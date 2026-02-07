import * as THREE from 'three';
import type { DiscSimulator } from '../../frisque-physics/pkg/frisque_physics.js';

export function createDiscMesh(): THREE.Group {
    const group = new THREE.Group();

    // Disc body: cylinder
    const discGeo = new THREE.CylinderGeometry(0.137, 0.137, 0.025, 32);
    const discMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const discMesh = new THREE.Mesh(discGeo, discMat);
    group.add(discMesh);

    // Spin stripe on top face
    const stripeGeo = new THREE.TorusGeometry(0.10, 0.008, 8, 32);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x1a73e8 });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.013;
    group.add(stripe);

    return group;
}

export function updateDiscMesh(mesh: THREE.Group, sim: DiscSimulator): void {
    mesh.position.set(sim.pos_x(), sim.pos_y(), sim.pos_z());
    mesh.quaternion.set(sim.quat_x(), sim.quat_y(), sim.quat_z(), sim.quat_w());
}
