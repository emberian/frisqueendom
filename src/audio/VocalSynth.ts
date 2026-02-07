/**
 * VocalSynth - Pure Web Audio API vocal synthesis
 * Generates referee calls, announcements, and whistles using oscillators
 */

export class VocalSynth {
    private ctx: AudioContext;
    private masterGain: GainNode;

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 0.4;
        this.masterGain.connect(ctx.destination);
    }

    /**
     * Synthesize stall count calls - percussive voice-like tones
     * count 1-5: calm cadence (200-300 Hz base)
     * count 6-8: faster, higher pitch (300-450 Hz)
     * count 9-10: urgent, rapid (450-600 Hz)
     */
    callStall(count: number): void {
        const clamped = Math.max(1, Math.min(10, count));

        // Urgency increases with count
        const urgency = (clamped - 1) / 9; // 0 to 1

        // Base frequency increases with urgency
        const baseFreq = 200 + urgency * 400; // 200-600 Hz

        // Duration decreases with urgency
        const duration = 0.15 - urgency * 0.05; // 0.15s to 0.1s

        // Attack/decay faster for higher urgency
        const attack = 0.01;
        const decay = 0.05 - urgency * 0.02;
        const release = 0.1 - urgency * 0.03;

        const now = this.ctx.currentTime;

        // Use 3 detuned oscillators for richer "voice" sound
        const detunes = [-8, 0, 8]; // cents
        const amps = [0.3, 0.5, 0.3]; // relative amplitudes

        for (let i = 0; i < 3; i++) {
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth'; // Richer harmonics than sine
            osc.frequency.value = baseFreq;
            osc.detune.value = detunes[i];

            // Formant-like bandpass filter for vocal character
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 800 + urgency * 400; // Formant shifts higher with urgency
            filter.Q.value = 3.0; // Sharp formant peak

            const gain = this.ctx.createGain();
            const amplitude = amps[i] * 0.15; // Overall volume scaling

            // ADSR envelope
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(amplitude, now + attack);
            gain.gain.linearRampToValueAtTime(amplitude * 0.7, now + attack + decay);
            gain.gain.setValueAtTime(amplitude * 0.7, now + duration - release);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + duration);
        }
    }

    /**
     * Ascending 3-note arpeggio (major chord)
     */
    announceScore(): void {
        const notes = [
            { freq: 261.63, start: 0.0 },    // C4
            { freq: 329.63, start: 0.12 },   // E4
            { freq: 392.00, start: 0.24 }    // G4
        ];

        this.playArpeggio(notes, 0.25);
    }

    /**
     * Descending 2-note (minor interval)
     */
    announceTurnover(): void {
        const notes = [
            { freq: 329.63, start: 0.0 },    // E4
            { freq: 261.63, start: 0.15 }    // C4
        ];

        this.playArpeggio(notes, 0.2);
    }

    /**
     * Long sustained chord (3 notes simultaneously)
     */
    announceEndOfHalf(): void {
        const freqs = [261.63, 329.63, 392.00]; // C4, E4, G4
        const now = this.ctx.currentTime;
        const duration = 1.2;

        for (const freq of freqs) {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
            gain.gain.setValueAtTime(0.2, now + duration - 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + duration);
        }
    }

    /**
     * Victory fanfare - 5-note ascending major scale
     */
    announceGameOver(): void {
        const notes = [
            { freq: 261.63, start: 0.0 },    // C4
            { freq: 293.66, start: 0.1 },    // D4
            { freq: 329.63, start: 0.2 },    // E4
            { freq: 392.00, start: 0.3 },    // G4
            { freq: 523.25, start: 0.4 }     // C5
        ];

        this.playArpeggio(notes, 0.3);
    }

    /**
     * Helper to play an arpeggio of notes
     */
    private playArpeggio(notes: { freq: number; start: number }[], noteDuration: number): void {
        const now = this.ctx.currentTime;

        for (const note of notes) {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = note.freq;

            const gain = this.ctx.createGain();
            const start = now + note.start;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(start);
            osc.stop(start + noteDuration);
        }
    }

    /**
     * Whistle sound - high-frequency sine with vibrato
     * short: 0.3s, long: 1.0s, triple: 3x 0.2s with 0.1s gaps
     */
    blowWhistle(type: 'short' | 'long' | 'triple'): void {
        if (type === 'triple') {
            this.playWhistleNote(0.0, 0.2);
            this.playWhistleNote(0.3, 0.2);
            this.playWhistleNote(0.6, 0.2);
        } else {
            const duration = type === 'short' ? 0.3 : 1.0;
            this.playWhistleNote(0.0, duration);
        }
    }

    /**
     * Play a single whistle note with vibrato
     */
    private playWhistleNote(startDelay: number, duration: number): void {
        const now = this.ctx.currentTime + startDelay;
        const baseFreq = 3000; // Hz

        // Vibrato LFO (Low Frequency Oscillator)
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 6; // 6 Hz vibrato

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 50; // +-50 Hz wobble

        lfo.connect(lfoGain);

        // Main whistle oscillator
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = baseFreq;

        // Connect LFO to frequency for vibrato
        lfoGain.connect(osc.frequency);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.setValueAtTime(0.15, now + duration - 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        lfo.start(now);
        lfo.stop(now + duration);
        osc.start(now);
        osc.stop(now + duration);
    }

    /**
     * Set master volume (0-1)
     */
    setVolume(v: number): void {
        this.masterGain.gain.value = Math.max(0, Math.min(1, v));
    }
}
