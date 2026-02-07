import * as THREE from 'three';

interface Particle {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    color: THREE.Color;
    size: number;
}

const MAX_PARTICLES = 500;

export class ParticleSystem {
    private particles: Particle[] = [];
    private mesh: THREE.Points;
    private positions: Float32Array;
    private colors: Float32Array;
    private sizes: Float32Array;
    private geometry: THREE.BufferGeometry;

    constructor(scene: THREE.Scene) {
        this.positions = new Float32Array(MAX_PARTICLES * 3);
        this.colors = new Float32Array(MAX_PARTICLES * 3);
        this.sizes = new Float32Array(MAX_PARTICLES);

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
        const c = new THREE.Color(color);
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= MAX_PARTICLES) break;
            this.particles.push({
                position: origin.clone(),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * spread,
                    Math.random() * speed,
                    (Math.random() - 0.5) * spread,
                ),
                life,
                maxLife: life,
                color: c.clone(),
                size: 0.05 + Math.random() * 0.1,
            });
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
            this.emit(pos, 25, c, 6, 2.5, 4);
        }
    }

    update(dt: number): void {
        let alive = 0;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) continue;

            // Gravity
            p.velocity.y -= 9.81 * dt;
            p.position.addScaledVector(p.velocity, dt);

            // Floor
            if (p.position.y < 0) {
                p.position.y = 0;
                p.velocity.y *= -0.3;
            }

            const alpha = p.life / p.maxLife;

            this.positions[alive * 3] = p.position.x;
            this.positions[alive * 3 + 1] = p.position.y;
            this.positions[alive * 3 + 2] = p.position.z;
            this.colors[alive * 3] = p.color.r * alpha;
            this.colors[alive * 3 + 1] = p.color.g * alpha;
            this.colors[alive * 3 + 2] = p.color.b * alpha;
            this.sizes[alive] = p.size * alpha;

            this.particles[alive] = p;
            alive++;
        }

        this.particles.length = alive;
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.attributes.size.needsUpdate = true;
        this.geometry.setDrawRange(0, alive);
    }
}
