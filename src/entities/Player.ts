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
    frustrationPose,
    frustrationArmsUp,
    frustrationHeadDrop,
} from '../rendering/Animation';
import { PLAYER_JOG_SPEED } from '../data/Constants';
import { STAT_MODIFIERS, ANIMATION_TIMINGS } from '../data/GameplayConstants';
import type { TeamSide, PlayerRole } from '../data/Types';
import type { PlayerStats } from '../data/PlayerStats';

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
    private blendProgress = 1.0;
    private readonly blendDuration = 0.15;
    private prevAnimState: string = 'idle';

    // Throw type for animation
    private lastThrowType: 'backhand' | 'forehand' | 'hammer' | 'scoober' = 'backhand';

    // Celebration/frustration variant
    private celebrationVariant = 0;
    private frustrationVariant = 0;

    // Marking state
    isMarking = false;
    markStallIntensity = 0;

    constructor(
        team: TeamSide,
        role: PlayerRole,
        teamColor: number,
        index: number,
    ) {
        this.team = team;
        this.role = role;
        this.index = index;
        this.stickman = new Stickman(teamColor);
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
        return base;
    }
    
    // Get layout catch radius
    getLayoutRadius(): number {
        let base = STAT_MODIFIERS.BASE_LAYOUT_RADIUS;
        if (this.stats) {
            base *= (0.8 + this.stats.getEffectiveStat('jumping') / STAT_MODIFIERS.JUMPING_LAYOUT_MODIFIER);
        }
        return base;
    }
    
    // Trigger layout animation toward a target
    startLayout(target: THREE.Vector3): boolean {
        if (this.animState === 'layout') return false;
        
        // Check if player is willing to layout based on stats
        if (this.stats) {
            const layoutWillingness = this.stats.getEffectiveStat('layout');
            const moraleMod = this.stats.morale / 100;
            const clutchMod = this.stats.attributes.clutch / 100;
            const chance = (layoutWillingness * moraleMod * clutchMod) / 100;
            
            if (Math.random() > chance) {
                return false; // Player chose not to layout
            }
        }
        
        this.animState = 'layout';
        this.layoutTarget = target.clone();
        this.layoutProgress = 0;
        return true;
    }
    
    // Trigger throw animation
    startThrow(throwType?: string): void {
        if (throwType) {
            this.lastThrowType = throwType as typeof this.lastThrowType;
        }
        this.setAnimState('throw');
    }

    // Trigger celebration (variant by player index for team variety)
    celebrate(): void {
        this.celebrationVariant = this.index % 3;
        this.setAnimState('celebrate');
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
            this.layoutProgress += dt * 2; // Layout takes 0.5 seconds
            if (this.layoutProgress >= 1) {
                this.animState = 'idle';
                this.layoutTarget = null;
            } else {
                // Move player toward layout target
                const dir = new THREE.Vector3().subVectors(this.layoutTarget, this.movement.position);
                dir.y = 0;
                const dist = dir.length();
                if (dist > 0.1) {
                    dir.normalize();
                    const layoutSpeed = 15 * Math.sin(this.layoutProgress * Math.PI);
                    this.movement.velocity.copy(dir).multiplyScalar(layoutSpeed);
                    this.movement.position.addScaledVector(this.movement.velocity, dt);
                    this.movement.facing = Math.atan2(dir.x, dir.z);
                }
            }
        } else if (this.isControlled && input) {
            if (this.holdingDisc) {
                this.movement.updatePivot(dt, input.movementDir, 3.0);
            } else {
                this.movement.update(dt, input.movementDir, input.sprint);
            }
        }

        // Animation state machine
        const speed = this.movement.velocity.length();
        const time = performance.now() / 1000;
        let targetJoints: Float32Array;

        switch (this.animState) {
            case 'throw':
                this.animTimer += dt;
                targetJoints = throwingPose(this.animTimer, this.lastThrowType);
                if (this.animTimer > 0.5) {
                    this.setAnimState('idle');
                }
                break;

            case 'layout':
                targetJoints = layoutPose(this.layoutProgress);
                break;

            case 'celebrate':
                this.animTimer += dt;
                switch (this.celebrationVariant) {
                    case 1: targetJoints = celebrationFistPump(this.animTimer); break;
                    case 2: targetJoints = celebrationSpike(this.animTimer); break;
                    default: targetJoints = celebrationPose(this.animTimer); break;
                }
                if (this.animTimer > 3) {
                    this.setAnimState('idle');
                }
                break;

            case 'frustrated':
                this.animTimer += dt;
                switch (this.frustrationVariant) {
                    case 1: targetJoints = frustrationArmsUp(this.animTimer); break;
                    case 2: targetJoints = frustrationHeadDrop(this.animTimer); break;
                    default: targetJoints = frustrationPose(this.animTimer); break;
                }
                if (this.animTimer > 2) {
                    this.setAnimState('idle');
                }
                break;

            default: // idle, run, sprint, marking based on movement
                if (this.holdingDisc && speed < 0.5) {
                    targetJoints = holdingDiscIdlePose(time);
                    this.animState = 'idle';
                } else if (this.isMarking && speed < 1.0) {
                    targetJoints = markingPose(time, this.markStallIntensity);
                    this.animState = 'marking';
                } else if (speed < 0.5) {
                    targetJoints = idlePose(time);
                    this.animState = 'idle';
                } else {
                    const isSprinting = speed > PLAYER_JOG_SPEED + 1;
                    const stride = isSprinting ? 2.0 : 1.5;
                    this.animPhase += (speed / stride) * dt;
                    this.animPhase %= 1.0;
                    targetJoints = isSprinting
                        ? sprintPose(speed, this.animPhase)
                        : runPose(speed, this.animPhase);
                    this.animState = isSprinting ? 'sprint' : 'run';
                }
        }

        // Animation blending
        let joints: Float32Array;
        if (this.blendProgress < 1.0) {
            this.blendProgress = Math.min(1.0, this.blendProgress + dt / this.blendDuration);
            const t = this.blendProgress * this.blendProgress * (3 - 2 * this.blendProgress); // smoothstep
            joints = lerpPose(this.prevJoints, targetJoints, t);
        } else {
            joints = targetJoints;
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
    
    private getThrowType(): 'backhand' | 'forehand' | 'hammer' {
        // This would be set by the throw controller
        return 'backhand';
    }

    distanceTo(point: THREE.Vector3): number {
        return this.movement.position.distanceTo(point);
    }

    getHandPosition(): THREE.Vector3 {
        const offset = new THREE.Vector3(0.4, 1.3, 0.2);
        offset.applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            this.movement.facing,
        );
        return this.movement.position.clone().add(offset);
    }
}
