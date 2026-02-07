import * as THREE from 'three';

const TRAIL_LENGTH = 30;

export class DiscTrail {
    private line: THREE.Line;
    private geometry: THREE.BufferGeometry;
    private positions: Float32Array;
    private colors: Float32Array;
    private head = 0;
    private count = 0;
    private trail: THREE.Vector3[] = [];

    constructor(scene: THREE.Scene) {
        for (let i = 0; i < TRAIL_LENGTH; i++) {
            this.trail.push(new THREE.Vector3());
        }

        this.positions = new Float32Array(TRAIL_LENGTH * 3);
        this.colors = new Float32Array(TRAIL_LENGTH * 4);

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));

        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
        });

        this.line = new THREE.Line(this.geometry, material);
        this.line.visible = false;
        this.line.frustumCulled = false;
        scene.add(this.line);
    }

    push(pos: THREE.Vector3): void {
        this.trail[this.head].copy(pos);
        this.head = (this.head + 1) % TRAIL_LENGTH;
        if (this.count < TRAIL_LENGTH) this.count++;

        // Rebuild buffer from newest to oldest
        for (let i = 0; i < this.count; i++) {
            const idx = (this.head - 1 - i + TRAIL_LENGTH) % TRAIL_LENGTH;
            const p = this.trail[idx];
            this.positions[i * 3] = p.x;
            this.positions[i * 3 + 1] = p.y;
            this.positions[i * 3 + 2] = p.z;

            const alpha = 1 - i / this.count;
            // Blue-white trail
            this.colors[i * 4] = 0.53 + 0.47 * alpha;
            this.colors[i * 4 + 1] = 0.8 + 0.2 * alpha;
            this.colors[i * 4 + 2] = 1.0;
            this.colors[i * 4 + 3] = alpha;
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.setDrawRange(0, this.count);
        this.line.visible = this.count > 1;
    }

    clear(): void {
        this.head = 0;
        this.count = 0;
        this.line.visible = false;
    }
}
