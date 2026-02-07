import * as THREE from 'three';
import {
    FIELD_LENGTH,
    FIELD_WIDTH,
    ENDZONE_DEPTH,
    BRICK_MARK_DISTANCE,
} from '../data/Constants';

export function isInBounds(pos: THREE.Vector3): boolean {
    return (
        pos.x >= -FIELD_WIDTH / 2 &&
        pos.x <= FIELD_WIDTH / 2 &&
        pos.z >= 0 &&
        pos.z <= FIELD_LENGTH
    );
}

export function isInEndzone(
    pos: THREE.Vector3,
    targetEndzone: number,
): boolean {
    if (targetEndzone === 0) {
        return pos.z >= 0 && pos.z <= ENDZONE_DEPTH;
    } else {
        return (
            pos.z >= FIELD_LENGTH - ENDZONE_DEPTH && pos.z <= FIELD_LENGTH
        );
    }
}

export function getBrickMark(nearestEndzone: number): THREE.Vector3 {
    const z =
        nearestEndzone === 0
            ? BRICK_MARK_DISTANCE
            : FIELD_LENGTH - BRICK_MARK_DISTANCE;
    return new THREE.Vector3(0, 0, z);
}

export function nearestInBoundsPoint(pos: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
        Math.max(-FIELD_WIDTH / 2, Math.min(FIELD_WIDTH / 2, pos.x)),
        0,
        Math.max(0, Math.min(FIELD_LENGTH, pos.z)),
    );
}
