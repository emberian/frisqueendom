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

    get isSprinting(): boolean {
        return this._isSprinting;
    }

    update(
        dt: number,
        inputDir: { x: number; z: number },
        sprint: boolean,
    ): void {
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
        this.facing += inputDir.x * pivotRate * dt;
    }
}
