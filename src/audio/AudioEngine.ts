/** Position in 3D space for spatial audio */
export interface AudioPosition {
    x: number;
    y: number;
    z: number;
}

export type VenueType = 'park' | 'tournament' | 'stadium';

export class AudioEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private windGain: GainNode | null = null;
    private windNoiseSource: AudioBufferSourceNode | null = null;
    private crowdNoiseSource: AudioBufferSourceNode | null = null;
    private crowdGain: GainNode | null = null;

    // Disc flight hum nodes
    private discHumOsc: OscillatorNode | null = null;
    private discHumGain: GainNode | null = null;
    private discHumPanner: PannerNode | null = null;

    // Ambient environment
    private ambientNodes: AudioNode[] = [];
    private ambientVenue: VenueType | null = null;
    private birdInterval: ReturnType<typeof setTimeout> | null = null;
    private paTimeout: ReturnType<typeof setTimeout> | null = null;

    // Rain system
    private rainSource: AudioBufferSourceNode | null = null;
    private rainGain: GainNode | null = null;
    private rainFilter: BiquadFilterNode | null = null;
    private raindropInterval: ReturnType<typeof setInterval> | null = null;

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

    // ─── Spatial Audio ───────────────────────────────────────────────

    /**
     * Update the AudioListener position and forward orientation.
     * Call each frame with the camera's world position and forward direction.
     */
    setListenerPosition(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
        if (!this.ctx) return;
        const listener = this.ctx.listener;
        if (listener.positionX) {
            // Modern API (AudioParam-based)
            const now = this.ctx.currentTime;
            listener.positionX.setValueAtTime(x, now);
            listener.positionY.setValueAtTime(y, now);
            listener.positionZ.setValueAtTime(z, now);
            listener.forwardX.setValueAtTime(fx, now);
            listener.forwardY.setValueAtTime(fy, now);
            listener.forwardZ.setValueAtTime(fz, now);
            listener.upX.setValueAtTime(0, now);
            listener.upY.setValueAtTime(1, now);
            listener.upZ.setValueAtTime(0, now);
        } else {
            // Legacy API fallback
            listener.setPosition(x, y, z);
            listener.setOrientation(fx, fy, fz, 0, 1, 0);
        }
    }

    /**
     * Create a PannerNode configured for spatial game audio.
     */
    private createSpatialPanner(ctx: AudioContext, pos: AudioPosition): PannerNode {
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 5;
        panner.maxDistance = 100;
        panner.rolloffFactor = 1;
        panner.positionX.setValueAtTime(pos.x, ctx.currentTime);
        panner.positionY.setValueAtTime(pos.y, ctx.currentTime);
        panner.positionZ.setValueAtTime(pos.z, ctx.currentTime);
        return panner;
    }

    /**
     * Route a source node through an optional spatial panner to the master output.
     * If pos is provided, inserts a PannerNode; otherwise connects directly.
     * Returns the PannerNode if created, for later position updates.
     */
    private connectWithSpatial(
        lastNode: AudioNode,
        pos?: AudioPosition,
    ): PannerNode | null {
        if (!this.ctx) return null;
        if (pos) {
            const panner = this.createSpatialPanner(this.ctx, pos);
            lastNode.connect(panner);
            panner.connect(this.getMaster());
            return panner;
        } else {
            lastNode.connect(this.getMaster());
            return null;
        }
    }

    // ─── Throw Sounds ────────────────────────────────────────────────

    playThrowSound(speed: number, type: string = 'backhand', pos?: AudioPosition): void {
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
            this.connectWithSpatial(gain, pos);
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
            this.connectWithSpatial(cg, pos);
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
            this.connectWithSpatial(g1, pos);
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
            this.connectWithSpatial(g2, pos);
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
            this.connectWithSpatial(gain, pos);
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
            this.connectWithSpatial(gain, pos);
            src.start(now);
            src.stop(now + duration);
        }
    }

    // ─── Disc Flight Hum ─────────────────────────────────────────────

    startDiscHum(pos?: AudioPosition): void {
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
        this.discHumPanner = this.connectWithSpatial(this.discHumGain, pos);
        this.discHumOsc.start();
    }

    updateDiscHum(speed: number, pos?: AudioPosition): void {
        if (!this.discHumOsc || !this.discHumGain || !this.ctx) return;
        const t = Math.min(1, speed / 30);
        this.discHumOsc.frequency.value = 200 + t * 600;
        this.discHumGain.gain.value = 0.02 + t * 0.06;
        // Update spatial position for Doppler-like effect
        if (pos && this.discHumPanner) {
            const now = this.ctx.currentTime;
            this.discHumPanner.positionX.setValueAtTime(pos.x, now);
            this.discHumPanner.positionY.setValueAtTime(pos.y, now);
            this.discHumPanner.positionZ.setValueAtTime(pos.z, now);
        }
    }

    stopDiscHum(): void {
        if (this.discHumOsc) {
            try { this.discHumOsc.stop(); } catch (_) { /* already stopped */ }
            this.discHumOsc = null;
        }
        this.discHumGain = null;
        this.discHumPanner = null;
    }

    // ─── Catch / Impact Sounds ───────────────────────────────────────

    playCatchSound(quality: string = 'clean', isLayout: boolean = false, pos?: AudioPosition): void {
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
            this.connectWithSpatial(g, pos);
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
        this.connectWithSpatial(gain, pos);
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
            this.connectWithSpatial(g, pos);
            osc.start(now + clapOffset);
            osc.stop(now + clapOffset + 0.03);
        }
    }

    playEffortGrunt(type: 'layout' | 'jump' | 'catch', pos?: AudioPosition): void {
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
            this.connectWithSpatial(gain, pos);
            osc.start(now);
            osc.stop(now + duration);
        }
    }

    playCutSkid(sharpness: number, pos?: AudioPosition): void {
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
        this.connectWithSpatial(gain, pos);
        src.start(now);
        src.stop(now + duration);
    }

    playBlockSound(pos?: AudioPosition): void {
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
        this.connectWithSpatial(g1, pos);
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
        this.connectWithSpatial(g2, pos);
        src.start(now);
        src.stop(now + 0.04);
    }

    playDiscSpike(pos?: AudioPosition): void {
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
        this.connectWithSpatial(g1, pos);
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
        this.connectWithSpatial(g2, pos);
        src.start(now);
        src.stop(now + 0.03);
    }

    playTeamCheer(): void {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        const duration = 0.8;
        // 4 detuned sawtooth oscillators — non-spatial (crowd sound)
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

    // ─── UI Sounds ───────────────────────────────────────────────────

    /** Short sine wave pulse for menu click. Non-spatial. */
    playMenuClick(): void {
        if (!this.ctx) return;
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.getMaster());
        osc.start(now);
        osc.stop(now + 0.05);
    }

    /** Brighter click with harmonic for menu selection. Non-spatial. */
    playMenuSelect(): void {
        if (!this.ctx) return;
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        for (const freq of [1000, 2000]) {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(freq === 1000 ? 0.3 : 0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.connect(gain);
            gain.connect(this.getMaster());
            osc.start(now);
            osc.stop(now + 0.08);
        }
    }

    /** Ascending C-E-G arpeggio with triangle waves. Non-spatial. */
    playScoreJingle(): void {
        if (!this.ctx) return;
        const ctx = this.ensureContext();
        const notes = [261.63, 329.63, 392.0]; // C4, E4, G4
        const now = ctx.currentTime;

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
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

    /** Brief descending tone for turnovers. Non-spatial. */
    playTurnoverTone(): void {
        if (!this.ctx) return;
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.getMaster());
        osc.start(now);
        osc.stop(now + 0.2);
    }

    /** Filtered noise whistle for timeout/foul. Non-spatial. */
    playWhistle(): void {
        if (!this.ctx) return;
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        const duration = 0.3;
        const buf = this.makeNoiseBuf(ctx, duration, 0.6);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3000;
        bp.Q.value = 8;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
        gain.gain.setValueAtTime(0.25, now + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        src.connect(bp);
        bp.connect(gain);
        gain.connect(this.getMaster());
        src.start(now);
        src.stop(now + duration);
    }

    /** Sawtooth horn blast for game start/end. Non-spatial. */
    playHornBlast(): void {
        if (!this.ctx) return;
        const ctx = this.ensureContext();
        const now = ctx.currentTime;
        const duration = 0.5;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 200;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.03);
        gain.gain.setValueAtTime(0.35, now + duration * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(this.getMaster());
        osc.start(now);
        osc.stop(now + duration);
    }

    // ─── Wind Ambience ───────────────────────────────────────────────

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

    // ─── Crowd Ambience ──────────────────────────────────────────────

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

    // ─── Ambient Environment ─────────────────────────────────────────

    /**
     * Start ambient environment sounds based on venue type.
     * Non-spatial (ambient layer).
     */
    startAmbient(venue: VenueType): void {
        if (!this.ctx) return;
        this.stopAmbient();
        this.ambientVenue = venue;
        const ctx = this.ensureContext();

        if (venue === 'park') {
            this.startParkAmbient(ctx);
        } else if (venue === 'tournament') {
            this.startTournamentAmbient(ctx);
        } else if (venue === 'stadium') {
            this.startStadiumAmbient(ctx);
        }
    }

    private startParkAmbient(ctx: AudioContext): void {
        // Distant traffic: very low brown noise rumble, constant
        const bufferSize = ctx.sampleRate * 3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            brown = (brown + 0.02 * white) / 1.02;
            data[i] = brown * 1.5;
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 120;
        const gain = ctx.createGain();
        gain.gain.value = 0.04;
        src.connect(lp);
        lp.connect(gain);
        gain.connect(this.getMaster());
        src.start();
        this.ambientNodes.push(src);

        // Bird songs: random trills at 2-4s intervals
        this.scheduleBirdSong();
    }

    private scheduleBirdSong(): void {
        if (!this.ctx || this.ambientVenue !== 'park') return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Random trill pattern
        const baseFreq = 2000 + Math.random() * 2000; // 2000-4000 Hz
        const noteCount = 2 + Math.floor(Math.random() * 4); // 2-5 notes
        const noteGap = 0.06 + Math.random() * 0.04;

        for (let n = 0; n < noteCount; n++) {
            const freq = baseFreq + (Math.random() - 0.5) * 400;
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const gain = ctx.createGain();
            const t = now + n * noteGap;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.04, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + noteGap * 0.8);
            osc.connect(gain);
            gain.connect(this.getMaster());
            osc.start(t);
            osc.stop(t + noteGap);
        }

        // Schedule next bird call at 2-4s interval
        const nextDelay = 2000 + Math.random() * 2000;
        this.birdInterval = setTimeout(() => this.scheduleBirdSong(), nextDelay);
    }

    private startTournamentAmbient(ctx: AudioContext): void {
        // Crowd murmur: layered noise with bandpass around voice frequencies
        const bufferSize = ctx.sampleRate * 3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            brown = (brown + 0.02 * white) / 1.02;
            data[i] = brown * 2.0;
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 700;
        bp.Q.value = 0.6;
        const gain = ctx.createGain();
        gain.gain.value = 0.06;
        src.connect(bp);
        bp.connect(gain);
        gain.connect(this.getMaster());
        src.start();
        this.ambientNodes.push(src);

        // PA announcements: occasional muffled bandpass noise bursts
        this.schedulePAAnnouncement(ctx);
    }

    private schedulePAAnnouncement(ctx: AudioContext): void {
        if (this.ambientVenue !== 'tournament') return;

        const delay = 8000 + Math.random() * 15000; // 8-23s between announcements
        this.paTimeout = setTimeout(() => {
            if (!this.ctx || this.ambientVenue !== 'tournament') return;
            const now = ctx.currentTime;
            const duration = 1.5 + Math.random() * 1.5;
            const bufSize = Math.floor(ctx.sampleRate * duration);
            const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                const t = i / bufSize;
                // Envelope: fade in, sustain, fade out
                const env = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1.0;
                d[i] = (Math.random() * 2 - 1) * env * 0.3;
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 500;
            bp.Q.value = 2;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 800;
            const paGain = ctx.createGain();
            paGain.gain.value = 0.03;
            src.connect(bp);
            bp.connect(lp);
            lp.connect(paGain);
            paGain.connect(this.getMaster());
            src.start(now);
            src.stop(now + duration);
            // Schedule next
            this.schedulePAAnnouncement(ctx);
        }, delay);
    }

    private startStadiumAmbient(ctx: AudioContext): void {
        // Larger crowd presence — deeper continuous rumble layer
        const bufferSize = ctx.sampleRate * 3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            brown = (brown + 0.02 * white) / 1.02;
            data[i] = brown * 2.5;
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 650;
        bp.Q.value = 0.5;
        const gain = ctx.createGain();
        gain.gain.value = 0.12;
        src.connect(bp);
        bp.connect(gain);
        gain.connect(this.getMaster());
        src.start();
        this.ambientNodes.push(src);

        // Boost CrowdAudio volume if active
        if (this.crowdGain) {
            this.crowdGain.gain.value = Math.min(0.3, this.crowdGain.gain.value * 1.5);
        }
    }

    stopAmbient(): void {
        this.ambientVenue = null;
        if (this.birdInterval !== null) {
            clearTimeout(this.birdInterval);
            this.birdInterval = null;
        }
        if (this.paTimeout !== null) {
            clearTimeout(this.paTimeout);
            this.paTimeout = null;
        }
        for (const node of this.ambientNodes) {
            try {
                if ('stop' in node && typeof (node as AudioBufferSourceNode).stop === 'function') {
                    (node as AudioBufferSourceNode).stop();
                }
                node.disconnect();
            } catch (_) {
                // already stopped/disconnected
            }
        }
        this.ambientNodes = [];
    }

    // ─── Rain Audio ──────────────────────────────────────────────────

    /**
     * Start rain sound layer. Intensity 0-1 scales volume and filter bandwidth.
     * Non-spatial (ambient layer).
     */
    startRain(intensity: number): void {
        if (!this.ctx) return;
        const ctx = this.ensureContext();
        this.stopRain();

        const clamped = Math.max(0, Math.min(1, intensity));

        // White noise filtered to rain character
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }

        this.rainSource = ctx.createBufferSource();
        this.rainSource.buffer = buffer;
        this.rainSource.loop = true;

        // Bandpass filter for rain character (2000-8000Hz range)
        this.rainFilter = ctx.createBiquadFilter();
        this.rainFilter.type = 'bandpass';
        // Center frequency shifts with intensity
        this.rainFilter.frequency.value = 4000 + clamped * 1000;
        // Q narrows the band — lower intensity = narrower band
        this.rainFilter.Q.value = 1.5 - clamped * 0.8; // 1.5 -> 0.7

        this.rainGain = ctx.createGain();
        this.rainGain.gain.value = 0.03 + clamped * 0.12; // 0.03 -> 0.15

        this.rainSource.connect(this.rainFilter);
        this.rainFilter.connect(this.rainGain);
        this.rainGain.connect(this.getMaster());
        this.rainSource.start();

        // Raindrop pings overlay at higher intensities
        if (clamped > 0.3) {
            this.startRaindropPings(ctx, clamped);
        }
    }

    private startRaindropPings(ctx: AudioContext, intensity: number): void {
        // Interval between pings decreases with intensity (more rain = more pings)
        const intervalMs = Math.max(50, 300 - intensity * 250);
        this.raindropInterval = setInterval(() => {
            if (!this.ctx) return;
            const now = ctx.currentTime;
            // High-frequency sine burst for raindrop
            const freq = 4000 + Math.random() * 4000; // 4000-8000 Hz
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const gain = ctx.createGain();
            const vol = 0.01 + Math.random() * 0.02 * intensity;
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
            osc.connect(gain);
            gain.connect(this.getMaster());
            osc.start(now);
            osc.stop(now + 0.02);
        }, intervalMs);
    }

    stopRain(): void {
        if (this.rainSource) {
            try { this.rainSource.stop(); } catch (_) { /* already stopped */ }
            this.rainSource = null;
        }
        this.rainGain = null;
        this.rainFilter = null;
        if (this.raindropInterval !== null) {
            clearInterval(this.raindropInterval);
            this.raindropInterval = null;
        }
    }

    /** Low-frequency rumble + sharp crack for thunder. */
    playThunder(): void {
        if (!this.ctx) return;
        const ctx = this.ensureContext();
        const now = ctx.currentTime;

        // Low-freq rumble (50Hz brown noise, 2s)
        const rumbleDuration = 2.0;
        const rumbleSize = Math.floor(ctx.sampleRate * rumbleDuration);
        const rumbleBuffer = ctx.createBuffer(1, rumbleSize, ctx.sampleRate);
        const rumbleData = rumbleBuffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < rumbleSize; i++) {
            const t = i / rumbleSize;
            const env = t < 0.1 ? t / 0.1 : Math.pow(1 - (t - 0.1) / 0.9, 2);
            const white = Math.random() * 2 - 1;
            brown = (brown + 0.02 * white) / 1.02;
            rumbleData[i] = brown * 3.0 * env;
        }
        const rumbleSrc = ctx.createBufferSource();
        rumbleSrc.buffer = rumbleBuffer;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 80;
        const rumbleGain = ctx.createGain();
        rumbleGain.gain.value = 0.25;
        rumbleSrc.connect(lp);
        lp.connect(rumbleGain);
        rumbleGain.connect(this.getMaster());
        rumbleSrc.start(now);
        rumbleSrc.stop(now + rumbleDuration);

        // Sharp crack (white noise burst, 0.08s)
        const crackDelay = 0.05 + Math.random() * 0.1;
        const crackDuration = 0.08;
        const crackBuf = this.makeNoiseBuf(ctx, crackDuration, 1.0);
        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = crackBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000;
        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0, now + crackDelay);
        crackGain.gain.linearRampToValueAtTime(0.4, now + crackDelay + 0.005);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + crackDelay + crackDuration);
        crackSrc.connect(hp);
        hp.connect(crackGain);
        crackGain.connect(this.getMaster());
        crackSrc.start(now + crackDelay);
        crackSrc.stop(now + crackDelay + crackDuration);
    }

    // ─── Footstep ────────────────────────────────────────────────────

    playFootstep(speed: number, pos?: AudioPosition): void {
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
        this.connectWithSpatial(gain, pos);
        source.start(now);
        source.stop(now + duration);
    }

    // Backward compat for pull sound
    playThrowWhoosh(speed: number): void {
        this.playThrowSound(speed, 'backhand');
    }

    // ─── Utilities ───────────────────────────────────────────────────

    private makeNoiseBuf(ctx: AudioContext, duration: number, amplitude: number): AudioBuffer {
        const size = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) {
            data[i] = (Math.random() * 2 - 1) * amplitude;
        }
        return buffer;
    }
}
