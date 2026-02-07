import * as THREE from 'three';
import { CATCH_RADIUS } from '../data/Constants';
import type { Player } from '../entities/Player';
import type { Disc } from '../entities/Disc';

const PICKUP_RADIUS = 0.8;
const _handPos = new THREE.Vector3();

export interface CatchResult {
    catcher: Player;
    isInterception: boolean;
}

export function checkCatch(
    disc: Disc,
    allPlayers: Player[],
): CatchResult | null {
    if (disc.state === 'in_flight') {
        return checkFlightCatch(disc, allPlayers);
    }
    if (disc.state === 'on_ground') {
        return checkPickup(disc, allPlayers);
    }
    return null;
}

function checkFlightCatch(
    disc: Disc,
    allPlayers: Player[],
): CatchResult | null {
    let nearest: Player | null = null;
    let nearestDist = Infinity;

    for (const player of allPlayers) {
        if (player.holdingDisc) continue;

        _handPos.copy(player.getHandPosition());
        const dist = _handPos.distanceTo(disc.position);

        if (dist < CATCH_RADIUS && dist < nearestDist) {
            // Check if facing roughly toward disc
            const toDisc = disc.position
                .clone()
                .sub(player.movement.position)
                .normalize();
            const playerForward = new THREE.Vector3(
                Math.sin(player.movement.facing),
                0,
                Math.cos(player.movement.facing),
            );
            const dot = toDisc.x * playerForward.x + toDisc.z * playerForward.z;

            // Minimum facing requirement (forward 180° cone)
            if (dot > 0.0) {
                nearest = player;
                nearestDist = dist;
            }
        }
    }

    if (nearest) {
        const isInterception =
            disc.thrownByTeam !== null && disc.thrownByTeam !== nearest.team;
        return { catcher: nearest, isInterception };
    }
    return null;
}

function checkPickup(
    disc: Disc,
    allPlayers: Player[],
): CatchResult | null {
    let nearest: Player | null = null;
    let nearestDist = Infinity;

    for (const player of allPlayers) {
        if (player.holdingDisc) continue;
        const dist = player.movement.position.distanceTo(disc.position);
        if (dist < PICKUP_RADIUS && dist < nearestDist) {
            nearest = player;
            nearestDist = dist;
        }
    }

    if (nearest) {
        return { catcher: nearest, isInterception: false };
    }
    return null;
}
