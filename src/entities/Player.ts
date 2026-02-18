import * as THREE from 'three';
import { MovementController } from '../gameplay/Movement';
import { Stickman } from '../rendering/Stickman';
import {
    JOINT_COUNT,
    lerpPose,
    idlePose,
    runPose,
    sprintPose,
    holdingDiscIdlePose,
    throwingPose,
    markingPose,
    layoutPose,
    celebrationPose,
    celebrationFistPump,
    celebrationSpike,
    celebrationBackflip,
    frustrationPose,
    frustrationArmsUp,
    frustrationHeadDrop,
    getPose,
} from '../rendering/Animation';
import { PLAYER_JOG_SPEED } from '../data/Constants';
import { STAT_MODIFIERS, ANIMATION_TIMINGS } from '../data/GameplayConstants';
import type { TeamSide, PlayerRole } from '../data/Types';
import type { PlayerStats } from '../data/PlayerStats';
import { Random } from '../data/SeededRandom';
import { isInBounds } from '../gameplay/FieldBounds';

// Reuse vectors to minimize GC
const _tempVec = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _handOffset = new THREE.Vector3(0.4, 1.3, 0.2);

export class Player {
    movement = new MovementController();
    stickman: Stickman;
    animPhase = 0;
    isControlled = false;
    holdingDisc = false;
    team: TeamSide;
    role: PlayerRole;
    index: number;
    stats: PlayerStats | null = null;
    
    // Animation state
    private animState: 'idle' | 'run' | 'sprint' | 'throw' | 'layout' | 'celebrate' | 'frustrated' | 'marking' = 'idle';
    private animTimer = 0;
    private layoutTarget: THREE.Vector3 | null = null;
    private layoutProgress = 0;

    // Animation blending
    private prevJoints = new Float32Array(JOINT_COUNT * 3);
    private targetJoints = new Float32Array(JOINT_COUNT * 3);
    private blendProgress = 1.0;
    private readonly blendDuration = 0.15;
    private prevAnimState: string = 'idle';

    // Throw type for animation
    private lastThrowType: 'backhand' | 'forehand' | 'hammer' | 'scoober' = 'backhand';

    // Celebration/frustration variant
    private celebrationVariant = 0;
    private frustrationVariant = 0;
    private customCelebration: string | null = null;

    // Marking state
    isMarking = false;
    markStallIntensity = 0;

    // Greatest play: true if player's last ground contact was in-bounds
    // Frozen during layout so a dive from in-bounds over OB is still a valid catch
    lastInBoundsGround = true;

    constructor(
        team: TeamSide,
        role: PlayerRole,
        teamColor: number,
        index: number,
        secondaryColor?: number,
    ) {
        this.team = team;
        this.role = role;
        this.index = index;
        this.stickman = new Stickman(teamColor, secondaryColor);
    }

    get id(): string {
        return this.stats?.id ?? `${this.team}_${this.index}`;
    }
    
    // Attach stats to this player
    setStats(stats: PlayerStats): void {
        this.stats = stats;
        // Apply stat modifiers to movement
        const speedMod = stats.getEffectiveStat('speed') / STAT_MODIFIERS.SPEED_STAT_REFERENCE;
        this.movement.maxSpeed = PLAYER_JOG_SPEED * speedMod;
        this.movement.sprintSpeed = (PLAYER_JOG_SPEED * STAT_MODIFIERS.SPRINT_SPEED_MULTIPLIER) * speedMod;
        this.movement.acceleration = 15 * (stats.getEffectiveStat('acceleration') / STAT_MODIFIERS.ACCELERATION_STAT_REFERENCE);
    }
    
    // Get effective catch radius based on stats and action
    getCatchRadius(): number {
        let base = STAT_MODIFIERS.BASE_CATCH_RADIUS;
        if (this.stats) {
            // Height affects standing catch radius
            base *= (0.9 + this.stats.getEffectiveStat('height') / STAT_MODIFIERS.HEIGHT_CATCH_MODIFIER);
        }
        if (this.movement.isAirborne) base *= 1.35;
        return base;
    }

