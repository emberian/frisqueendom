import * as THREE from 'three';
import { SKY_PRESETS, type SkyConfig, type TimeOfDay } from '../data/WeatherTypes';
import { FIELD_LENGTH } from '../data/Constants';
import { CloudLayer } from './CloudLayer';

const STAR_COUNT = 2000;

export class SkySystem {
    private scene: THREE.Scene;
    private skyMat: THREE.ShaderMaterial;
    private sunSprite: THREE.Sprite;
    private sunLight: THREE.DirectionalLight;
    private ambientLight: THREE.AmbientLight;
    private hemiLight: THREE.HemisphereLight;
    private stadiumLights: THREE.DirectionalLight[] = [];
    private starField: THREE.Points | null = null;
    private moonSprite: THREE.Sprite | null = null;
    readonly cloudLayer: CloudLayer;

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

        // Stars — scattered on upper hemisphere
        this.starField = this.createStarField();
        this.starField.visible = false;
        scene.add(this.starField);

        // Moon sprite
        this.moonSprite = this.createMoonSprite();
        this.moonSprite.visible = false;
        scene.add(this.moonSprite);

        // Volumetric cloud billboard layer
        this.cloudLayer = new CloudLayer(scene);
    }

    private createStarField(): THREE.Points {
        const positions = new Float32Array(STAR_COUNT * 3);
        const sizes = new Float32Array(STAR_COUNT);
        const radius = 230; // slightly inside sky dome (250)

        for (let i = 0; i < STAR_COUNT; i++) {
            // Uniform distribution on upper hemisphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random()); // 0 to PI/2 (upper hemisphere only)
            const r = radius;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi); // always positive (upper hemisphere)
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

            // Vary star sizes: mostly small, a few bright ones
            sizes[i] = 0.5 + Math.pow(Math.random(), 3) * 2.5;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            sizeAttenuation: false,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.85,
        });

        return new THREE.Points(geo, mat);
    }

    private createMoonSprite(): THREE.Sprite {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;

        // Full moon circle
        ctx.beginPath();
        ctx.arc(32, 32, 24, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(230, 232, 240, 0.95)';
        ctx.fill();

        // Crescent shadow (offset circle to create crescent)
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(42, 30, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // Soft glow
        ctx.beginPath();
        const glow = ctx.createRadialGradient(32, 32, 16, 32, 32, 32);
        glow.addColorStop(0, 'rgba(200, 210, 240, 0.15)');
        glow.addColorStop(1, 'rgba(200, 210, 240, 0)');
        ctx.arc(32, 32, 32, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(20, 20, 1);
        sprite.position.set(-60, 140, -40);
        return sprite;
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

        // Cloud density derived from fog and lighting:
        //   High fog density  -> more clouds (overcast / rain)
        //   Low sun intensity -> night, light clouds
        //   Low fog density   -> clear, few clouds
        const fogFactor = Math.min(1, config.fogDensity / 0.006); // 0..1, 0.006 = densest preset
        const isNight = config.useStadiumLights || config.sunPosition.y < 5;
        let cloudDensity: number;
        if (isNight) {
            cloudDensity = 0.3;
        } else if (fogFactor > 0.7) {
            // Heavy fog -> overcast (0.6-0.8 depending on exact density)
            cloudDensity = 0.6 + (fogFactor - 0.7) * 0.67;
        } else {
            // Clear to moderate: map fogFactor 0..0.7 -> 0.15..0.5
            cloudDensity = 0.15 + fogFactor * 0.5;
        }
        this.cloudLayer.setDensity(cloudDensity);

        // Tint clouds to match horizon for cohesive look
        this.cloudLayer.setColor(new THREE.Color(config.horizonColor));

        // Stars and moon — visible during night and sunset
        const showNightSky = config.useStadiumLights || config.sunPosition.y < 10;
        if (this.starField) this.starField.visible = showNightSky;
        if (this.moonSprite) this.moonSprite.visible = showNightSky;

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

    private starTime = 0;

    update(dt: number, windX = 0.5, windZ = 0): void {
        this.starTime += dt;

        // Subtle star twinkle via opacity modulation
        if (this.starField?.visible) {
            const mat = this.starField.material as THREE.PointsMaterial;
            mat.opacity = 0.75 + 0.15 * Math.sin(this.starTime * 0.8);
        }

        // Drift clouds with wind
        this.cloudLayer.update(dt, windX, windZ);
    }
}

/**
 * Convenience function to apply a time-of-day preset to an existing SkySystem.
 * Equivalent to calling skySystem.applyPreset(timeOfDay).
 */
export function applyTimeOfDay(sky: SkySystem, _scene: THREE.Scene, timeOfDay: TimeOfDay): void {
    sky.applyPreset(timeOfDay);
}
