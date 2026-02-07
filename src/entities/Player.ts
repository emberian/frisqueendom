import * as THREE from 'three';
import { MovementController } from '../gameplay/Movement';
import { Stickman } from '../rendering/Stickman';
import {
    idlePose,
    runPose,
    sprintPose,
    holdingDiscIdlePose,
} from '../rendering/Animation';
import { PLAYER_JOG_SPEED } from '../data/Constants';
import type { TeamSide, PlayerRole } from '../data/Types';

export class Player {
    movement = new MovementController();
    stickman: Stickman;
    animPhase = 0;
    isControlled = false;
    holdingDisc = false;
    team: TeamSide;
    role: PlayerRole;
    index: number;

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

    update(
        dt: number,
        input: { movementDir: { x: number; z: number }; sprint: boolean } | null,
    ): void {
        if (this.isControlled && input) {
            if (this.holdingDisc) {
                this.movement.updatePivot(dt, input.movementDir, 3.0);
            } else {
                this.movement.update(dt, input.movementDir, input.sprint);
            }
        }

        // Animation
        const speed = this.movement.velocity.length();
        const time = performance.now() / 1000;

        let joints: Float32Array;

        if (this.holdingDisc && speed < 0.5) {
            joints = holdingDiscIdlePose(time);
        } else if (speed < 0.5) {
            joints = idlePose(time);
        } else {
            const isSprinting = speed > PLAYER_JOG_SPEED + 1;
            const stride = isSprinting ? 2.0 : 1.5;
            this.animPhase += (speed / stride) * dt;
            this.animPhase %= 1.0;
            joints = isSprinting
                ? sprintPose(speed, this.animPhase)
                : runPose(speed, this.animPhase);
        }

        this.stickman.updateFromJoints(
            joints,
            this.movement.position,
            this.movement.facing,
        );
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
