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
let SHARED_SHOE_MAT: THREE.MeshStandardMaterial | null = null;

interface SharedMaterials {
    limb: THREE.MeshStandardMaterial;
    joint: THREE.MeshStandardMaterial;
    shoe: THREE.MeshStandardMaterial;
}

function getSharedMaterials(): SharedMaterials {
    if (!SHARED_LIMB_MAT || !SHARED_JOINT_MAT || !SHARED_SHOE_MAT) {
        SHARED_LIMB_MAT = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.6,
            metalness: 0.15
        });
        applyRimLighting(SHARED_LIMB_MAT, 0.5);

        SHARED_JOINT_MAT = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.5
        });
        applyRimLighting(SHARED_JOINT_MAT, 0.35);

        SHARED_SHOE_MAT = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.4,
            metalness: 0.1,
            emissive: 0x444444,
            emissiveIntensity: 0.15
        });
        applyRimLighting(SHARED_SHOE_MAT, 0.3);
    }
    return { limb: SHARED_LIMB_MAT, joint: SHARED_JOINT_MAT, shoe: SHARED_SHOE_MAT };
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

export type Expression = 'neutral' | 'happy' | 'frustrated' | 'shocked';

export class Stickman {
    group = new THREE.Group();
    private boneMeshes: THREE.Mesh[] = [];
    private jointMeshes: THREE.Mesh[] = [];
    private headMesh: THREE.Mesh;
    private jerseyMesh: THREE.Mesh;
    private jerseyGeo: THREE.BufferGeometry;
    private shortsMesh: THREE.Mesh;
    private shortsGeo: THREE.BufferGeometry;
    private leftShoeMesh: THREE.Mesh;
    private rightShoeMesh: THREE.Mesh;
    private accentMesh: THREE.Mesh | null = null;
    private worldJoints = new Float32Array(JOINT_COUNT * 3);
    private indicatorRing: THREE.Mesh;
    private currentAccentColor: string | null = null;

    // Eyes
    private leftEye: THREE.Mesh;
    private rightEye: THREE.Mesh;
    private eyeBaseOffsetX = 0.04; // horizontal separation from center (half)
    private eyeBaseOffsetY = 0.02; // up from head center
    private eyeBaseOffsetZ = 0.06; // forward from head center (facing direction)
    private eyeLookOffset = new THREE.Vector3(0, 0, 0);

    // Mouth
    private mouthMesh: THREE.Mesh;
    private currentExpression: Expression = 'neutral';
    private mouthMat: THREE.MeshBasicMaterial;

    // Cosmetics
    private headbandMesh: THREE.Mesh | null = null;
    private leftWristband: THREE.Mesh | null = null;
    private rightWristband: THREE.Mesh | null = null;
    private currentHeadShape: 'circle' | 'square' | 'triangle' = 'circle';

    // Jersey number
    private jerseyNumberMesh: THREE.Mesh | null = null;
    private jerseyNumberCanvas: HTMLCanvasElement | null = null;
    private jerseyNumberTexture: THREE.CanvasTexture | null = null;

    // Hair
    private hairGroup: THREE.Group | null = null;
    private hairStyle: 'none' | 'buzzcut' | 'ponytail' | 'afro' = 'none';
    private hairColor = 0x3d2b1f;

    // Shoe color (per-instance material, not shared)
    private leftShoeMat: THREE.MeshStandardMaterial;
    private rightShoeMat: THREE.MeshStandardMaterial;

    private static readonly LIMB_RADIUS = 0.055;
    private static readonly JOINT_RADIUS = 0.06;

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

