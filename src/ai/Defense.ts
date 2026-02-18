import * as THREE from 'three';
import type { Player } from '../entities/Player';
import { FIELD_WIDTH, FIELD_LENGTH } from '../data/Constants';
import {
    ZONE_CUP_DEPTH,
    ZONE_CUP_WING_SPREAD,
    ZONE_MID_DEPTH,
    ZONE_MID_SPREAD_FACTOR,
    ZONE_DEEP_DEPTH,
    ZONE_SHIFT_X_WEIGHT,
    ZONE_SHIFT_Z_WEIGHT,
} from '../data/GameplayConstants';

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

// Reusable vectors for defensive positioning (avoid per-frame allocations)
const _defToDisc = new THREE.Vector3();
const _defResult = new THREE.Vector3();
const _defForce = new THREE.Vector3();

/**
 * Compute defensive position accounting for:
 * - Force side: position on the force side between mark and disc
 * - Fronting/backing: front when mark is deep, back when mark is under
 * - Closing speed: give faster marks a bigger cushion
 * - Sideline overplay: when disc is near sideline, shade the open side
 */
export function computeDefensivePosition(
    mark: Player,
    discPos: THREE.Vector3,
    forceSide: number = 1,
    attackingEndzone: number = 0,
): THREE.Vector3 {
    const markPos = mark.movement.position;

    // Direction from mark to disc
    _defToDisc.copy(discPos).sub(markPos);
    _defToDisc.y = 0;
    const distToDisc = _defToDisc.length();
    if (distToDisc < 0.1) {
        return _defResult.copy(markPos);
    }
    _defToDisc.multiplyScalar(1 / distToDisc);

    // --- Fronting vs Backing ---
    // Depth of mark relative to disc in the attacking direction
    const dir = attackingEndzone === 0 ? -1 : 1;
    const markDepth = (markPos.z - discPos.z) * dir; // positive = mark is downfield

    // When mark is deep (positive depth), front them (stay disc-side)
    // When mark is under (negative depth), back them (stay endzone-side)
    // Transition smoothly between -5m and +10m depth
    const frontBackBias = Math.max(-1, Math.min(1, markDepth / 8));
    // frontBackBias > 0 means mark is deep -> offset toward disc (fronting)
    // frontBackBias < 0 means mark is under -> offset away from disc (backing)
    const baseOffset = 1.2 + frontBackBias * 0.6; // 0.6 to 1.8m along disc direction

    // --- Closing speed cushion ---
    // Give faster/sprinting marks more cushion so defender can react
    const markSpeed = mark.movement.velocity.length();
    const speedCushion = Math.min(0.8, markSpeed * 0.08); // up to 0.8m extra

    const totalOffset = baseOffset + speedCushion;

    // Start with position between mark and disc
    _defResult.copy(markPos).addScaledVector(_defToDisc, totalOffset);

    // --- Force side offset ---
    // Perpendicular to the mark-disc line, on the force side
    // This shades the force side, making break throws harder
    _defForce.set(-_defToDisc.z, 0, _defToDisc.x); // perpendicular (left)
    // forceSide > 0 means force toward positive X
    const forceWeight = 0.8 + Math.min(0.6, distToDisc * 0.02); // stronger when mark is far from disc
    _defResult.addScaledVector(_defForce, forceSide * forceWeight);

    // --- Sideline overplay ---
    // When disc is near the sideline, shade the open (center) side more
    const halfW = FIELD_WIDTH / 2;
    const sidelineProximity = Math.abs(discPos.x) / halfW; // 0 to 1
    if (sidelineProximity > 0.6) {
        const openSideDir = -Math.sign(discPos.x); // toward center
        const overplayAmount = (sidelineProximity - 0.6) * 2.0; // 0 to 0.8
        _defResult.x += openSideDir * overplayAmount;
    }

    // Clamp to field bounds
    _defResult.x = Math.max(-halfW * 0.48, Math.min(halfW * 0.48, _defResult.x));
    _defResult.z = Math.max(1, Math.min(FIELD_LENGTH - 1, _defResult.z));
    _defResult.y = 0;

    return _defResult;
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
    // 3-3-1 zone: 3 cup (near disc), 3 mids (short-deep), 1 deep
    // Cup follows disc position; zone shifts as a unit on swing
    const dir = attackingEndzone === 0 ? -1 : 1;
    const halfW = FIELD_WIDTH / 2;
    const zones = new Map<Player, THREE.Vector3>();

    // Sort defenders by speed to assign fastest to wings/deep
    const sorted = [...defenders].sort((a, b) => {
        const sa = a.stats?.getEffectiveStat('speed') ?? 50;
        const sb = b.stats?.getEffectiveStat('speed') ?? 50;
        return sb - sa; // fastest first
    });

    // Lateral shift: cup and mids track disc x position
    const shiftX = discPos.x * ZONE_SHIFT_X_WEIGHT;

    // Cup (3 players) - mark on thrower position + 2 wings clogging throwing lanes
    const cupZ = Math.max(2, Math.min(FIELD_LENGTH - 2,
        discPos.z + dir * ZONE_CUP_DEPTH));
    // Cup center: directly on thrower
    zones.set(sorted[3] ?? sorted[0], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x)),
        0, cupZ));
    // Cup wings: prevent easy breaks and resets by clogging lanes
    zones.set(sorted[4] ?? sorted[1], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x - ZONE_CUP_WING_SPREAD)),
        0, cupZ));
    zones.set(sorted[5] ?? sorted[2], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x + ZONE_CUP_WING_SPREAD)),
        0, cupZ));

    // Mids (3 players) - short-deeps covering mid-range throws, shift with disc
    const midZ = Math.max(2, Math.min(FIELD_LENGTH - 2,
        discPos.z + dir * ZONE_MID_DEPTH));
    zones.set(sorted[1] ?? sorted[3], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, -halfW * ZONE_MID_SPREAD_FACTOR + shiftX)),
        0, midZ));
    zones.set(sorted[2] ?? sorted[4], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, shiftX)),
        0, midZ));
    zones.set(sorted[6] ?? sorted[5], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, halfW * ZONE_MID_SPREAD_FACTOR + shiftX)),
        0, midZ));

    // Deep (1 player) - prevents hucks/over-the-top throws
    const deepZ = Math.max(2, Math.min(FIELD_LENGTH - 2,
        discPos.z + dir * ZONE_DEEP_DEPTH));
    zones.set(sorted[0], new THREE.Vector3(
        Math.max(-halfW * 0.35, Math.min(halfW * 0.35, shiftX * 0.5)),
        0, deepZ));

    return zones;
}

