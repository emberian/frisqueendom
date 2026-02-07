import * as THREE from 'three';
import type { Disc } from '../entities/Disc';
import type { Player } from '../entities/Player';
import type { ThrowParams } from '../data/Types';
import { FIELD_LENGTH, FIELD_WIDTH, ENDZONE_DEPTH } from '../data/Constants';

export function positionForPull(
    pullingPlayers: Player[],
    receivingPlayers: Player[],
    pullingEndzone: number,
): void {
    const pullZ = pullingEndzone === 0 ? ENDZONE_DEPTH * 0.5 : FIELD_LENGTH - ENDZONE_DEPTH * 0.5;
    const recvZ = pullingEndzone === 0 ? FIELD_LENGTH - ENDZONE_DEPTH * 0.5 : ENDZONE_DEPTH * 0.5;

    const halfW = FIELD_WIDTH / 2;
    const spacing = FIELD_WIDTH / 8;

    for (let i = 0; i < pullingPlayers.length; i++) {
        const x = -halfW + spacing * (i + 1);
        pullingPlayers[i].movement.position.set(x, 0, pullZ);
        pullingPlayers[i].movement.velocity.set(0, 0, 0);
        pullingPlayers[i].movement.facing =
            pullingEndzone === 0 ? 0 : Math.PI;
        pullingPlayers[i].holdingDisc = false;
    }

    for (let i = 0; i < receivingPlayers.length; i++) {
        const x = -halfW + spacing * (i + 1);
        receivingPlayers[i].movement.position.set(x, 0, recvZ);
        receivingPlayers[i].movement.velocity.set(0, 0, 0);
        receivingPlayers[i].movement.facing =
            pullingEndzone === 0 ? Math.PI : 0;
        receivingPlayers[i].holdingDisc = false;
    }
}

export function createAIPullParams(
    puller: Player,
    targetEndzone: number,
): ThrowParams {
    const dir = targetEndzone === 0 ? -1 : 1;
    const targetZ = targetEndzone === 0 ? ENDZONE_DEPTH : FIELD_LENGTH - ENDZONE_DEPTH;

    return {
        position: puller.movement.position.clone().setY(1.5),
        direction: new THREE.Vector3(0.02, 0.10, dir * 0.99).normalize(),
        speed: 30,
        spinRate: 100,
        noseAngle: -0.04,
        hyzerAngle: 0.15,
        releaseHeight: 1.8,
        offAxis: 0,
        isForehand: false,
    };
}
