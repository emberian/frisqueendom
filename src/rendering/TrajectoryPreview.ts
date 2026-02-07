import * as THREE from 'three';
import { DiscBridge } from '../physics/DiscBridge';

const MAX_POINTS = 90;

export class TrajectoryPreview {
    private line: THREE.Line;
    private geometry: THREE.BufferGeometry;
    private positions: Float32Array;
    private colors: Float32Array;
    private landingMarker: THREE.Mesh;

    constructor(scene: THREE.Scene) {
        this.positions = new Float32Array(MAX_POINTS * 3);
        this.colors = new Float32Array(MAX_POINTS * 3);

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            linewidth: 1,
        });

        this.line = new THREE.Line(this.geometry, material);
        this.line.visible = false;
        this.line.frustumCulled = false;
        scene.add(this.line);

        // Landing marker
        const markerGeo = new THREE.CircleGeometry(0.3, 16);
        const markerMat = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        this.landingMarker = new THREE.Mesh(markerGeo, markerMat);
        this.landingMarker.rotation.x = -Math.PI / 2;
        this.landingMarker.visible = false;
        scene.add(this.landingMarker);
    }

    update(bridge: DiscBridge): void {
        const data = bridge.predict(3.0, MAX_POINTS);
        const pointCount = Math.floor(data.length / 3);

        if (pointCount === 0) {
            this.line.visible = false;
            this.landingMarker.visible = false;
            return;
        }

        for (let i = 0; i < pointCount; i++) {
            const t = i / pointCount;
            this.positions[i * 3] = data[i * 3];
            this.positions[i * 3 + 1] = data[i * 3 + 1];
            this.positions[i * 3 + 2] = data[i * 3 + 2];

            // Green to red gradient
            this.colors[i * 3] = t;
            this.colors[i * 3 + 1] = 1 - t;
            this.colors[i * 3 + 2] = 0;
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.setDrawRange(0, pointCount);
        this.line.visible = true;

        // Update landing marker
        const lastIdx = (pointCount - 1) * 3;
        this.landingMarker.position.set(data[lastIdx], 0.02, data[lastIdx + 2]);
        this.landingMarker.visible = true;
    }

    setVisible(visible: boolean): void {
        this.line.visible = visible;
        this.landingMarker.visible = visible;
    }
}
