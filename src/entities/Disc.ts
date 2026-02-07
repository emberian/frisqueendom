import * as THREE from 'three';
import { DiscBridge } from '../physics/DiscBridge';
import { createDiscMesh, updateDiscMesh } from '../rendering/DiscRenderer';
import type { DiscLifecycle, ThrowParams } from '../data/Types';
import type { DiscSimulator } from '../../frisque-physics/pkg/frisque_physics.js';
import type { Player } from './Player';
import { Random } from '../data/SeededRandom';

export class Disc {
    state: DiscLifecycle = 'on_ground';
    previousState: DiscLifecycle = 'on_ground';
    position = new THREE.Vector3(0, 0, 50);
    velocity = new THREE.Vector3();
    holder: Player | null = null;
    bridge: DiscBridge;
    mesh: THREE.Group;
    justCaught = false;
    thrownByTeam: 'home' | 'away' | null = null;
    isRolling = false;
    private rollTimer = 0;
    private hasSkipped = false;

    constructor(sim: DiscSimulator, scene: THREE.Scene) {
        this.bridge = new DiscBridge(sim);
        this.mesh = createDiscMesh();
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);
    }

    pickup(player: Player): void {
        this.previousState = this.state;
        this.state = 'held';
        this.holder = player;
        player.holdingDisc = true;
        this.justCaught = true;
        this.thrownByTeam = null;
    }

    throwDisc(params: ThrowParams, team: 'home' | 'away'): void {
        if (this.holder) {
            this.holder.holdingDisc = false;
        }
        this.previousState = this.state;
        this.state = 'in_flight';
        this.holder = null;
        this.bridge.throw(params);
        this.thrownByTeam = team;
    }

    update(dt: number): void {
        this.justCaught = false;

        if (this.state === 'held' && this.holder) {
            this.updateHeld();
        } else if (this.state === 'in_flight') {
            this.updateFlight(dt);
        } else if (this.state === 'on_ground' && this.isRolling) {
            this.updateRolling(dt);
        }
    }

    private updateHeld(): void {
        if (!this.holder) return;
        const hand = this.holder.getHandPosition();
        this.position.copy(hand);
        this.velocity.set(0, 0, 0);
        this.mesh.position.copy(this.position);
        // Orient disc flat relative to holder's facing
        this.mesh.quaternion.setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            this.holder.movement.facing,
        );
    }

    private updateFlight(_dt: number): void {
        this.bridge.getPosition(this.position);
        this.bridge.getVelocity(this.velocity);
        this.bridge.getQuaternion(this.mesh.quaternion);
        this.mesh.position.copy(this.position);

        if (this.bridge.isGrounded()) {
            this.previousState = this.state;
            this.handleGroundImpact();
        }
    }

    private handleGroundImpact(): void {
        const speed = Math.sqrt(
            this.velocity.x * this.velocity.x +
            this.velocity.z * this.velocity.z
        );

        // Calculate impact angle (degrees from horizontal)
        const impactAngle = Math.abs(Math.atan2(this.velocity.y, speed)) * (180 / Math.PI);

        if (speed > 8.0 && impactAngle < 30 && !this.hasSkipped) {
            // Skip: bounce once, lose 50% speed
            this.velocity.multiplyScalar(0.5);
            this.velocity.y = Math.abs(this.velocity.y) * 0.3; // Small bounce
            this.hasSkipped = true;
            this.state = 'in_flight'; // Stay in flight briefly
        } else if (speed > 5.0 && impactAngle >= 30 && impactAngle < 60) {
            // Cartwheel: roll on edge for 1-2 seconds
            this.state = 'on_ground';
            this.isRolling = true;
            this.rollTimer = 1.0 + Random.next(); // 1-2 seconds
            this.velocity.y = 0;
        } else {
            // Flat landing: stop immediately
            this.state = 'on_ground';
            this.velocity.set(0, 0, 0);
            this.isRolling = false;
            this.hasSkipped = false;
        }
    }

    private updateRolling(dt: number): void {
        this.rollTimer -= dt;

        if (this.rollTimer <= 0) {
            // Stop rolling
            this.isRolling = false;
            this.velocity.set(0, 0, 0);
            this.hasSkipped = false;
            return;
        }

        // Continue rolling with deceleration
        const deceleration = 3.0; // m/s^2
        const currentSpeed = Math.sqrt(
            this.velocity.x * this.velocity.x +
            this.velocity.z * this.velocity.z
        );

        if (currentSpeed > 0.1) {
            const newSpeed = Math.max(0, currentSpeed - deceleration * dt);
            const scale = newSpeed / currentSpeed;
            this.velocity.x *= scale;
            this.velocity.z *= scale;

            // Update position
            this.position.x += this.velocity.x * dt;
            this.position.z += this.velocity.z * dt;
            this.mesh.position.copy(this.position);

            // Rotate disc on edge (cartwheel effect)
            const rollAngle = (performance.now() / 1000) * Math.PI * 2;
            this.mesh.quaternion.setFromAxisAngle(
                new THREE.Vector3(
                    -this.velocity.z,
                    0,
                    this.velocity.x
                ).normalize(),
                rollAngle
            );
        } else {
            this.isRolling = false;
            this.velocity.set(0, 0, 0);
            this.hasSkipped = false;
        }
    }

    resetToPosition(pos: THREE.Vector3): void {
        this.state = 'on_ground';
        this.previousState = 'on_ground';
        this.position.copy(pos);
        this.velocity.set(0, 0, 0);
        this.mesh.position.copy(pos);
        this.holder = null;
        this.justCaught = false;
        this.thrownByTeam = null;
        this.isRolling = false;
        this.rollTimer = 0;
        this.hasSkipped = false;
    }
}
