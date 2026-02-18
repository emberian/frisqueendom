import type { MatchPhase } from '../data/Types';

export interface GameState {
    phase: MatchPhase;
    stallCount: number;
    momentum: number;
    isCloseGame: boolean;
}

interface Layer {
    gain: GainNode;
    sources: Set<AudioNode>;
}

/**
 * Dynamic procedural music system for FrisQueendom.
 *
 * Generates music entirely using Web Audio API with 4 layers:
 * - Base rhythm: Low-frequency percussion (kick, hi-hat)
 * - Harmonic pad: Sustained chord tones (major/minor based on game tension)
 * - Melodic layer: Pentatonic scale phrases
 * - Intensity stinger: Dramatic hits on key events
 *
 * Music adapts to game state:
 * - BPM increases from 100 to 140 based on stall count and momentum
 * - Layers crossfade based on match phase
 * - Minor key used during close games for tension
 * - Stingers trigger on turnover, score, and block events
 *
 * Usage:
 * ```ts
 * const music = new MusicSystem(audioContext);
 * music.start();
 * music.setGameState({ phase: 'live_play', stallCount: 5, momentum: 0.8, isCloseGame: true });
 * // In game loop:
 * music.update(deltaTime);
 * ```
 */
export class MusicSystem {
    private ctx: AudioContext;
    private masterGain: GainNode;
    private isRunning: boolean = false;
    private currentTime: number = 0;
    private lastUpdateTime: number = 0;

    // Layers
    private baseRhythmLayer: Layer;
    private harmonicPadLayer: Layer;
    private melodicLayer: Layer;
    private intensityStingerLayer: Layer;

    // Game state
    private gameState: GameState = {
        phase: 'pre_pull',
        stallCount: 0,
        momentum: 0,
        isCloseGame: false,
    };

    // Music parameters
    private baseBPM: number = 100;
    private currentBPM: number = 100;
    private targetBPM: number = 100;
    private lastKickTime: number = 0;
    private lastHiHatTime: number = 0;
    private lastMelodyTime: number = 0;
    private melodyIndex: number = 0;

    // Pentatonic scale (C, D, E, G, A) in multiple octaves
    private pentatonicScale: number[] = [
        261.63, 293.66, 329.63, 392.0, 440.0,  // C4, D4, E4, G4, A4
        523.25, 587.33, 659.25, 783.99, 880.0, // C5, D5, E5, G5, A5
    ];

    // Chord progressions (indices into pentatonic scale)
    private majorProgression: number[] = [0, 2, 4]; // C, E, G
    private minorProgression: number[] = [0, 1, 3]; // C, D, G (more tense)

    constructor(audioContext: AudioContext) {
        this.ctx = audioContext;

        // Create master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3;
        this.masterGain.connect(this.ctx.destination);

        // Initialize layers
        this.baseRhythmLayer = this.createLayer(0.0);
        this.harmonicPadLayer = this.createLayer(0.3);
        this.melodicLayer = this.createLayer(0.0);
        this.intensityStingerLayer = this.createLayer(0.0);
    }

    private createLayer(initialVolume: number): Layer {
        const gain = this.ctx.createGain();
        gain.gain.value = initialVolume;
        gain.connect(this.masterGain);

        return {
            gain,
            sources: new Set(),
        };
    }

    private scheduleKick(layer: Layer): void {
        const now = this.ctx.currentTime;
        const duration = 0.08;

        // Low sine wave for kick
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(layer.gain);

        layer.sources.add(osc);
        osc.start(now);
        osc.stop(now + duration);
        osc.onended = () => layer.sources.delete(osc);
    }

    private scheduleHiHat(layer: Layer): void {
        const now = this.ctx.currentTime;
        const duration = 0.03;

        // Filtered noise for hi-hat
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 8000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(layer.gain);

        layer.sources.add(source);
        source.start(now);
        source.stop(now + duration);
        source.onended = () => layer.sources.delete(source);
    }

