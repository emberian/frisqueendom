import * as THREE from 'three';
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
    [1, 13],  // neck to chest (upper spine)
    [13, 8],  // chest to waist (lower spine)
    [8, 14],  // waist to L hip
    [14, 9],  // L hip to L knee
    [9, 10],  // L knee to L ankle
    [10, 16], // L ankle to L toe
    [8, 15],  // waist to R hip
    [15, 11], // R hip to R knee
    [11, 12], // R knee to R ankle
    [12, 17], // R ankle to R toe
];

// Per-bone radii (mannequin proportions). -1 = hidden (inside torso/shoes).
const BONE_RADII: number[] = [
    0.045,  // [0,1]   head→neck
    0.05,   // [1,2]   neck→L_shoulder (clavicle)
    0.05,   // [1,5]   neck→R_shoulder (clavicle)
    0.065,  // [2,3]   L_shoulder→L_elbow (upper arm)
    0.055,  // [3,4]   L_elbow→L_wrist (forearm)
    0.065,  // [5,6]   R_shoulder→R_elbow (upper arm)
    0.055,  // [6,7]   R_elbow→R_wrist (forearm)
    -1,     // [1,13]  neck→chest (hidden in torso)
    -1,     // [13,8]  chest→waist (hidden in torso)
    -1,     // [8,14]  waist→L_hip (hidden in torso)
    0.08,   // [14,9]  L_hip→L_knee (thigh)
    0.065,  // [9,10]  L_knee→L_ankle (shin)
    -1,     // [10,16] L_ankle→L_toe (hidden in shoe)
    -1,     // [8,15]  waist→R_hip (hidden in torso)
    0.08,   // [15,11] R_hip→R_knee (thigh)
    0.065,  // [11,12] R_knee→R_ankle (shin)
    -1,     // [12,17] R_ankle→R_toe (hidden in shoe)
];

