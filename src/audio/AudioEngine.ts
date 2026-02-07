export class AudioEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private windNode: OscillatorNode | null = null;
    private windGain: GainNode | null = null;
    private windNoiseSource: AudioBufferSourceNode | null = null;
    private crowdNoiseSource: AudioBufferSourceNode | null = null;
    private crowdGain: GainNode | null = null;

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

    playThrowWhoosh(speed: number): void {
        const ctx = this.ensureContext();
        const duration = 0.15;

        // Noise source
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 400 + speed * 30;
        filter.Q.value = 2;

        const gain = ctx.createGain();
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.getMaster());
        source.start(now);
        source.stop(now + duration);
    }

    playCatchClap(): void {
        const ctx = this.ensureContext();
        const duration = 0.08;

        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;

        const gain = ctx.createGain();
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.getMaster());
        source.start(now);
        source.stop(now + duration);
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
