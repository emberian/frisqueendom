import * as THREE from 'three';

/**
 * Volumetric cloud billboard system using InstancedMesh.
 *
 * 200-400 instanced planes with a noise-based density shader that creates
 * soft, volumetric-looking clouds.  Clouds drift with wind, bob gently,
 * and face the camera via a shader-based billboard transform.
 */

const MAX_CLOUDS = 350;

// ----- shader source -----

const cloudVertexShader = /* glsl */ `
    attribute vec3 instanceOffset;
    attribute float instanceScale;
    attribute float instanceOpacity;
    attribute float instancePhase;

    uniform float uTime;
    uniform vec3 uWindDrift;

    varying vec2 vUv;
    varying float vOpacity;
    varying float vPhase;

    void main() {
        vUv = uv;
        vOpacity = instanceOpacity;
        vPhase = instancePhase;

        // Billboard: build camera-aligned axes from view matrix
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

        // Offset quad corners in camera space
        vec3 vertexPos = camRight * position.x * instanceScale
                       + camUp    * position.y * instanceScale;

        // Wind drift accumulation
        vec3 drift = uWindDrift * uTime;

        // Gentle vertical bobbing
        float bob = sin(uTime * 0.4 + instancePhase * 6.2831) * 1.5;

        vec3 worldPos = instanceOffset + drift + vec3(0.0, bob, 0.0) + vertexPos;

        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    }
`;

const cloudFragmentShader = /* glsl */ `
    uniform vec3 uColor;
    uniform float uDensity;
    uniform float uTime;

    varying vec2 vUv;
    varying float vOpacity;
    varying float vPhase;

    // Hash-based noise (same family as PostFX)
    float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f); // smoothstep

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p = p * 2.0 + shift;
            a *= 0.5;
        }
        return v;
    }

    void main() {
        // Radial fade from billboard center
        vec2 centered = vUv * 2.0 - 1.0;
        float radial = 1.0 - smoothstep(0.3, 1.0, length(centered));

        // Animated procedural density
        float phase = vPhase * 100.0;
        float slowTime = uTime * 0.05;
        float n = fbm(centered * 2.5 + vec2(phase) + slowTime);

        // Combine noise with radial falloff for soft volumetric edges
        float density = radial * n * 1.8;
        density = smoothstep(0.15, 0.65, density);

        float alpha = density * vOpacity * uDensity;

        // Discard fully transparent fragments
        if (alpha < 0.005) discard;

        gl_FragColor = vec4(uColor, alpha);
    }
`;

// ----- class -----

export class CloudLayer {
    private mesh: THREE.InstancedMesh;
    private material: THREE.ShaderMaterial;
    private time = 0;
    private windDrift = new THREE.Vector3(0.5, 0, 0); // default gentle drift

    constructor(scene: THREE.Scene) {
        // Plane geometry per billboard (20 x 10)
        const geo = new THREE.PlaneGeometry(20, 10);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xf8f4ee) }, // warm white
                uDensity: { value: 0.15 },
                uWindDrift: { value: this.windDrift },
            },
            vertexShader: cloudVertexShader,
            fragmentShader: cloudFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.mesh = new THREE.InstancedMesh(geo, this.material, MAX_CLOUDS);
        this.mesh.frustumCulled = false; // clouds are large and on a dome; skip per-instance culling

        // Per-instance attributes
        const offsets = new Float32Array(MAX_CLOUDS * 3);
        const scales = new Float32Array(MAX_CLOUDS);
        const opacities = new Float32Array(MAX_CLOUDS);
        const phases = new Float32Array(MAX_CLOUDS);

        for (let i = 0; i < MAX_CLOUDS; i++) {
            // Distribute on a dome: xz in [-200, 200], y in [80, 140]
            const angle = pseudoRandom(i * 3) * Math.PI * 2;
            const radius = 40 + pseudoRandom(i * 3 + 1) * 160; // 40-200
            offsets[i * 3] = Math.cos(angle) * radius;
            offsets[i * 3 + 1] = 80 + pseudoRandom(i * 3 + 2) * 60; // y: 80-140
            offsets[i * 3 + 2] = Math.sin(angle) * radius;

            scales[i] = 0.5 + pseudoRandom(i * 7 + 5) * 1.5; // 0.5 - 2.0
            opacities[i] = 0.3 + pseudoRandom(i * 11 + 7) * 0.7; // 0.3 - 1.0
            phases[i] = pseudoRandom(i * 13 + 11); // 0 - 1
        }

        // Set dummy instance matrices (billboard is computed in the shader, but
        // InstancedMesh requires matrices to not be all-zero).
        const identity = new THREE.Matrix4();
        for (let i = 0; i < MAX_CLOUDS; i++) {
            this.mesh.setMatrixAt(i, identity);
        }
        this.mesh.instanceMatrix.needsUpdate = true;

        // Attach instance attributes to the geometry
        geo.setAttribute('instanceOffset', new THREE.InstancedBufferAttribute(offsets, 3));
        geo.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(scales, 1));
        geo.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(opacities, 1));
        geo.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(phases, 1));

        scene.add(this.mesh);
    }

    /** Advance cloud animation.  windX/windZ are world-space wind components. */
    update(dt: number, windX: number, windZ: number): void {
        this.time += dt;
        this.material.uniforms.uTime.value = this.time;

        // Drift direction from wind (scaled down for gentle movement)
        this.windDrift.set(windX * 0.12, 0, windZ * 0.12);
    }

    /** Set cloud coverage: 0 = clear sky, 1 = fully overcast. */
    setDensity(density: number): void {
        this.material.uniforms.uDensity.value = Math.max(0, Math.min(1, density));
    }

    /** Toggle cloud layer visibility. */
    setVisible(visible: boolean): void {
        this.mesh.visible = visible;
    }

    /** Tint cloud color (default is warm white). */
    setColor(color: THREE.Color): void {
        this.material.uniforms.uColor.value.copy(color);
    }
}

// Deterministic pseudo-random based on integer seed (no Math.random dependency).
function pseudoRandom(seed: number): number {
    let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    x = x - Math.floor(x);
    return x;
}
