import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import {
    ReplayRecorder,
    saveReplay,
    loadReplay,
    listReplays,
    deleteReplay,
    type ReplayData,
    type MatchSettings,
    type PlayerInputEventData,
    type MatchPhaseChangeEventData,
    type DiscThrowEventData,
} from '../gameplay/Replay';
import { ReplayPlayer } from '../gameplay/ReplayPlayer';
import type { ThrowParams } from '../data/Types';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        key: (index: number) => {
            const keys = Object.keys(store);
            return keys[index] || null;
        },
        get length() {
            return Object.keys(store).length;
        },
    };
})();

// Replace global localStorage
Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true,
});

// Helper to create test throw params
function createTestThrowParams(): ThrowParams {
    return {
        position: new THREE.Vector3(0, 1, 50),
        direction: new THREE.Vector3(0, 0, 1),
        speed: 15,
        spinRate: 30,
        noseAngle: 0.05,
        hyzerAngle: 0,
        releaseHeight: 1.5,
        offAxis: 0,
        isForehand: false,
    };
}

describe('ReplayRecorder', () => {
    let recorder: ReplayRecorder;
    let mockPerformanceNow: number;

    beforeEach(() => {
        recorder = new ReplayRecorder();
        mockPerformanceNow = 0;

        // Mock performance.now()
        vi.spyOn(performance, 'now').mockImplementation(() => mockPerformanceNow);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('recording lifecycle', () => {
        it('should start not recording', () => {
            expect(recorder.recording()).toBe(false);
        });

        it('should start recording when start is called', () => {
            const settings: MatchSettings = {
                gameTo: 11,
                homeTeam: 'home',
                awayTeam: 'away',
            };
            recorder.start(12345, { home: 'Team A', away: 'Team B' }, settings);
            expect(recorder.recording()).toBe(true);
        });

        it('should stop recording when stop is called', () => {
            const settings: MatchSettings = {
                gameTo: 11,
                homeTeam: 'home',
                awayTeam: 'away',
            };
            recorder.start(12345, { home: 'Team A', away: 'Team B' }, settings);
            recorder.stop();
            expect(recorder.recording()).toBe(false);
        });

        it('should record match_start event on start', () => {
            const settings: MatchSettings = {
                gameTo: 11,
                homeTeam: 'home',
                awayTeam: 'away',
            };
            recorder.start(12345, { home: 'Team A', away: 'Team B' }, settings);
            const data = recorder.getData();
            expect(data.events.length).toBeGreaterThan(0);
            expect(data.events[0].type).toBe('match_start');
        });

        it('should record match_end event on stop', () => {
            const settings: MatchSettings = {
                gameTo: 11,
                homeTeam: 'home',
                awayTeam: 'away',
            };
            recorder.start(12345, { home: 'Team A', away: 'Team B' }, settings);
            recorder.stop();
            const data = recorder.getData();
            expect(data.events[data.events.length - 1].type).toBe('match_end');
        });

        it('should not record events when not recording', () => {
            recorder.recordPlayerInput('p1', 'home', { x: 0, z: 1 }, false);
            const data = recorder.getData();
            expect(data.events.length).toBe(0);
        });
    });

    describe('event recording', () => {
        beforeEach(() => {
            const settings: MatchSettings = {
                gameTo: 11,
                homeTeam: 'home',
                awayTeam: 'away',
            };
            recorder.start(12345, { home: 'Team A', away: 'Team B' }, settings);
        });

        it('should record player input events', () => {
            mockPerformanceNow = 1000;
            recorder.recordPlayerInput('p1', 'home', { x: 0.5, z: 0.8 }, true);

            const data = recorder.getData();
            const inputEvents = data.events.filter((e) => e.type === 'player_input');
            expect(inputEvents.length).toBe(1);

            const eventData = inputEvents[0].data as PlayerInputEventData;
            expect(eventData.playerId).toBe('p1');
            expect(eventData.team).toBe('home');
            expect(eventData.movement.x).toBe(0.5);
            expect(eventData.movement.z).toBe(0.8);
            expect(eventData.sprint).toBe(true);
        });

        it('should record phase change events', () => {
            mockPerformanceNow = 2000;
            recorder.recordPhaseChange('pre_pull', 'pulling', [0, 0]);

            const data = recorder.getData();
            const phaseEvents = data.events.filter((e) => e.type === 'match_phase_change');
            expect(phaseEvents.length).toBe(1);

            const eventData = phaseEvents[0].data as MatchPhaseChangeEventData;
            expect(eventData.fromPhase).toBe('pre_pull');
            expect(eventData.toPhase).toBe('pulling');
            expect(eventData.score).toEqual([0, 0]);
        });

        it('should record throw events', () => {
            mockPerformanceNow = 3000;
            const throwParams = createTestThrowParams();
            recorder.recordThrow('p1', 'home', throwParams);

            const data = recorder.getData();
            const throwEvents = data.events.filter((e) => e.type === 'disc_throw');
            expect(throwEvents.length).toBe(1);

            const eventData = throwEvents[0].data as DiscThrowEventData;
            expect(eventData.throwerId).toBe('p1');
            expect(eventData.team).toBe('home');
            expect(eventData.throwParams.speed).toBe(15);
        });

        it('should record catch events', () => {
            mockPerformanceNow = 4000;
            recorder.recordCatch('p2', 'away', { x: 5, y: 1.5, z: 70 });

            const data = recorder.getData();
            const catchEvents = data.events.filter((e) => e.type === 'disc_catch');
            expect(catchEvents.length).toBe(1);
        });

        it('should record turnover events', () => {
            mockPerformanceNow = 5000;
            recorder.recordTurnover('incomplete', { x: 10, y: 0, z: 60 });

            const data = recorder.getData();
            const turnoverEvents = data.events.filter((e) => e.type === 'disc_turnover');
            expect(turnoverEvents.length).toBe(1);
        });

        it('should record score events', () => {
            mockPerformanceNow = 6000;
            recorder.recordScore('p3', 'home', [1, 0]);

            const data = recorder.getData();
            const scoreEvents = data.events.filter((e) => e.type === 'disc_score');
            expect(scoreEvents.length).toBe(1);
        });
    });

    describe('timestamps', () => {
        it('should record events with correct timestamps', () => {
            const settings: MatchSettings = {
                gameTo: 11,
                homeTeam: 'home',
                awayTeam: 'away',
            };

            mockPerformanceNow = 1000;
            recorder.start(12345, { home: 'Team A', away: 'Team B' }, settings);

            mockPerformanceNow = 2500; // 1.5 seconds later
            recorder.recordPlayerInput('p1', 'home', { x: 0, z: 1 }, false);

            mockPerformanceNow = 5000; // 4 seconds from start
            recorder.recordThrow('p1', 'home', createTestThrowParams());

            const data = recorder.getData();
            const events = data.events.filter((e) => e.type !== 'match_start');

            expect(events[0].timestamp).toBeCloseTo(1.5, 2);
            expect(events[1].timestamp).toBeCloseTo(4.0, 2);
        });

        it('should maintain chronological order of events', () => {
            const settings: MatchSettings = {
                gameTo: 11,
                homeTeam: 'home',
                awayTeam: 'away',
            };

            mockPerformanceNow = 0;
            recorder.start(12345, { home: 'Team A', away: 'Team B' }, settings);

            for (let i = 0; i < 10; i++) {
                mockPerformanceNow = i * 100;
                recorder.recordPlayerInput('p1', 'home', { x: 0, z: 1 }, false);
            }

            const data = recorder.getData();
            for (let i = 1; i < data.events.length; i++) {
                expect(data.events[i].timestamp).toBeGreaterThanOrEqual(
                    data.events[i - 1].timestamp,
                );
            }
        });
    });

    describe('getData', () => {
        it('should return complete replay data', () => {
            const settings: MatchSettings = {
                gameTo: 15,
                homeTeam: 'home',
                awayTeam: 'away',
            };

            recorder.start(99999, { home: 'Home Team', away: 'Away Team' }, settings);
            mockPerformanceNow = 10000;
            recorder.recordPlayerInput('p1', 'home', { x: 0, z: 1 }, false);

            const data = recorder.getData();

            expect(data.version).toBe('1.1.0');
            expect(data.matchSeed).toBe(99999);
            expect(data.teamNames.home).toBe('Home Team');
            expect(data.teamNames.away).toBe('Away Team');
            expect(data.matchSettings.gameTo).toBe(15);
            expect(data.events.length).toBeGreaterThan(0);
            expect(data.recordedAt).toBeTruthy();
        });

        it('should calculate duration from last event', () => {
            const settings: MatchSettings = {
                gameTo: 11,
                homeTeam: 'home',
                awayTeam: 'away',
            };

            mockPerformanceNow = 0;
            recorder.start(12345, { home: 'Team A', away: 'Team B' }, settings);

            mockPerformanceNow = 5000;
            recorder.recordPlayerInput('p1', 'home', { x: 0, z: 1 }, false);

            const data = recorder.getData();
            expect(data.duration).toBeCloseTo(5.0, 1);
        });
    });
});

describe('Replay storage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    describe('saveReplay', () => {
        it('should save replay to localStorage', () => {
            const replayData: ReplayData = {
                version: '1.0.0',
                matchSeed: 12345,
                events: [],
                snapshots: [],
                teamNames: { home: 'Team A', away: 'Team B' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: new Date().toISOString(),
                duration: 120,
            };

            const key = saveReplay(replayData);
            expect(key).toBeTruthy();
            expect(key.startsWith('frisqueendom_replay_')).toBe(true);
        });

        it('should return unique keys for multiple saves', () => {
            const replayData: ReplayData = {
                version: '1.0.0',
                matchSeed: 12345,
                events: [],
                snapshots: [],
                teamNames: { home: 'Team A', away: 'Team B' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: new Date().toISOString(),
                duration: 120,
            };

            const key1 = saveReplay(replayData);
            const key2 = saveReplay(replayData);

            expect(key1).not.toBe(key2);
        });
    });

    describe('loadReplay', () => {
        it('should load saved replay', () => {
            const replayData: ReplayData = {
                version: '1.0.0',
                matchSeed: 12345,
                events: [],
                snapshots: [],
                teamNames: { home: 'Team A', away: 'Team B' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: new Date().toISOString(),
                duration: 120,
            };

            const key = saveReplay(replayData);
            const loaded = loadReplay(key);

            expect(loaded).toBeTruthy();
            expect(loaded?.matchSeed).toBe(12345);
            expect(loaded?.teamNames.home).toBe('Team A');
        });

        it('should return null for non-existent key', () => {
            const loaded = loadReplay('frisqueendom_replay_nonexistent');
            expect(loaded).toBeNull();
        });

        it('should preserve all replay data', () => {
            const replayData: ReplayData = {
                version: '1.0.0',
                matchSeed: 99999,
                events: [
                    { timestamp: 0, type: 'match_start', data: {} },
                    { timestamp: 1.5, type: 'player_input', data: {} },
                ],
                snapshots: [],
                teamNames: { home: 'Home', away: 'Away' },
                matchSettings: { gameTo: 15, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: '2026-02-07T12:00:00Z',
                duration: 180,
            };

            const key = saveReplay(replayData);
            const loaded = loadReplay(key);

            expect(loaded?.version).toBe(replayData.version);
            expect(loaded?.matchSeed).toBe(replayData.matchSeed);
            expect(loaded?.events.length).toBe(replayData.events.length);
            expect(loaded?.duration).toBe(replayData.duration);
        });
    });

    describe('listReplays', () => {
        it('should return empty array when no replays exist', () => {
            const replays = listReplays();
            expect(replays).toEqual([]);
        });

        it('should list all saved replays', () => {
            const replay1: ReplayData = {
                version: '1.0.0',
                matchSeed: 1,
                events: [],
                snapshots: [],
                teamNames: { home: 'Team A', away: 'Team B' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: '2026-02-07T10:00:00Z',
                duration: 120,
            };

            const replay2: ReplayData = {
                version: '1.0.0',
                matchSeed: 2,
                events: [],
                snapshots: [],
                teamNames: { home: 'Team C', away: 'Team D' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: '2026-02-07T11:00:00Z',
                duration: 150,
            };

            saveReplay(replay1);
            saveReplay(replay2);

            const replays = listReplays();
            expect(replays.length).toBe(2);
        });

        it('should include team names in metadata', () => {
            const replayData: ReplayData = {
                version: '1.0.0',
                matchSeed: 1,
                events: [],
                snapshots: [],
                teamNames: { home: 'Rhinos', away: 'Tigers' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: '2026-02-07T10:00:00Z',
                duration: 120,
            };

            saveReplay(replayData);
            const replays = listReplays();

            expect(replays[0].teams).toBe('Rhinos vs Tigers');
        });

        it('should extract score from disc_score events', () => {
            const replayData: ReplayData = {
                version: '1.0.0',
                matchSeed: 1,
                events: [
                    {
                        timestamp: 10,
                        type: 'disc_score',
                        data: { scorerId: 'p1', team: 'home', score: [3, 2] },
                    },
                ],
                snapshots: [],
                teamNames: { home: 'Team A', away: 'Team B' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: '2026-02-07T10:00:00Z',
                duration: 120,
            };

            saveReplay(replayData);
            const replays = listReplays();

            expect(replays[0].score).toBe('3-2');
        });

        it('should sort replays by date, newest first', () => {
            const replay1: ReplayData = {
                version: '1.0.0',
                matchSeed: 1,
                events: [],
                snapshots: [],
                teamNames: { home: 'Old', away: 'Game' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: '2026-02-01T10:00:00Z',
                duration: 120,
            };

            const replay2: ReplayData = {
                version: '1.0.0',
                matchSeed: 2,
                events: [],
                snapshots: [],
                teamNames: { home: 'New', away: 'Game' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: '2026-02-07T11:00:00Z',
                duration: 150,
            };

            saveReplay(replay1);
            saveReplay(replay2);

            const replays = listReplays();
            expect(replays[0].teams).toBe('New vs Game');
            expect(replays[1].teams).toBe('Old vs Game');
        });
    });

    describe('deleteReplay', () => {
        it('should delete replay from localStorage', () => {
            const replayData: ReplayData = {
                version: '1.0.0',
                matchSeed: 12345,
                events: [],
                snapshots: [],
                teamNames: { home: 'Team A', away: 'Team B' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: new Date().toISOString(),
                duration: 120,
            };

            const key = saveReplay(replayData);
            expect(loadReplay(key)).toBeTruthy();

            deleteReplay(key);
            expect(loadReplay(key)).toBeNull();
        });

        it('should not throw when deleting non-existent replay', () => {
            expect(() => {
                deleteReplay('frisqueendom_replay_nonexistent');
            }).not.toThrow();
        });
    });
});

describe('ReplayPlayer', () => {
    let player: ReplayPlayer;
    let testReplay: ReplayData;

    beforeEach(() => {
        player = new ReplayPlayer();

        testReplay = {
            version: '1.0.0',
            matchSeed: 12345,
            events: [
                { timestamp: 0, type: 'match_start', data: { seed: 12345 } },
                {
                    timestamp: 1.0,
                    type: 'player_input',
                    data: { playerId: 'p1', movement: { x: 0, z: 1 } },
                },
                {
                    timestamp: 2.0,
                    type: 'disc_throw',
                    data: { throwerId: 'p1', team: 'home' },
                },
                {
                    timestamp: 3.5,
                    type: 'disc_catch',
                    data: { catcherId: 'p2', team: 'home' },
                },
                { timestamp: 5.0, type: 'match_end', data: {} },
            ],
            snapshots: [],
            teamNames: { home: 'Team A', away: 'Team B' },
            matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
            recordedAt: '2026-02-07T12:00:00Z',
            duration: 5.0,
        };
    });

    describe('loading', () => {
        it('should load replay data', () => {
            player.load(testReplay);
            expect(player.isLoaded()).toBe(true);
        });

        it('should reset state when loading new replay', () => {
            player.load(testReplay);
            player.resume();
            player.update(2.0);

            player.load(testReplay);
            const progress = player.getProgress();
            expect(progress.current).toBe(0);
        });
    });

    describe('playback control', () => {
        beforeEach(() => {
            player.load(testReplay);
        });

        it('should start paused', () => {
            expect(player.paused()).toBe(true);
        });

        it('should resume playback', () => {
            player.resume();
            expect(player.paused()).toBe(false);
        });

        it('should pause playback', () => {
            player.resume();
            player.pause();
            expect(player.paused()).toBe(true);
        });

        it('should not update when paused', () => {
            player.update(1.0);
            const progress = player.getProgress();
            expect(progress.current).toBe(0);
        });

        it('should advance time when playing', () => {
            player.resume();
            player.update(1.5);
            const progress = player.getProgress();
            expect(progress.current).toBeCloseTo(1.5, 2);
        });
    });

    describe('speed control', () => {
        beforeEach(() => {
            player.load(testReplay);
        });

        it('should have default speed of 1x', () => {
            expect(player.getSpeed()).toBe(1.0);
        });

        it('should change playback speed', () => {
            player.setSpeed(2.0);
            expect(player.getSpeed()).toBe(2.0);
        });

        it('should advance at 2x speed', () => {
            player.setSpeed(2.0);
            player.resume();
            player.update(1.0);
            const progress = player.getProgress();
            expect(progress.current).toBeCloseTo(2.0, 2);
        });

        it('should advance at 0.5x speed', () => {
            player.setSpeed(0.5);
            player.resume();
            player.update(1.0);
            const progress = player.getProgress();
            expect(progress.current).toBeCloseTo(0.5, 2);
        });

        it('should advance at 4x speed', () => {
            player.setSpeed(4.0);
            player.resume();
            player.update(0.5);
            const progress = player.getProgress();
            expect(progress.current).toBeCloseTo(2.0, 2);
        });

        it('should throw error for negative speed', () => {
            expect(() => player.setSpeed(-1)).toThrow();
        });

        it('should throw error for zero speed', () => {
            expect(() => player.setSpeed(0)).toThrow();
        });
    });

    describe('seeking', () => {
        beforeEach(() => {
            player.load(testReplay);
        });

        it('should seek to specific time', () => {
            player.seek(2.5);
            const progress = player.getProgress();
            expect(progress.current).toBeCloseTo(2.5, 2);
        });

        it('should clamp seek to start of replay', () => {
            player.seek(-5);
            const progress = player.getProgress();
            expect(progress.current).toBe(0);
        });

        it('should clamp seek to end of replay', () => {
            player.seek(100);
            const progress = player.getProgress();
            expect(progress.current).toBe(testReplay.duration);
        });

        it('should update event index when seeking', () => {
            const emittedEvents: string[] = [];
            player.onEvent('disc_throw', () => emittedEvents.push('throw'));

            player.seek(2.5);
            player.resume();
            player.update(0.1);

            // Should not re-emit throw event at 2.0
            expect(emittedEvents.length).toBe(0);
        });

        it('should emit events after seek point', () => {
            const emittedEvents: string[] = [];
            player.onEvent('disc_catch', () => emittedEvents.push('catch'));

            player.seek(3.0);
            player.resume();
            player.update(1.0);

            expect(emittedEvents.length).toBe(1);
        });
    });

    describe('event callbacks', () => {
        beforeEach(() => {
            player.load(testReplay);
        });

        it('should register event callback', () => {
            let called = false;
            player.onEvent('match_start', () => {
                called = true;
            });

            player.resume();
            player.update(0.1);

            expect(called).toBe(true);
        });

        it('should pass event data to callback', () => {
            let receivedData: unknown = null;
            player.onEvent('match_start', (data) => {
                receivedData = data;
            });

            player.resume();
            player.update(0.1);

            expect(receivedData).toEqual({ seed: 12345 });
        });

        it('should call multiple callbacks for same event type', () => {
            let count = 0;
            player.onEvent('match_start', () => count++);
            player.onEvent('match_start', () => count++);

            player.resume();
            player.update(0.1);

            expect(count).toBe(2);
        });

        it('should emit events at correct timestamps', () => {
            const emittedTypes: string[] = [];

            player.onEvent('match_start', () => emittedTypes.push('start'));
            player.onEvent('player_input', () => emittedTypes.push('input'));
            player.onEvent('disc_throw', () => emittedTypes.push('throw'));

            player.resume();
            player.update(1.5);

            expect(emittedTypes).toEqual(['start', 'input']);
        });

        it('should emit all events when time advances past multiple events', () => {
            const emittedTypes: string[] = [];

            player.onEvent('match_start', () => emittedTypes.push('start'));
            player.onEvent('player_input', () => emittedTypes.push('input'));
            player.onEvent('disc_throw', () => emittedTypes.push('throw'));
            player.onEvent('disc_catch', () => emittedTypes.push('catch'));

            player.resume();
            player.update(4.0);

            expect(emittedTypes).toEqual(['start', 'input', 'throw', 'catch']);
        });

        it('should remove callbacks for specific event type', () => {
            let called = false;
            player.onEvent('match_start', () => {
                called = true;
            });
            player.offEvent('match_start');

            player.resume();
            player.update(0.1);

            expect(called).toBe(false);
        });

        it('should clear all callbacks', () => {
            let count = 0;
            player.onEvent('match_start', () => count++);
            player.onEvent('player_input', () => count++);
            player.clearCallbacks();

            player.resume();
            player.update(2.0);

            expect(count).toBe(0);
        });

        it('should not throw if callback throws error', () => {
            player.onEvent('match_start', () => {
                throw new Error('Test error');
            });

            expect(() => {
                player.resume();
                player.update(0.1);
            }).not.toThrow();
        });
    });

    describe('progress tracking', () => {
        beforeEach(() => {
            player.load(testReplay);
        });

        it('should return correct progress', () => {
            player.resume();
            player.update(2.5);

            const progress = player.getProgress();
            expect(progress.current).toBeCloseTo(2.5, 2);
            expect(progress.total).toBe(5.0);
        });

        it('should return zero progress for unloaded replay', () => {
            const emptyPlayer = new ReplayPlayer();
            const progress = emptyPlayer.getProgress();
            expect(progress.current).toBe(0);
            expect(progress.total).toBe(0);
        });
    });

    describe('reset', () => {
        beforeEach(() => {
            player.load(testReplay);
        });

        it('should reset to beginning', () => {
            player.resume();
            player.update(3.0);
            player.reset();

            const progress = player.getProgress();
            expect(progress.current).toBe(0);
        });

        it('should pause on reset', () => {
            player.resume();
            player.update(1.0);
            player.reset();

            expect(player.paused()).toBe(true);
        });

        it('should re-emit events after reset', () => {
            const emittedTypes: string[] = [];
            player.onEvent('match_start', () => emittedTypes.push('start'));

            player.resume();
            player.update(1.0);
            player.reset();

            emittedTypes.length = 0; // Clear array
            player.resume();
            player.update(0.1);

            expect(emittedTypes).toEqual(['start']);
        });
    });

    describe('end detection', () => {
        beforeEach(() => {
            player.load(testReplay);
        });

        it('should detect when replay has ended', () => {
            player.resume();
            player.update(10.0); // Beyond duration

            expect(player.isAtEnd()).toBe(true);
        });

        it('should auto-pause at end', () => {
            player.resume();
            player.update(10.0);

            expect(player.paused()).toBe(true);
        });

        it('should not be at end initially', () => {
            expect(player.isAtEnd()).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle empty replay', () => {
            const emptyReplay: ReplayData = {
                version: '1.0.0',
                matchSeed: 0,
                events: [],
                snapshots: [],
                teamNames: { home: 'A', away: 'B' },
                matchSettings: { gameTo: 11, homeTeam: 'home', awayTeam: 'away' },
                recordedAt: '2026-02-07T12:00:00Z',
                duration: 0,
            };

            player.load(emptyReplay);
            player.resume();
            player.update(1.0);

            expect(player.isAtEnd()).toBe(true);
        });

        it('should handle seek beyond end', () => {
            player.load(testReplay);
            player.seek(100);

            expect(player.isAtEnd()).toBe(true);
        });

        it('should handle resume without loading', () => {
            const emptyPlayer = new ReplayPlayer();
            expect(() => emptyPlayer.resume()).not.toThrow();
        });

        it('should handle update without loading', () => {
            const emptyPlayer = new ReplayPlayer();
            expect(() => emptyPlayer.update(1.0)).not.toThrow();
        });
    });
});
