import * as THREE from 'three';
import { FIELD_LENGTH, FIELD_WIDTH, ENDZONE_DEPTH, BRICK_MARK_DISTANCE } from '../data/Constants';

const MOWING_STRIPE_WIDTH = 5.0;
const MOWING_BRIGHTNESS_DIFF = 0.07;

// --- Procedural Texture Generators ---

/**
 * Simple 2D hash for pseudo-random noise.
 * Returns a value in [0, 1).
 */
function hash2D(x: number, y: number): number {
    let h = (x * 374761393 + y * 668265263 + 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h & 0x7fffffff) / 0x7fffffff;
}

/**
 * Smooth noise with bilinear interpolation between integer lattice points.
 */
function smoothNoise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    // Smoothstep for interpolation
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const n00 = hash2D(ix, iy);
    const n10 = hash2D(ix + 1, iy);
    const n01 = hash2D(ix, iy + 1);
    const n11 = hash2D(ix + 1, iy + 1);

    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;

    return nx0 + (nx1 - nx0) * sy;
}

/**
 * Fractal Brownian Motion — layered noise for organic texture.
 */
function fbm(x: number, y: number, octaves: number): number {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * smoothNoise(x * frequency, y * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return value;
}

/**
 * Generate a 512x512 grass-like normal map.
 * Simulates blades of grass by creating directional noise
 * predominantly in the vertical (Y in texture space) direction,
 * then encoding as tangent-space normals in the RGB channels.
 */
function createGrassNormalMap(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const scale = 16.0;       // base noise frequency — controls blade density
    const bladeScale = 64.0;  // high-freq for individual blade detail
    const strength = 1.0;     // normal perturbation strength

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;

            // Large-scale terrain undulation
            const broad = fbm(u * scale, v * scale, 4);
            // High-frequency blade-level detail, elongated vertically
            const bladeDetail = fbm(u * bladeScale, v * bladeScale * 0.3, 3);

            // Compute tangent-space normal from height differences
            const eps = 1.0 / size;
            const hR = fbm((u + eps) * scale, v * scale, 4)
                      + 0.4 * fbm((u + eps) * bladeScale, v * bladeScale * 0.3, 3);
            const hL = fbm((u - eps) * scale, v * scale, 4)
                      + 0.4 * fbm((u - eps) * bladeScale, v * bladeScale * 0.3, 3);
            const hU = fbm(u * scale, (v + eps) * scale, 4)
                      + 0.4 * fbm(u * bladeScale, (v + eps) * bladeScale * 0.3, 3);
            const hD = fbm(u * scale, (v - eps) * scale, 4)
                      + 0.4 * fbm(u * bladeScale, (v - eps) * bladeScale * 0.3, 3);

            // Central difference for partial derivatives
            let dx = (hR - hL) * strength;
            let dy = (hU - hD) * strength;

            // Add broad contribution
            dx += broad * 0.05;
            dy += bladeDetail * 0.08;

            // Tangent-space normal: (-dx, -dy, 1) normalized
            const len = Math.sqrt(dx * dx + dy * dy + 1.0);
            const nx = -dx / len;
            const ny = -dy / len;
            const nz = 1.0 / len;

            // Encode normal into [0, 255] range (standard tangent-space mapping)
            const idx = (y * size + x) * 4;
            data[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
            data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // Tile the normal map across the field so blades are appropriately scaled
    tex.repeat.set(FIELD_WIDTH / 4, FIELD_LENGTH / 4);
    tex.needsUpdate = true;
    return tex;
}

/**
 * Generate a 256x256 roughness map with wet/dry patches.
 * Values in the 0.6 - 0.9 range: lower = shinier (wet), higher = matte (dry).
 */
function createRoughnessMap(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const patchScale = 6.0; // large patches for wet/dry regions
    const detailScale = 20.0;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;

            // Large-scale wet/dry patches
            const patchNoise = fbm(u * patchScale + 100, v * patchScale + 200, 4);
            // Finer detail variation
            const detailNoise = fbm(u * detailScale + 300, v * detailScale + 400, 3);

            // Map to roughness range [0.6, 0.9]
            const roughness = 0.6 + 0.3 * (patchNoise * 0.7 + detailNoise * 0.3);
            const clamped = Math.max(0.6, Math.min(0.9, roughness));

            // Roughness map is greyscale — Three.js reads from the green channel
            // but for safety we write all RGB channels identically.
            const val = Math.round(clamped * 255);
            const idx = (y * size + x) * 4;
            data[idx]     = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(FIELD_WIDTH / 8, FIELD_LENGTH / 8);
    tex.needsUpdate = true;
    return tex;
}

// --- Endzone Wear Decals ---

/**
 * Create subtle worn/darkened patches in endzone areas where players congregate.
 * Returns an array of meshes to add to the field group.
 */
function createEndzoneWearDecals(): THREE.Mesh[] {
    const decals: THREE.Mesh[] = [];

    const wornMat = new THREE.MeshStandardMaterial({
        color: 0x1a5c1a,          // darker green — worn/compacted grass
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        roughness: 0.95,           // worn grass is rougher
    });

    // Endzone 1: z in [0, ENDZONE_DEPTH]
    // Endzone 2: z in [FIELD_LENGTH - ENDZONE_DEPTH, FIELD_LENGTH]
    const endzone1Center = ENDZONE_DEPTH / 2;
    const endzone2Center = FIELD_LENGTH - ENDZONE_DEPTH / 2;

    // Wear patch definitions: [xOffset, zOffset from endzone center, width, depth]
    const patchDefs: [number, number, number, number][] = [
        [ 0.0,  0.0, 8.0, 4.0],   // central high-traffic
        [-6.0,  3.0, 5.0, 3.0],   // left side cluster
        [ 7.0, -2.0, 6.0, 3.5],   // right side cluster
        [ 2.0, -5.0, 4.0, 2.5],   // near back line
        [-4.0, -4.0, 3.5, 2.0],   // left near back line
    ];

    const decalHeight = 0.005;  // just above field surface

    for (const ezCenter of [endzone1Center, endzone2Center]) {
        for (const [xOff, zOff, w, d] of patchDefs) {
            const geo = new THREE.BoxGeometry(w, decalHeight, d);
            const mesh = new THREE.Mesh(geo, wornMat);
            mesh.position.set(xOff, decalHeight / 2 + 0.001, ezCenter + zOff);
            mesh.receiveShadow = true;
            decals.push(mesh);
        }
    }

    return decals;
}

// --- Center Field Circle ---

/**
 * Create a subtle midfield marker ring at the center of the playing field.
 */
function createMidfieldMarker(): THREE.Mesh {
    const midZ = FIELD_LENGTH / 2;
    const ringOuterRadius = 4.0;
    const ringInnerRadius = 3.8;

    const ringGeo = new THREE.RingGeometry(ringInnerRadius, ringOuterRadius, 64);
    const ringMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        roughness: 0.8,
        side: THREE.DoubleSide,
    });

    const ring = new THREE.Mesh(ringGeo, ringMat);
    // Lie flat on the ground, slightly above surface to avoid z-fighting
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.003, midZ);
    ring.receiveShadow = true;

    return ring;
}

