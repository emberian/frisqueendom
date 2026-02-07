import * as THREE from 'three';
import { SKY_PRESETS, type SkyConfig, type TimeOfDay } from '../data/WeatherTypes';

export class SkySystem {
    private scene: THREE.Scene;
    private skyMat: THREE.ShaderMaterial;
    private sunSprite: THREE.Sprite;
    private sunLight: THREE.DirectionalLight;
    private ambientLight: THREE.AmbientLight;

    constructor(
        scene: THREE.Scene,
        sunLight: THREE.DirectionalLight,
        ambientLight: THREE.AmbientLight,
    ) {
        this.scene = scene;
        this.sunLight = sunLight;
        this.ambientLight = ambientLight;

        // Sky dome
        const skyGeo = new THREE.SphereGeometry(250, 32, 32);
        this.skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                topColor: { value: new THREE.Color(0x4a90d9) },
                horizonColor: { value: new THREE.Color(0x87ceeb) },
                bottomColor: { value: new THREE.Color(0xf5e6c8) },
                sunDir: { value: new THREE.Vector3(0, 1, 0) }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                uniform vec3 bottomColor;
                uniform vec3 sunDir;
                varying vec3 vWorldPosition;
                void main() {
                    vec3 dir = normalize(vWorldPosition);
                    float h = dir.y;
                    vec3 color;
                    
                    if (h > 0.0) {
                        float zenithMix = pow(h, 0.6);
                        color = mix(horizonColor, topColor, zenithMix);
                        
                        // Sun halo
                        float sunGlow = pow(max(0.0, dot(dir, normalize(sunDir))), 120.0);
                        color += vec3(1.0, 0.9, 0.7) * sunGlow * 0.8;
                    } else {
                        color = mix(horizonColor, bottomColor, pow(-h, 0.5));
                    }
                    
                    color = mix(color, vec3(1.0), clamp(0.02 / (abs(h) + 0.01), 0.0, 0.15));
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
        });

        const sky = new THREE.Mesh(skyGeo, this.skyMat);
        scene.add(sky);

        // Sun sprite
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 240, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 200, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 200, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        const sunTex = new THREE.CanvasTexture(canvas);
        const sunMat = new THREE.SpriteMaterial({
            map: sunTex,
            transparent: true,
            blending: THREE.AdditiveBlending,
        });
        this.sunSprite = new THREE.Sprite(sunMat);
        this.sunSprite.scale.set(30, 30, 1);
        this.sunSprite.position.set(30, 50, 20);
        scene.add(this.sunSprite);
    }

    applyPreset(timeOfDay: TimeOfDay): void {
        this.applyConfig(SKY_PRESETS[timeOfDay]);
    }

    applyConfig(config: SkyConfig): void {
        // Update sky shader uniforms
        this.skyMat.uniforms.topColor.value.setHex(config.topColor);
        this.skyMat.uniforms.horizonColor.value.setHex(config.horizonColor);
        this.skyMat.uniforms.bottomColor.value.setHex(config.bottomColor);
        this.skyMat.uniforms.sunDir.value.copy(config.sunPosition).normalize();

        // Update sun sprite position and visibility
        this.sunSprite.position.set(
            config.sunPosition.x,
            config.sunPosition.y,
            config.sunPosition.z,
        );
        this.sunSprite.visible = config.sunIntensity > 0;

        // Update directional light (sun)
        this.sunLight.intensity = config.sunIntensity;
        this.sunLight.color.setHex(config.sunColor);
        this.sunLight.position.set(
            config.sunPosition.x,
            config.sunPosition.y,
            config.sunPosition.z,
        );

        // Update ambient light
        this.ambientLight.intensity = config.ambientIntensity;
        this.ambientLight.color.setHex(config.ambientColor);

        // Update fog if scene has it
        if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
            this.scene.fog.color.setHex(config.fogColor);
            this.scene.fog.density = config.fogDensity;
        }
    }

    update(_dt: number): void {
        // Placeholder for future animation (e.g., sun movement, clouds)
    }
}
