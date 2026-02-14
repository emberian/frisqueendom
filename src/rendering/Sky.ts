import * as THREE from 'three';
import { SKY_PRESETS, type SkyConfig, type TimeOfDay } from '../data/WeatherTypes';
import { FIELD_LENGTH } from '../data/Constants';

export class SkySystem {
    private scene: THREE.Scene;
    private skyMat: THREE.ShaderMaterial;
    private sunSprite: THREE.Sprite;
    private sunLight: THREE.DirectionalLight;
    private ambientLight: THREE.AmbientLight;
    private hemiLight: THREE.HemisphereLight;
    private stadiumLights: THREE.DirectionalLight[] = [];

    constructor(
        scene: THREE.Scene,
        sunLight: THREE.DirectionalLight,
        ambientLight: THREE.AmbientLight,
    ) {
        this.scene = scene;
        this.sunLight = sunLight;
        this.ambientLight = ambientLight;

        // Hemisphere light for sky/ground color bleed
        this.hemiLight = new THREE.HemisphereLight(0x88bbee, 0x446622, 0.5);
        scene.add(this.hemiLight);

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

        // Shadow bias
        if (this.sunLight.shadow) {
            this.sunLight.shadow.bias = config.shadowBias;
        }

        // Update ambient light
        this.ambientLight.intensity = config.ambientIntensity;
        this.ambientLight.color.setHex(config.ambientColor);

        // Update hemisphere light
        this.hemiLight.color.setHex(config.hemiSkyColor);
        this.hemiLight.groundColor.setHex(config.hemiGroundColor);
        this.hemiLight.intensity = config.hemiIntensity;

        // Update fog if scene has it
        if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
            this.scene.fog.color.setHex(config.fogColor);
            this.scene.fog.density = config.fogDensity;
        }

        // Update scene background to match horizon for seamless blending
        if (this.scene.background instanceof THREE.Color) {
            this.scene.background.setHex(config.horizonColor);
        }

        // Stadium lights for night mode
        this.removeStadiumLights();
        if (config.useStadiumLights && config.stadiumLights) {
            const fieldCenter = new THREE.Vector3(0, 0, FIELD_LENGTH / 2);
            for (const lightDef of config.stadiumLights) {
                const light = new THREE.DirectionalLight(lightDef.color, lightDef.intensity);
                light.position.set(lightDef.x, lightDef.y, lightDef.z);
                light.target.position.copy(fieldCenter);
                this.scene.add(light);
                this.scene.add(light.target);
                this.stadiumLights.push(light);
            }
        }
    }

    private removeStadiumLights(): void {
        for (const light of this.stadiumLights) {
            this.scene.remove(light);
            this.scene.remove(light.target);
        }
        this.stadiumLights = [];
    }

    update(_dt: number): void {
        // Placeholder for future animation (e.g., sun movement, clouds)
    }
}

/**
 * Convenience function to apply a time-of-day preset to an existing SkySystem.
 * Equivalent to calling skySystem.applyPreset(timeOfDay).
 */
export function applyTimeOfDay(sky: SkySystem, _scene: THREE.Scene, timeOfDay: TimeOfDay): void {
    sky.applyPreset(timeOfDay);
}