export function assignZoneCupPositions(
    defenders: Player[],
    discPos: THREE.Vector3,
    attackingEndzone: number,
): Map<Player, THREE.Vector3> {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const halfW = FIELD_WIDTH / 2;
    const zones = new Map<Player, THREE.Vector3>();
    const sorted = [...defenders].sort((a, b) => {
        const sa = a.stats?.getEffectiveStat('speed') ?? 50;
        const sb = b.stats?.getEffectiveStat('speed') ?? 50;
        return sb - sa;
    });

    // 3 cup players around disc handler (~5m spread)
    const cupZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 2));
    // Mark directly on handler
    zones.set(sorted[4] ?? sorted[0], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x)),
        0, cupZ));
    // Left wing at ~5m
    zones.set(sorted[5] ?? sorted[1], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x - 5)),
        0, cupZ));
    // Right wing at ~5m
    zones.set(sorted[6] ?? sorted[2], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x + 5)),
        0, cupZ));

    // 2 mid-field players
    const midZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 12));
    zones.set(sorted[1] ?? sorted[3], new THREE.Vector3(
        Math.max(-halfW * 0.4, Math.min(halfW * 0.4, -halfW * 0.35)),
        0, midZ));
    zones.set(sorted[2] ?? sorted[4], new THREE.Vector3(
        Math.max(-halfW * 0.4, Math.min(halfW * 0.4, halfW * 0.35)),
        0, midZ));

    // 1 short-deep
    const shortDeepZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 20));
    zones.set(sorted[3] ?? sorted[5], new THREE.Vector3(0, 0, shortDeepZ));

    // 1 deep-deep
    const deepZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 32));
    zones.set(sorted[0], new THREE.Vector3(0, 0, deepZ));

    return zones;
}

