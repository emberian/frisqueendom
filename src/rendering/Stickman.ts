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

// Shared static materials to minimize GPU overhead
let SHARED_LIMB_MAT: THREE.MeshStandardMaterial | null = null;
let SHARED_JOINT_MAT: THREE.MeshStandardMaterial | null = null;

interface SharedMaterials {
    limb: THREE.MeshStandardMaterial;
    joint: THREE.MeshStandardMaterial;
}

function getSharedMaterials(): SharedMaterials {
    if (!SHARED_LIMB_MAT || !SHARED_JOINT_MAT) {
        SHARED_LIMB_MAT = new THREE.MeshStandardMaterial({ 
            color: 0x111111,
            roughness: 0.7,
            metalness: 0.2
        });
        applyRimLighting(SHARED_LIMB_MAT, 0.3);

        SHARED_JOINT_MAT = new THREE.MeshStandardMaterial({ 
            color: 0x000000,
            roughness: 0.5
        });
        applyRimLighting(SHARED_JOINT_MAT, 0.2);
    }
    return { limb: SHARED_LIMB_MAT, joint: SHARED_JOINT_MAT };
}

function applyRimLighting(mat: THREE.MeshStandardMaterial, intensity: number) {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.rimIntensity = { value: intensity };
        // Rim color is now per-instance/mesh via userData if we wanted, 
        // but for now we'll use a fixed white or team color uniform.
        // To support different team colors on shared mats, we use a varying.
        shader.vertexShader = `
            varying vec3 vViewDir;
            varying vec3 vNormalWorld;
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <beginnormal_vertex>',
            `
            #include <beginnormal_vertex>
            vNormalWorld = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
            `
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vViewDir = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);
            `
        );
        shader.fragmentShader = `
            uniform float rimIntensity;
            varying vec3 vViewDir;
            varying vec3 vNormalWorld;
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormalWorld), normalize(vViewDir))), 3.0);
            gl_FragColor.rgb += vec3(1.0) * fresnel * rimIntensity; // Default white rim
            `
        );
    };
}

export class Stickman {
    group = new THREE.Group();
    private boneMeshes: THREE.Mesh[] = [];
    private jointMeshes: THREE.Mesh[] = [];
    private headMesh: THREE.Mesh;
    private jerseyMesh: THREE.Mesh;
    private jerseyGeo: THREE.BufferGeometry;
    private accentMesh: THREE.Mesh | null = null;
    private worldJoints = new Float32Array(JOINT_COUNT * 3);
    private indicatorRing: THREE.Mesh;
    private currentAccentColor: string | null = null;

    private static readonly LIMB_RADIUS = 0.035;
    private static readonly JOINT_RADIUS = 0.045;

