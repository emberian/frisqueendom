import type * as THREE from 'three';

// ── Shake Presets ──

export const SHAKE_CATCH = { intensity: 0.02, duration: 0.15 } as const;
export const SHAKE_BLOCK = { intensity: 0.04, duration: 0.2 } as const;
export const SHAKE_SCORE = { intensity: 0.06, duration: 0.35 } as const;
export const SHAKE_TURNOVER = { intensity: 0.03, duration: 0.1 } as const;
export const SHAKE_LAYOUT_CATCH = { intensity: 0.08, duration: 0.4 } as const;

export interface ShakePreset {
    readonly intensity: number;
    readonly duration: number;
    readonly frequency?: number;
}

// ── Perlin-like Noise (1D gradient noise) ──
//
// We use a simple 1D gradient noise function seeded with a permutation table.
// This produces smooth, continuous noise that feels organic -- not the jarring
// random-per-frame jitter you get from Math.random().

const PERM_SIZE = 256;
const PERM_MASK = PERM_SIZE - 1;

// Deterministic permutation table (no need for crypto randomness here)
const perm = new Uint8Array(PERM_SIZE * 2);
{
    const base = new Uint8Array(PERM_SIZE);
    for (let i = 0; i < PERM_SIZE; i++) base[i] = i;

    // Fisher-Yates with a simple LCG so the table is reproducible
    let seed = 0xDEADBEEF;
    for (let i = PERM_SIZE - 1; i > 0; i--) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const j = seed % (i + 1);
        const tmp = base[i];
        base[i] = base[j];
        base[j] = tmp;
    }
    // Double the table so we never need to wrap with modulo in the hot path
    for (let i = 0; i < PERM_SIZE * 2; i++) {
        perm[i] = base[i & PERM_MASK];
    }
}

// Gradient values: just +1 / -1 selected by the low bit of the hash
function grad1d(hash: number, x: number): number {
    return (hash & 1) === 0 ? x : -x;
}

// Fade curve (Perlin's improved 6t^5 - 15t^4 + 10t^3)
function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * 1D gradient noise, output in [-1, 1].
 * Smooth and continuous -- suitable for camera shake oscillation.
 */
function noise1d(x: number): number {
    const xi = Math.floor(x);
    const xf = x - xi;
    const ix = xi & PERM_MASK;

    const g0 = grad1d(perm[ix], xf);
    const g1 = grad1d(perm[ix + 1], xf - 1);

    return g0 + fade(xf) * (g1 - g0);
}

// ── Active Shake Entry ──

interface ActiveShake {
    /** Peak intensity in world units */
    intensity: number;
    /** Total duration in seconds */
    duration: number;
    /** Oscillation frequency in Hz */
    frequency: number;
    /** Elapsed time since this shake started */
    elapsed: number;
    /** Random phase offset so overlapping shakes don't correlate */
    phaseX: number;
    phaseY: number;
}

// ── ScreenShake Class ──

const DEFAULT_FREQUENCY = 25;

export class ScreenShake {
    /** Master enable/disable toggle */
    enabled = true;

    private shakes: ActiveShake[] = [];

    // We store the offset that was applied so we can undo it after the frame
    private appliedOffsetX = 0;
    private appliedOffsetY = 0;
    private offsetX = 0;
    private offsetY = 0;

    // Simple seeded counter for phase offsets
    private phaseCounter = 0;

    /**
     * Trigger a new shake effect.
     *
     * @param intensity  Amplitude in world units (0.02 = subtle, 0.08 = dramatic)
     * @param duration   How long the shake lasts in seconds
     * @param frequency  Oscillation speed in Hz (default 25)
     */
    shake(intensity: number, duration: number, frequency: number = DEFAULT_FREQUENCY): void {
        if (intensity <= 0 || duration <= 0) return;

        // Generate decorrelated phase offsets for the two axes
        this.phaseCounter += 17.31;
        const phaseX = this.phaseCounter;
        const phaseY = this.phaseCounter + 100.77;

        this.shakes.push({
            intensity,
            duration,
            frequency,
            elapsed: 0,
            phaseX,
            phaseY,
        });
    }

    /**
     * Convenience: trigger a shake from a preset object.
     */
    shakePreset(preset: ShakePreset): void {
        this.shake(preset.intensity, preset.duration, preset.frequency);
    }

    /**
     * Advance all active shakes by `dt` seconds and compute the combined offset.
     * Call once per frame, before `applyToCamera`.
     */
    update(dt: number): void {
        if (!this.enabled || this.shakes.length === 0) {
            this.offsetX = 0;
            this.offsetY = 0;
            return;
        }

        // Evaluate each active shake. We pick the strongest contribution per
        // axis rather than summing, so overlapping shakes don't stack to
        // absurd amplitudes.
        let bestMagSq = 0;
        let bestX = 0;
        let bestY = 0;

        for (let i = this.shakes.length - 1; i >= 0; i--) {
            const s = this.shakes[i];
            s.elapsed += dt;

            if (s.elapsed >= s.duration) {
                // This shake is finished -- remove it
                this.shakes[i] = this.shakes[this.shakes.length - 1];
                this.shakes.pop();
                continue;
            }

            // Normalized progress [0, 1]
            const progress = s.elapsed / s.duration;

            // Exponential falloff: fast initial decay then a gentle tail.
            // At progress=0 amplitude=intensity, at progress=1 amplitude~0.
            // Using exp(-4*progress) gives ~1.8% remaining at the end.
            const amplitude = s.intensity * Math.exp(-4 * progress);

            // Noise-driven oscillation at the requested frequency.
            // We sample the noise function at `elapsed * frequency` which
            // gives us `frequency` oscillations per second. The phase offsets
            // decorrelate the X and Y axes.
            const t = s.elapsed * s.frequency;
            const nx = noise1d(t + s.phaseX);
            const ny = noise1d(t + s.phaseY);

            const ox = nx * amplitude;
            const oy = ny * amplitude;

            const magSq = ox * ox + oy * oy;
            if (magSq > bestMagSq) {
                bestMagSq = magSq;
                bestX = ox;
                bestY = oy;
            }
        }

        this.offsetX = bestX;
        this.offsetY = bestY;
    }

    /**
     * Apply the current shake offset to a Three.js camera.
     * Offsets the camera position in screen-space X and Y.
     * Call after the camera has been positioned for the frame, but before rendering.
     *
     * You MUST call `restoreCamera` on the same camera after rendering to undo the offset.
     */
    applyToCamera(camera: THREE.Camera): void {
        if (!this.enabled) {
            this.appliedOffsetX = 0;
            this.appliedOffsetY = 0;
            return;
        }

        this.appliedOffsetX = this.offsetX;
        this.appliedOffsetY = this.offsetY;

        camera.position.x += this.appliedOffsetX;
        camera.position.y += this.appliedOffsetY;
    }

    /**
     * Restore the camera position to its pre-shake state.
     * Call after rendering the frame.
     */
    restoreCamera(camera: THREE.Camera): void {
        camera.position.x -= this.appliedOffsetX;
        camera.position.y -= this.appliedOffsetY;
        this.appliedOffsetX = 0;
        this.appliedOffsetY = 0;
    }

    /**
     * Immediately cancel all active shakes and zero out offsets.
     */
    reset(): void {
        this.shakes.length = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.appliedOffsetX = 0;
        this.appliedOffsetY = 0;
    }

    /** True if any shake is currently active. */
    get active(): boolean {
        return this.shakes.length > 0;
    }
}
