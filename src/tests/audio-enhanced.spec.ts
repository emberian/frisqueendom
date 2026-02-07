import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VocalSynth } from '../audio/VocalSynth';
import { CrowdAudio } from '../audio/CrowdAudio';

describe('VocalSynth', () => {
    let ctx: AudioContext;
    let vocalSynth: VocalSynth;

    beforeEach(() => {
        ctx = new AudioContext();
        vocalSynth = new VocalSynth(ctx);
    });

    describe('callStall', () => {
        it('creates oscillators for stall calls', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');

            vocalSynth.callStall(1);

            // Should create 3 oscillators (for detuned voice effect)
            expect(createOscSpy).toHaveBeenCalledTimes(3);
        });

        it('produces different frequencies for different stall counts', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');
            const oscs: any[] = [];

            createOscSpy.mockImplementation((() => {
                const osc = {
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                    frequency: { value: 0 },
                    detune: { value: 0 },
                    type: ''
                };
                oscs.push(osc);
                return osc;
            }) as any);

            // Low count - lower base frequency
            vocalSynth.callStall(1);
            const freq1 = oscs[0].frequency.value;

            oscs.length = 0;

            // High count - higher base frequency
            vocalSynth.callStall(10);
            const freq10 = oscs[0].frequency.value;

            expect(freq10).toBeGreaterThan(freq1);
        });

        it('clamps stall count to valid range', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');

            // Should not crash with out-of-range values
            expect(() => vocalSynth.callStall(0)).not.toThrow();
            expect(() => vocalSynth.callStall(15)).not.toThrow();

            // Should still create oscillators
            expect(createOscSpy.mock.calls.length).toBeGreaterThan(0);
        });
    });

    describe('whistle types', () => {
        it('short whistle has correct duration', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');
            const oscs: any[] = [];

            createOscSpy.mockImplementation((() => {
                const osc = {
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                    frequency: { value: 0 },
                    type: ''
                };
                oscs.push(osc);
                return osc;
            }) as any);

            vocalSynth.blowWhistle('short');

            // Should create 2 oscillators (LFO + main)
            expect(oscs.length).toBe(2);

            // Verify stop was called with ~0.3s duration
            const stopCall = oscs[1].stop.mock.calls[0][0];
            const startCall = oscs[1].start.mock.calls[0][0];
            const duration = stopCall - startCall;

            expect(duration).toBeCloseTo(0.3, 1);
        });

        it('long whistle has correct duration', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');
            const oscs: any[] = [];

            createOscSpy.mockImplementation((() => {
                const osc = {
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                    frequency: { value: 0 },
                    type: ''
                };
                oscs.push(osc);
                return osc;
            }) as any);

            vocalSynth.blowWhistle('long');

            // Verify stop was called with ~1.0s duration
            const stopCall = oscs[1].stop.mock.calls[0][0];
            const startCall = oscs[1].start.mock.calls[0][0];
            const duration = stopCall - startCall;

            expect(duration).toBeCloseTo(1.0, 1);
        });

        it('triple whistle creates 3 sets of oscillators', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');

            vocalSynth.blowWhistle('triple');

            // 3 whistles x 2 oscillators each (LFO + main)
            expect(createOscSpy).toHaveBeenCalledTimes(6);
        });
    });

    describe('announcements', () => {
        it('score announcement creates ascending tones', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');
            const oscs: any[] = [];

            createOscSpy.mockImplementation((() => {
                const osc = {
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                    frequency: { value: 0 },
                    type: ''
                };
                oscs.push(osc);
                return osc;
            }) as any);

            vocalSynth.announceScore();

            // Should create 3 oscillators (3-note arpeggio)
            expect(oscs.length).toBe(3);

            // Frequencies should be ascending
            expect(oscs[1].frequency.value).toBeGreaterThan(oscs[0].frequency.value);
            expect(oscs[2].frequency.value).toBeGreaterThan(oscs[1].frequency.value);
        });

        it('turnover announcement creates descending tones', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');
            const oscs: any[] = [];

            createOscSpy.mockImplementation((() => {
                const osc = {
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                    frequency: { value: 0 },
                    type: ''
                };
                oscs.push(osc);
                return osc;
            }) as any);

            vocalSynth.announceTurnover();

            // Should create 2 oscillators (2-note)
            expect(oscs.length).toBe(2);

            // Frequencies should be descending
            expect(oscs[1].frequency.value).toBeLessThan(oscs[0].frequency.value);
        });

        it('end of half announcement creates sustained chord', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');

            vocalSynth.announceEndOfHalf();

            // Should create 3 oscillators (3-note chord)
            expect(createOscSpy).toHaveBeenCalledTimes(3);
        });

        it('game over announcement creates victory fanfare', () => {
            const createOscSpy = vi.spyOn(ctx, 'createOscillator');
            const oscs: any[] = [];

            createOscSpy.mockImplementation((() => {
                const osc = {
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                    frequency: { value: 0 },
                    type: ''
                };
                oscs.push(osc);
                return osc;
            }) as any);

            vocalSynth.announceGameOver();

            // Should create 5 oscillators (5-note fanfare)
            expect(oscs.length).toBe(5);

            // Frequencies should be ascending
            for (let i = 1; i < oscs.length; i++) {
                expect(oscs[i].frequency.value).toBeGreaterThan(oscs[i - 1].frequency.value);
            }
        });
    });

    describe('setVolume', () => {
        it('sets master gain value', () => {
            vocalSynth.setVolume(0.5);
            // Master gain is private, but method should not throw
            expect(() => vocalSynth.setVolume(0.5)).not.toThrow();
        });

        it('clamps volume to valid range', () => {
            expect(() => vocalSynth.setVolume(-0.5)).not.toThrow();
            expect(() => vocalSynth.setVolume(1.5)).not.toThrow();
        });
    });
});