// Per-joint radii (ball joints). -1 = hidden (inside torso/shoes/head).
const JOINT_RADII: number[] = [
    -1,     // 0:  head (head sphere handles this)
    0.055,  // 1:  neck
    0.08,   // 2:  L_shoulder
    0.065,  // 3:  L_elbow
    0.05,   // 4:  L_wrist
    0.08,   // 5:  R_shoulder
    0.065,  // 6:  R_elbow
    0.05,   // 7:  R_wrist
    -1,     // 8:  waist (inside torso)
    0.075,  // 9:  L_knee
    0.06,   // 10: L_ankle
    0.075,  // 11: R_knee
    0.06,   // 12: R_ankle
    -1,     // 13: chest (inside torso)
    -1,     // 14: L_hip (inside torso)
    -1,     // 15: R_hip (inside torso)
    -1,     // 16: L_toe (inside shoe)
    -1,     // 17: R_toe (inside shoe)
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
    private torsoMesh: THREE.Mesh;
    private pelvisMesh: THREE.Mesh;
    private leftHandMesh: THREE.Mesh;
    private rightHandMesh: THREE.Mesh;
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

    constructor(teamColor: number, secondaryColor?: number) {
        const shared = getSharedMaterials();

        // Team-tinted materials for body parts (makes teams visually distinct)
        const teamCol = new THREE.Color(teamColor);
        const limbColor = new THREE.Color(0x222222).lerp(teamCol, 0.55);
        const teamLimbMat = new THREE.MeshStandardMaterial({
            color: limbColor,
            roughness: 0.6,
            metalness: 0.15,
        });
        applyRimLighting(teamLimbMat, 0.5);

        const jointColor = new THREE.Color(0x1a1a1a).lerp(teamCol, 0.45);
        const teamJointMat = new THREE.MeshStandardMaterial({
            color: jointColor,
            roughness: 0.5,
        });
        applyRimLighting(teamJointMat, 0.35);

        // Create volumetric bones (cylinders) with per-bone radii
        const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
        cylinderGeo.rotateX(Math.PI / 2); // Align with Z axis for easy 'lookAt'

        for (let i = 0; i < BONES.length; i++) {
            const mesh = new THREE.Mesh(cylinderGeo, teamLimbMat);
            mesh.castShadow = true;
            if (BONE_RADII[i] < 0) mesh.visible = false;
            this.boneMeshes.push(mesh);
            this.group.add(mesh);
        }

        // Create joint spheres with per-joint radii (ball joints)
        const jointGeo = new THREE.SphereGeometry(1, 10, 10);
        for (let i = 0; i < JOINT_COUNT; i++) {
            const mesh = new THREE.Mesh(jointGeo, teamJointMat);
            const r = JOINT_RADII[i];
            if (r < 0) {
                mesh.visible = false;
                mesh.scale.setScalar(0.01);
            } else {
                mesh.scale.setScalar(r);
            }
            this.jointMeshes.push(mesh);
            this.group.add(mesh);
        }

        // Head sphere — team-tinted for readability at distance
        const headGeo = new THREE.SphereGeometry(0.17, 16, 16);
        const headColor = new THREE.Color(0x1a1a1a).lerp(teamCol, 0.45);
        const headMat = new THREE.MeshStandardMaterial({
            color: headColor,
            roughness: 0.3,
        });
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

        // Torso ellipsoid (replaces flat jersey polygon)
        const torsoGeo = new THREE.SphereGeometry(1, 12, 10);
        const jerseyColor = new THREE.Color(teamColor);
        const torsoMat = new THREE.MeshStandardMaterial({
            color: jerseyColor,
            roughness: 0.85,
            metalness: 0.0,
            emissive: jerseyColor,
            emissiveIntensity: 0.15,
        });
        this.torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
        this.torsoMesh.castShadow = true;
        this.torsoMesh.frustumCulled = false;
        this.group.add(this.torsoMesh);

        // Pelvis ellipsoid (replaces flat shorts polygon)
        const pelvisGeo = new THREE.SphereGeometry(1, 10, 8);
        const darkerColor = new THREE.Color(jerseyColor).multiplyScalar(0.65);
        const pelvisMat = new THREE.MeshStandardMaterial({
            color: darkerColor,
            roughness: 0.85,
            metalness: 0.0,
            emissive: darkerColor,
            emissiveIntensity: 0.15,
        });
        this.pelvisMesh = new THREE.Mesh(pelvisGeo, pelvisMat);
        this.pelvisMesh.castShadow = true;
        this.pelvisMesh.frustumCulled = false;
        this.group.add(this.pelvisMesh);

        // Hand spheres at wrists
        const handGeo = new THREE.SphereGeometry(0.04, 8, 8);
        this.leftHandMesh = new THREE.Mesh(handGeo, teamLimbMat);
        this.rightHandMesh = new THREE.Mesh(handGeo, teamLimbMat);
        this.leftHandMesh.castShadow = true;
        this.rightHandMesh.castShadow = true;
        this.leftHandMesh.frustumCulled = false;
        this.rightHandMesh.frustumCulled = false;
        this.group.add(this.leftHandMesh);
        this.group.add(this.rightHandMesh);

        // Shoes at ankles — box meshes for crisp ground contact readability
        // Use secondary team color if provided, otherwise white
        const shoeColor = new THREE.Color(secondaryColor ?? 0xffffff);
        const shoeEmissive = shoeColor.clone().multiplyScalar(0.3);
        const shoeGeo = new THREE.BoxGeometry(0.08, 0.04, 0.12);
        this.leftShoeMat = new THREE.MeshStandardMaterial({
            color: shoeColor,
            roughness: 0.4,
            metalness: 0.1,
            emissive: shoeEmissive,
            emissiveIntensity: 0.15,
        });
        applyRimLighting(this.leftShoeMat, 0.3);
        this.rightShoeMat = new THREE.MeshStandardMaterial({
            color: shoeColor.clone(),
            roughness: 0.4,
            metalness: 0.1,
            emissive: shoeEmissive.clone(),
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
            const r = BONE_RADII[i];
            if (r < 0) continue; // hidden bone
            const [a, b] = BONES[i];
            start.set(this.worldJoints[a * 3], this.worldJoints[a * 3 + 1], this.worldJoints[a * 3 + 2]);
            end.set(this.worldJoints[b * 3], this.worldJoints[b * 3 + 1], this.worldJoints[b * 3 + 2]);

            const dist = start.distanceTo(end);
            const mesh = this.boneMeshes[i];

            // Position at midpoint
            mesh.position.copy(start).lerp(end, 0.5);
            // Scale: per-bone radius for width, distance for length
            mesh.scale.set(r, r, dist);
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

        // Update torso ellipsoid — position at midpoint of neck↔waist, scale to body proportions
        const wj = this.worldJoints;
        const neckX = wj[1 * 3], neckY = wj[1 * 3 + 1], neckZ = wj[1 * 3 + 2];
        const lShX = wj[2 * 3], rShX = wj[5 * 3];
        const lShZ = wj[2 * 3 + 2], rShZ = wj[5 * 3 + 2];
        const waistX = wj[8 * 3], waistY = wj[8 * 3 + 1], waistZ = wj[8 * 3 + 2];
        const chestX = wj[13 * 3], chestY = wj[13 * 3 + 1], chestZ = wj[13 * 3 + 2];

        // Shoulder span for torso width
        const shoulderSpan = Math.sqrt((rShX - lShX) ** 2 + (rShZ - lShZ) ** 2);
        const torsoHeight = Math.abs(neckY - waistY);

        // Torso center between chest and waist (slightly above midpoint for a chest-heavy look)
        const torsoCX = (chestX + waistX) * 0.5;
        const torsoCY = (neckY + waistY) * 0.5;
        const torsoCZ = (chestZ + waistZ) * 0.5;

        this.torsoMesh.position.set(torsoCX, torsoCY, torsoCZ);
        this.torsoMesh.scale.set(
            shoulderSpan * 0.55 + 0.04,   // width: half shoulder span + padding
            torsoHeight * 0.5 + 0.02,     // height: half neck-to-waist
            0.13,                          // depth: front-to-back thickness
        );
        this.torsoMesh.rotation.y = facing;

        // Update jersey number position: centered on back of torso
        if (this.jerseyNumberMesh) {
            const cos_f = Math.cos(facing);
            const sin_f = Math.sin(facing);
            const backOffset = 0.14;
            this.jerseyNumberMesh.position.set(
                torsoCX - sin_f * backOffset,
                torsoCY,
                torsoCZ - cos_f * backOffset,
            );
            this.jerseyNumberMesh.rotation.y = facing + Math.PI;
        }

        // Update pelvis ellipsoid — spans waist to upper thigh
        const lHipX = wj[14 * 3], lHipY = wj[14 * 3 + 1], lHipZ = wj[14 * 3 + 2];
        const rHipX = wj[15 * 3], rHipY = wj[15 * 3 + 1], rHipZ = wj[15 * 3 + 2];
        const hipSpan = Math.sqrt((rHipX - lHipX) ** 2 + (rHipZ - lHipZ) ** 2);
        const pelvisCX = (lHipX + rHipX) * 0.5;
        const pelvisCY = (waistY + lHipY) * 0.5;
        const pelvisCZ = (lHipZ + rHipZ) * 0.5;

        this.pelvisMesh.position.set(pelvisCX, pelvisCY, pelvisCZ);
        this.pelvisMesh.scale.set(
            hipSpan * 0.55 + 0.03,     // width
            Math.abs(waistY - lHipY) * 0.5 + 0.03, // height
            0.11,                       // depth
        );
        this.pelvisMesh.rotation.y = facing;

        // Update hand spheres at wrist joints
        this.leftHandMesh.position.set(wj[4 * 3], wj[4 * 3 + 1], wj[4 * 3 + 2]);
        this.rightHandMesh.position.set(wj[7 * 3], wj[7 * 3 + 1], wj[7 * 3 + 2]);

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
        const mat = this.torsoMesh.material as THREE.MeshStandardMaterial;
        mat.color.copy(c);
        mat.emissive.copy(c);
        const pelvisMat = this.pelvisMesh.material as THREE.MeshStandardMaterial;
        const darkerColor = c.clone().multiplyScalar(0.65);
        pelvisMat.color.copy(darkerColor);
        pelvisMat.emissive.copy(darkerColor);
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
        this.torsoMesh.geometry.dispose();
        (this.torsoMesh.material as THREE.Material).dispose();
        this.pelvisMesh.geometry.dispose();
        (this.pelvisMesh.material as THREE.Material).dispose();
        this.leftHandMesh.geometry.dispose();
        this.rightHandMesh.geometry.dispose();
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
