import { describe, it, expect, beforeEach } from 'vitest';
import { GustSystem, type Gust } from '../gameplay/WindGust';

describe('WindGust', () => {
    let system: GustSystem;

    beforeEach(() => {
        system = new GustSystem();
    });

    describe('GustSystem', () => {
        it('spawns gusts over time', () => {
            system.setIntensity(60); // 60 gusts per minute = 1 per second

            // No gusts initially
            expect(system.getActiveGusts().length).toBe(0);

            // Update for 1 second
            system.update(1.0, 100, 100);

            // Should have spawned approximately 1 gust
            expect(system.getActiveGusts().length).toBeGreaterThanOrEqual(1);
            expect(system.getActiveGusts().length).toBeLessThanOrEqual(2);
        });

        it('does not spawn gusts when intensity is 0', () => {
            system.setIntensity(0);

            system.update(10.0, 100, 100);

            expect(system.getActiveGusts().length).toBe(0);
        });

        it('spawns multiple gusts with high intensity', () => {
            system.setIntensity(120); // 120 gusts per minute = 2 per second

            system.update(2.0, 100, 100);

            // Should have spawned approximately 4 gusts
            expect(system.getActiveGusts().length).toBeGreaterThanOrEqual(3);
            expect(system.getActiveGusts().length).toBeLessThanOrEqual(5);
        });

        it('gust progresses over time', () => {
            system.setIntensity(60);
            system.update(1.0, 100, 100);

            const gusts = system.getActiveGusts();
            expect(gusts.length).toBeGreaterThan(0);

            const initialProgress = gusts[0].progress;

            // Update for another second
            system.update(1.0, 100, 100);

            const updatedProgress = gusts[0].progress;
            expect(updatedProgress).toBeGreaterThan(initialProgress);
        });

        it('deactivates gusts when complete', () => {
            system.setIntensity(60);
            system.update(1.0, 100, 100);

            const initialCount = system.getActiveGusts().length;
            expect(initialCount).toBeGreaterThan(0);

            // Update for a long time to allow gusts to complete
            system.update(20.0, 100, 100);

            // Old gusts should have been removed
            // Note: new gusts may have spawned, so we just check that removal happened
            const finalGusts = system.getActiveGusts();
            const hasAnyCompletedGusts = finalGusts.length === 0 ||
                finalGusts.every(g => g.progress < 1.5);

            expect(hasAnyCompletedGusts).toBe(true);
        });

        it('returns zero wind contribution far from gusts', () => {
            system.setIntensity(60);
            system.update(1.0, 100, 100);

            // Sample at a point very far from the field
            const wind = system.sample(1000, 1000);

            expect(Math.abs(wind.dx)).toBeLessThan(0.01);
            expect(Math.abs(wind.dz)).toBeLessThan(0.01);
        });

        it('returns non-zero wind contribution near gust', () => {
            // Manually create a gust at known location
            system.setIntensity(0); // Disable random spawning

            // Create a test gust directly
            const testGust: Gust = {
                origin: { x: 0, z: 0 },
                direction: 0, // North
                speed: 5,
                width: 20,
                length: 30,
                travelSpeed: 5,
                progress: 0.5, // Halfway through
                shape: 'gaussian',
                active: true,
            };

            // Access private field for testing (TypeScript will complain but it works)
            (system as any).gusts.push(testGust);

            // Sample near the gust front (at origin + progress * length * direction)
            const frontZ = 0 + 0.5 * 30; // = 15
            const wind = system.sample(0, frontZ);

            // Should have some northward wind component
            const totalWind = Math.sqrt(wind.dx * wind.dx + wind.dz * wind.dz);
            expect(totalWind).toBeGreaterThan(0.1);
        });

        it('gaussian shape produces bell curve falloff', () => {
            system.setIntensity(0);

            const testGust: Gust = {
                origin: { x: 0, z: 0 },
                direction: 0,
                speed: 5,
                width: 40,
                length: 30,
                travelSpeed: 5,
                progress: 0.5,
                shape: 'gaussian',
                active: true,
            };

            (system as any).gusts.push(testGust);

            const frontZ = 15;

            // Sample at gust front
            const windAtFront = system.sample(0, frontZ);
            const speedAtFront = Math.sqrt(windAtFront.dx ** 2 + windAtFront.dz ** 2);

            // Sample ahead of front
            const windAhead = system.sample(0, frontZ - 10);
            const speedAhead = Math.sqrt(windAhead.dx ** 2 + windAhead.dz ** 2);

            // Sample behind front
            const windBehind = system.sample(0, frontZ + 10);
            const speedBehind = Math.sqrt(windBehind.dx ** 2 + windBehind.dz ** 2);

            // Gaussian should have peak at center and falloff on both sides
            expect(speedAtFront).toBeGreaterThan(speedAhead);
            expect(speedAtFront).toBeGreaterThan(speedBehind);
        });

        it('sharp_front shape has no wind ahead of front', () => {
            system.setIntensity(0);

            const testGust: Gust = {
                origin: { x: 0, z: 0 },
                direction: 0,
                speed: 5,
                width: 40,
                length: 30,
                travelSpeed: 5,
                progress: 0.5,
                shape: 'sharp_front',
                active: true,
            };

            (system as any).gusts.push(testGust);

            const frontZ = 15;

            // Sample ahead of front
            const windAhead = system.sample(0, frontZ - 5);
            expect(Math.abs(windAhead.dx)).toBeLessThan(0.01);
            expect(Math.abs(windAhead.dz)).toBeLessThan(0.01);

            // Sample behind front should have wind
            const windBehind = system.sample(0, frontZ + 1);
            const speedBehind = Math.sqrt(windBehind.dx ** 2 + windBehind.dz ** 2);
            expect(speedBehind).toBeGreaterThan(0.1);
        });

        it('oscillating shape varies along gust length', () => {
            system.setIntensity(0);

            const testGust: Gust = {
                origin: { x: 0, z: 0 },
                direction: 0,
                speed: 5,
                width: 40,
                length: 30,
                travelSpeed: 5,
                progress: 1.0, // Fully extended
                shape: 'oscillating',
                active: true,
            };

            (system as any).gusts.push(testGust);

            // Sample at multiple points along the gust
            const samples: number[] = [];
            for (let i = 0; i <= 10; i++) {
                const z = (i / 10) * 30; // 0 to 30
                const wind = system.sample(0, z);
                samples.push(Math.sqrt(wind.dx ** 2 + wind.dz ** 2));
            }

            // Check that intensity varies (not monotonic)
            let hasVariation = false;
            for (let i = 1; i < samples.length - 1; i++) {
                // Look for local peaks or valleys
                if ((samples[i] > samples[i - 1] && samples[i] > samples[i + 1]) ||
                    (samples[i] < samples[i - 1] && samples[i] < samples[i + 1])) {
                    hasVariation = true;
                    break;
                }
            }
            expect(hasVariation).toBe(true);
        });

        it('wind contribution decreases with perpendicular distance', () => {
            system.setIntensity(0);

            const testGust: Gust = {
                origin: { x: 0, z: 0 },
                direction: 0,
                speed: 5,
                width: 20,
                length: 30,
                travelSpeed: 5,
                progress: 0.5,
                shape: 'gaussian',
                active: true,
            };

            (system as any).gusts.push(testGust);

            const frontZ = 15;

            // Sample at center
            const windCenter = system.sample(0, frontZ);
            const speedCenter = Math.sqrt(windCenter.dx ** 2 + windCenter.dz ** 2);

            // Sample at edge of width
            const windEdge = system.sample(9, frontZ);
            const speedEdge = Math.sqrt(windEdge.dx ** 2 + windEdge.dz ** 2);

            // Sample outside width
            const windOutside = system.sample(15, frontZ);
            const speedOutside = Math.sqrt(windOutside.dx ** 2 + windOutside.dz ** 2);

            expect(speedCenter).toBeGreaterThan(speedEdge);
            expect(speedEdge).toBeGreaterThan(speedOutside);
            expect(speedOutside).toBeLessThan(0.01);
        });

        it('clear removes all gusts', () => {
            system.setIntensity(60);
            system.update(2.0, 100, 100);

            expect(system.getActiveGusts().length).toBeGreaterThan(0);

            system.clear();

            expect(system.getActiveGusts().length).toBe(0);
        });
    });
});