    // Get layout catch radius
    getLayoutRadius(): number {
        let base = STAT_MODIFIERS.BASE_LAYOUT_RADIUS;
        if (this.stats) {
            base *= (0.8 + this.stats.getEffectiveStat('jumping') / STAT_MODIFIERS.JUMPING_LAYOUT_MODIFIER);
        }
        if (this.movement.isAirborne) base *= 1.35;
        return base;
    }
    
    // Trigger layout animation toward a target
    startLayout(target: THREE.Vector3): boolean {
        if (this.animState === 'layout') return false;
        
        // Check if player is willing to layout based on stats
        if (this.stats) {
            const layoutWillingness = this.stats.getEffectiveStat('layout');
            const moraleMod = 0.5 + (this.stats.morale / 200); // 0.5–1.0
            const clutchMod = 0.5 + (this.stats.attributes.clutch / 200); // 0.5–1.0
            const chance = (layoutWillingness / 100) * moraleMod * clutchMod;
            // e.g. layout=60, morale=80, clutch=60 → 0.6 * 0.9 * 0.8 = 43%
            // layout=80, morale=100, clutch=80 → 0.8 * 1.0 * 0.9 = 72%

            if (Random.next() > chance) {
                return false; // Player chose not to layout
            }
        }
        
        this.animState = 'layout';
        this.layoutTarget = target; // Just keep reference, don't clone
        this.layoutProgress = 0;
        return true;
    }
    
    // Trigger throw animation
    startThrow(throwType?: string): void {
        if (throwType) {
            // Map throw types that lack unique animations to their closest equivalent
            const mapped = throwType === 'thumber' ? 'hammer'
                : throwType === 'blade' ? 'forehand'
                : throwType as typeof this.lastThrowType;
            this.lastThrowType = mapped;
        }
        this.setAnimState('throw');
    }

    // Trigger celebration (variant by player index for team variety)
    celebrate(): void {
        if (this.customCelebration === 'spike') {
            this.celebrationVariant = 2;
        } else if (this.customCelebration === 'backflip') {
            this.celebrationVariant = 3;
        } else {
            this.celebrationVariant = this.index % 3;
        }
        this.setAnimState('celebrate');
    }

    setCustomCelebration(key: string | null): void {
        this.customCelebration = key;
    }

    // Trigger frustration (variant by player index)
    frustrate(): void {
        this.frustrationVariant = this.index % 3;
        this.setAnimState('frustrated');
    }

    // Set marking animation state
    setMarking(active: boolean, stallIntensity: number): void {
        this.isMarking = active;
        this.markStallIntensity = stallIntensity;
    }

    getAnimState(): string {
        return this.animState;
    }

    getAnimTimer(): number {
        return this.animTimer;
    }

    private setAnimState(state: typeof this.animState): void {
        if (state !== this.animState) {
            this.prevAnimState = this.animState;
            this.blendProgress = 0;
            this.animState = state;
            this.animTimer = 0;
        }
    }