export function assignZoneWallPositions(
    defenders: Player[],
    discPos: THREE.Vector3,
    attackingEndzone: number,
): Map<Player, THREE.Vector3> {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const halfW = FIELD_WIDTH / 2;
    const zones = new Map<Player, THREE.Vector3>();
    const sorted = [...defenders].sort((a, b) => {
        const sa = a.stats?.getEffectiveStat('speed') ?? 50;
        const sb = b.stats?.getEffectiveStat('speed') ?? 50;
        return sb - sa;
    });

    // 4 players in horizontal wall across field at disc depth + 10m
    const wallZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 10));
    const wallSpacing = halfW * 0.6;
    zones.set(sorted[2], new THREE.Vector3(-wallSpacing, 0, wallZ));
    zones.set(sorted[3], new THREE.Vector3(-wallSpacing * 0.33, 0, wallZ));
    zones.set(sorted[4] ?? sorted[0], new THREE.Vector3(wallSpacing * 0.33, 0, wallZ));
    zones.set(sorted[5] ?? sorted[1], new THREE.Vector3(wallSpacing, 0, wallZ));

    // 2 chasers near disc
    const chaserZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 2));
    zones.set(sorted[6] ?? sorted[2], new THREE.Vector3(
        Math.max(-halfW * 0.3, Math.min(halfW * 0.3, discPos.x - 3)),
        0, chaserZ));
    zones.set(sorted[1], new THREE.Vector3(
        Math.max(-halfW * 0.3, Math.min(halfW * 0.3, discPos.x + 3)),
        0, chaserZ));

    // 1 deep safety
    const safetyZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 28));
    zones.set(sorted[0], new THREE.Vector3(0, 0, safetyZ));

    return zones;
}

export function assignSurroundPositions(
    defenders: Player[],
    discPos: THREE.Vector3,
    attackingEndzone: number,
): Map<Player, THREE.Vector3> {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const halfW = FIELD_WIDTH / 2;
    const zones = new Map<Player, THREE.Vector3>();
    const sorted = [...defenders].sort((a, b) => {
        const sa = a.stats?.getEffectiveStat('speed') ?? 50;
        const sb = b.stats?.getEffectiveStat('speed') ?? 50;
        return sb - sa;
    });

    // Diamond/box: 4 players surrounding handler area at ~4m
    // Front (downfield from handler)
    zones.set(sorted[3], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x)),
        0, Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 4))));
    // Back (upfield from handler)
    zones.set(sorted[4] ?? sorted[0], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x)),
        0, Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z - dir * 4))));
    // Left
    zones.set(sorted[5] ?? sorted[1], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x - 4)),
        0, Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z))));
    // Right
    zones.set(sorted[6] ?? sorted[2], new THREE.Vector3(
        Math.max(-halfW * 0.47, Math.min(halfW * 0.47, discPos.x + 4)),
        0, Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z))));

    // 2 mid cutter defenders
    const midZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 14));
    zones.set(sorted[1], new THREE.Vector3(
        Math.max(-halfW * 0.4, Math.min(halfW * 0.4, -halfW * 0.3)),
        0, midZ));
    zones.set(sorted[2], new THREE.Vector3(
        Math.max(-halfW * 0.4, Math.min(halfW * 0.4, halfW * 0.3)),
        0, midZ));

    // 1 deep safety
    const deepZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z + dir * 28));
    zones.set(sorted[0], new THREE.Vector3(0, 0, deepZ));

    return zones;
}

/**
 * Detect if the opposing defense is playing zone based on positioning patterns.
 * Zone indicators: defenders clustered near disc, spread across width,
 * not tightly marking individual players.
 */
export function detectZoneDefense(
    defenders: Player[],
    offenders: Player[],
    discPos: THREE.Vector3,
): boolean {
    if (defenders.length < 3 || offenders.length < 3) return false;

    // Count how many defenders are NOT within tight marking distance of any offender
    let unmarkCount = 0;
    for (const def of defenders) {
        let nearestOffDist = Infinity;
        for (const off of offenders) {
            const d = def.movement.position.distanceTo(off.movement.position);
            if (d < nearestOffDist) nearestOffDist = d;
        }
        // If defender is > 4m from any offender, they're likely zoning
        if (nearestOffDist > 4) unmarkCount++;
    }

    // Count how many defenders are clustered near disc (cup indicator)
    let cupCount = 0;
    for (const def of defenders) {
        if (def.movement.position.distanceTo(discPos) < 6) cupCount++;
    }

    // Zone indicators: multiple unmatched defenders AND a cup formation
    return unmarkCount >= 2 && cupCount >= 2;
}
