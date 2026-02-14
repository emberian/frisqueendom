import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const TRAIL_LENGTH = 40;

export class DiscTrail {
    private line: Line2;
    private geometry: LineGeometry;
    private material: LineMaterial;
    private head = 0;
    private count = 0;
    private trail: THREE.Vector3[] = [];
    private positions: number[] = [];
    private colors: number[] = [];
    private teamColor = new THREE.Color(0x8fdcff);
    private overrideColor: THREE.Color | null = null;

    constructor(scene: THREE.Scene) {
        for (let i = 0; i < TRAIL_LENGTH; i++) {
            this.trail.push(new THREE.Vector3());
        }

        this.positions = new Array(TRAIL_LENGTH * 3).fill(0);
        this.colors = new Array(TRAIL_LENGTH * 3).fill(1);

        this.geometry = new LineGeometry();
        
        this.material = new LineMaterial({
            vertexColors: true,
            transparent: true,
            linewidth: 0.1,
            worldUnits: true,
            opacity: 0.85,
            alphaToCoverage: true
        });
        this.material.resolution.set(window.innerWidth, window.innerHeight);

        this.line = new Line2(this.geometry, this.material);
        this.line.visible = false;
        this.line.frustumCulled = false;
        scene.add(this.line);
    }

    push(pos: THREE.Vector3): void {
        this.trail[this.head].copy(pos);
        this.head = (this.head + 1) % TRAIL_LENGTH;
        if (this.count < TRAIL_LENGTH) this.count++;

        if (this.count < 2) return;

        // Rebuild buffer from newest to oldest
        for (let i = 0; i < this.count; i++) {
            const idx = (this.head - 1 - i + TRAIL_LENGTH) % TRAIL_LENGTH;
            const p = this.trail[idx];
            this.positions[i * 3] = p.x;
            this.positions[i * 3 + 1] = p.y;
            this.positions[i * 3 + 2] = p.z;

            const t = i / this.count; // 0 = head, 1 = tail
            const base = this.overrideColor || this.teamColor;

            // Head is bright white-tinted, tail fades to dim team color
            const brightness = 1 - t * 0.7; // 1.0 → 0.3
            const whiteMix = (1 - t) * 0.5; // head has 50% white blend
            this.colors[i * 3] = (base.r + (1 - base.r) * whiteMix) * brightness;
            this.colors[i * 3 + 1] = (base.g + (1 - base.g) * whiteMix) * brightness;
            this.colors[i * 3 + 2] = (base.b + (1 - base.b) * whiteMix) * brightness;
        }

        // LineGeometry expects full arrays
        this.geometry.setPositions(this.positions.slice(0, this.count * 3));
        this.geometry.setColors(this.colors.slice(0, this.count * 3));
        
        this.line.visible = true;
        this.line.computeLineDistances();
    }

    setTeamColor(hex: number): void {
        this.teamColor.setHex(hex);
    }

    setOverrideColor(hex: string | null): void {
        if (!hex) {
            this.overrideColor = null;
        } else {
            this.overrideColor = new THREE.Color(hex);
        }
    }

    clear(): void {
        this.head = 0;
        this.count = 0;
        this.line.visible = false;
    }

    handleResize(width: number, height: number): void {
        this.material.resolution.set(width, height);
    }
}