    update(
        dt: number,
        input: { movementDir: { x: number; z: number }; sprint: boolean } | null,
    ): void {
        // Handle layout animation
        if (this.animState === 'layout' && this.layoutTarget) {
            // During layout, lastInBoundsGround is FROZEN — enables "greatest" plays
            this.layoutProgress += dt * 2; // Layout takes 0.5 seconds
            if (this.layoutProgress >= 1) {
                this.animState = 'idle';
                this.layoutTarget = null;
            } else {
                // Move player toward layout target
                _tempVec.subVectors(this.layoutTarget, this.movement.position);
                _tempVec.y = 0;
                const dist = _tempVec.length();
                if (dist > 0.1) {
                    _tempVec.normalize();
                    const layoutSpeed = 15 * Math.sin(this.layoutProgress * Math.PI);
                    this.movement.velocity.copy(_tempVec).multiplyScalar(layoutSpeed);
                    this.movement.position.addScaledVector(this.movement.velocity, dt);
                    this.movement.facing = Math.atan2(_tempVec.x, _tempVec.z);
                }
            }
        } else if (this.isControlled && input) {
            if (this.holdingDisc) {
                this.movement.updatePivot(dt, input.movementDir, 3.0);
            } else {
                this.movement.update(dt, input.movementDir, input.sprint);
            }
        }

        // Track in-bounds ground contact (NOT updated during layout — enables greatest plays)
        if (this.animState !== 'layout') {
            this.lastInBoundsGround = isInBounds(this.movement.position);
        }

        // Animation state machine
        const speed = this.movement.velocity.length();
        const time = performance.now() / 1000;
        let pose: Float32Array;

        if (this.remoteAnim) {
            pose = getPose(this.remoteAnim, this.remoteAnimTime);
            this.remoteAnim = null; // Clear after use
        } else {
            switch (this.animState) {
                case 'throw':
                this.animTimer += dt;
                pose = throwingPose(this.animTimer, this.lastThrowType);
                if (this.animTimer > 0.5) {
                    this.setAnimState('idle');
                }
                break;

            case 'layout':
                pose = layoutPose(this.layoutProgress);
                break;

            case 'celebrate':
                this.animTimer += dt;
                switch (this.celebrationVariant) {
                    case 1: pose = celebrationFistPump(this.animTimer); break;
                    case 2: pose = celebrationSpike(this.animTimer); break;
                    case 3: pose = celebrationBackflip(this.animTimer); break;
                    default: pose = celebrationPose(this.animTimer); break;
                }
                if (this.animTimer > 3) {
                    this.setAnimState('idle');
                }
                break;

            case 'frustrated':
                this.animTimer += dt;
                switch (this.frustrationVariant) {
                    case 1: pose = frustrationArmsUp(this.animTimer); break;
                    case 2: pose = frustrationHeadDrop(this.animTimer); break;
                    default: pose = frustrationPose(this.animTimer); break;
                }
                if (this.animTimer > 2) {
                    this.setAnimState('idle');
                }
                break;

            default: // idle, run, sprint, marking based on movement
                if (this.holdingDisc && speed < 0.5) {
                    pose = holdingDiscIdlePose(time);
                    this.animState = 'idle';
                } else if (this.isMarking && speed < 1.0) {
                    pose = markingPose(time, this.markStallIntensity);
                    this.animState = 'marking';
                } else if (speed < 0.5) {
                    pose = idlePose(time);
                    this.animState = 'idle';
                } else {
                    const isSprinting = speed > PLAYER_JOG_SPEED + 1;
                    const stride = isSprinting ? 2.0 : 1.5;
                    this.animPhase += (speed / stride) * dt;
                    this.animPhase %= 1.0;
                    pose = isSprinting
                        ? sprintPose(speed, this.animPhase)
                        : runPose(speed, this.animPhase);
                    this.animState = isSprinting ? 'sprint' : 'run';
                }
            }
        }
        
        // Safety copy because Pose functions share POSE_BUFFER
        this.targetJoints.set(pose);

        // Animation blending
        let joints: Float32Array;
        if (this.blendProgress < 1.0) {
            this.blendProgress = Math.min(1.0, this.blendProgress + dt / this.blendDuration);
            const t = this.blendProgress * this.blendProgress * (3 - 2 * this.blendProgress); // smoothstep
            joints = lerpPose(this.prevJoints, this.targetJoints, t);
        } else {
            joints = this.targetJoints;
        }
        // Snapshot for next blend
        this.prevJoints.set(joints);

        this.stickman.updateFromJoints(
            joints,
            this.movement.position,
            this.movement.facing,
        );

        // Update controlled player indicator
        this.stickman.setControlled(this.isControlled);

        // Sync stats stamina from movement (single source of truth)
        if (this.stats) {
            this.stats.currentStamina = this.movement.stamina;
        }
    }
    
    distanceTo(point: THREE.Vector3): number {
        return this.movement.position.distanceTo(point);
    }

    getHandPosition(): THREE.Vector3 {
        _tempVec.copy(_handOffset);
        _tempVec.applyAxisAngle(_up, this.movement.facing);
        _tempVec.add(this.movement.position);
        return _tempVec;
    }

    private remoteAnim: string | null = null;
    private remoteAnimTime: number = 0;

    setRemotePose(anim: string, time: number): void {
        this.remoteAnim = anim;
        this.remoteAnimTime = time;
    }
}
