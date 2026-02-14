import * as THREE from 'three';
import type { Player } from '../entities/Player';
import { FIELD_WIDTH, FIELD_LENGTH } from '../data/Constants';
import {
    HSTACK_DEPTH_OFFSET,
    HSTACK_LANE_WIDTH_FACTOR,
    ZONE_OFFENSE_POPPER_DEPTH,
    ZONE_OFFENSE_WING_SPREAD,
} from '../data/GameplayConstants';
import { Random } from '../data/SeededRandom';

const _diff = new THREE.Vector3();
const _ray = new THREE.Vector3();
const _temp = new THREE.Vector3();

// Reusable buffers for formation positions
const STACK_POSITIONS = Array.from({ length: 4 }, () => new THREE.Vector3());
const HANDLER_POSITIONS = Array.from({ length: 3 }, () => new THREE.Vector3());

export function computeStackPositions(
    discPos: THREE.Vector3,
    attackingEndzone: number,
): THREE.Vector3[] {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const baseZ = discPos.z + dir * 15;
    const spacing = dir * 7;
    // Offset stack laterally toward disc position, clamped to stay in bounds
    const halfW = FIELD_WIDTH / 2;
    const stackX = Math.max(-halfW * 0.4, Math.min(halfW * 0.4, discPos.x * 0.5));

    // Lateral jitter pattern: alternate left/right so players don't line up on the same X.
    // Uses a deterministic zigzag pattern (not random per-frame) to avoid jittering.
    const jitterAmplitude = 2.2; // meters of lateral offset
    for (let i = 0; i < 4; i++) {
        const z = Math.max(2, Math.min(FIELD_LENGTH - 2, baseZ + i * spacing));
        // Alternate: even indices offset left, odd offset right
        const lateralJitter = (i % 2 === 0 ? -1 : 1) * jitterAmplitude * (0.6 + (i * 0.2));
        const jitteredX = Math.max(-halfW * 0.45, Math.min(halfW * 0.45, stackX + lateralJitter));
        STACK_POSITIONS[i].set(jitteredX, 0, z);
    }
    return STACK_POSITIONS;
}

export function computeHorizontalStackPositions(
    discPos: THREE.Vector3,
    attackingEndzone: number,
): THREE.Vector3[] {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const lineZ = discPos.z + dir * HSTACK_DEPTH_OFFSET;
    const halfW = FIELD_WIDTH / 2;

    // 4 cutters spread across field width in distinct lanes for isolation
    const clampedLineZ = Math.max(2, Math.min(FIELD_LENGTH - 2, lineZ));
    const laneEdge = halfW * HSTACK_LANE_WIDTH_FACTOR;
    for (let i = 0; i < 4; i++) {
        const x = -laneEdge + (i / 3) * laneEdge * 2;
        STACK_POSITIONS[i].set(x, 0, clampedLineZ);
    }
    return STACK_POSITIONS;
}

/**
 * Compute isolation cut target for a horizontal stack cutter.
 * Each cutter works their own lane — in-cuts break toward disc,
 * deep cuts streak upfield within the lane boundaries.
 */
export function computeHStackIsolationCut(
    cutter: Player,
    laneIndex: number,
    discPos: THREE.Vector3,
    attackingEndzone: number,
    cutType: 'in' | 'deep',
): THREE.Vector3 {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const halfW = FIELD_WIDTH / 2;
    const laneEdge = halfW * HSTACK_LANE_WIDTH_FACTOR;
    const laneCenterX = -laneEdge + (laneIndex / 3) * laneEdge * 2;

    if (cutType === 'in') {
        // Break toward disc within lane
        const targetX = laneCenterX + (discPos.x > laneCenterX ? 2 : -2);
        const targetZ = discPos.z - dir * 4;
        _temp.set(
            Math.max(-halfW * 0.47, Math.min(halfW * 0.47, targetX)),
            0,
            Math.max(2, Math.min(FIELD_LENGTH - 2, targetZ)),
        );
    } else {
        // Streak deep within lane
        const targetZ = cutter.movement.position.z + dir * 22;
        _temp.set(
            Math.max(-halfW * 0.47, Math.min(halfW * 0.47, laneCenterX)),
            0,
            Math.max(2, Math.min(FIELD_LENGTH - 2, targetZ)),
        );
    }
    return _temp;
}

// Reusable buffer for zone offense positions
const ZONE_OFFENSE_POSITIONS = Array.from({ length: 4 }, () => new THREE.Vector3());

/**
 * Compute cutter positions for zone offense:
 * - 1 popper sits in soft spot of zone (center, mid-depth)
 * - 2 wings stretch wide to create passing lanes
 * - 1 deep threat downfield
 */
