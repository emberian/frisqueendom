import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { JOINT_COUNT } from './Animation';

// Bone connections: pairs of joint indices
const BONES: [number, number][] = [
    [0, 1],   // head to neck
    [1, 2],   // neck to L shoulder
    [1, 5],   // neck to R shoulder
    [2, 3],   // L shoulder to L elbow
    [3, 4],   // L elbow to L wrist
    [5, 6],   // R shoulder to R elbow
    [6, 7],   // R elbow to R wrist
    [1, 8],   // neck to waist (spine)
    [8, 9],   // waist to L knee
    [9, 10],  // L knee to L ankle
    [8, 11],  // waist to R knee
    [11, 12], // R knee to R ankle
];

export class Stickman {
    group = new THREE.Group();
    private boneLines: Line2[] = [];
    private boneGeometries: LineGeometry[] = [];
    private headMesh: THREE.Mesh;
    private jerseyMesh: THREE.Mesh;
    private jerseyGeo: THREE.BufferGeometry;
    private lineMaterial: LineMaterial;
    private worldJoints = new Float32Array(JOINT_COUNT * 3);
    private indicatorRing: THREE.Mesh;

    constructor(teamColor: number) {
        // Line material for bones
        this.lineMaterial = new LineMaterial({
            color: 0x000000,
            linewidth: 0.04,
            worldUnits: true,
        });
        this.lineMaterial.resolution.set(window.innerWidth, window.innerHeight);

        // Create bone lines
        for (let i = 0; i < BONES.length; i++) {
            const geo = new LineGeometry();
            geo.setPositions([0, 0, 0, 0, 0.1, 0]); // placeholder
            const line = new Line2(geo, this.lineMaterial);
            line.computeLineDistances();
            this.boneLines.push(line);
            this.boneGeometries.push(geo);
            this.group.add(line);
        }

        // Head sphere
        const headGeo = new THREE.SphereGeometry(0.14, 12, 12);
        const headMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.headMesh = new THREE.Mesh(headGeo, headMat);
        this.group.add(this.headMesh);

        // Jersey (torso triangle)
        this.jerseyGeo = new THREE.BufferGeometry();
        // Initialize with valid placeholder positions to avoid NaN on first frame
        const jerseyPositions = new Float32Array([
            0, 1.5, 0,   // neck
            -0.25, 1.4, 0, // L shoulder
            0, 0.85, 0,  // waist
            0.25, 1.4, 0,  // R shoulder
        ]);
        const jerseyIndices = new Uint16Array([0, 1, 3, 1, 2, 3]); // two triangles
        this.jerseyGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(jerseyPositions, 3),
        );
        this.jerseyGeo.setIndex(new THREE.BufferAttribute(jerseyIndices, 1));
        const jerseyMat = new THREE.MeshBasicMaterial({
            color: teamColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
        });
        this.jerseyMesh = new THREE.Mesh(this.jerseyGeo, jerseyMat);
        this.group.add(this.jerseyMesh);

        // Controlled player indicator ring
        const ringGeo = new THREE.RingGeometry(0.5, 0.65, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        this.indicatorRing = new THREE.Mesh(ringGeo, ringMat);
        this.indicatorRing.visible = false;
        this.group.add(this.indicatorRing);
    }

    updateFromJoints(
        localJoints: Float32Array,
        position: THREE.Vector3,
        facing: number,
    ): void {
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);

        // Transform local joints to world space
        for (let i = 0; i < JOINT_COUNT; i++) {
            const lx = localJoints[i * 3];
            const ly = localJoints[i * 3 + 1];
            const lz = localJoints[i * 3 + 2];

            // Rotate around Y by facing angle, then translate
            this.worldJoints[i * 3] = position.x + lx * cos + lz * sin;
            this.worldJoints[i * 3 + 1] = position.y + ly + 0.85; // waist height offset
            this.worldJoints[i * 3 + 2] = position.z - lx * sin + lz * cos;
        }

        // Update bone line positions
        for (let i = 0; i < BONES.length; i++) {
            const [a, b] = BONES[i];
            const ax = this.worldJoints[a * 3];
            const ay = this.worldJoints[a * 3 + 1];
            const az = this.worldJoints[a * 3 + 2];
            const bx = this.worldJoints[b * 3];
            const by = this.worldJoints[b * 3 + 1];
            const bz = this.worldJoints[b * 3 + 2];

            this.boneGeometries[i].setPositions([ax, ay, az, bx, by, bz]);
            this.boneLines[i].computeLineDistances();
        }

        // Update head
        this.headMesh.position.set(
            this.worldJoints[0],
            this.worldJoints[1],
            this.worldJoints[2],
        );

        // Update jersey quad: neck(1), L_shoulder(2), waist(8), R_shoulder(5)
        const jerseyPos = this.jerseyGeo.attributes.position as THREE.BufferAttribute;
        const wj = this.worldJoints;
        jerseyPos.setXYZ(0, wj[1 * 3], wj[1 * 3 + 1], wj[1 * 3 + 2]); // neck
        jerseyPos.setXYZ(1, wj[2 * 3], wj[2 * 3 + 1], wj[2 * 3 + 2]); // L shoulder
        jerseyPos.setXYZ(2, wj[8 * 3], wj[8 * 3 + 1], wj[8 * 3 + 2]); // waist
        jerseyPos.setXYZ(3, wj[5 * 3], wj[5 * 3 + 1], wj[5 * 3 + 2]); // R shoulder
        jerseyPos.needsUpdate = true;
        this.jerseyGeo.computeBoundingSphere();

        // Update indicator ring position at player's feet
        if (this.indicatorRing.visible) {
            this.indicatorRing.position.set(position.x, 0.02, position.z);
        }
    }

    updateResolution(width: number, height: number): void {
        this.lineMaterial.resolution.set(width, height);
    }

    setControlled(controlled: boolean): void {
        this.indicatorRing.visible = controlled;
    }

    setJerseyColor(color: number): void {
        (this.jerseyMesh.material as THREE.MeshBasicMaterial).color.set(color);
    }

    dispose(): void {
        this.boneGeometries.forEach((g) => g.dispose());
        this.lineMaterial.dispose();
        (this.headMesh.geometry as THREE.SphereGeometry).dispose();
        this.jerseyGeo.dispose();
    }
}
