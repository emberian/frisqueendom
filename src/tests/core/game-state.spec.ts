import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameState } from '../../core/GameState';

describe('GameState', () => {
    let state: GameState;

    beforeEach(() => {
        state = new GameState();
    });

    describe('initial state', () => {
        it('starts in menu mode', () => {
            expect(state.mode).toBe('menu');
        });

        it('starts unpaused', () => {
            expect(state.isPaused).toBe(false);
        });

        it('starts not spectating', () => {
            expect(state.isSpectator).toBe(false);
        });

        it('has pre_pull phase', () => {
            expect(state.match.phase).toBe('pre_pull');
        });

        it('has zero score', () => {
            expect(state.match.score).toEqual([0, 0]);
        });

        it('has midday environment', () => {
            expect(state.environment.timeOfDay).toBe('midday');
            expect(state.environment.weather).toBe('clear');
        });
    });

    describe('setScore', () => {
        it('updates score', () => {
            state.setScore(3, 5);
            expect(state.match.score).toEqual([3, 5]);
        });

        it('notifies subscribers', () => {
            const fn = vi.fn();
            state.subscribe('match.score', fn);
            state.setScore(1, 0);
            expect(fn).toHaveBeenCalledOnce();
        });
    });

    describe('setPhase', () => {
        it('updates phase', () => {
            state.setPhase('live_play');
            expect(state.match.phase).toBe('live_play');
        });

        it('notifies subscribers', () => {
            const fn = vi.fn();
            state.subscribe('match.phase', fn);
            state.setPhase('pulling');
            expect(fn).toHaveBeenCalledOnce();
        });
    });

    describe('setMode', () => {
        it('updates mode', () => {
            state.setMode('quick_match');
            expect(state.mode).toBe('quick_match');
        });

        it('notifies subscribers', () => {
            const fn = vi.fn();
            state.subscribe('mode', fn);
            state.setMode('career_match');
            expect(fn).toHaveBeenCalledOnce();
        });
    });

    describe('setPaused', () => {
        it('updates pause state', () => {
            state.setPaused(true);
            expect(state.isPaused).toBe(true);
            state.setPaused(false);
            expect(state.isPaused).toBe(false);
        });

        it('notifies subscribers', () => {
            const fn = vi.fn();
            state.subscribe('isPaused', fn);
            state.setPaused(true);
            expect(fn).toHaveBeenCalledOnce();
        });
    });

    describe('subscribe', () => {
        it('returns an unsubscribe function', () => {
            const fn = vi.fn();
            const unsub = state.subscribe('match.score', fn);
            state.setScore(1, 0);
            expect(fn).toHaveBeenCalledOnce();
            unsub();
            state.setScore(2, 0);
            expect(fn).toHaveBeenCalledOnce(); // not called again
        });

        it('supports multiple subscribers for same path', () => {
            const fn1 = vi.fn();
            const fn2 = vi.fn();
            state.subscribe('match.phase', fn1);
            state.subscribe('match.phase', fn2);
            state.setPhase('score');
            expect(fn1).toHaveBeenCalledOnce();
            expect(fn2).toHaveBeenCalledOnce();
        });
    });

    describe('reset', () => {
        it('restores all state to defaults', () => {
            state.setMode('quick_match');
            state.setScore(10, 7);
            state.setPhase('live_play');
            state.isPaused = true;
            state.isSpectator = true;
            state.isCareerMatch = true;
            state.matchElapsedSeconds = 300;

            state.reset();

            expect(state.mode).toBe('menu');
            expect(state.isPaused).toBe(false);
            expect(state.isSpectator).toBe(false);
            expect(state.match.score).toEqual([0, 0]);
            expect(state.match.phase).toBe('pre_pull');
            expect(state.isCareerMatch).toBe(false);
            expect(state.matchElapsedSeconds).toBe(0);
        });
    });

    describe('environment', () => {
        it('can update environment state', () => {
            state.environment = {
                timeOfDay: 'night',
                weather: 'rain',
                venue: 'stadium',
                windSpeed: 8.0,
                windDirection: 3.14,
            };
            expect(state.environment.timeOfDay).toBe('night');
            expect(state.environment.weather).toBe('rain');
            expect(state.environment.windSpeed).toBe(8.0);
        });
    });

    describe('team config', () => {
        it('can update team names and colors', () => {
            state.homeTeam.name = 'Thunder';
            state.homeTeam.primaryColor = 0xff0000;
            state.awayTeam.name = 'Lightning';
            state.awayTeam.primaryColor = 0x0000ff;

            expect(state.homeTeam.name).toBe('Thunder');
            expect(state.awayTeam.name).toBe('Lightning');
        });
    });
});
