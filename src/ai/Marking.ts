import * as THREE from 'three';
import type { Player } from '../entities/Player';

export function computeMarkPosition(
    thrower: Player,
    forceSide: number, // +1 or -1 to force one side
): THREE.Vector3 {
    const offset = new THREE.Vector3(
        forceSide * 0.5,
        0,
        0,
    );
    // Rotate offset by thrower's facing
    offset.applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        thrower.movement.facing,
    );

    const markPos = thrower.movement.position.clone().add(
        new THREE.Vector3(
            Math.sin(thrower.movement.facing) * 1.0,
            0,
            Math.cos(thrower.movement.facing) * 1.0,
        ),
    );
    markPos.add(offset);
    return markPos;
}

export function updateMarkMirror(
    marker: Player,
    thrower: Player,
    dt: number,
): void {
    const targetFacing = thrower.movement.facing;
    // Delayed mirror
    let diff = targetFacing - marker.movement.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    marker.movement.facing += diff * Math.min(1, 8 * dt);
}