export function computeZoneOffensePositions(
    discPos: THREE.Vector3,
    attackingEndzone: number,
): THREE.Vector3[] {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const halfW = FIELD_WIDTH / 2;

    // Popper: sits in soft spot of zone, center of field, mid-depth
    const popperZ = Math.max(2, Math.min(FIELD_LENGTH - 2,
        discPos.z + dir * ZONE_OFFENSE_POPPER_DEPTH));
    ZONE_OFFENSE_POSITIONS[0].set(discPos.x * 0.3, 0, popperZ);

    // Wing left: stretch wide left
    const wingZ = Math.max(2, Math.min(FIELD_LENGTH - 2,
        discPos.z + dir * 10));
    ZONE_OFFENSE_POSITIONS[1].set(-halfW * ZONE_OFFENSE_WING_SPREAD, 0, wingZ);

    // Wing right: stretch wide right
    ZONE_OFFENSE_POSITIONS[2].set(halfW * ZONE_OFFENSE_WING_SPREAD, 0, wingZ);

    // Deep threat: downfield center
    const deepZ = Math.max(2, Math.min(FIELD_LENGTH - 2,
        discPos.z + dir * 22));
    ZONE_OFFENSE_POSITIONS[3].set(0, 0, deepZ);

    return ZONE_OFFENSE_POSITIONS;
}

/**
 * Compute handler positions for zone offense:
 * more handler-heavy, emphasize swinging the disc side to side
 */
export function computeZoneOffenseHandlerPositions(
    discPos: THREE.Vector3,
    attackingEndzone: number,
): THREE.Vector3[] {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const halfW = FIELD_WIDTH / 2;
    const cx = Math.max(-halfW * 0.3, Math.min(halfW * 0.3, discPos.x));

    // Wider handler triangle for swing passes
    const sideZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z - dir * 4));
    const behindZ = Math.max(2, Math.min(FIELD_LENGTH - 2, discPos.z - dir * 7));

    HANDLER_POSITIONS[0].set(cx - halfW * 0.35, 0, sideZ);
    HANDLER_POSITIONS[1].set(cx + halfW * 0.35, 0, sideZ);
    HANDLER_POSITIONS[2].set(cx, 0, behindZ);

    return HANDLER_POSITIONS;
}

export function computeHandlerPositions(
    discPos: THREE.Vector3,
    attackingEndzone: number,
): THREE.Vector3[] {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const behindZ = discPos.z - dir * 8;
    const sideZ = discPos.z - dir * 5;
    const halfW = FIELD_WIDTH / 2;
    // Offset handler triangle relative to disc x, clamped to stay in bounds
    const cx = Math.max(-halfW * 0.3, Math.min(halfW * 0.3, discPos.x));
    
    const clampedSideZ = Math.max(2, Math.min(FIELD_LENGTH - 2, sideZ));
    const clampedBehindZ = Math.max(2, Math.min(FIELD_LENGTH - 2, behindZ));
    HANDLER_POSITIONS[0].set(cx - halfW * 0.3, 0, clampedSideZ);
    HANDLER_POSITIONS[1].set(cx + halfW * 0.3, 0, clampedSideZ);
    HANDLER_POSITIONS[2].set(cx, 0, clampedBehindZ);
    
    return HANDLER_POSITIONS;
}

export function evaluateOpenness(
    thrower: Player,
    receiver: Player,
    defenders: Player[],
    attackingEndzone?: number,
): number {
    let minDefDistSq = Infinity;
    const recPos = receiver.movement.position;
    for (const def of defenders) {
        const dSq = def.movement.position.distanceToSquared(recPos);
        if (dSq < minDefDistSq) minDefDistSq = dSq;
    }

    const minDefDist = Math.sqrt(minDefDistSq);
    const normalized = Math.min(minDefDist / 3.0, 2.0);
    const laneClear = isLaneClear(thrower, receiver, defenders) ? 1.0 : 0.3;

    // Yards gained bonus — accounts for attack direction
    const zDiff = recPos.z - thrower.movement.position.z;
    const dir = attackingEndzone !== undefined ? (attackingEndzone === 0 ? -1 : 1) : Math.sign(zDiff);
    const yardGain = zDiff * dir; // positive when moving toward attacking endzone
    const yardBonus = 1 + Math.max(0, yardGain) * 0.03;

    return normalized * laneClear * yardBonus;
}

