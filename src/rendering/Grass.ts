import * as THREE from 'three';
import { FIELD_LENGTH, FIELD_WIDTH } from '../data/Constants';

const BLADE_COUNT = 15000;
const BLADE_HEIGHT = 0.07;
const BLADE_WIDTH = 0.015;

export class GrassField {
    mesh: THREE.InstancedMesh;
    private dummy = new THREE.Object3D();
    private time = 0;
    private windDir = new THREE.Vector2(0, 1);
    private windSpeed = 0;

    constructor(scene: THREE.Scene) {
        // Blade geometry: thin triangle
        const geo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            -BLADE_WIDTH / 2, 0, 0,
            BLADE_WIDTH / 2, 0, 0,
            0, BLADE_HEIGHT, 0,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
        });

        this.mesh = new THREE.InstancedMesh(geo, mat, BLADE_COUNT);
        this.mesh.receiveShadow = true;

        // Scatter blades across the field
        const colors = new Float32Array(BLADE_COUNT * 3);

        for (let i = 0; i < BLADE_COUNT; i++) {
            const x = (Math.random() - 0.5) * FIELD_WIDTH;
            const z = Math.random() * FIELD_LENGTH;
            const rot = Math.random() * Math.PI * 2;
            const scale = 0.8 + Math.random() * 0.4;

            this.dummy.position.set(x, 0, z);
            this.dummy.rotation.set(0, rot, 0);
            this.dummy.scale.set(1, scale, 1);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);

            // Color variation + mowing stripes
            const stripe = Math.floor(z / 3) % 2;
            const baseG = 0.45 + stripe * 0.08;
            const noise = (Math.random() - 0.5) * 0.08;
            colors[i * 3] = 0.15 + noise;
            colors[i * 3 + 1] = baseG + noise;
            colors[i * 3 + 2] = 0.12 + noise;
        }

        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        this.mesh.instanceMatrix.needsUpdate = true;

        scene.add(this.mesh);
    }

    update(dt: number, windSpeed: number, windDirection: number): void {
        this.time += dt;
        this.windSpeed = windSpeed;
        this.windDir.set(Math.sin(windDirection), Math.cos(windDirection));

        // Animate grass bending by modifying instance matrices
        // For perf, only update a subset each frame
        const batchSize = Math.min(3000, BLADE_COUNT);
        const offset = (Math.floor(this.time * 60) * batchSize) % BLADE_COUNT;

        for (let i = offset; i < offset + batchSize && i < BLADE_COUNT; i++) {
            this.mesh.getMatrixAt(i, this.dummy.matrix);
            this.dummy.matrix.decompose(
                this.dummy.position,
                this.dummy.quaternion,
                this.dummy.scale,
            );

            // Wind bend
            const bendAmount = windSpeed * 0.02;
            const microSway =
                Math.sin(
                    this.time * 3 + this.dummy.position.x * 0.5 + this.dummy.position.z * 0.3,
                ) * 0.015;
            const totalBend = bendAmount + microSway;

            // Apply lean toward wind direction
            this.dummy.rotation.x = totalBend * this.windDir.y;
            this.dummy.rotation.z = -totalBend * this.windDir.x;

            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
