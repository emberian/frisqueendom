import * as THREE from 'three';
import type { Player } from '../entities/Player';
import { FIELD_WIDTH } from '../data/Constants';

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
    
    for (let i = 0; i < 4; i++) {
        STACK_POSITIONS[i].set(stackX, 0, baseZ + i * spacing);
    }
    return STACK_POSITIONS;
}

export function computeHorizontalStackPositions(
    discPos: THREE.Vector3,
    attackingEndzone: number,
): THREE.Vector3[] {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const lineZ = discPos.z + dir * 15; // 15m downfield
    const halfW = FIELD_WIDTH / 2;
    
    // 4 cutters spread across the field width
    for (let i = 0; i < 4; i++) {
        const x = -halfW * 0.6 + (i / 3) * halfW * 1.2;
        STACK_POSITIONS[i].set(x, 0, lineZ);
    }
    return STACK_POSITIONS;
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
    
    HANDLER_POSITIONS[0].set(cx - halfW * 0.3, 0, sideZ);
    HANDLER_POSITIONS[1].set(cx + halfW * 0.3, 0, sideZ);
    HANDLER_POSITIONS[2].set(cx, 0, behindZ);
    
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

    if (cutType === 'in') {
        // Cut toward disc
        _temp.copy(discPos);
        _temp.x += (cutter.movement.position.x > 0 ? -1 : 1) * 5;
        _temp.z -= dir * 5;
        return _temp;
    } else {
        // Cut deep
        _temp.copy(cutter.movement.position);
        _temp.z += dir * 20;
        _temp.x += (cutter.movement.position.x > 0 ? 1 : -1) * 3;
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
    
    return _temp;
}