// --- Main Field Builder ---

export function createField(): THREE.Group {
    const group = new THREE.Group();

    // Generate PBR textures
    const grassNormalMap = createGrassNormalMap();
    const roughnessMap = createRoughnessMap();

    // Main surface with mowing stripe pattern + PBR maps
    const fieldGeo = new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_LENGTH);
    const fieldMat = new THREE.MeshStandardMaterial({
        color: 0x2d8c2d,
        normalMap: grassNormalMap,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughnessMap: roughnessMap,
        roughness: 1.0,  // base roughness modulated by the roughness map
    });

    // Inject mowing stripes into the field surface shader
    fieldMat.onBeforeCompile = (shader) => {
        shader.vertexShader = `
            varying vec3 vFieldWorldPos;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vFieldWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            `
        );

        shader.fragmentShader = `
            varying vec3 vFieldWorldPos;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            // Mowing stripe pattern perpendicular to endzones (along X axis)
            float stripePhase = floor(vFieldWorldPos.z / ${MOWING_STRIPE_WIDTH.toFixed(1)});
            float stripeMod = mod(stripePhase, 2.0);
            float mowFactor = mix(1.0, ${(1.0 - MOWING_BRIGHTNESS_DIFF).toFixed(3)}, stripeMod);
            diffuseColor.rgb *= mowFactor;
            `
        );
    };

    const fieldMesh = new THREE.Mesh(fieldGeo, fieldMat);
    fieldMesh.rotation.x = -Math.PI / 2;
    fieldMesh.position.set(0, 0, FIELD_LENGTH / 2);
    fieldMesh.receiveShadow = true;
    group.add(fieldMesh);

    // --- Endzone Wear Decals ---
    const wearDecals = createEndzoneWearDecals();
    for (const decal of wearDecals) {
        group.add(decal);
    }

    // --- Center Field Circle ---
    const midfieldRing = createMidfieldMarker();
    group.add(midfieldRing);

    // --- Field Lines ---
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const lineHeight = 0.02;

    // Sidelines
    const sidelineGeo = new THREE.BoxGeometry(0.1, lineHeight, FIELD_LENGTH);
    const leftSideline = new THREE.Mesh(sidelineGeo, whiteMat);
    leftSideline.position.set(-FIELD_WIDTH / 2, lineHeight / 2, FIELD_LENGTH / 2);
    group.add(leftSideline);

    const rightSideline = new THREE.Mesh(sidelineGeo, whiteMat);
    rightSideline.position.set(FIELD_WIDTH / 2, lineHeight / 2, FIELD_LENGTH / 2);
    group.add(rightSideline);

    // Cross lines (endzone lines and back lines)
    const crossLineGeo = new THREE.BoxGeometry(FIELD_WIDTH, lineHeight, 0.1);

    const crossLinePositions = [
        0,                                  // back line 1
        ENDZONE_DEPTH,                      // endzone line 1
        FIELD_LENGTH - ENDZONE_DEPTH,       // endzone line 2
        FIELD_LENGTH,                       // back line 2
    ];

    for (const z of crossLinePositions) {
        const line = new THREE.Mesh(crossLineGeo, whiteMat);
        line.position.set(0, lineHeight / 2, z);
        group.add(line);
    }

    // Brick marks
    const brickGeo = new THREE.BoxGeometry(1, lineHeight, 0.1);
    const brickPositions = [BRICK_MARK_DISTANCE, FIELD_LENGTH - BRICK_MARK_DISTANCE];

    for (const z of brickPositions) {
        const brick = new THREE.Mesh(brickGeo, whiteMat);
        brick.position.set(0, lineHeight / 2, z);
        group.add(brick);
    }

    // Corner cones at all 8 intersections
    const coneGeo = new THREE.ConeGeometry(0.15, 0.4, 8);
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff6600 });

    const coneXPositions = [-FIELD_WIDTH / 2, FIELD_WIDTH / 2];
    const coneZPositions = [0, ENDZONE_DEPTH, FIELD_LENGTH - ENDZONE_DEPTH, FIELD_LENGTH];

    for (const x of coneXPositions) {
        for (const z of coneZPositions) {
            const cone = new THREE.Mesh(coneGeo, orangeMat);
            cone.position.set(x, 0.2, z);
            group.add(cone);
        }
    }

    return group;
}
