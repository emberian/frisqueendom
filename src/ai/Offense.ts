import * as THREE from 'three';
import type { Player } from '../entities/Player';
import { FIELD_WIDTH } from '../data/Constants';

const _diff = new THREE.Vector3();
const _ray = new THREE.Vector3();

export function computeStackPositions(
    discPos: THREE.Vector3,
    attackingEndzone: number,
): THREE.Vector3[] {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const baseZ = discPos.z + dir * 15;
    const spacing = dir * 7;
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
        positions.push(new THREE.Vector3(0, 0, baseZ + i * spacing));
    }
    return positions;
}

export function computeHandlerPositions(
    discPos: THREE.Vector3,
    attackingEndzone: number,
): THREE.Vector3[] {
    const dir = attackingEndzone === 0 ? -1 : 1;
    const behindZ = discPos.z - dir * 8;
    const sideZ = discPos.z - dir * 5;
    const halfW = FIELD_WIDTH / 2;
    return [
        new THREE.Vector3(-halfW * 0.3, 0, sideZ),
        new THREE.Vector3(halfW * 0.3, 0, sideZ),
        new THREE.Vector3(0, 0, behindZ),
    ];
}

export function evaluateOpenness(
    thrower: Player,
    receiver: Player,
    defenders: Player[],
): number {
    let minDefDist = Infinity;
    for (const def of defenders) {
        const d = def.movement.position.distanceTo(receiver.movement.position);
        if (d < minDefDist) minDefDist = d;
    }

    const normalized = Math.min(minDefDist / 3.0, 2.0);
    const laneClear = isLaneClear(thrower, receiver, defenders) ? 1.0 : 0.3;

    // Yards gained bonus
    const yardDiff =
        receiver.movement.position.z - thrower.movement.position.z;
    const yardBonus = 1 + Math.max(0, yardDiff) * 0.03;

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

        const closest = _ray.clone().multiplyScalar(proj).add(thrower.movement.position);
        const perpDist = def.movement.position.distanceTo(closest);
        if (perpDist < 1.5) return false;
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
        const target = discPos.clone();
        target.x += (cutter.movement.position.x > 0 ? -1 : 1) * 5;
        target.z -= dir * 5;
        return target;
    } else {
        // Cut deep
        const target = cutter.movement.position.clone();
        target.z += dir * 20;
        target.x += (cutter.movement.position.x > 0 ? 1 : -1) * 3;
        return target;
    }
}

export function computeLeadPass(
    receiver: Player,
    throwSpeed: number,
): THREE.Vector3 {
    const dist = receiver.movement.position.length(); // approximate
    const travelTime = dist / Math.max(throwSpeed, 5);
    const leadTime = Math.min(travelTime, 0.5);
    return receiver.movement.position
        .clone()
        .add(receiver.movement.velocity.clone().multiplyScalar(leadTime));
}
