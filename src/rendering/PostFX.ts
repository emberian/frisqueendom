import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export class PostFX {
    timeScale = 1.0;
    private shakeAmplitude = 0;
    private shakeFrequency = 30;
    private shakeDecay = 0;
    private shakeTimer = 0;
    private shakeAppliedX = 0;
    private shakeAppliedY = 0;
    private lastCamera: THREE.PerspectiveCamera | null = null;

    // Phased slow-mo state
    private slowMoPhase: 'idle' | 'ramp_down' | 'hold' | 'ramp_up' = 'idle';
    private slowMoTimer = 0;
    private slowMoTarget = 0.25;
    private slowMoHoldDuration = 0.5;
    private slowMoRampDownDuration = 0.1;
    private slowMoRampUpDuration = 0.2;

    private composer: EffectComposer | null = null;
    private bloomPass: UnrealBloomPass | null = null;
    private vignettePass: ShaderPass | null = null;
    private dofPass: ShaderPass | null = null;
    private godRayPass: ShaderPass | null = null;
    private motionBlurPass: ShaderPass | null = null;
    private lutPass: ShaderPass | null = null;
    private baseBloomStrength = 0.4;
    private bloomPulse = 0;

    // DoF state
    private dofAmount = 0;
    private dofTarget = 0;
    private grainIntensity = 0.04;
    private elapsedTime = 0;

    // God ray state
    private godRayIntensity = 0;
    private godRayTarget = 0;
    private sunScreenPos = new THREE.Vector2(0.5, 0.5);

    // Motion blur state
    private motionBlurAmount = 0;
    private motionBlurTarget = 0;
    private prevViewProjection = new THREE.Matrix4();
    private prevViewProjectionSet = false;

    // LUT state
    private lutTexture: THREE.DataTexture | null = null;
    private lutIntensity = 1.0;

    init(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
        const renderScene = new RenderPass(scene, camera);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.4, // intensity
            0.1, // radius
            0.85 // threshold (high threshold ensures only emissive objects bloom)
        );

        // Custom Vignette + Chromatic Aberration + Film Grain Shader
        const vignetteShader = {
            uniforms: {
                'tDiffuse': { value: null },
                'offset': { value: 1.0 },
                'darkness': { value: 0.3 },
                'aberration': { value: 0.0014 },
                'grain': { value: 0.04 },
                'time': { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float offset;
                uniform float darkness;
                uniform float aberration;
                uniform float grain;
                uniform float time;
                varying vec2 vUv;

                // Hash-based noise (no texture needed)
                float hash(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                void main() {
                    vec4 texel = texture2D(tDiffuse, vUv);

                    // Chromatic Aberration
                    float r = texture2D(tDiffuse, vUv + vec2(aberration, 0.0)).r;
                    float g = texture2D(tDiffuse, vUv).g;
                    float b = texture2D(tDiffuse, vUv - vec2(aberration, 0.0)).b;

                    // Vignette
                    vec2 uv = (vUv - 0.5) * 2.0;
                    float dist = dot(uv, uv);
                    float vig = smoothstep(offset, offset - 0.5, dist * darkness);

                    vec3 color = vec3(r, g, b) * vig;

                    // Film grain
                    if (grain > 0.001) {
                        float n = hash(vUv * 1000.0 + time * 137.0) * 2.0 - 1.0;
                        color += color * n * grain;
                    }

                    gl_FragColor = vec4(color, texel.a);
                }
            `
        };
        this.vignettePass = new ShaderPass(vignetteShader);

        // Depth of Field (radial blur) shader
        const dofShader = {
            uniforms: {
                'tDiffuse': { value: null },
                'dofAmount': { value: 0.0 },
                'resolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float dofAmount;
                uniform vec2 resolution;
                varying vec2 vUv;

                void main() {
                    if (dofAmount < 0.001) {
                        gl_FragColor = texture2D(tDiffuse, vUv);
                        return;
                    }

                    vec2 center = vec2(0.5);
                    float dist = distance(vUv, center);
                    // Radial blur strength increases with distance from center
                    float blurStrength = smoothstep(0.2, 0.8, dist) * dofAmount;

                    vec2 texelSize = 1.0 / resolution;
                    vec4 color = texture2D(tDiffuse, vUv);
                    float totalWeight = 1.0;

                    // Sample in a small kernel, weighted by radial distance
                    float radius = blurStrength * 4.0;
                    for (float x = -2.0; x <= 2.0; x += 1.0) {
                        for (float y = -2.0; y <= 2.0; y += 1.0) {
                            if (x == 0.0 && y == 0.0) continue;
                            vec2 offset = vec2(x, y) * texelSize * radius;
                            float w = 1.0 / (1.0 + length(vec2(x, y)));
                            color += texture2D(tDiffuse, vUv + offset) * w;
                            totalWeight += w;
                        }
                    }
                    color /= totalWeight;

                    // Subtle darkening at edges for focus vignette
                    float focusVig = 1.0 - blurStrength * 0.15;
                    gl_FragColor = vec4(color.rgb * focusVig, color.a);
                }
            `
        };
        this.dofPass = new ShaderPass(dofShader);

        // God Rays (crepuscular rays) — radial blur from sun screen position
        const godRayShader = {
            uniforms: {
                'tDiffuse': { value: null },
                'sunPos': { value: new THREE.Vector2(0.5, 0.5) },
                'intensity': { value: 0.0 },
                'decay': { value: 0.96 },
                'density': { value: 0.5 },
                'weight': { value: 0.6 },
                'samples': { value: 60 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 sunPos;
                uniform float intensity;
                uniform float decay;
                uniform float density;
                uniform float weight;
                uniform int samples;
                varying vec2 vUv;

                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    if (intensity < 0.001) {
                        gl_FragColor = color;
                        return;
                    }

                    vec2 deltaUV = (vUv - sunPos) * density / float(samples);
                    vec2 sampleUV = vUv;
                    float illumination = 1.0;
                    vec3 rays = vec3(0.0);

                    for (int i = 0; i < 60; i++) {
                        sampleUV -= deltaUV;
                        vec3 samp = texture2D(tDiffuse, clamp(sampleUV, 0.0, 1.0)).rgb;
                        // Weight bright pixels more (luminance threshold)
                        float lum = dot(samp, vec3(0.299, 0.587, 0.114));
                        samp *= smoothstep(0.5, 1.0, lum);
                        rays += samp * illumination * weight;
                        illumination *= decay;
                    }

                    gl_FragColor = vec4(color.rgb + rays * intensity, color.a);
                }
            `
        };
        this.godRayPass = new ShaderPass(godRayShader);

        // Motion Blur — velocity-based directional blur
        const motionBlurShader = {
            uniforms: {
                'tDiffuse': { value: null },
                'velocityFactor': { value: 0.0 },
                'resolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                'prevViewProjection': { value: new THREE.Matrix4() },
                'viewProjectionInverse': { value: new THREE.Matrix4() }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float velocityFactor;
                uniform vec2 resolution;
                uniform mat4 prevViewProjection;
                uniform mat4 viewProjectionInverse;
                varying vec2 vUv;

                void main() {
                    if (velocityFactor < 0.001) {
                        gl_FragColor = texture2D(tDiffuse, vUv);
                        return;
                    }

                    // Reconstruct world position from UV + assumed depth
                    vec4 clipPos = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
                    vec4 worldPos = viewProjectionInverse * clipPos;
                    worldPos /= worldPos.w;

                    // Project to previous frame
                    vec4 prevClip = prevViewProjection * worldPos;
                    prevClip /= prevClip.w;
                    vec2 prevUV = prevClip.xy * 0.5 + 0.5;

                    // Velocity vector
                    vec2 velocity = (vUv - prevUV) * velocityFactor;

                    // Clamp velocity to avoid extreme streaking
                    float maxVel = 0.05;
                    float velLen = length(velocity);
                    if (velLen > maxVel) {
                        velocity = velocity / velLen * maxVel;
                    }

                    vec4 color = texture2D(tDiffuse, vUv);
                    float totalWeight = 1.0;

                    // 8 samples along velocity vector
                    for (int i = 1; i <= 8; i++) {
                        float t = float(i) / 8.0;
                        vec2 offset = velocity * t;
                        float w = 1.0 - t * 0.5; // weight falls off with distance
                        color += texture2D(tDiffuse, clamp(vUv + offset, 0.0, 1.0)) * w;
                        color += texture2D(tDiffuse, clamp(vUv - offset, 0.0, 1.0)) * w;
                        totalWeight += w * 2.0;
                    }

                    gl_FragColor = vec4(color.rgb / totalWeight, 1.0);
                }
            `
        };
        this.motionBlurPass = new ShaderPass(motionBlurShader);

        // Color Grading LUT — 16x16x16 lookup table
        const lutShader = {
            uniforms: {
                'tDiffuse': { value: null },
                'tLUT': { value: null },
                'lutSize': { value: 16.0 },
                'intensity': { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform sampler2D tLUT;
                uniform float lutSize;
                uniform float intensity;
                varying vec2 vUv;

                vec3 applyLUT(vec3 color) {
                    // Texture is (lutSize*lutSize) wide x lutSize tall
                    // X axis: lutSize blue slices, each lutSize pixels wide (R within slice)
                    // Y axis: lutSize pixels for green channel
                    float sliceSize = 1.0 / lutSize;           // UV width of one blue slice
                    float xPixelSize = sliceSize / lutSize;    // UV width of one pixel (1/256)
                    float xInnerSize = xPixelSize * (lutSize - 1.0); // UV span of R within a slice
                    float yPixelSize = 1.0 / lutSize;          // UV height of one pixel (1/16)
                    float yInnerSize = yPixelSize * (lutSize - 1.0); // UV span of G across height

                    float blueSlice0 = floor(color.b * (lutSize - 1.0));
                    float blueSlice1 = min(blueSlice0 + 1.0, lutSize - 1.0);
                    float blueFract = color.b * (lutSize - 1.0) - blueSlice0;

                    float v = yPixelSize * 0.5 + color.g * yInnerSize;

                    vec2 uv0 = vec2(
                        blueSlice0 * sliceSize + xPixelSize * 0.5 + color.r * xInnerSize,
                        v
                    );
                    vec2 uv1 = vec2(
                        blueSlice1 * sliceSize + xPixelSize * 0.5 + color.r * xInnerSize,
                        v
                    );

                    vec3 lutColor0 = texture2D(tLUT, uv0).rgb;
                    vec3 lutColor1 = texture2D(tLUT, uv1).rgb;

                    return mix(lutColor0, lutColor1, blueFract);
                }

                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    if (intensity < 0.001) {
                        gl_FragColor = color;
                        return;
                    }
                    vec3 graded = applyLUT(clamp(color.rgb, 0.0, 1.0));
                    gl_FragColor = vec4(mix(color.rgb, graded, intensity), color.a);
                }
            `
        };
        this.lutPass = new ShaderPass(lutShader);

        // Generate default LUT (identity + warm tint)
        this.generateLUT('afternoon');

        const outputPass = new OutputPass();

        // Pass chain: Render → Bloom → GodRays → DoF → MotionBlur → Vignette → LUT → Output
        this.composer = new EffectComposer(renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(this.godRayPass);
        this.composer.addPass(this.dofPass);
        this.composer.addPass(this.motionBlurPass);
        this.composer.addPass(this.vignettePass);
        this.composer.addPass(this.lutPass);
        this.composer.addPass(outputPass);
    }

    // --- Slow-Mo API (phased system) ---

    /** Trigger slow-motion with smooth ramp in/out. */
    triggerSlowMo(duration = 0.5, scale = 0.25): void {
        this.slowMoTarget = scale;
        this.slowMoHoldDuration = duration;
        this.slowMoRampDownDuration = 0.1;
        this.slowMoRampUpDuration = 0.2;
        this.slowMoPhase = 'ramp_down';
        this.slowMoTimer = 0;
    }

    /** Returns current time scale (1.0 = normal, 0.25 = slow). */
    getTimeScale(): number {
        return this.timeScale;
    }

    // --- DoF API ---

    /** Enable/disable depth-of-field effect (smooth transition). */
    setDoFEnabled(enabled: boolean): void {
        this.dofTarget = enabled ? 1 : 0;
    }

    // --- Film Grain API ---

    /** Set film grain intensity (0 = off, 0.04 = subtle, 0.1 = heavy). */
    setGrainIntensity(intensity: number): void {
        this.grainIntensity = Math.max(0, Math.min(0.2, intensity));
    }

    // --- God Ray API ---

    /** Enable/disable god rays with smooth transition. */
    setGodRaysEnabled(enabled: boolean): void {
        this.godRayTarget = enabled ? 0.4 : 0;
    }

    /** Set god ray intensity directly. */
    setGodRayIntensity(intensity: number): void {
        this.godRayTarget = Math.max(0, Math.min(1, intensity));
    }

    /** Update sun screen-space position for god ray source. Call from camera system. */
    setSunScreenPosition(x: number, y: number): void {
        this.sunScreenPos.set(x, y);
    }

    // --- Motion Blur API ---

    /** Enable/disable motion blur with smooth transition. */
    setMotionBlurEnabled(enabled: boolean): void {
        this.motionBlurTarget = enabled ? 0.5 : 0;
    }

    /** Set motion blur intensity (0 = off, 1 = heavy). */
    setMotionBlurAmount(amount: number): void {
        this.motionBlurTarget = Math.max(0, Math.min(1, amount));
    }

    // --- LUT API ---

    /** Apply a color grading preset for the given time of day. */
    setColorGrading(preset: string): void {
        this.generateLUT(preset);
    }

    /** Set LUT blending intensity (0 = no grading, 1 = full). */
    setLUTIntensity(intensity: number): void {
        this.lutIntensity = Math.max(0, Math.min(1, intensity));
    }

    // --- Existing trigger methods (preserved for backward compat) ---

    triggerScoreEffect(): void {
        this.triggerSlowMo(0.5, 0.25);
        this.shakeAmplitude = 0.12;
        this.shakeDecay = 8;
        this.shakeTimer = 0;
        this.bloomPulse = 1.0;
        if (this.vignettePass) this.vignettePass.uniforms.aberration.value = 0.018;
    }

    triggerLayoutEffect(): void {
        this.triggerSlowMo(0.4, 0.25);
        this.shakeAmplitude = 0.05;
        this.shakeDecay = 15;
        this.shakeTimer = 0;
        this.bloomPulse = 0.5;
        if (this.vignettePass) this.vignettePass.uniforms.aberration.value = 0.008;
    }

    triggerBlockShake(): void {
        this.shakeAmplitude = 0.08;
        this.shakeDecay = 10;
        this.shakeTimer = 0;
        this.bloomPulse = 0.3;
        if (this.vignettePass) this.vignettePass.uniforms.aberration.value = 0.007;
    }

    triggerSmallShake(): void {
        this.shakeAmplitude = 0.05;
        this.shakeDecay = 12;
        this.shakeTimer = 0;
    }

    update(dt: number, camera: THREE.PerspectiveCamera): void {
        this.lastCamera = camera;
        this.elapsedTime += dt;

        // --- Phased slow-mo ---
        this.updateSlowMo(dt);

        // Recover chromatic aberration and bloom pulse
        this.bloomPulse = THREE.MathUtils.lerp(this.bloomPulse, 0, 1 - Math.exp(-4 * dt));
        if (this.bloomPass) {
            // During slow-mo, slightly increase bloom for dramatic effect
            const slowMoBloomBoost = this.timeScale < 0.99 ? (1 - this.timeScale) * 0.3 : 0;
            this.bloomPass.strength = this.baseBloomStrength + this.bloomPulse * 1.2 + slowMoBloomBoost;
            this.bloomPass.radius = 0.1 + this.bloomPulse * 0.4;
        }

        if (this.vignettePass) {
            this.vignettePass.uniforms.aberration.value = THREE.MathUtils.lerp(
                this.vignettePass.uniforms.aberration.value,
                0.0007,
                1 - Math.exp(-5 * dt)
            );

            // During slow-mo, increase vignette slightly
            const slowMoVignette = this.timeScale < 0.99 ? 0.3 + (1 - this.timeScale) * 0.4 : 0.3;
            this.vignettePass.uniforms.darkness.value = THREE.MathUtils.lerp(
                this.vignettePass.uniforms.darkness.value,
                slowMoVignette,
                1 - Math.exp(-8 * dt)
            );

            // Film grain
            this.vignettePass.uniforms.grain.value = this.grainIntensity;
            this.vignettePass.uniforms.time.value = this.elapsedTime;
        }

        // --- DoF ---
        this.dofAmount = THREE.MathUtils.lerp(this.dofAmount, this.dofTarget, 1 - Math.exp(-5 * dt));
        if (this.dofPass) {
            this.dofPass.uniforms.dofAmount.value = this.dofAmount;
        }

        // --- God Rays ---
        this.godRayIntensity = THREE.MathUtils.lerp(this.godRayIntensity, this.godRayTarget, 1 - Math.exp(-4 * dt));
        if (this.godRayPass) {
            this.godRayPass.uniforms.intensity.value = this.godRayIntensity;
            this.godRayPass.uniforms.sunPos.value.copy(this.sunScreenPos);
        }

        // --- Motion Blur ---
        this.motionBlurAmount = THREE.MathUtils.lerp(this.motionBlurAmount, this.motionBlurTarget, 1 - Math.exp(-4 * dt));
        if (this.motionBlurPass) {
            this.motionBlurPass.uniforms.velocityFactor.value = this.motionBlurAmount;

            // Compute view-projection inverse for world position reconstruction
            const vp = new THREE.Matrix4();
            vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            const vpInverse = vp.clone().invert();
            this.motionBlurPass.uniforms.viewProjectionInverse.value.copy(vpInverse);

            if (this.prevViewProjectionSet) {
                this.motionBlurPass.uniforms.prevViewProjection.value.copy(this.prevViewProjection);
            } else {
                this.motionBlurPass.uniforms.prevViewProjection.value.copy(vp);
                this.prevViewProjectionSet = true;
            }
            this.prevViewProjection.copy(vp);
        }

        // --- LUT ---
        if (this.lutPass) {
            this.lutPass.uniforms.intensity.value = this.lutIntensity;
        }

        // Screen shake — apply offset, track it for restore after render
        this.shakeAppliedX = 0;
        this.shakeAppliedY = 0;
        if (this.shakeAmplitude > 0.001) {
            this.shakeTimer += dt;
            const decay = Math.exp(-this.shakeDecay * this.shakeTimer);
            this.shakeAppliedX =
                this.shakeAmplitude *
                decay *
                Math.sin(this.shakeTimer * this.shakeFrequency);
            this.shakeAppliedY =
                this.shakeAmplitude *
                decay *
                Math.cos(this.shakeTimer * this.shakeFrequency * 1.3);

            camera.position.x += this.shakeAppliedX;
            camera.position.y += this.shakeAppliedY;

            if (decay < 0.01) {
                this.shakeAmplitude = 0;
            }
        }
    }

    /** Cubic ease: t^2 * (3 - 2t) */
    private cubicEase(t: number): number {
        const c = Math.max(0, Math.min(1, t));
        return c * c * (3 - 2 * c);
    }

    private updateSlowMo(dt: number): void {
        switch (this.slowMoPhase) {
            case 'idle':
                // If timeScale is below 1.0 from a previous effect, ease it back
                if (this.timeScale < 0.999) {
                    this.timeScale = Math.min(1.0, this.timeScale + dt * 5);
                } else {
                    this.timeScale = 1.0;
                }
                break;

            case 'ramp_down': {
                this.slowMoTimer += dt;
                const progress = Math.min(1, this.slowMoTimer / this.slowMoRampDownDuration);
                const eased = this.cubicEase(progress);
                this.timeScale = 1.0 + (this.slowMoTarget - 1.0) * eased;
                if (progress >= 1) {
                    this.slowMoPhase = 'hold';
                    this.slowMoTimer = 0;
                    this.timeScale = this.slowMoTarget;
                }
                break;
            }

            case 'hold': {
                this.slowMoTimer += dt;
                this.timeScale = this.slowMoTarget;
                if (this.slowMoTimer >= this.slowMoHoldDuration) {
                    this.slowMoPhase = 'ramp_up';
                    this.slowMoTimer = 0;
                }
                break;
            }

            case 'ramp_up': {
                this.slowMoTimer += dt;
                const progress = Math.min(1, this.slowMoTimer / this.slowMoRampUpDuration);
                const eased = this.cubicEase(progress);
                this.timeScale = this.slowMoTarget + (1.0 - this.slowMoTarget) * eased;
                if (progress >= 1) {
                    this.slowMoPhase = 'idle';
                    this.slowMoTimer = 0;
                    this.timeScale = 1.0;
                }
                break;
            }
        }
    }

    /** Generate a procedural 16x16x16 LUT for the given time-of-day preset. */
    private generateLUT(preset: string): void {
        const size = 16;
        const data = new Uint8Array(size * size * size * 4);

        // Color grading parameters per preset
        type Grade = { lift: [number, number, number]; gamma: [number, number, number]; gain: [number, number, number]; saturation: number };
        const grades: Record<string, Grade> = {
            morning: {
                lift: [0.02, 0.01, -0.02],
                gamma: [1.05, 1.0, 0.92],
                gain: [1.1, 1.05, 0.95],
                saturation: 1.1
            },
            midday: {
                lift: [0.0, 0.0, 0.0],
                gamma: [1.0, 1.0, 1.0],
                gain: [1.0, 1.0, 1.0],
                saturation: 1.0
            },
            afternoon: {
                lift: [0.0, 0.0, 0.0],
                gamma: [1.0, 1.0, 1.0],
                gain: [1.02, 1.0, 0.98],
                saturation: 1.05
            },
            golden_hour: {
                lift: [0.04, 0.02, -0.04],
                gamma: [1.1, 0.98, 0.85],
                gain: [1.15, 1.0, 0.85],
                saturation: 1.2
            },
            sunset: {
                lift: [0.06, 0.01, -0.05],
                gamma: [1.12, 0.95, 0.82],
                gain: [1.2, 0.95, 0.8],
                saturation: 1.25
            },
            night: {
                lift: [-0.02, -0.01, 0.04],
                gamma: [0.9, 0.92, 1.1],
                gain: [0.85, 0.9, 1.1],
                saturation: 0.7
            },
            overcast: {
                lift: [0.0, 0.0, 0.01],
                gamma: [0.98, 0.98, 1.0],
                gain: [0.95, 0.95, 0.98],
                saturation: 0.8
            }
        };

        const grade = grades[preset] ?? grades.afternoon;

        let idx = 0;
        // Layout: texture is (size*size) wide x size tall
        // X axis = Blue slices (size groups of size pixels), R within each slice
        // Y axis = Green
        for (let g = 0; g < size; g++) {
            for (let b = 0; b < size; b++) {
                for (let r = 0; r < size; r++) {
                    // Normalize to 0-1
                    let cr = r / (size - 1);
                    let cg = g / (size - 1);
                    let cb = b / (size - 1);

                    // Apply lift (shadows)
                    cr += grade.lift[0] * (1 - cr);
                    cg += grade.lift[1] * (1 - cg);
                    cb += grade.lift[2] * (1 - cb);

                    // Apply gamma (midtones)
                    cr = Math.pow(Math.max(0, cr), 1 / grade.gamma[0]);
                    cg = Math.pow(Math.max(0, cg), 1 / grade.gamma[1]);
                    cb = Math.pow(Math.max(0, cb), 1 / grade.gamma[2]);

                    // Apply gain (highlights)
                    cr *= grade.gain[0];
                    cg *= grade.gain[1];
                    cb *= grade.gain[2];

                    // Apply saturation
                    const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
                    cr = lum + (cr - lum) * grade.saturation;
                    cg = lum + (cg - lum) * grade.saturation;
                    cb = lum + (cb - lum) * grade.saturation;

                    // Clamp and write
                    data[idx++] = Math.max(0, Math.min(255, Math.round(cr * 255)));
                    data[idx++] = Math.max(0, Math.min(255, Math.round(cg * 255)));
                    data[idx++] = Math.max(0, Math.min(255, Math.round(cb * 255)));
                    data[idx++] = 255;
                }
            }
        }

        // Create 256x16 strip texture (16 blue slices side-by-side, each 16x16 RG)
        if (this.lutTexture) {
            this.lutTexture.dispose();
        }
        this.lutTexture = new THREE.DataTexture(data, size * size, size, THREE.RGBAFormat);
        this.lutTexture.minFilter = THREE.LinearFilter;
        this.lutTexture.magFilter = THREE.LinearFilter;
        this.lutTexture.needsUpdate = true;

        if (this.lutPass) {
            this.lutPass.uniforms.tLUT.value = this.lutTexture;
        }
    }

    render(): void {
        if (this.composer) {
            this.composer.render();
        }
        // Restore camera position after rendering (undo shake offset)
        if (this.lastCamera) {
            this.lastCamera.position.x -= this.shakeAppliedX;
            this.lastCamera.position.y -= this.shakeAppliedY;
            this.shakeAppliedX = 0;
            this.shakeAppliedY = 0;
        }
    }

    handleResize(width: number, height: number): void {
        if (this.composer) {
            this.composer.setSize(width, height);
        }
        if (this.bloomPass) {
            this.bloomPass.resolution.set(width, height);
        }
        if (this.dofPass) {
            this.dofPass.uniforms.resolution.value.set(width, height);
        }
        if (this.motionBlurPass) {
            this.motionBlurPass.uniforms.resolution.value.set(width, height);
        }
    }
}
