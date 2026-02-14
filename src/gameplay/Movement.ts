import * as THREE from 'three';
import {
    PLAYER_JOG_SPEED,
    PLAYER_SPRINT_SPEED,
    PLAYER_ACCELERATION,
    PLAYER_DECELERATION,
    STAMINA_MAX,
    STAMINA_SPRINT_DRAIN,
    STAMINA_JOG_REGEN,
    STAMINA_IDLE_REGEN,
} from '../data/Constants';

function lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

export interface PivotState {
    active: boolean;
    pivotPoint: THREE.Vector3;  // where the pivot foot is planted
    facingAngle: number;        // current facing around pivot
}

const DEFAULT_PIVOT_TURN_RATE = 3.0; // rad/s

export class MovementController {
    position = new THREE.Vector3();
    velocity = new THREE.Vector3();
    facing = 0;
    stamina = STAMINA_MAX;
    maxSpeed = PLAYER_JOG_SPEED;
    sprintSpeed = PLAYER_SPRINT_SPEED;
    acceleration = PLAYER_ACCELERATION;
    deceleration = PLAYER_DECELERATION;
    private _isSprinting = false;

    // Pivot foot state
    private _pivot: PivotState = {
        active: false,
        pivotPoint: new THREE.Vector3(),
        facingAngle: 0,
    };

    get isSprinting(): boolean {
        return this._isSprinting;
    }

    get pivotState(): PivotState {
        return this._pivot;
    }

    /** Plant the pivot foot at the given position. */
    enterPivotMode(position: THREE.Vector3): void {
        this._pivot.active = true;
        this._pivot.pivotPoint.copy(position);
        this._pivot.facingAngle = this.facing;
        // Snap position to pivot point and zero velocity
        this.position.copy(position);
        this.velocity.set(0, 0, 0);
    }

    /** Release the pivot foot. */
    exitPivotMode(): void {
        this._pivot.active = false;
    }

    /** Whether pivot mode is currently active. */
    isPivotActive(): boolean {
        return this._pivot.active;
    }

    update(
        dt: number,
        inputDir: { x: number; z: number },
        sprint: boolean,
    ): void {
        // If pivot mode is active, delegate to pivot update
        if (this._pivot.active) {
            this.updatePivot(dt, inputDir, DEFAULT_PIVOT_TURN_RATE);
            // Regenerate stamina while pivoting (player is stationary)
            this.stamina = Math.min(
                STAMINA_MAX,
                this.stamina + STAMINA_IDLE_REGEN * dt,
            );
            return;
        }

        this._isSprinting = sprint && this.stamina > 0;

        const maxSpeed = this._isSprinting
            ? this.sprintSpeed
            : this.maxSpeed;
        const inputMag = Math.sqrt(
            inputDir.x * inputDir.x + inputDir.z * inputDir.z,
        );

        if (inputMag > 0.01) {
            const nx = inputDir.x / inputMag;
            const nz = inputDir.z / inputMag;
            const targetVelX = nx * maxSpeed;
            const targetVelZ = nz * maxSpeed;
            const accel = this.acceleration * dt;

            const dx = targetVelX - this.velocity.x;
            this.velocity.x += Math.sign(dx) * Math.min(accel, Math.abs(dx));
            const dz = targetVelZ - this.velocity.z;
            this.velocity.z += Math.sign(dz) * Math.min(accel, Math.abs(dz));

            const targetFacing = Math.atan2(this.velocity.x, this.velocity.z);
            this.facing = lerpAngle(
                this.facing,
                targetFacing,
                1 - Math.exp(-10 * dt),
            );
        } else {
            const speedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
            if (speedSq > 0.0001) {
                const speed = Math.sqrt(speedSq);
                const decel = this.deceleration * dt;
                const newSpeed = Math.max(0, speed - decel);
                if (newSpeed > 0) {
                    const factor = newSpeed / speed;
                    this.velocity.x *= factor;
                    this.velocity.z *= factor;
                } else {
                    this.velocity.set(0, 0, 0);
                }
            } else {
                this.velocity.set(0, 0, 0);
            }
        }

        // Clamp speed
        const currentSpeedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
        if (currentSpeedSq > maxSpeed * maxSpeed) {
            const currentSpeed = Math.sqrt(currentSpeedSq);
            this.velocity.x = (this.velocity.x / currentSpeed) * maxSpeed;
            this.velocity.z = (this.velocity.z / currentSpeed) * maxSpeed;
        }

        // Integrate position
        this.position.x += this.velocity.x * dt;
        this.position.z += this.velocity.z * dt;

        // Stamina
        const finalSpeedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
        if (this._isSprinting) {
            this.stamina = Math.max(
                0,
                this.stamina - STAMINA_SPRINT_DRAIN * dt,
            );
        } else if (finalSpeedSq > 0.25) { // speed > 0.5
            this.stamina = Math.min(
                STAMINA_MAX,
                this.stamina + STAMINA_JOG_REGEN * dt,
            );
        } else {
            this.stamina = Math.min(
                STAMINA_MAX,
                this.stamina + STAMINA_IDLE_REGEN * dt,
            );
        }
    }

    // Pivot mode: rotate facing without moving
    updatePivot(
        dt: number,
        inputDir: { x: number; z: number },
        pivotRate: number,
    ): void {
        this.velocity.set(0, 0, 0);
        // A/D (inputDir.x) rotates facing; W/S have no effect in pivot
        this.facing += inputDir.x * pivotRate * dt;
        // Keep position locked to pivot point
        if (this._pivot.active) {
            this.position.copy(this._pivot.pivotPoint);
            this._pivot.facingAngle = this.facing;
        }
    }
}
