import { Random } from '../data/SeededRandom';

export type GustShape = 'gaussian' | 'sharp_front' | 'oscillating';

export interface Gust {
    origin: { x: number; z: number };
    direction: number;      // radians
    speed: number;          // additional m/s
    width: number;          // meters
    length: number;         // meters
    travelSpeed: number;    // m/s
    progress: number;       // 0-1
    shape: GustShape;
    active: boolean;
}

export class GustSystem {
    private gusts: Gust[] = [];
    private spawnTimer = 0;
    private gustsPerMinute = 2;

    setIntensity(gustsPerMinute: number): void {
        this.gustsPerMinute = gustsPerMinute;
    }

    update(dt: number, fieldWidth: number, fieldLength: number): void {
        // Advance existing gusts
        for (const gust of this.gusts) {
            if (!gust.active) continue;

            gust.progress += (gust.travelSpeed * dt) / gust.length;

            // Deactivate completed gusts
            if (gust.progress >= 1.5) {
                // Extra margin for complete passthrough
                gust.active = false;
            }
        }

        // Remove inactive gusts
        this.gusts = this.gusts.filter(g => g.active);

        // Spawn new gusts based on frequency
        this.spawnTimer += dt;
        const spawnInterval = 60 / this.gustsPerMinute;

        while (this.spawnTimer >= spawnInterval && this.gustsPerMinute > 0) {
            this.spawnTimer -= spawnInterval;
            this.spawnGust(fieldWidth, fieldLength);
        }
    }

    private spawnGust(fieldWidth: number, fieldLength: number): void {
        // Random direction
        const direction = Random.next() * Math.PI * 2;

        // Random speed between 2-8 m/s additional
        const speed = 2 + Random.next() * 6;

        // Random width (10-30m)
        const width = 10 + Random.next() * 20;

        // Random length (15-40m)
        const length = 15 + Random.next() * 25;

        // Travel speed proportional to gust strength
        const travelSpeed = 3 + speed * 0.5;

        // Random shape
        const shapes: GustShape[] = ['gaussian', 'sharp_front', 'oscillating'];
        const shape = shapes[Math.floor(Random.next() * shapes.length)];

        // Spawn origin at random edge of field
        const margin = 10;
        let originX: number, originZ: number;

        const edge = Math.floor(Random.next() * 4);
        switch (edge) {
            case 0: // Left
                originX = -fieldWidth / 2 - margin;
                originZ = Random.next() * fieldLength;
                break;
            case 1: // Right
                originX = fieldWidth / 2 + margin;
                originZ = Random.next() * fieldLength;
                break;
            case 2: // Top
                originX = (Random.next() - 0.5) * fieldWidth;
                originZ = -margin;
                break;
            default: // Bottom
                originX = (Random.next() - 0.5) * fieldWidth;
                originZ = fieldLength + margin;
                break;
        }

        this.gusts.push({
            origin: { x: originX, z: originZ },
            direction,
            speed,
            width,
            length,
            travelSpeed,
            progress: 0,
            shape,
            active: true,
        });
    }

    // Sample total gust contribution at a point
    sample(x: number, z: number): { dx: number; dz: number } {
        let dx = 0;
        let dz = 0;

        for (const g of this.gusts) {
            if (!g.active) continue;

            // Calculate current gust front position
            const frontX = g.origin.x + Math.sin(g.direction) * g.progress * g.length;
            const frontZ = g.origin.z + Math.cos(g.direction) * g.progress * g.length;

            // Vector from gust front to point
            const fromFrontX = x - frontX;
            const fromFrontZ = z - frontZ;

            // Distance along gust direction (negative = ahead of front, positive = behind)
            const alongDist = fromFrontX * Math.sin(g.direction) + fromFrontZ * Math.cos(g.direction);

            // Distance perpendicular to gust direction
            const perpDist = Math.abs(
                fromFrontX * Math.cos(g.direction) - fromFrontZ * Math.sin(g.direction)
            );

            // Check if point is within gust width
            if (perpDist > g.width / 2) continue;

            // Calculate falloff based on distance from front
            let intensity = 0;

            switch (g.shape) {
                case 'gaussian': {
                    // Gaussian bell centered at front, extends behind
                    const sigma = g.length * 0.3;
                    const distFromFront = Math.abs(alongDist);
                    intensity = Math.exp(-(distFromFront * distFromFront) / (2 * sigma * sigma));
                    break;
                }
                case 'sharp_front': {
                    // Sharp leading edge, gradual trailing edge
                    if (alongDist < 0) {
                        // Ahead of front - no effect
                        intensity = 0;
                    } else {
                        // Behind front - exponential decay
                        const decayLength = g.length * 0.5;
                        intensity = Math.exp(-alongDist / decayLength);
                    }
                    break;
                }
                case 'oscillating': {
                    // Oscillating pattern - extends behind the front
                    if (alongDist < -g.length || alongDist > 0) {
                        intensity = 0;
                    } else {
                        // alongDist is negative behind the front, so invert it
                        const distBehind = -alongDist;
                        const baseIntensity = 1 - distBehind / g.length;
                        const oscillation = Math.sin(distBehind / g.length * Math.PI * 4);
                        intensity = baseIntensity * (0.5 + 0.5 * oscillation);
                    }
                    break;
                }
            }

            // Apply perpendicular falloff (softer at edges)
            const widthFalloff = 1 - (perpDist / (g.width / 2)) ** 2;
            intensity *= Math.max(0, widthFalloff);

            // Add contribution
            dx += Math.sin(g.direction) * g.speed * intensity;
            dz += Math.cos(g.direction) * g.speed * intensity;
        }

        return { dx, dz };
    }

    getActiveGusts(): readonly Gust[] {
        return this.gusts.filter(g => g.active);
    }

    clear(): void {
        this.gusts = [];
        this.spawnTimer = 0;
    }
}
