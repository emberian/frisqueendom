import * as THREE from 'three';
import { Random } from '../data/SeededRandom';

// Particle sprite types — each maps to a column in the texture atlas
export const PARTICLE_TYPE = {
    CIRCLE: 0,     // Soft circle (default, catch burst, celebration)
    RAINDROP: 1,   // Elongated teardrop
    DUST: 2,       // Wispy irregular shape
    CONFETTI: 3,   // Small rectangle/square
    RING: 4,       // Hollow ring (catch rings)
    GRASS: 5,      // Small blade shape
    FIREWORK: 6,   // Star/cross shape
    SPARK: 7,      // Bright tiny dot with glow
} as const;

interface Particle {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    color: THREE.Color;
    size: number;
    active: boolean;
    type: number;
    rotation: number;
    rotationSpeed: number;
}

const MAX_PARTICLES = 1500;
const ATLAS_COLS = 8;

export class ParticleSystem {
    private particles: Particle[] = [];
    private activeCount = 0;
    private mesh: THREE.Points;
    private positions: Float32Array;
    private colors: Float32Array;
    private sizes: Float32Array;
    private spriteTypes: Float32Array;
    private rotations: Float32Array;
    private geometry: THREE.BufferGeometry;

    constructor(scene: THREE.Scene) {
        this.positions = new Float32Array(MAX_PARTICLES * 3);
        this.colors = new Float32Array(MAX_PARTICLES * 4); // RGBA for per-particle alpha
        this.sizes = new Float32Array(MAX_PARTICLES);
        this.spriteTypes = new Float32Array(MAX_PARTICLES);
        this.rotations = new Float32Array(MAX_PARTICLES);

        // Pre-allocate all particle objects in a pool
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.particles.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                maxLife: 1,
                color: new THREE.Color(),
                size: 0,
                active: false,
                type: 0,
                rotation: 0,
                rotationSpeed: 0,
            });
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.positions, 3),
        );
        this.geometry.setAttribute(
            'aColor',
            new THREE.BufferAttribute(this.colors, 4),
        );
        this.geometry.setAttribute(
            'aSize',
            new THREE.BufferAttribute(this.sizes, 1),
        );
        this.geometry.setAttribute(
            'aSpriteType',
            new THREE.BufferAttribute(this.spriteTypes, 1),
        );
        this.geometry.setAttribute(
            'aRotation',
            new THREE.BufferAttribute(this.rotations, 1),
        );

        const atlas = this.generateAtlas();

        const material = new THREE.ShaderMaterial({
            uniforms: {
                atlas: { value: atlas },
                atlasCols: { value: ATLAS_COLS },
            },
            vertexShader: `
                attribute vec4 aColor;
                attribute float aSize;
                attribute float aSpriteType;
                attribute float aRotation;
                varying vec4 vColor;
                varying float vSpriteType;
                varying float vRotation;
                void main() {
                    vColor = aColor;
                    vSpriteType = aSpriteType;
                    vRotation = aRotation;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = aSize * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D atlas;
                uniform float atlasCols;
                varying vec4 vColor;
                varying float vSpriteType;
                varying float vRotation;
                void main() {
                    // Rotate point UV
                    vec2 uv = gl_PointCoord - 0.5;
                    float c = cos(vRotation);
                    float s = sin(vRotation);
                    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;

                    // Sample from atlas column
                    float col = floor(vSpriteType + 0.5);
                    float atlasU = (col + uv.x) / atlasCols;
                    float atlasV = uv.y;

                    vec4 texel = texture2D(atlas, vec2(atlasU, atlasV));
                    if (texel.a < 0.01) discard;
                    gl_FragColor = vec4(vColor.rgb * texel.rgb, vColor.a * texel.a);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this.mesh = new THREE.Points(this.geometry, material);
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }

    /** Generate a procedural 8-column texture atlas (one sprite type per column). */
    private generateAtlas(): THREE.CanvasTexture {
        const cellSize = 64;
        const canvas = document.createElement('canvas');
        canvas.width = cellSize * ATLAS_COLS;
        canvas.height = cellSize;
        const ctx = canvas.getContext('2d')!;

        const cx = cellSize / 2;
        const cy = cellSize / 2;

        // Helper to draw in a specific column
        const inCol = (col: number, fn: (ox: number) => void) => {
            const ox = col * cellSize;
            ctx.save();
            fn(ox);
            ctx.restore();
        };

        // 0: CIRCLE — soft radial gradient
        inCol(0, (ox) => {
            const grad = ctx.createRadialGradient(ox + cx, cy, 0, ox + cx, cy, cx);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(ox, 0, cellSize, cellSize);
        });

        // 1: RAINDROP — elongated teardrop
        inCol(1, (ox) => {
            const grad = ctx.createRadialGradient(ox + cx, cy + 8, 2, ox + cx, cy, cx);
            grad.addColorStop(0, 'rgba(200,210,255,0.9)');
            grad.addColorStop(0.3, 'rgba(180,200,255,0.5)');
            grad.addColorStop(1, 'rgba(180,200,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(ox + cx, cy, 10, 28, 0, 0, Math.PI * 2);
            ctx.fill();
        });

        // 2: DUST — wispy cloud
        inCol(2, (ox) => {
            for (let i = 0; i < 5; i++) {
                const x = ox + cx + (Math.random() - 0.5) * 20;
                const y = cy + (Math.random() - 0.5) * 20;
                const r = 8 + Math.random() * 12;
                const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
                grad.addColorStop(0, 'rgba(255,255,255,0.4)');
                grad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(ox, 0, cellSize, cellSize);
            }
        });

        // 3: CONFETTI — small solid rectangle
        inCol(3, (ox) => {
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.fillRect(ox + cx - 10, cy - 14, 20, 28);
        });

        // 4: RING — hollow ring
        inCol(4, (ox) => {
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(ox + cx, cy, 22, 0, Math.PI * 2);
            ctx.stroke();
            // Soft glow
            const grad = ctx.createRadialGradient(ox + cx, cy, 18, ox + cx, cy, 28);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(ox, 0, cellSize, cellSize);
        });

        // 5: GRASS — blade shape
        inCol(5, (ox) => {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.moveTo(ox + cx - 3, cy + 20);
            ctx.lineTo(ox + cx, cy - 20);
            ctx.lineTo(ox + cx + 3, cy + 20);
            ctx.closePath();
            ctx.fill();
        });

        // 6: FIREWORK — star/cross
        inCol(6, (ox) => {
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            for (let a = 0; a < 4; a++) {
                ctx.save();
                ctx.translate(ox + cx, cy);
                ctx.rotate((a * Math.PI) / 4);
                ctx.fillRect(-2, -24, 4, 48);
                ctx.restore();
            }
            // Center glow
            const grad = ctx.createRadialGradient(ox + cx, cy, 0, ox + cx, cy, 12);
            grad.addColorStop(0, 'rgba(255,255,255,0.8)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(ox, 0, cellSize, cellSize);
        });

        // 7: SPARK — bright dot
        inCol(7, (ox) => {
            const grad = ctx.createRadialGradient(ox + cx, cy, 0, ox + cx, cy, 16);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(0.15, 'rgba(255,255,240,0.9)');
            grad.addColorStop(0.5, 'rgba(255,220,150,0.3)');
            grad.addColorStop(1, 'rgba(255,200,100,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(ox, 0, cellSize, cellSize);
        });

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
    }

    emit(
        origin: THREE.Vector3,
        count: number,
        color: number,
        speed: number,
        life: number,
        spread: number,
        type: number = PARTICLE_TYPE.CIRCLE,
        sizeRange = [0.05, 0.15],
    ): void {
        let spawned = 0;
        for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
            const p = this.particles[i];
            if (p.active) continue;

            p.active = true;
            p.position.copy(origin);
            p.velocity.set(
                (Random.next() - 0.5) * spread,
                Random.next() * speed,
                (Random.next() - 0.5) * spread,
            );
            p.life = life;
            p.maxLife = life;
            p.color.set(color);
            p.size = sizeRange[0] + Random.next() * (sizeRange[1] - sizeRange[0]);
            p.type = type;
            p.rotation = Random.next() * Math.PI * 2;
            p.rotationSpeed = (Random.next() - 0.5) * 3;
            spawned++;
        }
    }

    emitGrassSpray(pos: THREE.Vector3): void {
        this.emit(pos, 12, 0x44aa44, 2, 0.3, 1.5, PARTICLE_TYPE.GRASS, [0.04, 0.08]);
    }

    emitCatchBurst(pos: THREE.Vector3, teamColor: number): void {
        // Ring expansion
        this.emit(pos, 3, teamColor, 0.5, 0.6, 0.2, PARTICLE_TYPE.RING, [0.3, 0.5]);
        // Spark burst
        this.emit(pos, 20, teamColor, 3, 0.5, 2, PARTICLE_TYPE.SPARK, [0.04, 0.1]);
    }

    emitScoreCelebration(pos: THREE.Vector3): void {
        const colors = [0xff4444, 0x4444ff, 0xffff44, 0x44ff44, 0xff44ff];
        for (const c of colors) {
            // Confetti
            this.emit(pos, 10, c, 5, 2.5, 4, PARTICLE_TYPE.CONFETTI, [0.06, 0.12]);
            // Firework sparkle
            this.emit(pos, 5, c, 7, 1.5, 3, PARTICLE_TYPE.FIREWORK, [0.08, 0.15]);
            // Sparks
            this.emit(pos, 8, c, 6, 2.0, 4, PARTICLE_TYPE.SPARK, [0.03, 0.06]);
        }
    }

    emitRainDrop(fieldWidth: number, fieldLength: number, count: number = 8): void {
        let spawned = 0;
        for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
            const p = this.particles[i];
            if (p.active) continue;

            const x = (Random.next() - 0.5) * fieldWidth;
            const z = (Random.next() - 0.5) * fieldLength;
            const y = 20 + Random.next() * 5;

            p.active = true;
            p.position.set(x, y, z);
            p.velocity.set(
                (Random.next() - 0.5) * 0.5,
                -12 - Random.next() * 2,
                (Random.next() - 0.5) * 0.5,
            );
            p.life = 2.0;
            p.maxLife = 2.0;
            p.color.set(0x9999bb);
            p.size = 0.04 + Random.next() * 0.03;
            p.type = PARTICLE_TYPE.RAINDROP;
            p.rotation = 0;
            p.rotationSpeed = 0;
            spawned++;
        }
    }

    emitWindDust(origin: THREE.Vector3, windDir: THREE.Vector2, windSpeed: number): void {
        let spawned = 0;
        for (let i = 0; i < MAX_PARTICLES && spawned < 3; i++) {
            const p = this.particles[i];
            if (p.active) continue;

            p.active = true;
            p.position.copy(origin).add(
                _tempDust.set(
                    (Random.next() - 0.5) * 0.5,
                    Random.next() * 0.3,
                    (Random.next() - 0.5) * 0.5,
                ),
            );
            p.velocity.set(
                windDir.x * windSpeed * 0.5 + (Random.next() - 0.5) * 0.3,
                0.2 + Random.next() * 0.3,
                windDir.y * windSpeed * 0.5 + (Random.next() - 0.5) * 0.3,
            );
            p.life = 1.5 + Random.next() * 0.5;
            p.maxLife = 2.0;
            p.color.set(0xccbb99);
            p.size = 0.03 + Random.next() * 0.02;
            p.type = PARTICLE_TYPE.DUST;
            p.rotation = Random.next() * Math.PI * 2;
            p.rotationSpeed = (Random.next() - 0.5) * 0.5;
            spawned++;
        }
    }

    update(dt: number): void {
        let liveCount = 0;
        for (let i = 0; i < MAX_PARTICLES; i++) {
            const p = this.particles[i];
            if (!p.active) continue;

            p.life -= dt;
            if (p.life <= 0) {
                p.active = false;
                continue;
            }

            // Gravity (reduced for confetti/dust)
            const gravMul = p.type === PARTICLE_TYPE.CONFETTI ? 0.4
                : p.type === PARTICLE_TYPE.DUST ? 0.2
                : 1.0;
            p.velocity.y -= 9.81 * gravMul * dt;
            p.position.addScaledVector(p.velocity, dt);
            p.rotation += p.rotationSpeed * dt;

            // Floor bounce
            if (p.position.y < 0) {
                p.position.y = 0;
                p.velocity.y *= -0.3;
            }

            const alpha = p.life / p.maxLife;

            this.positions[liveCount * 3] = p.position.x;
            this.positions[liveCount * 3 + 1] = p.position.y;
            this.positions[liveCount * 3 + 2] = p.position.z;
            this.colors[liveCount * 4] = p.color.r;
            this.colors[liveCount * 4 + 1] = p.color.g;
            this.colors[liveCount * 4 + 2] = p.color.b;
            this.colors[liveCount * 4 + 3] = alpha;
            this.sizes[liveCount] = p.size;
            this.spriteTypes[liveCount] = p.type;
            this.rotations[liveCount] = p.rotation;

            liveCount++;
        }

        this.activeCount = liveCount;
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.aColor.needsUpdate = true;
        this.geometry.attributes.aSize.needsUpdate = true;
        this.geometry.attributes.aSpriteType.needsUpdate = true;
        this.geometry.attributes.aRotation.needsUpdate = true;
        this.geometry.setDrawRange(0, liveCount);
    }

    getActiveCount(): number {
        return this.activeCount;
    }
}

const _tempDust = new THREE.Vector3();
