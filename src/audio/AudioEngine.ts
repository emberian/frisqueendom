export class AudioEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private windNode: OscillatorNode | null = null;
    private windGain: GainNode | null = null;
    private windNoiseSource: AudioBufferSourceNode | null = null;
    private crowdNoiseSource: AudioBufferSourceNode | null = null;
    private crowdGain: GainNode | null = null;

    // Disc flight hum nodes
    private discHumOsc: OscillatorNode | null = null;
    private discHumGain: GainNode | null = null;

    private ensureContext(): AudioContext {
        if (!this.ctx) {
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    private getMaster(): GainNode {
        this.ensureContext();
        return this.masterGain!;
    }

    getContext(): AudioContext {
        return this.ensureContext();
    }

    playThrowSound(speed: number, type: string = 'backhand'): void {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;

        if (type === 'forehand') {
            // Higher bandpass, sharper attack + click at onset
            const duration = 0.15;
            const buf = this.makeNoiseBuf(ctx, duration, 0.5);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 800 + speed * 40;
            filter.Q.value = 3;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            src.connect(filter);
            filter.connect(gain);
            gain.connect(this.getMaster());
            src.start(now);
            src.stop(now + duration);
            // Click at onset
            const click = ctx.createOscillator();
            click.frequency.value = 1200;
            click.type = 'sine';
            const cg = ctx.createGain();
            cg.gain.setValueAtTime(0.3, now);
            cg.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            click.connect(cg);
            cg.connect(this.getMaster());
            click.start(now);
            click.stop(now + 0.03);
        } else if (type === 'hammer') {
            // Two-stage sweep + noise crack
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(600, now + 0.08);
            const g1 = ctx.createGain();
            g1.gain.setValueAtTime(0.3, now);
            g1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(g1);
            g1.connect(this.getMaster());
            osc.start(now);
            osc.stop(now + 0.12);
            // Noise crack
            const buf = this.makeNoiseBuf(ctx, 0.05, 0.8);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 2000;
            const g2 = ctx.createGain();
            g2.gain.setValueAtTime(0.35, now);
            g2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            src.connect(hp);
            hp.connect(g2);
            g2.connect(this.getMaster());
            src.start(now);
            src.stop(now + 0.05);
        } else if (type === 'scoober') {
            // Soft upward sweep
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(500, now + 0.12);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(gain);
            gain.connect(this.getMaster());
            osc.start(now);
            osc.stop(now + 0.12);
        } else {
            // Backhand / default: original whoosh
            const duration = 0.15;
            const buf = this.makeNoiseBuf(ctx, duration, 0.5);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 400 + speed * 30;
            filter.Q.value = 2;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.4, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            src.connect(filter);
            filter.connect(gain);
            gain.connect(this.getMaster());
            src.start(now);
            src.stop(now + duration);
        }
    }

    // Disc flight hum (continuous while in flight)
    startDiscHum(): void {
        const ctx = this.ensureContext();
        this.stopDiscHum();
        this.discHumOsc = ctx.createOscillator();
        this.discHumOsc.type = 'triangle';
        this.discHumOsc.frequency.value = 200;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 300;
        filter.Q.value = 1;
        this.discHumGain = ctx.createGain();
        this.discHumGain.gain.value = 0.02;
        this.discHumOsc.connect(filter);
        filter.connect(this.discHumGain);
        this.discHumGain.connect(this.getMaster());
        this.discHumOsc.start();
    }

    updateDiscHum(speed: number): void {
        if (!this.discHumOsc || !this.discHumGain || !this.ctx) return;
        const t = Math.min(1, speed / 30);
        this.discHumOsc.frequency.value = 200 + t * 600;
        this.discHumGain.gain.value = 0.02 + t * 0.06;
    }

    stopDiscHum(): void {
        if (this.discHumOsc) {
            try { this.discHumOsc.stop(); } catch (_) { /* already stopped */ }
            this.discHumOsc = null;
        }
        this.discHumGain = null;
    }

    playCatchSound(quality: string = 'clean', isLayout: boolean = false): void {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;

        // Body impact thud for layout catches
        if (isLayout) {
            const buf = this.makeNoiseBuf(ctx, 0.1, 1.0);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 200;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.3, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            src.connect(lp);
            lp.connect(g);
            g.connect(this.getMaster());
            src.start(now);
            src.stop(now + 0.1);
        }

        // Clap sound with quality-based variation
        const clapOffset = isLayout ? 0.05 : 0;
        const duration = 0.08;
        const clapGainVal = quality === 'perfect' ? 0.6 : quality === 'clean' ? 0.5 : 0.3;
        const buf = this.makeNoiseBuf(ctx, duration, 1.0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + clapOffset);
        gain.gain.linearRampToValueAtTime(clapGainVal, now + clapOffset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + clapOffset + duration);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.getMaster());
        src.start(now + clapOffset);
        src.stop(now + clapOffset + duration);

        // Low thump for perfect catches
        if (quality === 'perfect') {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 80;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.2, now + clapOffset);
            g.gain.exponentialRampToValueAtTime(0.001, now + clapOffset + 0.03);
            osc.connect(g);
            g.connect(this.getMaster());
            osc.start(now + clapOffset);
            osc.stop(now + clapOffset + 0.03);
        }
    }

    playEffortGrunt(type: 'layout' | 'jump' | 'catch'): void {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        const pitchVar = (Math.random() - 0.5) * 100;
        const duration = type === 'layout' ? 0.15 : type === 'jump' ? 0.08 : 0.06;
        const vol = type === 'layout' ? 0.1 : type === 'jump' ? 0.06 : 0.05;

        // Formant synthesis: two bandpass-filtered sawtooth oscillators
        for (const freq of [700 + pitchVar, 1200 + pitchVar]) {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = freq;
            bp.Q.value = 5;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(vol, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(bp);
            bp.connect(gain);
            gain.connect(this.getMaster());
            osc.start(now);
            osc.stop(now + duration);
        }
    }

    playCutSkid(sharpness: number): void {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        const clamped = Math.max(0, Math.min(1, sharpness));
        const duration = 0.05 + clamped * 0.05;
        const buf = this.makeNoiseBuf(ctx, duration, 0.5);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.05 + clamped * 0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        src.connect(hp);
        hp.connect(gain);
        gain.connect(this.getMaster());
        src.start(now);
        src.stop(now + duration);
    }

    playBlockSound(): void {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        // Punchy low-mid thud
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(0.4, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(g1);
        g1.connect(this.getMaster());
        osc.start(now);
        osc.stop(now + 0.1);
        // Slap noise
        const buf = this.makeNoiseBuf(ctx, 0.04, 0.8);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.3, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        src.connect(bp);
        bp.connect(g2);
        g2.connect(this.getMaster());
        src.start(now);
        src.stop(now + 0.04);
    }

    playDiscSpike(): void {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        // Low sine impact
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 60;
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(0, now);
        g1.gain.linearRampToValueAtTime(0.4, now + 0.04);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(g1);
        g1.connect(this.getMaster());
        osc.start(now);
        osc.stop(now + 0.14);
        // High-freq slap noise
        const buf = this.makeNoiseBuf(ctx, 0.03, 1.0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 4000;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.3, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        src.connect(hp);
        hp.connect(g2);
        g2.connect(this.getMaster());
        src.start(now);
        src.stop(now + 0.03);
    }

    playTeamCheer(): void {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        const duration = 0.8;
        // 4 detuned sawtooth oscillators
        for (const baseFreq of [280, 340, 400, 460]) {
            const freq = baseFreq + (Math.random() - 0.5) * 40;
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 1000;
            bp.Q.value = 1;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.03, now + 0.1);
            gain.gain.setValueAtTime(0.03, now + duration * 0.7);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(bp);
            bp.connect(gain);
            gain.connect(this.getMaster());
            osc.start(now);
            osc.stop(now + duration);
        }
    }

    playScoreJingle(): void {
        const ctx = this.ensureContext();
        const notes = [261.63, 329.63, 392.0]; // C4, E4, G4
        const now = ctx.currentTime;

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            const start = now + i * 0.15;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

            osc.connect(gain);
            gain.connect(this.getMaster());
            osc.start(start);
            osc.stop(start + 0.3);
        });
    }

    startAmbientWind(windSpeed: number): void {
        const ctx = this.ensureContext();

        // Clean up existing
        this.stopAmbientWind();

        // Noise source (looping)
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }

        this.windNoiseSource = ctx.createBufferSource();
        this.windNoiseSource.buffer = buffer;
        this.windNoiseSource.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200 + windSpeed * 100;

        this.windGain = ctx.createGain();
        this.windGain.gain.value = Math.min(0.15, windSpeed * 0.02);

        this.windNoiseSource.connect(filter);
        filter.connect(this.windGain);
        this.windGain.connect(this.getMaster());
        this.windNoiseSource.start();
    }

    updateWindAudio(windSpeed: number): void {
        if (this.windGain) {
            this.windGain.gain.value = Math.min(0.15, windSpeed * 0.02);
        }
    }

    stopAmbientWind(): void {
        if (this.windNoiseSource) {
            try {
                this.windNoiseSource.stop();
            } catch (_) {
                // already stopped
            }
            this.windNoiseSource = null;
        }
    }

    startCrowdAmbience(baseIntensity: number = 0.25): void {
        const ctx = this.ensureContext();
        this.stopCrowdAmbience();

        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            brown = (brown + 0.02 * white) / 1.02;
            data[i] = brown * 2.2;
        }

        this.crowdNoiseSource = ctx.createBufferSource();
        this.crowdNoiseSource.buffer = buffer;
        this.crowdNoiseSource.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 680;
        filter.Q.value = 0.8;

        this.crowdGain = ctx.createGain();
        this.crowdGain.gain.value = Math.max(0, Math.min(0.2, baseIntensity * 0.2));

        this.crowdNoiseSource.connect(filter);
        filter.connect(this.crowdGain);
        this.crowdGain.connect(this.getMaster());
        this.crowdNoiseSource.start();
    }

    updateCrowdExcitement(excitement: number): void {
        if (!this.crowdGain || !this.ctx) return;
        const clamped = Math.max(0, Math.min(1, excitement));
        const now = this.ctx.currentTime;
        this.crowdGain.gain.cancelScheduledValues(now);
        this.crowdGain.gain.linearRampToValueAtTime(0.03 + clamped * 0.18, now + 0.2);
    }

    playCrowdCheer(strength: number): void {
        const ctx = this.ensureContext();
        const clamped = Math.max(0.2, Math.min(1, strength));
        const duration = 1.5 + clamped * 0.8;
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            const env = Math.sin(t * Math.PI);
            data[i] = (Math.random() * 2 - 1) * env * 0.5;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800 + clamped * 300;
        filter.Q.value = 0.7;
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15 + clamped * 0.25, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.getMaster());
        source.start(now);
        source.stop(now + duration);
    }

    stopCrowdAmbience(): void {
        if (this.crowdNoiseSource) {
            try {
                this.crowdNoiseSource.stop();
            } catch (_) {
                // already stopped
            }
            this.crowdNoiseSource = null;
        }
    }

    // Backward compat for pull sound
    playThrowWhoosh(speed: number): void {
        this.playThrowSound(speed, 'backhand');
    }

    private makeNoiseBuf(ctx: AudioContext, duration: number, amplitude: number): AudioBuffer {
        const size = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) {
            data[i] = (Math.random() * 2 - 1) * amplitude;
        }
        return buffer;
    }

    playFootstep(speed: number): void {
        const ctx = this.ensureContext();
        const duration = 0.05;

        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;

        const gain = ctx.createGain();
        const now = ctx.currentTime;
        const vol = Math.min(0.1, speed * 0.01);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.getMaster());
        source.start(now);
        source.stop(now + duration);
    }
}