    constructor(teamColor: number) {
        const shared = getSharedMaterials();

        // Create volumetric bones (cylinders)
        const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
        cylinderGeo.rotateX(Math.PI / 2); // Align with Z axis for easy 'lookAt'

        for (let i = 0; i < BONES.length; i++) {
            const mesh = new THREE.Mesh(cylinderGeo, shared.limb);
            mesh.castShadow = true;
            this.boneMeshes.push(mesh);
            this.group.add(mesh);
        }

        // Create joint spheres
        const jointGeo = new THREE.SphereGeometry(1, 8, 8);
        for (let i = 0; i < JOINT_COUNT; i++) {
            const mesh = new THREE.Mesh(jointGeo, shared.joint);
            mesh.scale.setScalar(Stickman.JOINT_RADIUS);
            this.jointMeshes.push(mesh);
            this.group.add(mesh);
        }

        // Head sphere
        const headGeo = new THREE.SphereGeometry(0.15, 16, 16);
        // Head can stay unique or share, but there's only 14, so standard mat is fine
        const headMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.3 });
        this.headMesh = new THREE.Mesh(headGeo, headMat);
        this.headMesh.castShadow = true;
        this.group.add(this.headMesh);

        // Jersey (torso quad) - UNIQUE per player for team colors
        this.jerseyGeo = new THREE.BufferGeometry();
        const jerseyPositions = new Float32Array([
            0, 1.5, 0,   // neck
            -0.25, 1.4, 0, // L shoulder
            0, 0.85, 0,  // waist
            0.25, 1.4, 0,  // R shoulder
        ]);
        const jerseyIndices = new Uint16Array([0, 1, 3, 1, 2, 3]);
        this.jerseyGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(jerseyPositions, 3),
        );
        this.jerseyGeo.setIndex(new THREE.BufferAttribute(jerseyIndices, 1));
        const jerseyMat = new THREE.MeshStandardMaterial({
            color: teamColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95,
            emissive: teamColor,
            emissiveIntensity: 0.2
        });
        applyRimLighting(jerseyMat, 0.4);
        this.jerseyMesh = new THREE.Mesh(this.jerseyGeo, jerseyMat);
        this.jerseyMesh.castShadow = true;
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

            this.worldJoints[i * 3] = position.x + lx * cos + lz * sin;
            this.worldJoints[i * 3 + 1] = position.y + ly + 0.85; 
            this.worldJoints[i * 3 + 2] = position.z - lx * sin + lz * cos;

            // Update joint sphere position
            this.jointMeshes[i].position.set(
                this.worldJoints[i * 3],
                this.worldJoints[i * 3 + 1],
                this.worldJoints[i * 3 + 2]
            );
        }

        // Update volumetric bone positions and rotations
        const start = new THREE.Vector3();
        const end = new THREE.Vector3();
        for (let i = 0; i < BONES.length; i++) {
            const [a, b] = BONES[i];
            start.set(this.worldJoints[a * 3], this.worldJoints[a * 3 + 1], this.worldJoints[a * 3 + 2]);
            end.set(this.worldJoints[b * 3], this.worldJoints[b * 3 + 1], this.worldJoints[b * 3 + 2]);

            const dist = start.distanceTo(end);
            const mesh = this.boneMeshes[i];
            
            // Position at midpoint
            mesh.position.copy(start).lerp(end, 0.5);
            // Scale length (geometry was 1 unit long)
            mesh.scale.set(Stickman.LIMB_RADIUS, Stickman.LIMB_RADIUS, dist);
            // Orient
            mesh.lookAt(end);
        }

        // Update head
        this.headMesh.position.set(
            this.worldJoints[0],
            this.worldJoints[1],
            this.worldJoints[2],
        );

        if (this.accentMesh) {
            this.accentMesh.position.set(
                this.worldJoints[0],
                this.worldJoints[1] + 0.18,
                this.worldJoints[2],
            );
        }

        // Update jersey quad
        const jerseyPos = this.jerseyGeo.attributes.position as THREE.BufferAttribute;
        const wj = this.worldJoints;
        jerseyPos.setXYZ(0, wj[1 * 3], wj[1 * 3 + 1], wj[1 * 3 + 2]); // neck
        jerseyPos.setXYZ(1, wj[2 * 3], wj[2 * 3 + 1], wj[2 * 3 + 2]); // L shoulder
        jerseyPos.setXYZ(2, wj[8 * 3], wj[8 * 3 + 1], wj[8 * 3 + 2]); // waist
        jerseyPos.setXYZ(3, wj[5 * 3], wj[5 * 3 + 1], wj[5 * 3 + 2]); // R shoulder
        jerseyPos.needsUpdate = true;
        this.jerseyGeo.computeVertexNormals();

        // Update indicator ring position
        if (this.indicatorRing.visible) {
            this.indicatorRing.position.set(position.x, 0.02, position.z);
        }
    }

    updateResolution(_width: number, _height: number): void {
        // No longer needed for volumetric meshes
    }

    setControlled(controlled: boolean): void {
        this.indicatorRing.visible = controlled;
    }

    setJerseyColor(color: number): void {
        const mat = this.jerseyMesh.material as THREE.MeshStandardMaterial;
        mat.color.set(color);
        mat.emissive.set(color);
    }

    setAccent(colorHex: string | null): void {
        if (this.currentAccentColor === colorHex) return;
        this.currentAccentColor = colorHex;

        if (this.accentMesh) {
            this.group.remove(this.accentMesh);
            this.accentMesh.geometry.dispose();
            (this.accentMesh.material as THREE.Material).dispose();
            this.accentMesh = null;
        }

        if (!colorHex) return;

        const geo = new THREE.TorusGeometry(0.16, 0.015, 8, 24);
        geo.rotateX(Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({ 
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.5
        });
        this.accentMesh = new THREE.Mesh(geo, mat);
        this.group.add(this.accentMesh);
    }

    dispose(): void {
        this.boneMeshes.forEach(m => {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
        });
        this.jointMeshes.forEach(m => {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
        });
        (this.headMesh.geometry as THREE.SphereGeometry).dispose();
        (this.headMesh.material as THREE.Material).dispose();
        this.jerseyGeo.dispose();
        (this.jerseyMesh.material as THREE.Material).dispose();
    }
}
