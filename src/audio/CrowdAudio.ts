/**
 * CrowdAudio - Enhanced reactive crowd audio system
 * Ambient crowd noise with reactive responses to game events
 */

export class CrowdAudio {
    private ctx: AudioContext;
    private masterGain: GainNode;

    // Ambient crowd
    private ambienceSource: AudioBufferSourceNode | null = null;
    private ambienceGain: GainNode | null = null;
    private ambienceFilter: BiquadFilterNode | null = null;
    private currentIntensity: number = 0.5;

    // Momentum tracking
    private momentum: number = 0.5;
    private targetMomentum: number = 0.5;

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 0.3;
        this.masterGain.connect(ctx.destination);
    }

    /**
     * Start ambient crowd noise with brown noise and bandpass filtering
     * intensity: 0 = quiet, 1 = loud
     */
    startAmbience(intensity: number = 0.5): void {
        this.stopAmbience();

        this.currentIntensity = Math.max(0, Math.min(1, intensity));

        // Generate brown noise for crowd murmur
        const bufferSize = this.ctx.sampleRate * 3; // 3-second loop
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        let brown = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            brown = (brown + 0.02 * white) / 1.02;
            data[i] = brown * 2.5;
        }

        this.ambienceSource = this.ctx.createBufferSource();
        this.ambienceSource.buffer = buffer;
        this.ambienceSource.loop = true;

        // Bandpass filter for vocal-range crowd sound
        this.ambienceFilter = this.ctx.createBiquadFilter();
        this.ambienceFilter.type = 'bandpass';
        this.ambienceFilter.frequency.value = 600 + this.currentIntensity * 200;
        this.ambienceFilter.Q.value = 0.9;

        this.ambienceGain = this.ctx.createGain();
        this.ambienceGain.gain.value = 0.05 + this.currentIntensity * 0.15; // 0.05-0.20

        this.ambienceSource.connect(this.ambienceFilter);
        this.ambienceFilter.connect(this.ambienceGain);
        this.ambienceGain.connect(this.masterGain);

        this.ambienceSource.start();
    }

    /**
     * Stop ambient crowd noise
     */
    stopAmbience(): void {
        if (this.ambienceSource) {
            try {
                this.ambienceSource.stop();
            } catch (_) {
                // Already stopped
            }
            this.ambienceSource = null;
            this.ambienceGain = null;
            this.ambienceFilter = null;
        }
    }

    /**
     * Big cheer - noise burst with rising pitch
     */
    reactToScore(): void {
        const duration = 2.0;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Generate noise with envelope
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            // Quick rise, slow fall
            const env = t < 0.2 ? t / 0.2 : 1.0 - (t - 0.2) / 0.8;
            data[i] = (Math.random() * 2 - 1) * env * 0.7;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 1.2;

        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        // Rising pitch sweep
        filter.frequency.setValueAtTime(700, now);
        filter.frequency.exponentialRampToValueAtTime(1400, now + 0.3);
        filter.frequency.setValueAtTime(1400, now + 0.3);
        filter.frequency.exponentialRampToValueAtTime(900, now + duration);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        source.start(now);
        source.stop(now + duration);
    }

    /**
     * "Ohhh!" sound - filtered noise with pitch sweep down
     */
    reactToBlock(): void {
        const duration = 0.8;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            const env = Math.sin(t * Math.PI);
            data[i] = (Math.random() * 2 - 1) * env * 0.5;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 1.5;

        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        // Descending pitch sweep
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(600, now + duration);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        source.start(now);
        source.stop(now + duration);
    }

    /**
     * Gasp + cheer - two-stage reaction
     */
    reactToLayout(): void {
        // Gasp (quick high pitch)
        this.playGasp(0.0);

        // Followed by cheer
        this.playCheer(0.4);
    }

    /**
     * Brief "aww" sound
     */
    reactToNearMiss(): void {
        const duration = 0.5;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            const env = Math.sin(t * Math.PI);
            data[i] = (Math.random() * 2 - 1) * env * 0.4;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 750;
        filter.Q.value = 1.0;

        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        source.start(now);
        source.stop(now + duration);
    }

    /**
     * Set momentum level (0-1) - affects ambience volume and filter
     */
    setMomentum(momentum: number): void {
        this.targetMomentum = Math.max(0, Math.min(1, momentum));
    }

    /**
     * Update momentum smoothly over time
     */
    update(dt: number): void {
        if (!isFinite(dt)) return;

        // Smooth momentum interpolation
        const lerpSpeed = 2.0;
        this.momentum += (this.targetMomentum - this.momentum) * lerpSpeed * dt;
        if (!isFinite(this.momentum)) this.momentum = 0;

        // Update ambience based on momentum
        if (this.ambienceGain && this.ambienceFilter) {
            const now = this.ctx.currentTime;

            // Volume scales with both intensity and momentum
            const targetVolume = (0.05 + this.currentIntensity * 0.15) * (0.5 + this.momentum * 0.5);
            this.ambienceGain.gain.cancelScheduledValues(now);
            this.ambienceGain.gain.linearRampToValueAtTime(targetVolume, now + 0.3);

            // Filter frequency increases with momentum (crowd gets "brighter")
            const targetFreq = 600 + this.currentIntensity * 200 + this.momentum * 300;
            this.ambienceFilter.frequency.cancelScheduledValues(now);
            this.ambienceFilter.frequency.linearRampToValueAtTime(targetFreq, now + 0.3);
        }
    }

    /**
     * Helper: play a gasp sound
     */
    private playGasp(delay: number): void {
        const duration = 0.3;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            const env = t < 0.5 ? t * 2 : 2 - t * 2;
            data[i] = (Math.random() * 2 - 1) * env * 0.3;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1500;
        filter.Q.value = 2.0;

        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime + delay;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        source.start(now);
        source.stop(now + duration);
    }

    /**
     * Helper: play a cheer sound
     */
    private playCheer(delay: number): void {
        const duration = 1.2;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            const env = Math.sin(t * Math.PI);
            data[i] = (Math.random() * 2 - 1) * env * 0.6;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 900;
        filter.Q.value = 1.0;

        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime + delay;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        source.start(now);
        source.stop(now + duration);
    }
}
