import * as THREE from 'three';
import { DiscBridge } from '../physics/DiscBridge';
import { createDiscMesh, updateDiscMesh } from '../rendering/DiscRenderer';
import type { DiscLifecycle, ThrowParams } from '../data/Types';
import type { DiscSimulator } from '../../frisque-physics/pkg/frisque_physics.js';
import type { Player } from './Player';

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
            this.state = 'on_ground';
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
    }
}
