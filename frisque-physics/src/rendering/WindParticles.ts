import * as THREE from 'three';

const MAX_WIND_PARTICLES = 200;

export class WindParticles {
    private mesh: THREE.Points;
    private positions: Float32Array;
    private velocities: Float32Array;
    private lifetimes: Float32Array;
    private geometry: THREE.BufferGeometry;
    private count = 0;
    private windX = 0;
    private windZ = 0;
    private windSpeed = 0;
    private fieldWidth: number;
    private fieldLength: number;

    constructor(scene: THREE.Scene, fieldWidth: number, fieldLength: number) {
        this.fieldWidth = fieldWidth;
        this.fieldLength = fieldLength;

        // Create buffers for particle data
        this.positions = new Float32Array(MAX_WIND_PARTICLES * 3);
        this.velocities = new Float32Array(MAX_WIND_PARTICLES * 3);
        this.lifetimes = new Float32Array(MAX_WIND_PARTICLES);

        // Create geometry
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

        // Create material - transparent white with additive blending for ethereal look
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.05,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.mesh = new THREE.Points(this.geometry, material);
        scene.add(this.mesh);
    }

    setWind(speed: number, direction: number): void {
        this.windSpeed = speed;
        this.windX = Math.sin(direction) * speed;
        this.windZ = Math.cos(direction) * speed;
    }

    update(dt: number): void {
        const spawnRate = Math.max(0, this.windSpeed * 20); // particles per second
        const particlesToSpawn = Math.floor(spawnRate * dt);

        // Update existing particles
        for (let i = 0; i < this.count; i++) {
            const idx = i * 3;

            // Update lifetime
            this.lifetimes[i] -= dt;

            if (this.lifetimes[i] <= 0) {
                // Remove particle by swapping with last particle
                if (i < this.count - 1) {
                    const lastIdx = (this.count - 1) * 3;
                    this.positions[idx] = this.positions[lastIdx];
                    this.positions[idx + 1] = this.positions[lastIdx + 1];
                    this.positions[idx + 2] = this.positions[lastIdx + 2];
                    this.velocities[idx] = this.velocities[lastIdx];
                    this.velocities[idx + 1] = this.velocities[lastIdx + 1];
                    this.velocities[idx + 2] = this.velocities[lastIdx + 2];
                    this.lifetimes[i] = this.lifetimes[this.count - 1];
                    i--; // Re-check this index
                }
                this.count--;
                continue;
            }

            // Move particle with wind + slight random drift
            const driftX = (Math.random() - 0.5) * 0.1;
            const driftZ = (Math.random() - 0.5) * 0.1;
            const driftY = Math.sin(this.lifetimes[i] * 2) * 0.05; // Gentle vertical oscillation

            this.positions[idx] += (this.windX + driftX) * dt;
            this.positions[idx + 1] += driftY * dt;
            this.positions[idx + 2] += (this.windZ + driftZ) * dt;

            // Check if particle left the field area
            const x = this.positions[idx];
            const z = this.positions[idx + 2];
            const margin = 5; // Extra margin beyond field

            if (Math.abs(x) > this.fieldWidth / 2 + margin ||
                z < -margin ||
                z > this.fieldLength + margin) {
                // Mark for removal
                this.lifetimes[i] = 0;
            }
        }

        // Spawn new particles at upwind edge
        for (let i = 0; i < particlesToSpawn && this.count < MAX_WIND_PARTICLES; i++) {
            const idx = this.count * 3;

            // Determine upwind edge based on wind direction
            const windAngle = Math.atan2(this.windX, this.windZ);

            // Spawn particles along the upwind edge
            if (Math.abs(this.windX) > Math.abs(this.windZ)) {
                // Wind mostly horizontal - spawn on left or right edge
                if (this.windX > 0) {
                    // Wind blowing right, spawn on left
                    this.positions[idx] = -this.fieldWidth / 2 - 2;
                } else {
                    // Wind blowing left, spawn on right
                    this.positions[idx] = this.fieldWidth / 2 + 2;
                }
                this.positions[idx + 2] = Math.random() * this.fieldLength;
            } else {
                // Wind mostly vertical - spawn on top or bottom edge
                this.positions[idx] = (Math.random() - 0.5) * this.fieldWidth;
                if (this.windZ > 0) {
                    // Wind blowing forward, spawn at back
                    this.positions[idx + 2] = -2;
                } else {
                    // Wind blowing backward, spawn at front
                    this.positions[idx + 2] = this.fieldLength + 2;
                }
            }

            // Random height between 0.1 and 2 meters
            this.positions[idx + 1] = 0.1 + Math.random() * 1.9;

            // Random lifetime between 3-8 seconds
            this.lifetimes[this.count] = 3 + Math.random() * 5;

            this.count++;
        }

        // Update geometry
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.setDrawRange(0, this.count);
    }

    dispose(): void {
        this.geometry.dispose();
        if (this.mesh.material instanceof THREE.Material) {
            this.mesh.material.dispose();
        }
        this.mesh.parent?.remove(this.mesh);
    }
}
