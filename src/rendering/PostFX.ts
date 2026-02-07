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
    private slowMoTimer = 0;
    private slowMoTarget = 1.0;

    private composer: EffectComposer | null = null;
    private bloomPass: UnrealBloomPass | null = null;
    private vignettePass: ShaderPass | null = null;
    private baseBloomStrength = 0.4;
    private bloomPulse = 0;

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
                'darkness': { value: 1.2 },
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

        const outputPass = new OutputPass(); // Handles ACES Filmic Tone Mapping by default in newer Three.js

        this.composer = new EffectComposer(renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(this.vignettePass);
        this.composer.addPass(outputPass);
    }

    triggerScoreEffect(): void {
        this.slowMoTimer = 0.5;
        this.slowMoTarget = 0.25;
        this.shakeAmplitude = 0.12;
        this.shakeDecay = 8;
        this.shakeTimer = 0;
        this.bloomPulse = 1.0;
        if (this.vignettePass) this.vignettePass.uniforms.aberration.value = 0.025;
    }

    triggerLayoutEffect(): void {
        this.slowMoTimer = 0.4;
        this.slowMoTarget = 0.25;
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
        // Slow-mo
        if (this.slowMoTimer > 0) {
            this.timeScale = this.slowMoTarget;
            this.slowMoTimer -= dt; 
            if (this.slowMoTimer <= 0) {
                this.slowMoTimer = 0;
            }
        } else if (this.timeScale < 1.0) {
            this.timeScale = Math.min(1.0, this.timeScale + dt * 3);
        }

        // Recover chromatic aberration and bloom pulse
        this.bloomPulse = THREE.MathUtils.lerp(this.bloomPulse, 0, 1 - Math.exp(-4 * dt));
        if (this.bloomPass) {
            this.bloomPass.strength = this.baseBloomStrength + this.bloomPulse * 1.2;
            this.bloomPass.radius = 0.1 + this.bloomPulse * 0.4;
        }

        if (this.vignettePass) {
            this.vignettePass.uniforms.aberration.value = THREE.MathUtils.lerp(
                this.vignettePass.uniforms.aberration.value,
                0.001,
                1 - Math.exp(-5 * dt)
            );
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
    }
}
