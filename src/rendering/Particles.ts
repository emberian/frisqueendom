import * as THREE from 'three';
import { Random } from '../data/SeededRandom';

interface Particle {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    color: THREE.Color;
    size: number;
    active: boolean;
}

const MAX_PARTICLES = 1000; // Increased limit for smoother visuals

export class ParticleSystem {
    private particles: Particle[] = [];
    private activeCount = 0;
    private mesh: THREE.Points;
    private positions: Float32Array;
    private colors: Float32Array;
    private sizes: Float32Array;
    private geometry: THREE.BufferGeometry;

    constructor(scene: THREE.Scene) {
        this.positions = new Float32Array(MAX_PARTICLES * 3);
        this.colors = new Float32Array(MAX_PARTICLES * 3);
        this.sizes = new Float32Array(MAX_PARTICLES);

        // Pre-allocate all particle objects in a pool
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.particles.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                maxLife: 1,
                color: new THREE.Color(),
                size: 0,
                active: false
            });
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.positions, 3),
        );
        this.geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(this.colors, 3),
        );
        this.geometry.setAttribute(
            'size',
            new THREE.BufferAttribute(this.sizes, 1),
        );

        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true,
            depthWrite: false, // Better for overlapping particles
            blending: THREE.AdditiveBlending // Punchy visuals
        });

        this.mesh = new THREE.Points(this.geometry, material);
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }

    emit(
        origin: THREE.Vector3,
        count: number,
        color: number,
        speed: number,
        life: number,
        spread: number,
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
            p.size = 0.05 + Random.next() * 0.1;
            spawned++;
        }
    }

    emitGrassSpray(pos: THREE.Vector3): void {
        this.emit(pos, 12, 0x44aa44, 2, 0.3, 1.5);
    }

    emitCatchBurst(pos: THREE.Vector3, teamColor: number): void {
        this.emit(pos, 25, teamColor, 3, 0.5, 2);
    }

    emitScoreCelebration(pos: THREE.Vector3): void {
        const colors = [0xff4444, 0x4444ff, 0xffff44, 0x44ff44, 0xff44ff];
        for (const c of colors) {
            this.emit(pos, 20, c, 6, 2.0, 4);
        }
    }

    emitRainDrop(fieldWidth: number, fieldLength: number): void {
        for (let i = 0; i < MAX_PARTICLES; i++) {
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
            p.size = 0.03 + Random.next() * 0.02;
            return;
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
            p.size = 0.02 + Random.next() * 0.01;
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

            // Gravity
            p.velocity.y -= 9.81 * dt;
            p.position.addScaledVector(p.velocity, dt);

            // Floor
            if (p.position.y < 0) {
                p.position.y = 0;
                p.velocity.y *= -0.3;
            }

            const alpha = p.life / p.maxLife;

            this.positions[liveCount * 3] = p.position.x;
            this.positions[liveCount * 3 + 1] = p.position.y;
            this.positions[liveCount * 3 + 2] = p.position.z;
            this.colors[liveCount * 3] = p.color.r * alpha;
            this.colors[liveCount * 3 + 1] = p.color.g * alpha;
            this.colors[liveCount * 3 + 2] = p.color.b * alpha;
            this.sizes[liveCount] = p.size * alpha;

            liveCount++;
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.attributes.size.needsUpdate = true;
        this.geometry.setDrawRange(0, liveCount);
    }
}

const _tempDust = new THREE.Vector3();
