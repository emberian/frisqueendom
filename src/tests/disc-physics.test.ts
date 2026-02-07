/**
 * Disc Physics Test Suite
 *
 * Run in the browser console via:
 *   import('/src/tests/disc-physics.test.ts').then(m => m.runAll())
 *
 * Or access from the game's debug object:
 *   window.__tests.discPhysics()
 *
 * These tests validate disc flight behavior against known-good values
 * after the yaw fix, spin decay fix, and aero coefficient tuning.
 */

import init, { DiscSimulator } from '../../frisque-physics/pkg/frisque_physics.js';
import wasmUrl from '../../frisque-physics/pkg/frisque_physics_bg.wasm?url';

interface TestResult {
    name: string;
    passed: boolean;
    detail: string;
}

const results: TestResult[] = [];

function assert(
    name: string,
    condition: boolean,
    detail: string,
): void {
    results.push({ name, passed: condition, detail });
    const icon = condition ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${name}: ${detail}`);
}

function assertRange(
    name: string,
    value: number,
    min: number,
    max: number,
    unit = '',
): void {
    const detail = `${value.toFixed(2)}${unit} (expected ${min}-${max}${unit})`;
    assert(name, value >= min && value <= max, detail);
}

// --- Helpers ---

function simulateThrow(
    sim: DiscSimulator,
    speed: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    spinRate: number,
    noseAngle: number,
    hyzerAngle: number,
    isForehand: boolean,
    startZ = 0,
): {
    dist: number;
    maxHeight: number;
    flightTime: number;
    finalX: number;
    finalSpin: number;
} {
    sim.throw_disc(speed, dirX, dirY, dirZ, spinRate, noseAngle, hyzerAngle, 1.5, 0, isForehand);
    sim.set_position(0, 1.5, startZ);

    let maxY = 0;
    let steps = 0;
    const maxSteps = 12000; // 50 seconds max

    while (!sim.is_grounded() && steps < maxSteps) {
        sim.step(1 / 240);
        const y = sim.pos_y();
        if (y > maxY) maxY = y;
        steps++;
    }

    return {
        dist: sim.pos_z() - startZ,
        maxHeight: maxY,
        flightTime: steps / 240,
        finalX: sim.pos_x(),
        finalSpin: sim.spin_rate(),
    };
}

function getAccelY(
    sim: DiscSimulator,
    speed: number,
    dirY: number,
    noseAngle: number,
): number {
    const dirZ = Math.sqrt(1 - dirY * dirY);
    sim.throw_disc(speed, 0, dirY, dirZ, 80, noseAngle, 0.1, 1.5, 0, false);
    sim.set_position(0, 5, 10); // high up to avoid ground
    const vy0 = sim.vel_y();
    for (let i = 0; i < 10; i++) sim.step(1 / 240);
    return (sim.vel_y() - vy0) / (10 / 240);
}

// --- Test Suites ---

function testYawFix(sim: DiscSimulator): void {
    console.log('\n%c=== Yaw Alignment Tests ===', 'font-weight:bold');

    // After the yaw fix, lofted and flat throws should both get positive lift
    const accelFlat = getAccelY(sim, 20, 0.001, 0.03);
    const accelLofted = getAccelY(sim, 20, 0.1, 0.03);
    const accelStrongLoft = getAccelY(sim, 20, 0.3, 0.03);

    assertRange('Flat throw vertical accel', accelFlat, 2, 15, ' m/s²');
    assertRange('Lofted throw vertical accel', accelLofted, 2, 15, ' m/s²');
    assertRange('Strong loft vertical accel', accelStrongLoft, 0, 15, ' m/s²');

    // All should be positive (upward lift, not downforce)
    assert(
        'No downforce on lofted throws',
        accelLofted > 0 && accelStrongLoft > 0,
        `lofted=${accelLofted.toFixed(1)}, strong=${accelStrongLoft.toFixed(1)} (both should be > 0)`,
    );

    // Lofted and flat should be in the same ballpark (within 5x of each other)
    const ratio = accelFlat / accelLofted;
    assertRange('Lift ratio flat/lofted', ratio, 0.3, 3, 'x');
}

function testDistanceScaling(sim: DiscSimulator): void {
    console.log('\n%c=== Distance Scaling Tests ===', 'font-weight:bold');

    // Simulate throws at different power levels using the game's throw formula:
    //   speed = power * 25 (backhand)
    //   noseAngle = 0.05 - power * 0.09
    //   loft = 0.05 + power * 0.1
    //   spinRate = 80 * power * 1.1

    function playerThrow(power: number) {
        const speed = power * 25;
        const nose = 0.05 - power * 0.09;
        const loft = 0.05 + power * 0.1;
        const spin = 80 * power * 1.1;
        const dirY = loft;
        const dirZ = Math.sqrt(1 - loft * loft);
        return simulateThrow(sim, speed, 0, dirY, dirZ, spin, nose, 0.1, false);
    }

    const soft = playerThrow(0.3);
    const med = playerThrow(0.6);
    const hard = playerThrow(0.85);
    const full = playerThrow(1.0);

    // Distance expectations (meters)
    assertRange('Soft throw distance (30%)', soft.dist, 3, 15, 'm');
    assertRange('Medium throw distance (60%)', med.dist, 20, 40, 'm');
    assertRange('Hard throw distance (85%)', hard.dist, 35, 60, 'm');
    assertRange('Full power distance (100%)', full.dist, 45, 75, 'm');

    // Distance should strictly increase with power
    assert(
        'Distance increases with power',
        soft.dist < med.dist && med.dist < hard.dist && hard.dist < full.dist,
        `${soft.dist.toFixed(0)} < ${med.dist.toFixed(0)} < ${hard.dist.toFixed(0)} < ${full.dist.toFixed(0)}`,
    );

    // Flight time should increase with power
    assertRange('Soft flight time', soft.flightTime, 0.5, 2.5, 's');
    assertRange('Full power flight time', full.flightTime, 3.0, 7.0, 's');

    // Max height should be reasonable
    assertRange('Soft max height', soft.maxHeight, 1.0, 3.0, 'm');
    assertRange('Full power max height', full.maxHeight, 3.0, 8.0, 'm');
}

function testPull(sim: DiscSimulator): void {
    console.log('\n%c=== Pull Tests ===', 'font-weight:bold');

    // Pull params from Pull.ts
    const dirY = 0.10;
    const dirZ = 0.99;
    const len = Math.sqrt(0.02 * 0.02 + dirY * dirY + dirZ * dirZ);
    const pull = simulateThrow(
        sim, 30, 0.02 / len, dirY / len, dirZ / len, 100, -0.04, 0.15, false,
    );

    assertRange('Pull distance', pull.dist, 50, 85, 'm');
    assertRange('Pull flight time', pull.flightTime, 3.0, 8.0, 's');
    assertRange('Pull max height', pull.maxHeight, 3.0, 10.0, 'm');
}

function testSpinDecay(sim: DiscSimulator): void {
    console.log('\n%c=== Spin Decay Tests ===', 'font-weight:bold');

    // Full power throw: check spin retention over time
    sim.throw_disc(25, 0, 0.15, 0.99, 88, -0.04, 0.1, 1.5, 0, false);
    sim.set_position(0, 5, 0); // start high to avoid ground

    const spinAt: Record<string, number> = {};
    for (let s = 0; s < 1200; s++) { // 5 seconds at 240Hz
        sim.step(1 / 240);
        const t = ((s + 1) / 240).toFixed(1);
        if (t === '1.0' || t === '2.0' || t === '3.0' || t === '4.0' || t === '5.0') {
            spinAt[t] = sim.spin_rate();
        }
    }

    // Spin should not decay too fast (old bug: lost 78% in 0.75s)
    const initial = 88;
    const retentionAt3s = spinAt['3.0'] / initial;
    const retentionAt5s = spinAt['5.0'] / initial;

    assertRange('Spin at 1s', spinAt['1.0'], 60, 88, ' rad/s');
    assertRange('Spin at 3s', spinAt['3.0'], 45, 80, ' rad/s');
    assertRange('Spin at 5s', spinAt['5.0'], 35, 75, ' rad/s');
    assertRange('Spin retention at 3s', retentionAt3s * 100, 55, 95, '%');
    assertRange('Spin retention at 5s', retentionAt5s * 100, 40, 90, '%');

    assert(
        'No catastrophic spin loss',
        retentionAt3s > 0.5,
        `${(retentionAt3s * 100).toFixed(0)}% retained at 3s (should be >50%)`,
    );
}

function testFlightProfile(sim: DiscSimulator): void {
    console.log('\n%c=== Flight Profile Tests ===', 'font-weight:bold');

    // Full power throw: trace the flight and verify shape
    sim.throw_disc(25, 0, 0.15, 0.99, 88, -0.04, 0.1, 1.5, 0, false);
    sim.set_position(0, 1.5, 0);

    let maxY = 0;
    let maxYTime = 0;
    let steps = 0;
    const speeds: number[] = [];

    while (!sim.is_grounded() && steps < 10000) {
        sim.step(1 / 240);
        steps++;
        const y = sim.pos_y();
        if (y > maxY) {
            maxY = y;
            maxYTime = steps / 240;
        }
        if (steps % 240 === 0) {
            speeds.push(Math.sqrt(
                sim.vel_x() ** 2 + sim.vel_y() ** 2 + sim.vel_z() ** 2,
            ));
        }
    }

    const totalTime = steps / 240;

    // Peak should be in the first half of flight (disc climbs then descends)
    assertRange(
        'Peak height time ratio',
        maxYTime / totalTime,
        0.2,
        0.6,
        '',
    );

    // Speed should monotonically decrease (no sudden accelerations)
    let monotonic = true;
    for (let i = 1; i < speeds.length; i++) {
        if (speeds[i] > speeds[i - 1] + 0.5) {
            monotonic = false;
            break;
        }
    }
    assert(
        'Speed monotonically decreases',
        monotonic,
        `${speeds.length} samples checked`,
    );

    // Final speed should be significantly less than initial
    if (speeds.length > 1) {
        const speedRatio = speeds[speeds.length - 1] / speeds[0];
        assertRange('Final/initial speed ratio', speedRatio, 0.15, 0.55, '');
    }
}

function testForehandVsBackhand(sim: DiscSimulator): void {
    console.log('\n%c=== Forehand vs Backhand Tests ===', 'font-weight:bold');

    const bh = simulateThrow(sim, 25, 0, 0.15, 0.99, 88, -0.04, 0.1, false);
    const fh = simulateThrow(sim, 28, 0, 0.15, 0.99, 110, -0.04, 0.1, true);

    // Both should fly reasonable distances
    assertRange('Backhand distance', bh.dist, 40, 75, 'm');
    assertRange('Forehand distance', fh.dist, 40, 80, 'm');

    // With same hyzer, both fade the same way. With opposite hyzer they should diverge.
    const bhAnhyzer = simulateThrow(sim, 25, 0, 0.15, 0.99, 88, -0.04, -0.15, false);
    const fhHyzer = simulateThrow(sim, 28, 0, 0.15, 0.99, 110, -0.04, 0.15, true);
    assert(
        'Hyzer vs anhyzer produce different lateral drift',
        Math.abs(bhAnhyzer.finalX - fhHyzer.finalX) > 2,
        `anhyzer_x=${bhAnhyzer.finalX.toFixed(1)}, hyzer_x=${fhHyzer.finalX.toFixed(1)}`,
    );
}

function testWindEffect(sim: DiscSimulator): void {
    console.log('\n%c=== Wind Effect Tests ===', 'font-weight:bold');

    // Test with no wind
    sim.set_base_wind(0, 0);
    const noWind = simulateThrow(sim, 20, 0, 0.1, 0.995, 80, -0.02, 0.0, false);

    // Test with headwind (wind opposes throw direction, in -Z)
    sim.set_base_wind(5, Math.PI);
    const headWind = simulateThrow(sim, 20, 0, 0.1, 0.995, 80, -0.02, 0.0, false);

    // Test with tailwind (wind in +Z direction, same as throw)
    sim.set_base_wind(5, 0);
    const tailWind = simulateThrow(sim, 20, 0, 0.1, 0.995, 80, -0.02, 0.0, false);

    // Test with crosswind (wind in +X direction)
    sim.set_base_wind(5, Math.PI / 2);
    const crossWind = simulateThrow(sim, 20, 0, 0.1, 0.995, 80, -0.02, 0.0, false);

    // Restore default wind
    sim.set_base_wind(3, 1.57);

    // Wind should meaningfully affect distance (tailwind vs headwind difference)
    const windDelta = Math.abs(tailWind.dist - headWind.dist);
    assert(
        'Wind affects distance (tail vs head)',
        windDelta > 3,
        `tailwind=${tailWind.dist.toFixed(1)}m, headwind=${headWind.dist.toFixed(1)}m, delta=${windDelta.toFixed(1)}m`,
    );

    // Headwind should reduce forward distance compared to no wind
    // (disc has higher relative airspeed → more drag → but also more lift → can go shorter or longer)
    assert(
        'Headwind changes distance from no-wind',
        Math.abs(headWind.dist - noWind.dist) > 1,
        `head=${headWind.dist.toFixed(1)}m vs no_wind=${noWind.dist.toFixed(1)}m`,
    );

    // Crosswind should cause more lateral drift than no-wind
    // Use zero hyzer to isolate wind effect from disc fade
    assert(
        'Crosswind causes lateral drift vs no-wind',
        Math.abs(crossWind.finalX) > Math.abs(noWind.finalX) + 0.5 ||
            Math.abs(crossWind.finalX - noWind.finalX) > 2,
        `cross_x=${crossWind.finalX.toFixed(1)}m, no_wind_x=${noWind.finalX.toFixed(1)}m`,
    );
}

function testGroundContact(sim: DiscSimulator): void {
    console.log('\n%c=== Ground Contact Tests ===', 'font-weight:bold');

    // Throw disc straight down - should ground immediately
    sim.throw_disc(5, 0, -0.5, 0.866, 80, 0, 0, 1.5, 0, false);
    sim.set_position(0, 0.5, 0);
    let steps = 0;
    while (!sim.is_grounded() && steps < 500) {
        sim.step(1 / 240);
        steps++;
    }
    assert(
        'Disc hitting ground stops',
        sim.is_grounded(),
        `Grounded after ${steps} steps (${(steps / 240).toFixed(2)}s)`,
    );
    assert(
        'Ground position is y=0',
        Math.abs(sim.pos_y()) < 0.01,
        `y=${sim.pos_y().toFixed(4)}`,
    );

    // Throw from very high - should eventually come down
    sim.throw_disc(10, 0, 0.001, 1, 80, 0.02, 0, 1.5, 0, false);
    sim.set_position(0, 20, 0);
    steps = 0;
    while (!sim.is_grounded() && steps < 20000) {
        sim.step(1 / 240);
        steps++;
    }
    assert(
        'High throw eventually lands',
        sim.is_grounded(),
        `Landed after ${(steps / 240).toFixed(1)}s`,
    );
}

// --- Runner ---

export async function runAll(): Promise<{
    total: number;
    passed: number;
    failed: number;
}> {
    results.length = 0;
    console.log('%c🥏 Disc Physics Test Suite', 'font-size:16px; font-weight:bold');
    console.log('━'.repeat(50));

    // Init WASM if not already loaded
    try {
        await init(wasmUrl);
    } catch {
        // Already initialized, that's fine
    }

    const sim = new DiscSimulator();
    sim.set_base_wind(3, 1.57); // default game wind

    testYawFix(sim);
    testDistanceScaling(sim);
    testPull(sim);
    testSpinDecay(sim);
    testFlightProfile(sim);
    testForehandVsBackhand(sim);
    testWindEffect(sim);
    testGroundContact(sim);

    // Summary
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;

    console.log('\n' + '━'.repeat(50));
    if (failed === 0) {
        console.log(`%c✓ All ${total} tests passed!`, 'color:green; font-weight:bold');
    } else {
        console.log(
            `%c✗ ${failed}/${total} tests failed:`,
            'color:red; font-weight:bold',
        );
        for (const r of results.filter((r) => !r.passed)) {
            console.log(`  ✗ ${r.name}: ${r.detail}`);
        }
    }

    return { total, passed, failed };
}

// Auto-register on window for easy console access
if (typeof window !== 'undefined') {
    (window as any).__tests = (window as any).__tests || {};
    (window as any).__tests.discPhysics = runAll;
}