export function isLaneClear(
    thrower: Player,
    receiver: Player,
    defenders: Player[],
): boolean {
    _ray
        .copy(receiver.movement.position)
        .sub(thrower.movement.position);
    const dist = _ray.length();
    if (dist < 0.1) return true;
    _ray.normalize();

    for (const def of defenders) {
        _diff.copy(def.movement.position).sub(thrower.movement.position);
        const proj = _diff.dot(_ray);
        if (proj < 0 || proj > dist) continue;

        // Closest point on ray to defender
        _temp.copy(_ray).multiplyScalar(proj).add(thrower.movement.position);
        const perpDistSq = def.movement.position.distanceToSquared(_temp);
        if (perpDistSq < 2.25) return false; // 1.5 * 1.5 = 2.25
    }
    return true;
}

export function computeCutTarget(
    cutter: Player,
    discPos: THREE.Vector3,
    attackingEndzone: number,
    cutType: 'in' | 'deep',
): THREE.Vector3 {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const halfW = FIELD_WIDTH / 2;
    // Deterministic angle variation based on player index to avoid all cuts being identical
    const angleSeed = (cutter.index * 7 + 3) % 10; // 0-9
    const angleVariation = (angleSeed / 10 - 0.5) * 0.6; // -0.3 to +0.3 radians

    if (cutType === 'in') {
        // Diagonal in-cut: angled toward the disc rather than straight at it
        // Base direction: from cutter toward disc
        const toDiscX = discPos.x - cutter.movement.position.x;
        const toDiscZ = discPos.z - cutter.movement.position.z;
        const toDist = Math.sqrt(toDiscX * toDiscX + toDiscZ * toDiscZ);

        if (toDist > 0.5) {
            const ndx = toDiscX / toDist;
            const ndz = toDiscZ / toDist;
            // Rotate the cut direction by the angle variation (diagonal cut)
            const cosA = Math.cos(angleVariation);
            const sinA = Math.sin(angleVariation);
            const rotX = ndx * cosA - ndz * sinA;
            const rotZ = ndx * sinA + ndz * cosA;
            // Target ~10m along the rotated direction, but at least 5m from disc
            const cutDist = Math.min(toDist - 2, 10);
            _temp.set(
                cutter.movement.position.x + rotX * cutDist,
                0,
                cutter.movement.position.z + rotZ * cutDist,
            );
        } else {
            _temp.copy(discPos);
            _temp.x += (cutter.movement.position.x > 0 ? -1 : 1) * 5;
            _temp.z -= dir * 5;
        }
        // Clamp to field bounds
        _temp.x = Math.max(-halfW * 0.47, Math.min(halfW * 0.47, _temp.x));
        _temp.z = Math.max(2, Math.min(FIELD_LENGTH - 2, _temp.z));
        return _temp;
    } else {
        // Deep cut with diagonal angle variation
        // Base deep direction: straight downfield with slight lateral break
        const lateralDir = cutter.movement.position.x > 0 ? 1 : -1;
        // Add angle variation to make the deep cut diagonal
        const baseAngle = lateralDir * 0.15 + angleVariation * 0.5; // slight break + variation
        _temp.set(
            cutter.movement.position.x + Math.sin(baseAngle) * 20,
            0,
            cutter.movement.position.z + dir * 20,
        );
        _temp.x = Math.max(-halfW * 0.47, Math.min(halfW * 0.47, _temp.x));
        _temp.z = Math.max(2, Math.min(FIELD_LENGTH - 2, _temp.z));
        return _temp;
    }
}

export function computeLeadPass(
    thrower: Player,
    receiver: Player,
    throwSpeed: number,
): THREE.Vector3 {
    const dist = thrower.movement.position.distanceTo(receiver.movement.position);
    // Improved time of flight estimation (discs slow down in air)
    const avgSpeed = throwSpeed * 0.75;
    const travelTime = dist / Math.max(avgSpeed, 5);
    
    // Lead based on travel time, with a reasonable cap
    const leadTime = Math.min(travelTime, 1.2);
    
    // Receiver velocity
    const recVel = receiver.movement.velocity;
    
    // If receiver is barely moving, don't lead much (might be a stationary target)
    if (recVel.lengthSq() < 1.0) {
        return receiver.movement.position;
    }

    _temp.copy(recVel).multiplyScalar(leadTime);
    if (_temp.lengthSq() > 9.5 * 9.5) {
        _temp.setLength(9.5);
    }
    _temp.add(receiver.movement.position);

    // Keep target in bounds
    _temp.x = Math.max(-FIELD_WIDTH / 2 + 1, Math.min(FIELD_WIDTH / 2 - 1, _temp.x));
    _temp.z = Math.max(1, Math.min(FIELD_LENGTH - 1, _temp.z));

    return _temp;
}
