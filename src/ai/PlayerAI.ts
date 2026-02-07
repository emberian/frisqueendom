import * as THREE from 'three';
import type { Player } from '../entities/Player';
import type { Disc } from '../entities/Disc';
import {
    evaluateOpenness,
    computeLeadPass,
    computeCutTarget,
    computeStackPositions,
    computeHandlerPositions,
} from './Offense';
import { computeDefensivePosition } from './Defense';
import { computeMarkPosition, updateMarkMirror } from './Marking';
import type { ThrowParams, TeamSide } from '../data/Types';
import { PLAYER_SPRINT_SPEED } from '../data/Constants';

const _target = new THREE.Vector3();

export interface AIAction {
    type: 'move' | 'throw' | 'none';
    target?: THREE.Vector3;
    sprint?: boolean;
    throwParams?: ThrowParams;
}

export function decideOffenseWithDisc(
    player: Player,
    teammates: Player[],
    defenders: Player[],
    stallCount: number,
    attackingEndzone: number,
): AIAction {
    // Evaluate openness of all teammates
    let bestReceiver: Player | null = null;
    let bestOpenness = 0;

    const threshold = stallCount < 5 ? 0.7 : stallCount < 8 ? 0.4 : 0.1;

    for (const tm of teammates) {
        if (tm === player || tm.holdingDisc) continue;
        const open = evaluateOpenness(player, tm, defenders);
        if (open > bestOpenness) {
            bestOpenness = open;
            bestReceiver = tm;
        }
    }

    if (bestReceiver && bestOpenness > threshold) {
        const speed = 15 + bestOpenness * 5;
        const leadTarget = computeLeadPass(bestReceiver, speed);
        const direction = leadTarget
            .clone()
            .sub(player.movement.position)
            .normalize();
        direction.y = 0.08;
        direction.normalize();

        // Choose forehand vs backhand based on receiver side
        const toReceiver = bestReceiver.movement.position
            .clone()
            .sub(player.movement.position);
        const cross =
            Math.sin(player.movement.facing) * toReceiver.z -
            Math.cos(player.movement.facing) * toReceiver.x;
        const isForehand = cross > 0;

        const throwParams: ThrowParams = {
            position: player.movement.position.clone().setY(1.5),
            direction,
            speed,
            spinRate: (isForehand ? 90 : 70) * 0.8,
            noseAngle: 0.05 - speed * 0.003,
            hyzerAngle: 0.05,
            releaseHeight: 1.5,
            offAxis: 0,
            isForehand,
        };

        return { type: 'throw', throwParams };
    }

    return { type: 'none' };
}

export function decideOffenseWithoutDisc(
    player: Player,
    discPos: THREE.Vector3,
    isActiveCutter: boolean,
    cutTimer: number,
    attackingEndzone: number,
    defenders: Player[],
): AIAction {
    if (!isActiveCutter) {
        // Hold stack position
        return { type: 'none' };
    }

    // Find nearest defender
    let nearestDef: Player | null = null;
    let nearestDefDist = Infinity;
    for (const d of defenders) {
        const dist = d.movement.position.distanceTo(player.movement.position);
        if (dist < nearestDefDist) {
            nearestDefDist = dist;
            nearestDef = d;
        }
    }

    if (cutTimer > 2.5) {
        // Clear out - run to far side
        const clearX =
            player.movement.position.x > 0 ? -15 : 15;
        _target.set(clearX, 0, player.movement.position.z);
        return { type: 'move', target: _target.clone(), sprint: false };
    }

    // Decide cut direction based on defender position
    let cutType: 'in' | 'deep' = 'in';
    if (nearestDef) {
        const defToDisc = discPos.z - nearestDef.movement.position.z;
        const playerToDisc = discPos.z - player.movement.position.z;
        // If defender is between player and disc (shading under), cut deep
        if (
            Math.sign(defToDisc) === Math.sign(playerToDisc) &&
            Math.abs(defToDisc) < Math.abs(playerToDisc)
        ) {
            cutType = 'deep';
        }
    }

    const target = computeCutTarget(
        player,
        discPos,
        attackingEndzone,
        cutType,
    );
    return { type: 'move', target, sprint: true };
}

export function decideDefense(
    player: Player,
    mark: Player | null,
    discHolder: Player | null,
    discPos: THREE.Vector3,
    isMarker: boolean,
): AIAction {
    if (!mark) return { type: 'none' };

    if (isMarker && discHolder) {
        // Mark the thrower
        const markPos = computeMarkPosition(discHolder, 1);
        return { type: 'move', target: markPos, sprint: false };
    }

    // Guard cutter
    const defPos = computeDefensivePosition(mark, discPos);
    const dist = player.movement.position.distanceTo(mark.movement.position);
    const sprint = dist > 3;
    return { type: 'move', target: defPos, sprint };
}

export function moveToward(
    player: Player,
    target: THREE.Vector3,
    dt: number,
    sprint: boolean,
): void {
    const diff = target.clone().sub(player.movement.position);
    diff.y = 0;
    const dist = diff.length();

    if (dist < 0.5) {
        player.movement.update(dt, { x: 0, z: 0 }, false);
        return;
    }

    const dir = { x: diff.x / dist, z: diff.z / dist };
    player.movement.update(dt, dir, sprint);
}
