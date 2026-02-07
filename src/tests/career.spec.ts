import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    PracticeManager,
    type DrillType,
    type DrillConfig,
    type DrillResult,
} from '../gameplay/Practice';
import {
    createNewCareer,
    generateSeasonSchedule,
    saveCareer,
    loadCareer,
    saveManager,
    type CareerData,
    type SeasonEvent,
} from '../data/SaveLoad';
import { CareerManager } from '../management/Career';

// Mock localStorage for testing
const mockLocalStorage = (() => {
    const store = new Map<string, string>();
    return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        get length() {
            return store.size;
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
    };
})();

// Replace global localStorage with mock
globalThis.localStorage = mockLocalStorage as Storage;

describe('Career Mode', () => {
    beforeEach(() => {
        mockLocalStorage.clear();
    });

    describe('Season Generation', () => {
        it('should create a season with multiple games', () => {
            const schedule = generateSeasonSchedule(1);
            expect(schedule.length).toBeGreaterThan(0);
        });

        it('should create games with progressive structure', () => {
            const schedule = generateSeasonSchedule(1);

            // Check that schedule has a mix of tournaments and practice
            const tournaments = schedule.filter(e => e.type === 'tournament');
            const practices = schedule.filter(e => e.type === 'practice');

            expect(tournaments.length).toBeGreaterThan(0);
            expect(practices.length).toBeGreaterThan(0);
        });

        it('should assign unique week numbers', () => {
            const schedule = generateSeasonSchedule(1);
            const weeks = schedule.map(e => e.date);

            // Check that weeks are in ascending order
            for (let i = 1; i < weeks.length; i++) {
                expect(weeks[i]).toBeGreaterThan(weeks[i - 1]);
            }
        });

        it('should create tournaments at regular intervals', () => {
            const schedule = generateSeasonSchedule(1);
            const tournaments = schedule.filter(e => e.type === 'tournament');

            // Should have at least a few tournaments in a season
            expect(tournaments.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Career Creation and Persistence', () => {
        it('should create a new career with team name', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');

            expect(career.playerName).toBe('TestCoach');
            expect(career.teamName).toBe('TestTeam');
            expect(career.team.name).toBe('TestTeam');
        });

        it('should start with season 1, week 1', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');

            expect(career.season).toBe(1);
            expect(career.week).toBe(1);
        });

        it('should start with 0 wins and 0 losses', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');

            expect(career.team.stats.wins).toBe(0);
            expect(career.team.stats.losses).toBe(0);
        });

        it('should generate a roster with players', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');

            expect(career.team.roster.length).toBeGreaterThan(0);
        });

        it('should save and load career successfully', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            saveCareer(career);

            const loaded = loadCareer();

            expect(loaded).not.toBeNull();
            expect(loaded?.playerName).toBe('TestCoach');
            expect(loaded?.teamName).toBe('TestTeam');
        });

        it('should preserve team stats on save/load', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            career.team.stats.wins = 5;
            career.team.stats.losses = 3;
            career.team.stats.pointsFor = 55;
            career.team.stats.pointsAgainst = 45;

            saveCareer(career);
            const loaded = loadCareer();

            expect(loaded?.team.stats.wins).toBe(5);
            expect(loaded?.team.stats.losses).toBe(3);
            expect(loaded?.team.stats.pointsFor).toBe(55);
            expect(loaded?.team.stats.pointsAgainst).toBe(45);
        });

        it('should return null when no career exists', () => {
            // Ensure save is properly deleted (clears both localStorage and cache)
            saveManager.deleteSave();
            const loaded = loadCareer();
            expect(loaded).toBeNull();
        });
    });

    describe('Career Advancement', () => {
        it('should update W-L record after match result', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            const manager = new CareerManager(career);

            manager.processMatchResult({
                id: 'test_match_1',
                date: Date.now(),
                opponentName: 'TestOpponent',
                opponentRating: 50,
                playerScore: 11,
                opponentScore: 8,
                playerSpirit: 8,
                opponentSpirit: 8,
                stats: [],
                highlights: [],
            });

            expect(manager.data.team.stats.wins).toBe(1);
            expect(manager.data.team.stats.losses).toBe(0);
        });

        it('should record loss when opponent wins', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            const manager = new CareerManager(career);

            manager.processMatchResult({
                id: 'test_match_1',
                date: Date.now(),
                opponentName: 'TestOpponent',
                opponentRating: 50,
                playerScore: 8,
                opponentScore: 11,
                playerSpirit: 8,
                opponentSpirit: 8,
                stats: [],
                highlights: [],
            });

            expect(manager.data.team.stats.wins).toBe(0);
            expect(manager.data.team.stats.losses).toBe(1);
        });

        it('should advance week after match', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            const initialWeek = career.week;
            const manager = new CareerManager(career);

            manager.processMatchResult({
                id: 'test_match_1',
                date: Date.now(),
                opponentName: 'TestOpponent',
                opponentRating: 50,
                playerScore: 11,
                opponentScore: 8,
                playerSpirit: 8,
                opponentSpirit: 8,
                stats: [],
                highlights: [],
            });

            expect(manager.data.week).toBe(initialWeek + 1);
        });

        it('should accumulate points for and against', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            const manager = new CareerManager(career);

            manager.processMatchResult({
                id: 'test_match_1',
                date: Date.now(),
                opponentName: 'TestOpponent',
                opponentRating: 50,
                playerScore: 11,
                opponentScore: 8,
                playerSpirit: 8,
                opponentSpirit: 8,
                stats: [],
                highlights: [],
            });

            expect(manager.data.team.stats.pointsFor).toBe(11);
            expect(manager.data.team.stats.pointsAgainst).toBe(8);
        });
    });

    describe('Opponent Team Generation', () => {
        it('should generate teams with unique identifiers', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            const manager = new CareerManager(career);

            const tournament = manager.generateTournament('local');

            // Team IDs should be unique
            const teamIds = new Set(tournament.teams);
            expect(teamIds.size).toBe(tournament.teams.length);
        });

        it('should include player team in tournament', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            const manager = new CareerManager(career);

            const tournament = manager.generateTournament('local');

            expect(tournament.teams).toContain(career.team.id);
        });

        it('should generate appropriate number of teams based on tier', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            const manager = new CareerManager(career);

            const localTournament = manager.generateTournament('local');
            const regionalTournament = manager.generateTournament('regional');
            const nationalTournament = manager.generateTournament('national');

            // Local should have fewer teams than regional
            expect(localTournament.teams.length).toBeGreaterThanOrEqual(4);
            expect(regionalTournament.teams.length).toBeGreaterThanOrEqual(8);
            expect(nationalTournament.teams.length).toBeGreaterThanOrEqual(16);
        });
    });

    describe('Schedule and Standings', () => {
        it('should track upcoming events', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            const manager = new CareerManager(career);

            const upcoming = manager.getUpcomingEvents(5);

            expect(upcoming.length).toBeGreaterThan(0);
            expect(upcoming.length).toBeLessThanOrEqual(5);
        });

        it('should only return future events', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');
            const manager = new CareerManager(career);

            const upcoming = manager.getUpcomingEvents(5);

            // All events should be in the future
            upcoming.forEach(event => {
                expect(event.date).toBeGreaterThan(career.week);
            });
        });

        it('should get current week event', () => {
            const career = createNewCareer('TestCoach', 'TestTeam');

            // Add an event for the current week
            career.schedule.push({
                type: 'tournament',
                tournamentId: 'test_tournament',
                date: career.week,
            });

            const manager = new CareerManager(career);
            const current = manager.getCurrentEvent();

            expect(current).not.toBeNull();
            expect(current?.date).toBe(career.week);
        });
    });
});

