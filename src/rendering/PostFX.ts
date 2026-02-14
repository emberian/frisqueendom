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
    private baseBloomStrength = 0.4;
    private bloomPulse = 0;

    // DoF state
    private dofAmount = 0;
    private dofTarget = 0;

    init(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
        const renderScene = new RenderPass(scene, camera);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.4, // intensity
            0.1, // radius
            0.85 // threshold (high threshold ensures only emissive objects bloom)
        );

        // Custom Vignette + Chromatic Aberration Shader
        const vignetteShader = {
            uniforms: {
                'tDiffuse': { value: null },
                'offset': { value: 1.0 },
                'darkness': { value: 0.3 },
                'aberration': { value: 0.002 }
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
                varying vec2 vUv;
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

                    gl_FragColor = vec4(vec3(r, g, b) * vig, texel.a);
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

        const outputPass = new OutputPass(); // Handles ACES Filmic Tone Mapping by default in newer Three.js

        this.composer = new EffectComposer(renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(this.dofPass);
        this.composer.addPass(this.vignettePass);
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

    // --- Existing trigger methods (preserved for backward compat) ---

    triggerScoreEffect(): void {
        this.triggerSlowMo(0.5, 0.25);
        this.shakeAmplitude = 0.12;
        this.shakeDecay = 8;
        this.shakeTimer = 0;
        this.bloomPulse = 1.0;
        if (this.vignettePass) this.vignettePass.uniforms.aberration.value = 0.025;
    }

    triggerLayoutEffect(): void {
        this.triggerSlowMo(0.4, 0.25);
        this.shakeAmplitude = 0.05;
        this.shakeDecay = 15;
        this.shakeTimer = 0;
        this.bloomPulse = 0.5;
        if (this.vignettePass) this.vignettePass.uniforms.aberration.value = 0.012;
    }

    triggerBlockShake(): void {
        this.shakeAmplitude = 0.08;
        this.shakeDecay = 10;
        this.shakeTimer = 0;
        this.bloomPulse = 0.3;
        if (this.vignettePass) this.vignettePass.uniforms.aberration.value = 0.01;
    }

    triggerSmallShake(): void {
        this.shakeAmplitude = 0.05;
        this.shakeDecay = 12;
        this.shakeTimer = 0;
    }

    update(dt: number, camera: THREE.PerspectiveCamera): void {
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
                0.001,
                1 - Math.exp(-5 * dt)
            );

            // During slow-mo, increase vignette slightly
            const slowMoVignette = this.timeScale < 0.99 ? 0.3 + (1 - this.timeScale) * 0.4 : 0.3;
            this.vignettePass.uniforms.darkness.value = THREE.MathUtils.lerp(
                this.vignettePass.uniforms.darkness.value,
                slowMoVignette,
                1 - Math.exp(-8 * dt)
            );
        }

        // --- DoF ---
        this.dofAmount = THREE.MathUtils.lerp(this.dofAmount, this.dofTarget, 1 - Math.exp(-5 * dt));
        if (this.dofPass) {
            this.dofPass.uniforms.dofAmount.value = this.dofAmount;
        }

        // Screen shake
        if (this.shakeAmplitude > 0.001) {
            this.shakeTimer += dt;
            const decay = Math.exp(-this.shakeDecay * this.shakeTimer);
            const offsetX =
                this.shakeAmplitude *
                decay *
                Math.sin(this.shakeTimer * this.shakeFrequency);
            const offsetY =
                this.shakeAmplitude *
                decay *
                Math.cos(this.shakeTimer * this.shakeFrequency * 1.3);

            camera.position.x += offsetX;
            camera.position.y += offsetY;

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

    render(): void {
        if (this.composer) {
            this.composer.render();
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
    }
}
