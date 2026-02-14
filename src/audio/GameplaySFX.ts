/**
 * GameplaySFX - Synthesized gameplay sound effects using Web Audio API.
 *
 * Provides punchy, responsive SFX for core gameplay events:
 *   - Disc throw whoosh (varies by power and throw type)
 *   - Disc catch thwack
 *   - Disc ground impact thud
 *   - Block slap
 *   - Score chime
 *   - Turnover buzz
 *
 * All sounds are generated on-the-fly from oscillators and noise buffers.
 * No audio files are loaded. Nodes are created per-play and self-dispose
 * via stop() + onended, so nothing leaks.
 *
 * Usage:
 * ```ts
 * const sfx = new GameplaySFX(audioContext);
 * sfx.playThrow(0.8, 'backhand');
 * sfx.playCatch();
 * sfx.playScore();
 * ```
 */
export class GameplaySFX {
    private ctx: AudioContext;
    private master: GainNode;

    /** Overall volume scalar (0-1). Adjusts the master gain node. */
    get masterVolume(): number {
        return this._masterVolume;
    }
    set masterVolume(v: number) {
        this._masterVolume = Math.max(0, Math.min(1, v));
        this.master.gain.value = this._masterVolume;
    }
    private _masterVolume: number = 0.5;

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this._masterVolume;
        this.master.connect(ctx.destination);
    }

    // ── A) Disc Throw Whoosh ─────────────────────────────────────────

    /**
     * Filtered noise burst that sweeps upward. Higher power = louder,
     * higher-pitched, and slightly longer. Hammer and scoober throws
     * get distinct filter voicing.
     *
     * @param power  Normalized throw power 0-1
     * @param throwType  'backhand' | 'forehand' | 'hammer' | 'scoober'
     */
    playThrow(power: number, throwType: string = 'backhand'): void {
        const p = Math.max(0, Math.min(1, power));
        const now = this.ctx.currentTime;

        // Duration scales with power: 0.1s at min, 0.2s at max
        const duration = 0.1 + p * 0.1;

        // Generate white noise buffer
        const noiseBuf = this.makeNoise(duration);
        const src = this.ctx.createBufferSource();
        src.buffer = noiseBuf;

        // Bandpass filter — center frequency and Q vary by throw type
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';

        switch (throwType) {
            case 'hammer':
                // Hammer: higher center, wider Q, slight upward sweep
                bp.frequency.setValueAtTime(800 + p * 600, now);
                bp.frequency.linearRampToValueAtTime(1200 + p * 800, now + duration * 0.6);
                bp.Q.value = 1.8;
                break;
            case 'scoober':
                // Scoober: mid-range, narrower band, gentle sweep
                bp.frequency.setValueAtTime(500 + p * 300, now);
                bp.frequency.linearRampToValueAtTime(700 + p * 400, now + duration * 0.7);
                bp.Q.value = 3.0;
                break;
            case 'forehand':
                // Forehand: snappier, higher starting point
                bp.frequency.setValueAtTime(600 + p * 500, now);
                bp.frequency.linearRampToValueAtTime(900 + p * 600, now + duration * 0.5);
                bp.Q.value = 2.5;
                break;
            default:
                // Backhand: classic whoosh sweep
                bp.frequency.setValueAtTime(400 + p * 400, now);
                bp.frequency.linearRampToValueAtTime(800 + p * 500, now + duration * 0.6);
                bp.Q.value = 2.0;
                break;
        }

        // Gain envelope: fast attack, exponential decay
        const gain = this.ctx.createGain();
        const peakVol = 0.25 + p * 0.35; // 0.25 at low power, 0.6 at full
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peakVol, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        // Connect chain: noise -> bandpass -> gain -> master
        src.connect(bp);
        bp.connect(gain);
        gain.connect(this.master);

        src.start(now);
        src.stop(now + duration);
    }

    // ── B) Disc Catch ────────────────────────────────────────────────

    /**
     * Short percussive "thwack" — a low-frequency click/pop with a
     * tiny noise transient layered on top for the slap of plastic
     * hitting hands.
     */
    playCatch(): void {
        const now = this.ctx.currentTime;

        // Layer 1: Low-frequency click (sine pop at 120 Hz)
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);

        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.5, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(oscGain);
        oscGain.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.08);

        // Layer 2: Brief high-frequency noise snap for the "slap"
        const noiseBuf = this.makeNoise(0.03);
        const src = this.ctx.createBufferSource();
        src.buffer = noiseBuf;

        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2500;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.35, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        src.connect(hp);
        hp.connect(noiseGain);
        noiseGain.connect(this.master);
        src.start(now);
        src.stop(now + 0.04);
    }

    // ── C) Disc Ground Impact ────────────────────────────────────────

    /**
     * Dull thud when the disc hits the ground. Low-frequency oscillator
     * with very fast decay — sounds like a plastic disc bouncing on grass.
     */
    playGroundHit(): void {
        const now = this.ctx.currentTime;

        // Low sine thud with pitch drop
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.12);

        // Tiny noise layer for the "dirt scatter" texture
        const noiseBuf = this.makeNoise(0.04);
        const src = this.ctx.createBufferSource();
        src.buffer = noiseBuf;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 400;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.15, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        src.connect(lp);
        lp.connect(noiseGain);
        noiseGain.connect(this.master);
        src.start(now);
        src.stop(now + 0.05);
    }

    // ── D) Block ─────────────────────────────────────────────────────

    /**
     * Sharp slap sound for a defensive block. Noise burst through a
     * high-pass filter with a punchy low-mid thud underneath for impact.
     */
    playBlock(): void {
        const now = this.ctx.currentTime;

        // Layer 1: High-frequency noise slap
        const noiseBuf = this.makeNoise(0.05);
        const src = this.ctx.createBufferSource();
        src.buffer = noiseBuf;

        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3000;

        const slapGain = this.ctx.createGain();
        slapGain.gain.setValueAtTime(0.5, now);
        slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        src.connect(hp);
        hp.connect(slapGain);
        slapGain.connect(this.master);
        src.start(now);
        src.stop(now + 0.08);

        // Layer 2: Low-mid impact thud
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);

        const thudGain = this.ctx.createGain();
        thudGain.gain.setValueAtTime(0.35, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(thudGain);
        thudGain.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    // ── E) Score Chime ───────────────────────────────────────────────

    /**
     * Two-note ascending chime using a major third interval (C5 -> E5).
     * Sine oscillators with gentle attack and smooth decay for a
     * pleasant, celebratory feel.
     */
    playScore(): void {
        const now = this.ctx.currentTime;

        // Note 1: C5 (523.25 Hz)
        // Note 2: E5 (659.25 Hz) — a major third above
        const notes = [
            { freq: 523.25, start: 0.0 },
            { freq: 659.25, start: 0.15 },
        ];

        for (const note of notes) {
            const t = now + note.start;

            // Fundamental
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = note.freq;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.35, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

            osc.connect(gain);
            gain.connect(this.master);
            osc.start(t);
            osc.stop(t + 0.4);

            // Soft octave harmonic for shimmer
            const harm = this.ctx.createOscillator();
            harm.type = 'sine';
            harm.frequency.value = note.freq * 2;

            const harmGain = this.ctx.createGain();
            harmGain.gain.setValueAtTime(0, t);
            harmGain.gain.linearRampToValueAtTime(0.1, t + 0.015);
            harmGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

            harm.connect(harmGain);
            harmGain.connect(this.master);
            harm.start(t);
            harm.stop(t + 0.3);
        }
    }

    // ── F) Turnover Buzz ─────────────────────────────────────────────

    /**
     * Quick descending tone that signals a turnover. A sine wave sweeps
     * from ~400 Hz down to ~150 Hz over 0.2s with a square-wave
     * undertone for a slightly "buzzy" quality.
     */
    playTurnover(): void {
        const now = this.ctx.currentTime;
        const duration = 0.2;

        // Primary: descending sine
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + duration + 0.02);

        // Undertone: square wave one octave below for buzz character
        const buzz = this.ctx.createOscillator();
        buzz.type = 'square';
        buzz.frequency.setValueAtTime(200, now);
        buzz.frequency.exponentialRampToValueAtTime(75, now + duration);

        const buzzGain = this.ctx.createGain();
        buzzGain.gain.setValueAtTime(0.08, now);
        buzzGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        buzz.connect(buzzGain);
        buzzGain.connect(this.master);
        buzz.start(now);
        buzz.stop(now + duration + 0.02);
    }

    // ── Utility ──────────────────────────────────────────────────────

    /**
     * Create a white noise AudioBuffer of the given duration.
     * Buffers are cheap to create and get GC'd after the source stops.
     */
    private makeNoise(duration: number): AudioBuffer {
        const length = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }
}
