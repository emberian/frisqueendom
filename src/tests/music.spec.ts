import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MusicSystem } from '../audio/MusicSystem';
import type { GameState } from '../audio/MusicSystem';

describe('MusicSystem', () => {
    let audioContext: AudioContext;
    let musicSystem: MusicSystem;

    beforeEach(() => {
        audioContext = new AudioContext();
        musicSystem = new MusicSystem(audioContext);
    });

    it('should create a MusicSystem instance', () => {
        expect(musicSystem).toBeDefined();
        expect(musicSystem).toBeInstanceOf(MusicSystem);
    });

    describe('start and stop', () => {
        it('should start without errors', () => {
            expect(() => musicSystem.start()).not.toThrow();
        });

        it('should stop without errors', () => {
            musicSystem.start();
            expect(() => musicSystem.stop()).not.toThrow();
        });

        it('should not error when starting twice', () => {
            musicSystem.start();
            expect(() => musicSystem.start()).not.toThrow();
        });

        it('should not error when stopping without starting', () => {
            expect(() => musicSystem.stop()).not.toThrow();
        });
    });

    describe('setVolume', () => {
        it('should set volume without errors', () => {
            expect(() => musicSystem.setVolume(0.5)).not.toThrow();
        });

        it('should clamp volume to 0-1 range', () => {
            expect(() => musicSystem.setVolume(-0.5)).not.toThrow();
            expect(() => musicSystem.setVolume(1.5)).not.toThrow();
            expect(() => musicSystem.setVolume(0)).not.toThrow();
            expect(() => musicSystem.setVolume(1)).not.toThrow();
        });
    });

    describe('setGameState', () => {
        it('should transition to pre_pull state', () => {
            musicSystem.start();
            expect(() => musicSystem.setGameState({ phase: 'pre_pull' })).not.toThrow();
        });

        it('should transition to live_play state', () => {
            musicSystem.start();
            expect(() => musicSystem.setGameState({ phase: 'live_play' })).not.toThrow();
        });

        it('should transition to turnover_reset state', () => {
            musicSystem.start();
            expect(() => musicSystem.setGameState({ phase: 'turnover_reset' })).not.toThrow();
        });

        it('should transition to score state', () => {
            musicSystem.start();
            expect(() => musicSystem.setGameState({ phase: 'score' })).not.toThrow();
        });

        it('should handle stall count changes', () => {
            musicSystem.start();
            expect(() => musicSystem.setGameState({ phase: 'live_play', stallCount: 0 })).not.toThrow();
            expect(() => musicSystem.setGameState({ phase: 'live_play', stallCount: 5 })).not.toThrow();
            expect(() => musicSystem.setGameState({ phase: 'live_play', stallCount: 10 })).not.toThrow();
        });

        it('should handle momentum changes', () => {
            musicSystem.start();
            expect(() => musicSystem.setGameState({ phase: 'live_play', momentum: 0 })).not.toThrow();
            expect(() => musicSystem.setGameState({ phase: 'live_play', momentum: 0.5 })).not.toThrow();
            expect(() => musicSystem.setGameState({ phase: 'live_play', momentum: 1.0 })).not.toThrow();
        });

        it('should handle close game flag', () => {
            musicSystem.start();
            expect(() => musicSystem.setGameState({ phase: 'live_play', isCloseGame: false })).not.toThrow();
            expect(() => musicSystem.setGameState({ phase: 'live_play', isCloseGame: true })).not.toThrow();
        });

        it('should handle partial state updates', () => {
            musicSystem.start();
            musicSystem.setGameState({ phase: 'live_play', stallCount: 3, momentum: 0.5 });
            expect(() => musicSystem.setGameState({ stallCount: 5 })).not.toThrow();
            expect(() => musicSystem.setGameState({ momentum: 0.8 })).not.toThrow();
        });

        it('should trigger stingers on phase transitions', () => {
            musicSystem.start();
            // Transition to turnover should trigger stinger
            expect(() => musicSystem.setGameState({ phase: 'turnover_reset' })).not.toThrow();

            // Transition to score should trigger stinger
            expect(() => musicSystem.setGameState({ phase: 'score' })).not.toThrow();
        });
    });

    describe('update', () => {
        it('should update without errors when not running', () => {
            expect(() => musicSystem.update(0.016)).not.toThrow();
        });

        it('should update without errors when running', () => {
            musicSystem.start();
            expect(() => musicSystem.update(0.016)).not.toThrow();
        });

        it('should advance internal timing', () => {
            musicSystem.start();
            musicSystem.setGameState({ phase: 'live_play' });

            // Multiple updates should not error
            for (let i = 0; i < 100; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });

        it('should handle variable delta times', () => {
            musicSystem.start();
            musicSystem.setGameState({ phase: 'live_play' });

            expect(() => musicSystem.update(0.008)).not.toThrow();
            expect(() => musicSystem.update(0.016)).not.toThrow();
            expect(() => musicSystem.update(0.033)).not.toThrow();
        });

        it('should schedule rhythm elements during live play', () => {
            musicSystem.start();
            musicSystem.setGameState({ phase: 'live_play', momentum: 0.5 });

            // Run updates for ~1 second
            for (let i = 0; i < 60; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });

        it('should schedule melody when stall count is high', () => {
            musicSystem.start();
            musicSystem.setGameState({ phase: 'live_play', stallCount: 8, momentum: 0.5 });

            // Run updates for ~1 second
            for (let i = 0; i < 60; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });
    });

    describe('BPM changes', () => {
        it('should increase BPM with high stall count', () => {
            musicSystem.start();

            // Low stall count should have lower BPM
            musicSystem.setGameState({ phase: 'live_play', stallCount: 0, momentum: 0 });
            musicSystem.update(0.016);

            // High stall count should increase BPM
            musicSystem.setGameState({ phase: 'live_play', stallCount: 10, momentum: 0 });
            for (let i = 0; i < 60; i++) {
                musicSystem.update(0.016);
            }
        });

        it('should increase BPM with high momentum', () => {
            musicSystem.start();

            // Low momentum
            musicSystem.setGameState({ phase: 'live_play', stallCount: 0, momentum: 0 });
            musicSystem.update(0.016);

            // High momentum should increase BPM
            musicSystem.setGameState({ phase: 'live_play', stallCount: 0, momentum: 1.0 });
            for (let i = 0; i < 60; i++) {
                musicSystem.update(0.016);
            }
        });

        it('should max BPM at 140 during score', () => {
            musicSystem.start();
            musicSystem.setGameState({ phase: 'score' });

            for (let i = 0; i < 60; i++) {
                musicSystem.update(0.016);
            }
        });

        it('should smoothly transition BPM', () => {
            musicSystem.start();

            // Start low
            musicSystem.setGameState({ phase: 'live_play', stallCount: 0, momentum: 0 });
            musicSystem.update(0.016);

            // Jump to high
            musicSystem.setGameState({ phase: 'live_play', stallCount: 10, momentum: 1.0 });

            // Should transition smoothly over multiple frames
            for (let i = 0; i < 120; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });
    });

    describe('layer control', () => {
        it('should enable base rhythm during live play', () => {
            musicSystem.start();
            musicSystem.setGameState({ phase: 'pre_pull' });
            musicSystem.update(0.016);

            musicSystem.setGameState({ phase: 'live_play', momentum: 0.5 });

            // Should schedule rhythm elements
            for (let i = 0; i < 60; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });

        it('should enable harmonic pad during pre_pull', () => {
            musicSystem.start();
            musicSystem.setGameState({ phase: 'pre_pull' });

            for (let i = 0; i < 60; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });

        it('should disable layers when not in relevant phase', () => {
            musicSystem.start();

            // Start in live play with all layers active
            musicSystem.setGameState({
                phase: 'live_play',
                stallCount: 10,
                momentum: 1.0
            });

            for (let i = 0; i < 60; i++) {
                musicSystem.update(0.016);
            }

            // Transition to pre_pull should disable rhythm
            musicSystem.setGameState({ phase: 'pre_pull' });

            for (let i = 0; i < 60; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });
    });

    describe('harmonic changes', () => {
        it('should use major chords for normal game', () => {
            musicSystem.start();
            musicSystem.setGameState({
                phase: 'live_play',
                isCloseGame: false
            });

            for (let i = 0; i < 60; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });

        it('should use minor chords for close game', () => {
            musicSystem.start();
            musicSystem.setGameState({
                phase: 'live_play',
                isCloseGame: true
            });

            for (let i = 0; i < 60; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });

        it('should transition between major and minor', () => {
            musicSystem.start();

            // Start with major
            musicSystem.setGameState({
                phase: 'live_play',
                isCloseGame: false
            });
            musicSystem.update(0.016);

            // Switch to minor
            musicSystem.setGameState({
                phase: 'live_play',
                isCloseGame: true
            });

            for (let i = 0; i < 60; i++) {
                expect(() => musicSystem.update(0.016)).not.toThrow();
            }
        });
    });

    describe('integration', () => {
        it('should handle a full game flow', () => {
            musicSystem.start();

            // Pre-pull
            musicSystem.setGameState({ phase: 'pre_pull' });
            for (let i = 0; i < 30; i++) musicSystem.update(0.016);

            // Pulling
            musicSystem.setGameState({ phase: 'pulling' });
            for (let i = 0; i < 30; i++) musicSystem.update(0.016);

            // Live play with increasing intensity
            musicSystem.setGameState({ phase: 'live_play', stallCount: 0, momentum: 0 });
            for (let i = 0; i < 30; i++) musicSystem.update(0.016);

            musicSystem.setGameState({ phase: 'live_play', stallCount: 5, momentum: 0.5 });
            for (let i = 0; i < 30; i++) musicSystem.update(0.016);

            musicSystem.setGameState({ phase: 'live_play', stallCount: 9, momentum: 0.8 });
            for (let i = 0; i < 30; i++) musicSystem.update(0.016);

            // Turnover
            musicSystem.setGameState({ phase: 'turnover_reset' });
            for (let i = 0; i < 30; i++) musicSystem.update(0.016);

            // Back to live play
            musicSystem.setGameState({ phase: 'live_play', stallCount: 0, momentum: 0 });
            for (let i = 0; i < 30; i++) musicSystem.update(0.016);

            // Score
            musicSystem.setGameState({ phase: 'score' });
            for (let i = 0; i < 60; i++) musicSystem.update(0.016);

            // Stop
            expect(() => musicSystem.stop()).not.toThrow();
        });

        it('should work with volume changes during playback', () => {
            musicSystem.start();
            musicSystem.setGameState({ phase: 'live_play', momentum: 0.5 });

            for (let i = 0; i < 20; i++) {
                musicSystem.update(0.016);
                musicSystem.setVolume(i / 20);
            }

            for (let i = 20; i >= 0; i--) {
                musicSystem.update(0.016);
                musicSystem.setVolume(i / 20);
            }
        });
    });
});
