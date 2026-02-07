export class AudioEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private windNode: OscillatorNode | null = null;
    private windGain: GainNode | null = null;
    private windNoiseSource: AudioBufferSourceNode | null = null;

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
