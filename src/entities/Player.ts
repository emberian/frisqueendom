import * as THREE from 'three';
import { MovementController } from '../gameplay/Movement';
import { Stickman } from '../rendering/Stickman';
import {
    idlePose,
    runPose,
    sprintPose,
    holdingDiscIdlePose,
    throwingPose,
    layoutPose,
    celebrationPose,
    frustrationPose,
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
    private animState: 'idle' | 'run' | 'sprint' | 'throw' | 'layout' | 'celebrate' | 'frustrated' = 'idle';
    private animTimer = 0;
    private layoutTarget: THREE.Vector3 | null = null;
    private layoutProgress = 0;

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
    startThrow(): void {
        this.animState = 'throw';
        this.animTimer = 0;
    }
    
    // Trigger celebration
    celebrate(): void {
        this.animState = 'celebrate';
        this.animTimer = 0;
    }
    
    // Trigger frustration
    frustrate(): void {
        this.animState = 'frustrated';
        this.animTimer = 0;
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
        let joints: Float32Array;

        switch (this.animState) {
            case 'throw':
                this.animTimer += dt;
                joints = throwingPose(this.animTimer, this.getThrowType());
                if (this.animTimer > 0.5) {
                    this.animState = 'idle';
                }
                break;
                
            case 'layout':
                joints = layoutPose(this.layoutProgress);
                break;
                
            case 'celebrate':
                this.animTimer += dt;
                joints = celebrationPose(this.animTimer);
                if (this.animTimer > 3) {
                    this.animState = 'idle';
                }
                break;
                
            case 'frustrated':
                this.animTimer += dt;
                joints = frustrationPose(this.animTimer);
                if (this.animTimer > 2) {
                    this.animState = 'idle';
                }
                break;
                
            default: // idle, run, sprint based on movement
                if (this.holdingDisc && speed < 0.5) {
                    joints = holdingDiscIdlePose(time);
                    this.animState = 'idle';
                } else if (speed < 0.5) {
                    joints = idlePose(time);
                    this.animState = 'idle';
                } else {
                    const isSprinting = speed > PLAYER_JOG_SPEED + 1;
                    const stride = isSprinting ? 2.0 : 1.5;
                    this.animPhase += (speed / stride) * dt;
                    this.animPhase %= 1.0;
                    joints = isSprinting
                        ? sprintPose(speed, this.animPhase)
                        : runPose(speed, this.animPhase);
                    this.animState = isSprinting ? 'sprint' : 'run';
                }
        }

        this.stickman.updateFromJoints(
            joints,
            this.movement.position,
            this.movement.facing,
        );
        
        // Update stats fatigue
        if (this.stats) {
            const isSprinting = this.animState === 'sprint';
            const isRunning = this.animState === 'run';
            if (isSprinting) {
                this.stats.currentStamina -= 20 * dt;
            } else if (isRunning) {
                this.stats.currentStamina += 5 * dt;
            } else {
                this.stats.currentStamina += 15 * dt;
            }
            this.stats.currentStamina = Math.max(0, Math.min(this.stats.attributes.stamina, this.stats.currentStamina));
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