describe('Practice Drills', () => {
    let practiceManager: PracticeManager;

    beforeEach(() => {
        mockLocalStorage.clear();
        practiceManager = new PracticeManager();
    });

    describe('Drill Configuration', () => {
        it('should have all 5 drill types configured', () => {
            const drills = practiceManager.getAllDrillConfigs();
            expect(drills.length).toBe(5);

            const types = drills.map(d => d.type);
            expect(types).toContain('throwing_accuracy');
            expect(types).toContain('huck_distance');
            expect(types).toContain('catch_training');
            expect(types).toContain('sprint_endurance');
            expect(types).toContain('pull_practice');
        });

        it('should have valid configurations for each drill', () => {
            const drills = practiceManager.getAllDrillConfigs();

            drills.forEach(({ type, config }) => {
                expect(config.name).toBeTruthy();
                expect(config.description).toBeTruthy();
                expect(config.duration).toBeGreaterThanOrEqual(0);
                expect(config.targetScore).toBeGreaterThan(0);
            });
        });

        it('should get specific drill config', () => {
            const config = practiceManager.getDrillConfig('throwing_accuracy');

            expect(config.name).toBe('Throwing Accuracy');
            expect(config.targetScore).toBeGreaterThan(0);
        });
    });

    describe('Drill Execution', () => {
        it('should start a drill and return state', () => {
            const state = practiceManager.startDrill('throwing_accuracy');

            expect(state).toBeTruthy();
            expect(state.type).toBe('throwing_accuracy');
            expect(state.isActive).toBe(true);
            expect(state.score).toBe(0);
        });

        it('should generate targets for throwing accuracy drill', () => {
            const state = practiceManager.startDrill('throwing_accuracy');

            expect(state.targets.length).toBeGreaterThan(0);
        });

        it('should generate checkpoints for sprint endurance drill', () => {
            const state = practiceManager.startDrill('sprint_endurance');

            expect(state.checkpoints.length).toBeGreaterThan(0);
        });

        it('should track score when target is hit', () => {
            const state = practiceManager.startDrill('throwing_accuracy');
            const targetId = state.targets[0].id;

            practiceManager.recordTargetHit(targetId);

            const currentState = practiceManager.getCurrentDrill();
            expect(currentState?.score).toBe(1);
        });

        it('should not double-count same target', () => {
            const state = practiceManager.startDrill('throwing_accuracy');
            const targetId = state.targets[0].id;

            practiceManager.recordTargetHit(targetId);
            practiceManager.recordTargetHit(targetId);

            const currentState = practiceManager.getCurrentDrill();
            expect(currentState?.score).toBe(1);
        });

        it('should record throw distance for huck drill', () => {
            practiceManager.startDrill('huck_distance');

            practiceManager.recordThrowDistance(45.5);

            const state = practiceManager.getCurrentDrill();
            expect(state?.score).toBe(45.5);
        });

        it('should keep best distance for huck drill', () => {
            practiceManager.startDrill('huck_distance');

            practiceManager.recordThrowDistance(40);
            practiceManager.recordThrowDistance(55);
            practiceManager.recordThrowDistance(45);

            const state = practiceManager.getCurrentDrill();
            expect(state?.score).toBe(55);
            expect(state?.attempts).toBe(3);
        });

        it('should track catch success rate', () => {
            practiceManager.startDrill('catch_training');

            practiceManager.recordCatchAttempt(true);
            practiceManager.recordCatchAttempt(true);
            practiceManager.recordCatchAttempt(false);

            const state = practiceManager.getCurrentDrill();
            expect(state?.score).toBe(2);
            expect(state?.attempts).toBe(3);
        });
    });

    describe('Drill Scoring', () => {
        it('should award 3 stars for excellent performance', () => {
            practiceManager.startDrill('throwing_accuracy');

            // Get target score and exceed it by 20%
            const config = practiceManager.getDrillConfig('throwing_accuracy');
            const excellentScore = Math.ceil(config.targetScore * 1.2);

            // Simulate hitting targets
            const state = practiceManager.getCurrentDrill();
            if (state) {
                for (let i = 0; i < Math.min(excellentScore, state.targets.length); i++) {
                    practiceManager.recordTargetHit(state.targets[i].id);
                }
            }

            const result = practiceManager.endDrill();

            expect(result?.stars).toBe(3);
        });

        it('should award 2 stars for good performance', () => {
            practiceManager.startDrill('throwing_accuracy');

            // Get target score and meet it exactly
            const config = practiceManager.getDrillConfig('throwing_accuracy');

            // Simulate hitting targets
            const state = practiceManager.getCurrentDrill();
            if (state) {
                for (let i = 0; i < Math.min(config.targetScore, state.targets.length); i++) {
                    practiceManager.recordTargetHit(state.targets[i].id);
                }
            }

            const result = practiceManager.endDrill();

            expect(result?.stars).toBe(2);
        });

        it('should award 1 star for basic completion', () => {
            practiceManager.startDrill('throwing_accuracy');

            // Don't hit any targets
            const result = practiceManager.endDrill();

            expect(result?.stars).toBe(1);
        });

        it('should use lower-is-better scoring for sprint endurance', () => {
            practiceManager.startDrill('sprint_endurance');

            const state = practiceManager.getCurrentDrill();
            if (state) {
                // Complete all checkpoints
                for (let i = 0; i < state.checkpoints.length; i++) {
                    practiceManager.recordCheckpointReached(i);
                }
            }

            const result = practiceManager.endDrill();

            // Should have recorded time
            expect(result?.score).toBeGreaterThan(0);
        });

        it('should save and retrieve best scores', () => {
            practiceManager.startDrill('throwing_accuracy');

            // Hit some targets
            const state = practiceManager.getCurrentDrill();
            if (state) {
                for (let i = 0; i < 5; i++) {
                    practiceManager.recordTargetHit(state.targets[i].id);
                }
            }

            const result = practiceManager.endDrill();

            // Best score should be saved
            expect(result?.bestScore).toBe(5);

            // Create new manager and check if best score persists
            const newManager = new PracticeManager();
            const bestScore = newManager.getBestScore('throwing_accuracy');
            expect(bestScore).toBe(5);
        });

        it('should update best score when improved', () => {
            // First attempt
            practiceManager.startDrill('huck_distance');
            practiceManager.recordThrowDistance(50);
            const result1 = practiceManager.endDrill();

            expect(result1?.bestScore).toBe(50);

            // Second attempt with better distance
            practiceManager.startDrill('huck_distance');
            practiceManager.recordThrowDistance(60);
            const result2 = practiceManager.endDrill();

            expect(result2?.bestScore).toBe(60);
        });

        it('should not downgrade best score', () => {
            // First attempt
            practiceManager.startDrill('huck_distance');
            practiceManager.recordThrowDistance(60);
            const result1 = practiceManager.endDrill();

            expect(result1?.bestScore).toBe(60);

            // Second attempt with worse distance
            practiceManager.startDrill('huck_distance');
            practiceManager.recordThrowDistance(50);
            const result2 = practiceManager.endDrill();

            // Best score should remain 60
            expect(result2?.bestScore).toBe(60);
        });
    });
});