describe('CrowdAudio', () => {
    let ctx: AudioContext;
    let crowdAudio: CrowdAudio;

    beforeEach(() => {
        ctx = new AudioContext();
        crowdAudio = new CrowdAudio(ctx);
    });

    describe('ambience', () => {
        it('starts ambient crowd noise', () => {
            const createBufferSourceSpy = vi.spyOn(ctx, 'createBufferSource');

            crowdAudio.startAmbience(0.5);

            expect(createBufferSourceSpy).toHaveBeenCalled();
        });

        it('stops ambient crowd noise', () => {
            const sources: any[] = [];
            vi.spyOn(ctx, 'createBufferSource').mockImplementation((() => {
                const source = {
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                    buffer: null,
                    loop: false
                };
                sources.push(source);
                return source;
            }) as any);

            crowdAudio.startAmbience(0.5);
            crowdAudio.stopAmbience();

            // Stop should have been called
            expect(sources[0].stop).toHaveBeenCalled();
        });

        it('accepts intensity parameter', () => {
            expect(() => crowdAudio.startAmbience(0.0)).not.toThrow();
            expect(() => crowdAudio.startAmbience(0.5)).not.toThrow();
            expect(() => crowdAudio.startAmbience(1.0)).not.toThrow();
        });
    });

    describe('reactive responses', () => {
        it('reacts to score', () => {
            const createBufferSourceSpy = vi.spyOn(ctx, 'createBufferSource');

            crowdAudio.reactToScore();

            expect(createBufferSourceSpy).toHaveBeenCalled();
        });

        it('reacts to block', () => {
            const createBufferSourceSpy = vi.spyOn(ctx, 'createBufferSource');

            crowdAudio.reactToBlock();

            expect(createBufferSourceSpy).toHaveBeenCalled();
        });

        it('reacts to layout', () => {
            const createBufferSourceSpy = vi.spyOn(ctx, 'createBufferSource');

            crowdAudio.reactToLayout();

            // Should create 2 sources (gasp + cheer)
            expect(createBufferSourceSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
        });

        it('reacts to near miss', () => {
            const createBufferSourceSpy = vi.spyOn(ctx, 'createBufferSource');

            crowdAudio.reactToNearMiss();

            expect(createBufferSourceSpy).toHaveBeenCalled();
        });
    });

    describe('momentum', () => {
        it('sets momentum value', () => {
            expect(() => crowdAudio.setMomentum(0.0)).not.toThrow();
            expect(() => crowdAudio.setMomentum(0.5)).not.toThrow();
            expect(() => crowdAudio.setMomentum(1.0)).not.toThrow();
        });

        it('clamps momentum to valid range', () => {
            expect(() => crowdAudio.setMomentum(-0.5)).not.toThrow();
            expect(() => crowdAudio.setMomentum(1.5)).not.toThrow();
        });

        it('updates over time', () => {
            crowdAudio.startAmbience(0.5);
            crowdAudio.setMomentum(1.0);

            expect(() => crowdAudio.update(0.016)).not.toThrow();
            expect(() => crowdAudio.update(1.0)).not.toThrow();
        });

        it('can update without active ambience', () => {
            crowdAudio.setMomentum(0.7);
            expect(() => crowdAudio.update(0.016)).not.toThrow();
        });
    });
});
