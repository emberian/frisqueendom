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
    private teamR = 0.53;
    private teamG = 0.8;
    private teamB = 1.0;

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
            // Team-colored trail, brightening toward white at newest point
            this.colors[i * 4] = this.teamR + (1 - this.teamR) * alpha;
            this.colors[i * 4 + 1] = this.teamG + (1 - this.teamG) * alpha;
            this.colors[i * 4 + 2] = this.teamB + (1 - this.teamB) * alpha;
            this.colors[i * 4 + 3] = alpha;
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.setDrawRange(0, this.count);
        this.line.visible = this.count > 1;
    }

    setTeamColor(hex: number): void {
        this.teamR = ((hex >> 16) & 0xff) / 255;
        this.teamG = ((hex >> 8) & 0xff) / 255;
        this.teamB = (hex & 0xff) / 255;
    }

    clear(): void {
        this.head = 0;
        this.count = 0;
        this.line.visible = false;
    }
}
