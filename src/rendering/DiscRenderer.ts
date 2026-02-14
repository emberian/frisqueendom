import * as THREE from 'three';
import type { DiscSimulator } from '../../frisque-physics/pkg/frisque_physics.js';

export function createDiscMesh(): THREE.Group {
    const group = new THREE.Group();

    // Realistic disc profile using LatheGeometry
    const points = [];
    // Flight plate (center to rim start)
    for (let i = 0; i <= 10; i++) {
        const r = (i / 10) * 0.11;
        points.push(new THREE.Vector2(r, 0.012));
    }
    // Rim transition
    points.push(new THREE.Vector2(0.12, 0.011));
    points.push(new THREE.Vector2(0.135, 0.008));
    points.push(new THREE.Vector2(0.137, 0.0));
    points.push(new THREE.Vector2(0.135, -0.008));
    points.push(new THREE.Vector2(0.125, -0.012));
    points.push(new THREE.Vector2(0.11, -0.01)); // inner rim

    const discGeo = new THREE.LatheGeometry(points, 32);
    const discMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.1,
        emissive: 0xffffff,
        emissiveIntensity: 0.05
    });
    const discMesh = new THREE.Mesh(discGeo, discMat);
    discMesh.castShadow = true;
    discMesh.receiveShadow = true;
    group.add(discMesh);

    // Spin stripe on top face (recessed slightly) with rotational blur shader
    const stripeGeo = new THREE.TorusGeometry(0.09, 0.006, 8, 64);
    const stripeMat = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0x1a73e8) },
            emissive: { value: new THREE.Color(0x1a73e8) },
            intensity: { value: 0.2 },
            time: { value: 0 }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform vec3 emissive;
            uniform float intensity;
            uniform float time;
            varying vec2 vUv;
            varying vec3 vNormal;
            void main() {
                // Radial blur simulation
                float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
                float blur = sin(angle * 10.0 + time * 20.0) * 0.5 + 0.5;
                vec3 finalColor = mix(color, color * 1.5, blur);
                gl_FragColor = vec4(finalColor + emissive * intensity, 1.0);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.0125;
    group.add(stripe);
    group.userData.stripeShader = stripeMat;

    return group;
}

/**
 * Set team color on the disc body and stripe.
 */
export function setDiscTeamColor(mesh: THREE.Group, primaryHex: number, secondaryHex: number): void {
    // Body color
    const bodyMesh = mesh.children[0] as THREE.Mesh;
    if (bodyMesh?.material instanceof THREE.MeshStandardMaterial) {
        bodyMesh.material.color.setHex(primaryHex);
        bodyMesh.material.emissive.setHex(primaryHex);
        bodyMesh.material.emissiveIntensity = 0.05;
    }
    // Stripe color
    if (mesh.userData.stripeShader) {
        mesh.userData.stripeShader.uniforms.color.value.setHex(secondaryHex);
        mesh.userData.stripeShader.uniforms.emissive.value.setHex(secondaryHex);
    }
}

export function updateDiscMesh(mesh: THREE.Group, sim: DiscSimulator, spinRate?: number): void {
    mesh.position.set(sim.pos_x(), sim.pos_y(), sim.pos_z());
    mesh.quaternion.set(sim.quat_x(), sim.quat_y(), sim.quat_z(), sim.quat_w());

    if (mesh.userData.stripeShader) {
        // Tie stripe animation speed to actual spin rate for realistic blur
        const rate = spinRate ?? 30;
        mesh.userData.stripeShader.uniforms.time.value += rate * 0.001;
        // Increase blur intensity with spin
        mesh.userData.stripeShader.uniforms.intensity.value = 0.1 + Math.min(Math.abs(rate) / 100, 0.5);
    }
}