        // Head sphere — slightly larger for readability at distance
        const headGeo = new THREE.SphereGeometry(0.17, 16, 16);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 });
        applyRimLighting(headMat, 0.4);
        this.headMesh = new THREE.Mesh(headGeo, headMat);
        this.headMesh.castShadow = true;
        this.group.add(this.headMesh);

        // Eyes - small white spheres on the front face of the head
        const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.group.add(this.leftEye);
        this.group.add(this.rightEye);

        // Mouth - start with a thin box for neutral expression
        this.mouthMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const mouthGeo = new THREE.BoxGeometry(0.06, 0.008, 0.008);
        this.mouthMesh = new THREE.Mesh(mouthGeo, this.mouthMat);
        this.group.add(this.mouthMesh);

        // Jersey (torso) - 8 vertices forming a shirt shape
        // 0=L_collar, 1=R_collar, 2=L_shoulder_out, 3=L_hip, 4=R_hip, 5=R_shoulder_out, 6=L_back, 7=R_back
        this.jerseyGeo = new THREE.BufferGeometry();
        const jerseyPositions = new Float32Array(8 * 3);
        const jerseyIndices = new Uint16Array([
            // Front panel (two quads split diagonally)
            0, 2, 3,   // L_collar -> L_shoulder -> L_hip
            0, 3, 4,   // L_collar -> L_hip -> R_hip
            0, 4, 5,   // L_collar -> R_hip -> R_shoulder
            0, 5, 1,   // L_collar -> R_shoulder -> R_collar
            // Back panel
            6, 3, 2,   // L_back -> L_hip -> L_shoulder
            6, 4, 3,   // L_back -> R_hip -> L_hip
            6, 5, 4,   // L_back -> R_shoulder -> R_hip
            6, 7, 5,   // L_back -> R_back -> R_shoulder
            // Top shoulder strip (visible from above)
            0, 1, 7,   // collar top
            0, 7, 6,   // collar top
        ]);
        this.jerseyGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(jerseyPositions, 3),
        );
        this.jerseyGeo.setIndex(new THREE.BufferAttribute(jerseyIndices, 1));
        // Ensure team color is bright enough to see — floor at luminance 0.25
        const jerseyColor = new THREE.Color(teamColor);
        const lum = jerseyColor.r * 0.299 + jerseyColor.g * 0.587 + jerseyColor.b * 0.114;
        if (lum < 0.25) {
            jerseyColor.lerp(new THREE.Color(0xffffff), 0.3);
        }
        const jerseyMat = new THREE.MeshStandardMaterial({
            color: jerseyColor,
            side: THREE.DoubleSide,
            emissive: jerseyColor,
            emissiveIntensity: 0.5,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });
        applyRimLighting(jerseyMat, 0.6);
        this.jerseyMesh = new THREE.Mesh(this.jerseyGeo, jerseyMat);
        this.jerseyMesh.castShadow = true;
        this.jerseyMesh.renderOrder = 1; // draw on top of limbs
        this.jerseyMesh.frustumCulled = false; // positions update per-frame; bounding sphere would be stale
        this.group.add(this.jerseyMesh);

        // Shorts - 6 vertices: waist_L, waist_R, L_knee, R_knee, waist_front, waist_back
        this.shortsGeo = new THREE.BufferGeometry();
        const shortsPositions = new Float32Array(6 * 3);
        const shortsIndices = new Uint16Array([
            // Left leg panel
            4, 0, 2,   // waist_front -> waist_L -> L_knee
            5, 2, 0,   // waist_back -> L_knee -> waist_L
            // Right leg panel
            4, 3, 1,   // waist_front -> R_knee -> waist_R
            5, 1, 3,   // waist_back -> waist_R -> R_knee
            // Center crotch panels
            4, 2, 3,   // waist_front -> L_knee -> R_knee
            5, 3, 2,   // waist_back -> R_knee -> L_knee
        ]);
        this.shortsGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(shortsPositions, 3),
        );
        this.shortsGeo.setIndex(new THREE.BufferAttribute(shortsIndices, 1));
        // Shorts are a darker shade of team color (but still visible)
        const darkerColor = new THREE.Color(jerseyColor).multiplyScalar(0.65);
        const shortsMat = new THREE.MeshStandardMaterial({
            color: darkerColor,
            side: THREE.DoubleSide,
            emissive: darkerColor,
            emissiveIntensity: 0.35,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });
        applyRimLighting(shortsMat, 0.4);
        this.shortsMesh = new THREE.Mesh(this.shortsGeo, shortsMat);
        this.shortsMesh.castShadow = true;
        this.shortsMesh.renderOrder = 1;
        this.shortsMesh.frustumCulled = false; // positions update per-frame; bounding sphere would be stale
        this.group.add(this.shortsMesh);

        // Shoes at ankles — box meshes for crisp ground contact readability
        const shoeGeo = new THREE.BoxGeometry(0.08, 0.04, 0.12);
        this.leftShoeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.4,
            metalness: 0.1,
            emissive: 0x444444,
            emissiveIntensity: 0.15,
        });
        applyRimLighting(this.leftShoeMat, 0.3);
        this.rightShoeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.4,
            metalness: 0.1,
            emissive: 0x444444,
            emissiveIntensity: 0.15,
        });
        applyRimLighting(this.rightShoeMat, 0.3);
        this.leftShoeMesh = new THREE.Mesh(shoeGeo, this.leftShoeMat);
        this.rightShoeMesh = new THREE.Mesh(shoeGeo.clone(), this.rightShoeMat);
        this.leftShoeMesh.castShadow = true;
        this.rightShoeMesh.castShadow = true;
        this.leftShoeMesh.frustumCulled = false;
        this.rightShoeMesh.frustumCulled = false;
        this.group.add(this.leftShoeMesh);
        this.group.add(this.rightShoeMesh);

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
        const headX = this.worldJoints[0];
        const headY = this.worldJoints[1];
        const headZ = this.worldJoints[2];
        this.headMesh.position.set(headX, headY, headZ);

        // Facing direction vector (in XZ plane)
        const faceDirX = cos;
        const faceDirZ = -sin;

        // Perpendicular right vector (in XZ plane)
        const rightX = -faceDirZ;
        const rightZ = faceDirX;

        // Update eyes to follow head and face forward
        const lookX = this.eyeLookOffset.x;
        const lookY = this.eyeLookOffset.y;
        const lookZ = this.eyeLookOffset.z;

        // Left eye: offset left, up, and forward relative to facing
        this.leftEye.position.set(
            headX + faceDirX * (this.eyeBaseOffsetZ + lookZ) - rightX * this.eyeBaseOffsetX + lookX,
            headY + this.eyeBaseOffsetY + lookY,
            headZ + faceDirZ * (this.eyeBaseOffsetZ + lookZ) - rightZ * this.eyeBaseOffsetX + lookZ * 0,
        );

        // Right eye: offset right, up, and forward relative to facing
        this.rightEye.position.set(
            headX + faceDirX * (this.eyeBaseOffsetZ + lookZ) + rightX * this.eyeBaseOffsetX + lookX,
            headY + this.eyeBaseOffsetY + lookY,
            headZ + faceDirZ * (this.eyeBaseOffsetZ + lookZ) + rightZ * this.eyeBaseOffsetX + lookZ * 0,
        );

        // Update mouth position: below center of eyes, forward on face
        this.mouthMesh.position.set(
            headX + faceDirX * this.eyeBaseOffsetZ,
            headY - 0.05,
            headZ + faceDirZ * this.eyeBaseOffsetZ,
        );
        // Rotate mouth to face the same direction as the stickman
        this.mouthMesh.rotation.y = facing;

        if (this.accentMesh) {
            this.accentMesh.position.set(
                headX,
                headY + 0.18,
                headZ,
            );
        }

        // Update headband position to follow head
        if (this.headbandMesh) {
            this.headbandMesh.position.set(headX, headY + 0.04, headZ);
        }

        // Update hair position to follow head
        if (this.hairGroup) {
            this.hairGroup.position.set(headX, headY, headZ);
            this.hairGroup.rotation.y = facing;
        }

        // Update wristband positions (joints 4=L_wrist, 7=R_wrist)
        if (this.leftWristband) {
            this.leftWristband.position.set(
                this.worldJoints[4 * 3],
                this.worldJoints[4 * 3 + 1],
                this.worldJoints[4 * 3 + 2],
            );
        }
        if (this.rightWristband) {
            this.rightWristband.position.set(
                this.worldJoints[7 * 3],
                this.worldJoints[7 * 3 + 1],
                this.worldJoints[7 * 3 + 2],
            );
        }

        // Update jersey torso shape (8 vertices)
        // 0=L_collar, 1=R_collar, 2=L_shoulder_out, 3=L_hip, 4=R_hip, 5=R_shoulder_out, 6=L_back, 7=R_back
        const jerseyPos = this.jerseyGeo.attributes.position as THREE.BufferAttribute;
        const wj = this.worldJoints;

        const neckX = wj[1 * 3], neckY = wj[1 * 3 + 1], neckZ = wj[1 * 3 + 2];
        const lShX = wj[2 * 3], lShY = wj[2 * 3 + 1], lShZ = wj[2 * 3 + 2];
        const rShX = wj[5 * 3], rShY = wj[5 * 3 + 1], rShZ = wj[5 * 3 + 2];
        const waistX = wj[8 * 3], waistY = wj[8 * 3 + 1], waistZ = wj[8 * 3 + 2];

        // Shoulder direction (left to right) for widening
        const sdx = rShX - lShX;
        const sdz = rShZ - lShZ;
        const sdLen = Math.sqrt(sdx * sdx + sdz * sdz) || 1;
        const snx = sdx / sdLen;
        const snz = sdz / sdLen;

        // Forward direction (perpendicular to shoulder line in XZ plane)
        const fwdX = -snz;
        const fwdZ = snx;

        const WIDEN = 0.14;   // extra width beyond shoulder joints
        const DEPTH = 0.14;   // front/back depth

        // Two collar points at neck height, spread apart for a proper neckline
        const collarSpread = 0.06;
        // 0: L collar (front)
        jerseyPos.setXYZ(0,
            neckX - snx * collarSpread + fwdX * DEPTH * 0.5, neckY,
            neckZ - snz * collarSpread + fwdZ * DEPTH * 0.5);
        // 1: R collar (front)
        jerseyPos.setXYZ(1,
            neckX + snx * collarSpread + fwdX * DEPTH * 0.5, neckY,
            neckZ + snz * collarSpread + fwdZ * DEPTH * 0.5);
        // 2: L shoulder outer
        jerseyPos.setXYZ(2, lShX - snx * WIDEN, lShY, lShZ - snz * WIDEN);
        // 3: L hip
        jerseyPos.setXYZ(3, waistX - snx * (WIDEN + 0.02), waistY, waistZ - snz * (WIDEN + 0.02));
        // 4: R hip
        jerseyPos.setXYZ(4, waistX + snx * (WIDEN + 0.02), waistY, waistZ + snz * (WIDEN + 0.02));
        // 5: R shoulder outer
        jerseyPos.setXYZ(5, rShX + snx * WIDEN, rShY, rShZ + snz * WIDEN);
        // 6: L collar (back)
        jerseyPos.setXYZ(6,
            neckX - snx * collarSpread - fwdX * DEPTH * 0.5, neckY,
            neckZ - snz * collarSpread - fwdZ * DEPTH * 0.5);
        // 7: R collar (back)
        jerseyPos.setXYZ(7,
            neckX + snx * collarSpread - fwdX * DEPTH * 0.5, neckY,
            neckZ + snz * collarSpread - fwdZ * DEPTH * 0.5);

        jerseyPos.needsUpdate = true;
        this.jerseyGeo.computeVertexNormals();

        // Update jersey number position: centered on back of torso, behind spine
        if (this.jerseyNumberMesh) {
            // Midpoint between neck and waist (upper back area)
            const backX = (neckX + waistX) * 0.5 - fwdX * (DEPTH * 0.5 + 0.01);
            const backY = (neckY + waistY) * 0.5;
            const backZ = (neckZ + waistZ) * 0.5 - fwdZ * (DEPTH * 0.5 + 0.01);
            this.jerseyNumberMesh.position.set(backX, backY, backZ);
            // Face away from the player (backward direction)
            this.jerseyNumberMesh.rotation.y = facing + Math.PI;
        }

        // Update shorts (6 vertices: 0=waist_L, 1=waist_R, 2=L_knee, 3=R_knee, 4=waist_front, 5=waist_back)
        const shortsPos = this.shortsGeo.attributes.position as THREE.BufferAttribute;
        const lKneeX = wj[9 * 3], lKneeY = wj[9 * 3 + 1], lKneeZ = wj[9 * 3 + 2];
        const rKneeX = wj[11 * 3], rKneeY = wj[11 * 3 + 1], rKneeZ = wj[11 * 3 + 2];
        // Mid-thigh point (shorts end above knee)
        const shortsFrac = 0.55; // how far down from waist to knee
        const lMidX = waistX + (lKneeX - waistX) * shortsFrac;
        const lMidY = waistY + (lKneeY - waistY) * shortsFrac;
        const lMidZ = waistZ + (lKneeZ - waistZ) * shortsFrac;
        const rMidX = waistX + (rKneeX - waistX) * shortsFrac;
        const rMidY = waistY + (rKneeY - waistY) * shortsFrac;
        const rMidZ = waistZ + (rKneeZ - waistZ) * shortsFrac;

        const SHORTS_WIDEN = 0.09;
        shortsPos.setXYZ(0, waistX - snx * (WIDEN + 0.02), waistY, waistZ - snz * (WIDEN + 0.02)); // waist L
        shortsPos.setXYZ(1, waistX + snx * (WIDEN + 0.02), waistY, waistZ + snz * (WIDEN + 0.02)); // waist R
        shortsPos.setXYZ(2, lMidX - snx * SHORTS_WIDEN, lMidY, lMidZ - snz * SHORTS_WIDEN); // L mid-thigh
        shortsPos.setXYZ(3, rMidX + snx * SHORTS_WIDEN, rMidY, rMidZ + snz * SHORTS_WIDEN); // R mid-thigh
        shortsPos.setXYZ(4, waistX + fwdX * DEPTH * 0.5, waistY, waistZ + fwdZ * DEPTH * 0.5); // waist front
        shortsPos.setXYZ(5, waistX - fwdX * DEPTH * 0.5, waistY, waistZ - fwdZ * DEPTH * 0.5); // waist back
        shortsPos.needsUpdate = true;
        this.shortsGeo.computeVertexNormals();

        // Update shoe positions (at ankles, joints 10=L_ankle, 12=R_ankle)
        this.leftShoeMesh.position.set(wj[10 * 3], wj[10 * 3 + 1] - 0.02, wj[10 * 3 + 2]);
        this.leftShoeMesh.rotation.y = facing;
        this.rightShoeMesh.position.set(wj[12 * 3], wj[12 * 3 + 1] - 0.02, wj[12 * 3 + 2]);
        this.rightShoeMesh.rotation.y = facing;

        // Update indicator ring position
        if (this.indicatorRing.visible) {
            this.indicatorRing.position.set(position.x, 0.02, position.z);
        }
    }

    /** Shift eye positions slightly to simulate looking in a direction */
    setLookDirection(x: number, y: number, z: number): void {
        const maxOffset = 0.015;
        const len = Math.sqrt(x * x + y * y + z * z);
        if (len > 0) {
            const scale = Math.min(len, 1) * maxOffset;
            this.eyeLookOffset.set(
                (x / len) * scale,
                (y / len) * scale,
                (z / len) * scale,
            );
        } else {
            this.eyeLookOffset.set(0, 0, 0);
        }
    }

    /** Change the mouth expression */
    setExpression(expression: Expression): void {
        if (this.currentExpression === expression) return;
        this.currentExpression = expression;

        // Remove old mouth mesh
        this.group.remove(this.mouthMesh);
        this.mouthMesh.geometry.dispose();

        const oldPos = this.mouthMesh.position.clone();
        const oldRotY = this.mouthMesh.rotation.y;

        let newGeo: THREE.BufferGeometry;

        switch (expression) {
            case 'neutral':
                // Straight horizontal line (thin box)
                newGeo = new THREE.BoxGeometry(0.06, 0.008, 0.008);
                break;
            case 'happy':
                // Upward curve - torus arc rotated to smile
                newGeo = new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI);
                newGeo.rotateX(Math.PI); // flip so curve goes up
                break;
            case 'frustrated':
                // Downward curve - torus arc
                newGeo = new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI);
                // Default orientation already curves down
                break;
            case 'shocked':
                // Small circle (ring)
                newGeo = new THREE.TorusGeometry(0.02, 0.005, 8, 16);
                break;
        }

        this.mouthMesh = new THREE.Mesh(newGeo, this.mouthMat);
        this.mouthMesh.position.copy(oldPos);
        this.mouthMesh.rotation.y = oldRotY;
        this.group.add(this.mouthMesh);
    }

    // --- Cosmetic methods ---

    /** Add or remove a headband torus around the head */
    setHeadband(enabled: boolean, color: number): void {
        if (this.headbandMesh) {
            this.group.remove(this.headbandMesh);
            this.headbandMesh.geometry.dispose();
            (this.headbandMesh.material as THREE.Material).dispose();
            this.headbandMesh = null;
        }

        if (!enabled) return;

        const geo = new THREE.TorusGeometry(0.18, 0.012, 8, 24);
        geo.rotateX(Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.3,
        });
        this.headbandMesh = new THREE.Mesh(geo, mat);
        this.group.add(this.headbandMesh);
    }

    /** Add or remove wristband meshes at both wrist joints */
    setWristbands(enabled: boolean): void {
        // Clean up existing
        if (this.leftWristband) {
            this.group.remove(this.leftWristband);
            this.leftWristband.geometry.dispose();
            (this.leftWristband.material as THREE.Material).dispose();
            this.leftWristband = null;
        }
        if (this.rightWristband) {
            this.group.remove(this.rightWristband);
            this.rightWristband.geometry.dispose();
            (this.rightWristband.material as THREE.Material).dispose();
            this.rightWristband = null;
        }

        if (!enabled) return;

        const bandGeo = new THREE.TorusGeometry(0.05, 0.01, 8, 16);
        bandGeo.rotateX(Math.PI / 2);
        const bandMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.2,
        });

        this.leftWristband = new THREE.Mesh(bandGeo, bandMat);
        this.rightWristband = new THREE.Mesh(bandGeo.clone(), bandMat.clone());
        this.group.add(this.leftWristband);
        this.group.add(this.rightWristband);
    }

    /** Scale the head mesh by a multiplier */
    setHeadSize(size: number): void {
        this.headMesh.scale.setScalar(size);
    }

    /** Swap head geometry to a different shape */
    setHeadShape(shape: 'circle' | 'square' | 'triangle'): void {
        if (this.currentHeadShape === shape) return;
        this.currentHeadShape = shape;

        // Dispose old geometry
        this.headMesh.geometry.dispose();

        switch (shape) {
            case 'circle':
                this.headMesh.geometry = new THREE.SphereGeometry(0.17, 16, 16);
                break;
            case 'square':
                this.headMesh.geometry = new THREE.BoxGeometry(0.27, 0.27, 0.27);
                break;
            case 'triangle':
                this.headMesh.geometry = new THREE.ConeGeometry(0.17, 0.34, 16);
                break;
        }
    }

    /** Create or update a jersey number rendered on the player's back */
    setJerseyNumber(num: number): void {
        const clamped = Math.max(1, Math.min(99, Math.round(num)));

        // Create or reuse canvas
        if (!this.jerseyNumberCanvas) {
            this.jerseyNumberCanvas = document.createElement('canvas');
            this.jerseyNumberCanvas.width = 64;
            this.jerseyNumberCanvas.height = 64;
        }
        const ctx = this.jerseyNumberCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(clamped), 32, 32);

        if (this.jerseyNumberTexture) {
            this.jerseyNumberTexture.needsUpdate = true;
        } else {
            this.jerseyNumberTexture = new THREE.CanvasTexture(this.jerseyNumberCanvas);
            this.jerseyNumberTexture.minFilter = THREE.LinearFilter;
            this.jerseyNumberTexture.magFilter = THREE.LinearFilter;
        }

        if (!this.jerseyNumberMesh) {
            const planeGeo = new THREE.PlaneGeometry(0.15, 0.15);
            const planeMat = new THREE.MeshBasicMaterial({
                map: this.jerseyNumberTexture,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            this.jerseyNumberMesh = new THREE.Mesh(planeGeo, planeMat);
            this.jerseyNumberMesh.renderOrder = 2; // on top of jersey
            this.jerseyNumberMesh.frustumCulled = false;
            this.group.add(this.jerseyNumberMesh);
        }
    }

    /** Set hair style with optional color override */
    setHairStyle(style: string, color?: number): void {
        const validStyle = (style === 'buzzcut' || style === 'ponytail' || style === 'afro')
            ? style : 'none';

        // Remove old hair group
        if (this.hairGroup) {
            this.hairGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.group.remove(this.hairGroup);
            this.hairGroup = null;
        }

        this.hairStyle = validStyle;
        if (color !== undefined) this.hairColor = color;

        if (validStyle === 'none') return;

        this.hairGroup = new THREE.Group();
        const hairMat = new THREE.MeshStandardMaterial({
            color: this.hairColor,
            roughness: 0.8,
        });

        switch (validStyle) {
            case 'buzzcut': {
                const geo = new THREE.SphereGeometry(1, 12, 12);
                const mesh = new THREE.Mesh(geo, hairMat);
                mesh.scale.set(0.12, 0.06, 0.12);
                mesh.position.set(0, 0.14, 0); // on top of head
                mesh.frustumCulled = false;
                this.hairGroup.add(mesh);
                break;
            }
            case 'ponytail': {
                // Small bun on top-back of head
                const bunGeo = new THREE.SphereGeometry(0.06, 10, 10);
                const bun = new THREE.Mesh(bunGeo, hairMat);
                bun.position.set(0, 0.1, -0.1); // top-back
                bun.frustumCulled = false;
                this.hairGroup.add(bun);

                // Trailing tail cylinder going backward-downward
                const tailGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.2, 8);
                const tail = new THREE.Mesh(tailGeo, hairMat.clone());
                tail.position.set(0, -0.01, -0.18); // behind and below bun
                tail.rotation.x = Math.PI * 0.35; // angle backward-down
                tail.frustumCulled = false;
                this.hairGroup.add(tail);
                break;
            }
            case 'afro': {
                // Large sphere on top of head
                const afroGeo = new THREE.SphereGeometry(0.14, 16, 16);
                const afroMesh = new THREE.Mesh(afroGeo, hairMat);
                afroMesh.position.set(0, 0.12, 0);
                afroMesh.frustumCulled = false;
                this.hairGroup.add(afroMesh);

                // Wireframe overlay for fuzzy look
                const wireGeo = new THREE.SphereGeometry(0.145, 12, 12);
                const wireMat = new THREE.MeshBasicMaterial({
                    color: this.hairColor,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.4,
                });
                const wireMesh = new THREE.Mesh(wireGeo, wireMat);
                wireMesh.position.set(0, 0.12, 0);
                wireMesh.frustumCulled = false;
                this.hairGroup.add(wireMesh);
                break;
            }
        }

        this.group.add(this.hairGroup);
    }

    /** Set shoe color for both feet */
    setShoeColor(color: number): void {
        this.leftShoeMat.color.setHex(color);
        this.leftShoeMat.needsUpdate = true;
        this.rightShoeMat.color.setHex(color);
        this.rightShoeMat.needsUpdate = true;
    }

    /** Scale the stickman's height by a multiplier (0.85-1.15 range) */
    setHeight(multiplier: number): void {
        const clamped = Math.max(0.85, Math.min(1.15, multiplier));
        this.group.scale.y = clamped;
    }

    setControlled(controlled: boolean): void {
        this.indicatorRing.visible = controlled;
    }

    setJerseyColor(color: number): void {
        const c = new THREE.Color(color);
        const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
        if (lum < 0.25) c.lerp(new THREE.Color(0xffffff), 0.3);
        const mat = this.jerseyMesh.material as THREE.MeshStandardMaterial;
        mat.color.copy(c);
        mat.emissive.copy(c);
        const shortsMat = this.shortsMesh.material as THREE.MeshStandardMaterial;
        const darkerColor = c.clone().multiplyScalar(0.65);
        shortsMat.color.copy(darkerColor);
        shortsMat.emissive.copy(darkerColor);
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
        (this.headMesh.geometry as THREE.BufferGeometry).dispose();
        (this.headMesh.material as THREE.Material).dispose();
        this.jerseyGeo.dispose();
        (this.jerseyMesh.material as THREE.Material).dispose();
        this.shortsGeo.dispose();
        (this.shortsMesh.material as THREE.Material).dispose();
        this.leftShoeMesh.geometry.dispose();
        this.rightShoeMesh.geometry.dispose();
        this.leftShoeMat.dispose();
        this.rightShoeMat.dispose();

        // Dispose eyes
        this.leftEye.geometry.dispose();
        (this.leftEye.material as THREE.Material).dispose();
        this.rightEye.geometry.dispose();
        (this.rightEye.material as THREE.Material).dispose();

        // Dispose mouth
        this.mouthMesh.geometry.dispose();
        this.mouthMat.dispose();

        // Dispose headband
        if (this.headbandMesh) {
            this.headbandMesh.geometry.dispose();
            (this.headbandMesh.material as THREE.Material).dispose();
        }

        // Dispose wristbands
        if (this.leftWristband) {
            this.leftWristband.geometry.dispose();
            (this.leftWristband.material as THREE.Material).dispose();
        }
        if (this.rightWristband) {
            this.rightWristband.geometry.dispose();
            (this.rightWristband.material as THREE.Material).dispose();
        }

        // Dispose jersey number
        if (this.jerseyNumberMesh) {
            this.jerseyNumberMesh.geometry.dispose();
            (this.jerseyNumberMesh.material as THREE.Material).dispose();
        }
        if (this.jerseyNumberTexture) {
            this.jerseyNumberTexture.dispose();
        }

        // Dispose hair
        if (this.hairGroup) {
            this.hairGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
    }
}
