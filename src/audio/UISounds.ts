/**
 * UISounds — Synthesized UI sound effects for menus and interactions.
 *
 * Singleton module. All sounds are generated with the Web Audio API (no files).
 * AudioContext is lazily created on the first user interaction to comply with
 * autoplay policies. Each play*() method is fire-and-forget: it spins up
 * short-lived oscillator/buffer nodes that auto-disconnect after playback.
 */

class UISoundsEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;

    private _masterVolume = 0.5;
    private _enabled = true;

    // Reusable noise buffer (created once per AudioContext)
    private noiseBuffer: AudioBuffer | null = null;

    // ─── Properties ──────────────────────────────────────────────────

    /** Master volume for all UI sounds (0-1). */
    get masterVolume(): number {
        return this._masterVolume;
    }

    set masterVolume(v: number) {
        this._masterVolume = Math.max(0, Math.min(1, v));
        if (this.masterGain) {
            this.masterGain.gain.value = this._masterVolume;
        }
    }

    /** Enable / disable all UI sounds. */
    get enabled(): boolean {
        return this._enabled;
    }

    set enabled(v: boolean) {
        this._enabled = v;
    }

    // ─── Context Management ──────────────────────────────────────────

    /**
     * Lazily create the AudioContext and master gain.
     * Returns null if sounds are disabled.
     */
    private ensure(): AudioContext | null {
        if (!this._enabled) return null;

        if (!this.ctx) {
            try {
                this.ctx = new AudioContext();
            } catch {
                // Web Audio not supported
                return null;
            }
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this._masterVolume;
            this.masterGain.connect(this.ctx.destination);
        }

        // Handle suspended context (browser autoplay policy)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }

        return this.ctx;
    }

    /** Get the master GainNode, ensuring context exists. */
    private master(): GainNode | null {
        if (!this.ensure()) return null;
        return this.masterGain;
    }

    // ─── Noise Utility ───────────────────────────────────────────────

    /** Get or create a 1-second white noise buffer for reuse. */
    private getNoise(): AudioBuffer | null {
        const ctx = this.ensure();
        if (!ctx) return null;
        if (!this.noiseBuffer) {
            const size = ctx.sampleRate; // 1 second
            this.noiseBuffer = ctx.createBuffer(1, size, ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < size; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        }
        return this.noiseBuffer;
    }

    // ─── A) Click / Select ───────────────────────────────────────────

    /**
     * Quick, subtle click. High-frequency oscillator blip.
     * Duration: ~30ms. Clean and non-annoying.
     */
    playClick(): void {
        const ctx = this.ensure();
        const dest = this.master();
        if (!ctx || !dest) return;

        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1800;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.03);
    }

    // ─── B) Confirm / Accept ─────────────────────────────────────────

    /**
     * Two quick ascending tones — a satisfying "ding-ding".
     * Duration: ~150ms. Positive, affirming feel.
     */
    playConfirm(): void {
        const ctx = this.ensure();
        const dest = this.master();
        if (!ctx || !dest) return;

        const now = ctx.currentTime;
        const tones: [number, number][] = [
            [880, 0],      // A5 at t=0
            [1320, 0.07],  // E6 at t=70ms
        ];

        for (const [freq, offset] of tones) {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            const t = now + offset;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.22, t + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

            osc.connect(gain);
            gain.connect(dest);
            osc.start(t);
            osc.stop(t + 0.08);
        }
    }

    // ─── C) Back / Cancel ────────────────────────────────────────────

    /**
     * Single descending tone — soft, not negative.
     * Duration: ~100ms.
     */
    playBack(): void {
        const ctx = this.ensure();
        const dest = this.master();
        if (!ctx || !dest) return;

        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.1);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    // ─── D) Hover ────────────────────────────────────────────────────

    /**
     * Very subtle, almost imperceptible tick.
     * Duration: ~20ms. Designed to not annoy when sweeping across buttons.
     */
    playHover(): void {
        const ctx = this.ensure();
        const dest = this.master();
        if (!ctx || !dest) return;

        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 2400;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.02);
    }

    // ─── E) Error / Denied ───────────────────────────────────────────

    /**
     * Quick low buzz — two rapid low-frequency pulses.
     * Duration: ~150ms. Communicates rejection without being harsh.
     */
    playError(): void {
        const ctx = this.ensure();
        const dest = this.master();
        if (!ctx || !dest) return;

        const now = ctx.currentTime;

        // Two rapid low-freq pulses
        for (const offset of [0, 0.075]) {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = 150;

            const gain = ctx.createGain();
            const t = now + offset;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.2, t + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

            osc.connect(gain);
            gain.connect(dest);
            osc.start(t);
            osc.stop(t + 0.065);
        }
    }

    // ─── F) Navigate (screen transition) ─────────────────────────────

    /**
     * Soft whoosh — filtered noise sweep for screen transitions.
     * Duration: ~120ms. Subtle spatial movement feel.
     */
    playNavigate(): void {
        const ctx = this.ensure();
        const dest = this.master();
        if (!ctx || !dest) return;

        const noise = this.getNoise();
        if (!noise) return;

        const now = ctx.currentTime;

        const src = ctx.createBufferSource();
        src.buffer = noise;

        // Bandpass sweep from low to high for the "whoosh" character
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 2;
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(3000, now + 0.06);
        filter.frequency.exponentialRampToValueAtTime(1200, now + 0.12);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        src.start(now);
        src.stop(now + 0.12);
    }
}

/** Singleton UI sounds instance. */
export const uiSounds = new UISoundsEngine();