    private updateHarmonicPad(): void {
        // Clean up old oscillators
        this.harmonicPadLayer.sources.forEach(source => {
            if ('stop' in source && typeof source.stop === 'function') {
                try {
                    source.stop();
                } catch (_) {
                    // already stopped
                }
            }
        });
        this.harmonicPadLayer.sources.clear();

        if (this.harmonicPadLayer.gain.gain.value < 0.01) return;

        const now = this.ctx.currentTime;
        const progression = this.gameState.isCloseGame ? this.minorProgression : this.majorProgression;

        progression.forEach((index, i) => {
            const freq = this.pentatonicScale[index];
            const osc = this.ctx.createOscillator();
            osc.type = i === 0 ? 'sine' : 'triangle';
            osc.frequency.value = freq;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.5);

            osc.connect(gain);
            gain.connect(this.harmonicPadLayer.gain);

            this.harmonicPadLayer.sources.add(osc);
            osc.start(now);
        });
    }

    private scheduleMelodyNote(layer: Layer): void {
        const now = this.ctx.currentTime;
        const duration = 0.2;

        // Pick a note from pentatonic scale
        const noteIndex = this.melodyIndex % this.pentatonicScale.length;
        const freq = this.pentatonicScale[noteIndex];
        this.melodyIndex = (this.melodyIndex + Math.floor(Math.random() * 3) + 1) % this.pentatonicScale.length;

        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(layer.gain);

        layer.sources.add(osc);
        osc.start(now);
        osc.stop(now + duration);
        osc.onended = () => layer.sources.delete(osc);
    }

    private playStinger(type: 'turnover' | 'score' | 'block'): void {
        const now = this.ctx.currentTime;

        if (type === 'score') {
            // Victory stinger - ascending major chord
            const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
            notes.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = freq;

                const gain = this.ctx.createGain();
                const start = now + i * 0.08;
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

                osc.connect(gain);
                gain.connect(this.intensityStingerLayer.gain);

                this.intensityStingerLayer.sources.add(osc);
                osc.start(start);
                osc.stop(start + 0.4);
                osc.onended = () => this.intensityStingerLayer.sources.delete(osc);
            });
        } else if (type === 'turnover') {
            // Dramatic descending
            const notes = [392.0, 329.63, 261.63]; // G4, E4, C4
            notes.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = freq;

                const gain = this.ctx.createGain();
                const start = now + i * 0.06;
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

                osc.connect(gain);
                gain.connect(this.intensityStingerLayer.gain);

                this.intensityStingerLayer.sources.add(osc);
                osc.start(start);
                osc.stop(start + 0.3);
                osc.onended = () => this.intensityStingerLayer.sources.delete(osc);
            });
        } else if (type === 'block') {
            // Short dramatic hit
            const osc = this.ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = 220;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

            osc.connect(gain);
            gain.connect(this.intensityStingerLayer.gain);

            this.intensityStingerLayer.sources.add(osc);
            osc.start(now);
            osc.stop(now + 0.2);
            osc.onended = () => this.intensityStingerLayer.sources.delete(osc);
        }
    }

    setGameState(state: Partial<GameState>): void {
        const previousPhase = this.gameState.phase;
        this.gameState = { ...this.gameState, ...state };

        // Update target BPM based on game state
        let bpmTarget = 100;

        if (this.gameState.phase === 'live_play') {
            // Increase BPM with stall count and momentum
            const stallFactor = Math.min(this.gameState.stallCount / 7, 1);
            const momentumFactor = Math.abs(this.gameState.momentum);
            bpmTarget = 100 + stallFactor * 20 + momentumFactor * 20;
        } else if (this.gameState.phase === 'score') {
            bpmTarget = 140;
        }

        this.targetBPM = Math.min(140, bpmTarget);

        // Update layer volumes
        this.updateLayerVolumes();

        // Trigger stingers on phase changes
        if (this.gameState.phase !== previousPhase) {
            if (this.gameState.phase === 'turnover_reset') {
                this.playStinger('turnover');
            } else if (this.gameState.phase === 'score') {
                this.playStinger('score');
            }
        }

        // Update harmonic pad
        this.updateHarmonicPad();
    }

    private updateLayerVolumes(): void {
        const now = this.ctx.currentTime;
        const fadeTime = 0.5;

        // Base rhythm layer
        let rhythmVol = 0;
        if (this.gameState.phase === 'live_play') {
            rhythmVol = 0.3 + this.gameState.momentum * 0.3;
        } else if (this.gameState.phase === 'score') {
            rhythmVol = 0.6;
        }
        this.fadeLayerTo(this.baseRhythmLayer, rhythmVol, now, fadeTime);

        // Harmonic pad layer
        let padVol = 0;
        if (this.gameState.phase === 'pre_pull') {
            padVol = 0.3;
        } else if (this.gameState.phase === 'live_play') {
            padVol = 0.2;
        } else if (this.gameState.phase === 'score') {
            padVol = 0.4;
        }
        this.fadeLayerTo(this.harmonicPadLayer, padVol, now, fadeTime);

        // Melodic layer
        let melodyVol = 0;
        if (this.gameState.phase === 'live_play' && this.gameState.stallCount > 5) {
            melodyVol = 0.25;
        } else if (this.gameState.phase === 'score') {
            melodyVol = 0.3;
        }
        this.fadeLayerTo(this.melodicLayer, melodyVol, now, fadeTime);
    }

    private fadeLayerTo(layer: Layer, targetVolume: number, startTime: number, duration: number): void {
        layer.gain.gain.cancelScheduledValues(startTime);
        layer.gain.gain.setValueAtTime(layer.gain.gain.value, startTime);
        layer.gain.gain.linearRampToValueAtTime(targetVolume, startTime + duration);
    }

    setVolume(volume: number): void {
        const clamped = Math.max(0, Math.min(1, volume));
        this.masterGain.gain.value = clamped * 0.3;
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastUpdateTime = this.ctx.currentTime;
        this.currentTime = 0;

        // Start with pre_pull state
        this.setGameState({ phase: 'pre_pull' });
    }

    stop(): void {
        if (!this.isRunning) return;
        this.isRunning = false;

        // Stop all layers
        this.stopLayer(this.baseRhythmLayer);
        this.stopLayer(this.harmonicPadLayer);
        this.stopLayer(this.melodicLayer);
        this.stopLayer(this.intensityStingerLayer);

        // Fade out master
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.linearRampToValueAtTime(0, now + 0.5);
    }

    private stopLayer(layer: Layer): void {
        layer.sources.forEach(source => {
            if ('stop' in source && typeof source.stop === 'function') {
                try {
                    source.stop();
                } catch (_) {
                    // already stopped
                }
            }
        });
        layer.sources.clear();
    }

    update(dt: number): void {
        if (!this.isRunning) return;

        this.currentTime += dt;

        // Smoothly adjust BPM
        const bpmDiff = this.targetBPM - this.currentBPM;
        this.currentBPM += bpmDiff * dt * 2; // Smooth transition

        const beatInterval = 60 / this.currentBPM;

        // Schedule rhythm elements
        if (this.baseRhythmLayer.gain.gain.value > 0.01) {
            // Kick on beats 1 and 3
            if (this.currentTime - this.lastKickTime >= beatInterval) {
                this.scheduleKick(this.baseRhythmLayer);
                this.lastKickTime = this.currentTime;
            }

            // Hi-hat on 8th notes
            if (this.currentTime - this.lastHiHatTime >= beatInterval / 2) {
                this.scheduleHiHat(this.baseRhythmLayer);
                this.lastHiHatTime = this.currentTime;
            }
        }

        // Schedule melody
        if (this.melodicLayer.gain.gain.value > 0.01) {
            if (this.currentTime - this.lastMelodyTime >= beatInterval / 2) {
                this.scheduleMelodyNote(this.melodicLayer);
                this.lastMelodyTime = this.currentTime;
            }
        }
    }
}
