import * as THREE from 'three';
import type { Player } from '../entities/Player';
import { FIELD_WIDTH } from '../data/Constants';

export type DefenseType = 'man' | 'zone_331';

export function assignMatchups(
    defenders: Player[],
    offenders: Player[],
): Map<Player, Player> {
    const matchups = new Map<Player, Player>();
    const assignedDef = new Set<Player>();
    const assignedOff = new Set<Player>();

    // Build all (defender, offender, distance) pairs and sort by distance
    // so closest pairs get matched first regardless of array order
    const pairs: { def: Player; off: Player; dist: number }[] = [];
    for (const def of defenders) {
        for (const off of offenders) {
            pairs.push({
                def,
                off,
                dist: def.movement.position.distanceTo(off.movement.position),
            });
        }
    }
    pairs.sort((a, b) => a.dist - b.dist);

    for (const pair of pairs) {
        if (assignedDef.has(pair.def) || assignedOff.has(pair.off)) continue;
        matchups.set(pair.def, pair.off);
        assignedDef.add(pair.def);
        assignedOff.add(pair.off);
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

export function assignZone331Positions(
    defenders: Player[],
    discPos: THREE.Vector3,
    attackingEndzone: number,
): Map<Player, THREE.Vector3> {
    // 3-3-1 zone: 3 cup (near disc), 3 wings (mid), 1 deep
    const dir = attackingEndzone === 0 ? -1 : 1;
    const halfW = FIELD_WIDTH / 2;
    const zones = new Map<Player, THREE.Vector3>();

    // Sort defenders by speed to assign fastest to wings/deep
    const sorted = [...defenders].sort((a, b) => {
        const sa = a.stats?.getEffectiveStat('speed') ?? 50;
        const sb = b.stats?.getEffectiveStat('speed') ?? 50;
        return sb - sa; // fastest first
    });

    // Cup (3 players) - close to disc handler
    const cupZ = discPos.z + dir * 3;
    zones.set(sorted[3] ?? sorted[0], new THREE.Vector3(discPos.x, 0, cupZ));
    zones.set(sorted[4] ?? sorted[1], new THREE.Vector3(discPos.x - 3, 0, cupZ));
    zones.set(sorted[5] ?? sorted[2], new THREE.Vector3(discPos.x + 3, 0, cupZ));

    // Wings (3 players) - mid-field, spread wide
    const wingZ = discPos.z + dir * 12;
    zones.set(sorted[1] ?? sorted[3], new THREE.Vector3(-halfW * 0.45, 0, wingZ));
    zones.set(sorted[2] ?? sorted[4], new THREE.Vector3(0, 0, wingZ));
    zones.set(sorted[6] ?? sorted[5], new THREE.Vector3(halfW * 0.45, 0, wingZ));

    // Deep (1 player) - last back
    const deepZ = discPos.z + dir * 25;
    zones.set(sorted[0], new THREE.Vector3(0, 0, deepZ));

    return zones;
}
