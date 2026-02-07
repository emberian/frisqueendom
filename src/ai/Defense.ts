import * as THREE from 'three';
import type { Player } from '../entities/Player';

export function assignMatchups(
    defenders: Player[],
    offenders: Player[],
): Map<Player, Player> {
    const matchups = new Map<Player, Player>();
    const assigned = new Set<Player>();

    // Greedy nearest-neighbor
    const remaining = [...defenders];
    for (const off of offenders) {
        let nearest: Player | null = null;
        let nearestDist = Infinity;

        for (const def of remaining) {
            if (assigned.has(def)) continue;
            const d = def.movement.position.distanceTo(off.movement.position);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = def;
            }
        }

        if (nearest) {
            matchups.set(nearest, off);
            assigned.add(nearest);
        }
    }

    return matchups;
}

export function computeDefensivePosition(
    mark: Player,
    discPos: THREE.Vector3,
): THREE.Vector3 {
    // Stay between mark and disc, slightly toward disc
    const toDisc = discPos.clone().sub(mark.movement.position).normalize();
    return mark.movement.position
        .clone()
        .add(toDisc.multiplyScalar(1.5));
}

export function shouldContestCatch(
    defender: Player,
    discPos: THREE.Vector3,
    mark: Player,
): boolean {
    const defToDist = defender.movement.position.distanceTo(discPos);
    const markToDist = mark.movement.position.distanceTo(discPos);
    return defToDist < markToDist + 1.0;
}
