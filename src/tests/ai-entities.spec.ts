import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';

// Import AI modules
import {
    computeStackPositions,
    computeHandlerPositions,
    evaluateOpenness,
    isLaneClear,
    computeCutTarget,
    computeLeadPass,
} from '../ai/Offense';

import {
    assignMatchups,
    computeDefensivePosition,
    shouldContestCatch,
} from '../ai/Defense';
import { TeamAI } from '../ai/TeamAI';
import { decideOffenseWithDisc, decideDefense } from '../ai/PlayerAI';
import { Random } from '../data/SeededRandom';

// Import data modules
import { PlayerStats, generatePlayer, generateRoster } from '../data/PlayerStats';
import {
    getDefaultSettings,
    saveManager,
    createNewCareer,
    generateSeasonSchedule,
} from '../data/SaveLoad';
import { FIELD_WIDTH } from '../data/Constants';
import { CAREER_CONSTANTS } from '../data/CareerConstants';

// Mock Player type for AI tests
interface MockPlayer {
    movement: {
        position: THREE.Vector3;
        velocity: THREE.Vector3;
        facing: number;
        stamina: number;
    };
    team: 'home' | 'away';
    role: 'handler' | 'cutter' | 'deep_cutter';
    index: number;
}

// Helper function to create minimal mock players
function mockPlayer(
    x: number,
    z: number,
    team: 'home' | 'away',
    role: 'handler' | 'cutter' | 'deep_cutter' = 'cutter',
    index: number = 0,
): MockPlayer {
    return {
        movement: {
            position: new THREE.Vector3(x, 0, z),
            velocity: new THREE.Vector3(0, 0, 0),
            facing: 0,
            stamina: 100,
        },
        team,
        role,
        index,
    };
}

describe('AI: Offense', () => {
    describe('computeStackPositions', () => {
        it('returns exactly 4 positions', () => {
            const discPos = new THREE.Vector3(0, 0, 0);
            const positions = computeStackPositions(discPos, 1);

            expect(positions).toHaveLength(4);
            positions.forEach(pos => {
                expect(pos).toBeInstanceOf(THREE.Vector3);
            });
        });

        it('positions stack downfield from disc when attacking endzone 1', () => {
            const discPos = new THREE.Vector3(0, 0, 0);
            const positions = computeStackPositions(discPos, 1);

            // All positions should be ahead of disc (positive z)
            positions.forEach(pos => {
                expect(pos.z).toBeGreaterThan(discPos.z);
            });
        });

        it('positions stack downfield from disc when attacking endzone 0', () => {
            const discPos = new THREE.Vector3(0, 0, 50);
            const positions = computeStackPositions(discPos, 0);

            // All positions should be toward endzone 0 (lower z than disc)
            positions.forEach(pos => {
                expect(pos.z).toBeLessThan(discPos.z);
            });
        });

        it('spaces stack positions evenly', () => {
            const discPos = new THREE.Vector3(0, 0, 0);
            const positions = computeStackPositions(discPos, 1);

            // Check spacing between consecutive positions
            for (let i = 1; i < positions.length; i++) {
                const spacing = Math.abs(positions[i].z - positions[i - 1].z);
                expect(spacing).toBeCloseTo(7, 1);
            }
        });

        it('keeps stack within field bounds', () => {
            const discPos = new THREE.Vector3(15, 0, 0);
            const positions = computeStackPositions(discPos, 1);

            const halfW = FIELD_WIDTH / 2;
            positions.forEach(pos => {
                expect(Math.abs(pos.x)).toBeLessThanOrEqual(halfW * 0.47 + 0.1);
            });
        });
    });

    describe('computeHandlerPositions', () => {
        it('returns exactly 3 positions', () => {
            const discPos = new THREE.Vector3(0, 0, 0);
            const positions = computeHandlerPositions(discPos, 1);

            expect(positions).toHaveLength(3);
        });

        it('positions handlers behind disc when attacking endzone 1', () => {
            const discPos = new THREE.Vector3(0, 0, 10);
            const positions = computeHandlerPositions(discPos, 1);

            // All handlers should be behind or at disc position
            positions.forEach(pos => {
                expect(pos.z).toBeLessThanOrEqual(discPos.z);
            });
        });

        it('positions handlers behind disc when attacking endzone 0', () => {
            const discPos = new THREE.Vector3(0, 0, 10);
            const positions = computeHandlerPositions(discPos, 0);

            // All handlers should be ahead or at disc position
            positions.forEach(pos => {
                expect(pos.z).toBeGreaterThanOrEqual(discPos.z);
            });
        });

        it('flanks disc with handlers on both sides', () => {
            const discPos = new THREE.Vector3(0, 0, 0);
            const positions = computeHandlerPositions(discPos, 1);

            // Should have positions on both left and right
            const xValues = positions.map(p => p.x);
            const hasLeft = xValues.some(x => x < -1);
            const hasRight = xValues.some(x => x > 1);

            expect(hasLeft || hasRight).toBe(true);
        });

        it('keeps handlers within field bounds', () => {
            const discPos = new THREE.Vector3(12, 0, 0);
            const positions = computeHandlerPositions(discPos, 1);

            const halfW = FIELD_WIDTH / 2;
            positions.forEach(pos => {
                expect(Math.abs(pos.x)).toBeLessThanOrEqual(halfW);
            });
        });
    });

    describe('evaluateOpenness', () => {
        it('returns higher score when defenders are far from receiver', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const receiver = mockPlayer(0, 10, 'home', 'cutter');
            const farDefenders = [
                mockPlayer(10, 10, 'away'),
                mockPlayer(-10, 10, 'away'),
            ];
            const nearDefenders = [
                mockPlayer(0, 11, 'away'),
                mockPlayer(1, 10, 'away'),
            ];

            const farScore = evaluateOpenness(thrower as any, receiver as any, farDefenders as any[], 1);
            const nearScore = evaluateOpenness(thrower as any, receiver as any, nearDefenders as any[], 1);

            expect(farScore).toBeGreaterThan(nearScore);
        });

        it('returns lower score when throwing lane is blocked', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const receiver = mockPlayer(0, 20, 'home', 'cutter');
            const blockingDefenders = [
                mockPlayer(0, 10, 'away'), // Directly in path
            ];
            const clearDefenders = [
                mockPlayer(10, 10, 'away'), // Off to the side
            ];

            const blockedScore = evaluateOpenness(thrower as any, receiver as any, blockingDefenders as any[], 1);
            const clearScore = evaluateOpenness(thrower as any, receiver as any, clearDefenders as any[], 1);

            expect(clearScore).toBeGreaterThan(blockedScore);
        });

        it('returns positive score for open receivers', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const receiver = mockPlayer(5, 15, 'home', 'cutter');
            const defenders = [
                mockPlayer(-10, 15, 'away'),
                mockPlayer(15, 15, 'away'),
            ];

            const score = evaluateOpenness(thrower as any, receiver as any, defenders as any[], 1);

            expect(score).toBeGreaterThan(0);
        });

        it('increases score for yard gain toward attacking endzone', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const forwardReceiver = mockPlayer(0, 20, 'home', 'cutter');
            const backwardReceiver = mockPlayer(0, -5, 'home', 'cutter');
            const defenders = [
                mockPlayer(10, 20, 'away'),
            ];

            const forwardScore = evaluateOpenness(thrower as any, forwardReceiver as any, defenders as any[], 1);
            const backwardScore = evaluateOpenness(thrower as any, backwardReceiver as any, defenders as any[], 1);

            expect(forwardScore).toBeGreaterThan(backwardScore);
        });
    });

    describe('isLaneClear', () => {
        it('returns true when no defenders in throwing lane', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const receiver = mockPlayer(0, 20, 'home', 'cutter');
            const defenders = [
                mockPlayer(10, 10, 'away'),
                mockPlayer(-10, 10, 'away'),
            ];

            const clear = isLaneClear(thrower as any, receiver as any, defenders as any[]);

            expect(clear).toBe(true);
        });

        it('returns false when defender blocks throwing lane', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const receiver = mockPlayer(0, 20, 'home', 'cutter');
            const defenders = [
                mockPlayer(0, 10, 'away'), // Directly in path
            ];

            const clear = isLaneClear(thrower as any, receiver as any, defenders as any[]);

            expect(clear).toBe(false);
        });

        it('returns true when defender is beyond receiver', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const receiver = mockPlayer(0, 20, 'home', 'cutter');
            const defenders = [
                mockPlayer(0, 30, 'away'), // Beyond receiver
            ];

            const clear = isLaneClear(thrower as any, receiver as any, defenders as any[]);

            expect(clear).toBe(true);
        });

        it('returns true when defender is behind thrower', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const receiver = mockPlayer(0, 20, 'home', 'cutter');
            const defenders = [
                mockPlayer(0, -10, 'away'), // Behind thrower
            ];

            const clear = isLaneClear(thrower as any, receiver as any, defenders as any[]);

            expect(clear).toBe(true);
        });
    });

    describe('computeCutTarget', () => {
        it('returns target position for "in" cut', () => {
            const cutter = mockPlayer(10, 20, 'home', 'cutter');
            const discPos = new THREE.Vector3(0, 0, 10);
            const target = computeCutTarget(cutter as any, discPos, 1, 'in');

            expect(target).toBeInstanceOf(THREE.Vector3);
            // Should move toward disc
            expect(Math.abs(target.x)).toBeLessThan(Math.abs(cutter.movement.position.x));
        });

        it('returns target position for "deep" cut', () => {
            const cutter = mockPlayer(5, 20, 'home', 'cutter');
            const discPos = new THREE.Vector3(0, 0, 10);
            const target = computeCutTarget(cutter as any, discPos, 1, 'deep');

            expect(target).toBeInstanceOf(THREE.Vector3);
            // Should move downfield
            expect(target.z).toBeGreaterThan(cutter.movement.position.z);
        });
    });

    describe('computeLeadPass', () => {
        it('returns position ahead of moving receiver', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const receiver = mockPlayer(10, 20, 'home', 'cutter');
            receiver.movement.velocity = new THREE.Vector3(5, 0, 5);

            const leadTarget = computeLeadPass(thrower as any, receiver as any, 25);

            expect(leadTarget.x).toBeGreaterThan(receiver.movement.position.x);
            expect(leadTarget.z).toBeGreaterThan(receiver.movement.position.z);
        });

        it('limits lead time to prevent excessive leading', () => {
            const thrower = mockPlayer(0, 0, 'home', 'handler');
            const receiver = mockPlayer(10, 20, 'home', 'cutter');
            receiver.movement.velocity = new THREE.Vector3(10, 0, 10);

            const leadTarget = computeLeadPass(thrower as any, receiver as any, 5);

            // Should not lead too far
            const leadDistance = leadTarget.distanceTo(receiver.movement.position);
            expect(leadDistance).toBeLessThan(10);
        });
    });
});

describe('AI: Defense', () => {
    describe('assignMatchups', () => {
        it('returns a Map of defenders to offenders', () => {
            const defenders = [
                mockPlayer(0, 0, 'away'),
                mockPlayer(5, 0, 'away'),
            ];
            const offenders = [
                mockPlayer(1, 1, 'home'),
                mockPlayer(6, 1, 'home'),
            ];

            const matchups = assignMatchups(defenders as any[], offenders as any[]);

            expect(matchups).toBeInstanceOf(Map);
            expect(matchups.size).toBe(2);
        });

        it('assigns each defender to exactly one offender', () => {
            const defenders = [
                mockPlayer(0, 0, 'away'),
                mockPlayer(10, 0, 'away'),
                mockPlayer(20, 0, 'away'),
            ];
            const offenders = [
                mockPlayer(1, 1, 'home'),
                mockPlayer(11, 1, 'home'),
                mockPlayer(21, 1, 'home'),
            ];

            const matchups = assignMatchups(defenders as any[], offenders as any[]);

            // Each defender should appear exactly once as a key
            expect(matchups.size).toBe(3);
            const assignedOffenders = new Set(matchups.values());
            expect(assignedOffenders.size).toBe(3);
        });

        it('prefers nearest player matchups', () => {
            const defender1 = mockPlayer(0, 0, 'away');
            const defender2 = mockPlayer(20, 0, 'away');
            const offender1 = mockPlayer(2, 0, 'home'); // Very close to defender1
            const offender2 = mockPlayer(19, 0, 'home'); // Very close to defender2

            const defenders = [defender1, defender2];
            const offenders = [offender1, offender2];

            const matchups = assignMatchups(defenders as any[], offenders as any[]);

            // Defender1 should match offender1, defender2 should match offender2
            expect(matchups.get(defender1 as any)).toBe(offender1 as any);
            expect(matchups.get(defender2 as any)).toBe(offender2 as any);
        });

        it('handles unequal numbers of defenders and offenders', () => {
            const defenders = [
                mockPlayer(0, 0, 'away'),
                mockPlayer(10, 0, 'away'),
            ];
            const offenders = [
                mockPlayer(1, 1, 'home'),
                mockPlayer(11, 1, 'home'),
                mockPlayer(21, 1, 'home'),
            ];

            const matchups = assignMatchups(defenders as any[], offenders as any[]);

            // Should assign both defenders, leaving one offender unmatched
            expect(matchups.size).toBe(2);
        });

        it('returns empty map when no players provided', () => {
            const matchups = assignMatchups([], []);

            expect(matchups.size).toBe(0);
        });
    });

    describe('computeDefensivePosition', () => {
        it('returns position between mark and disc', () => {
            const mark = mockPlayer(10, 10, 'home');
            const discPos = new THREE.Vector3(0, 0, 0);

            const defPos = computeDefensivePosition(mark as any, discPos);

            expect(defPos).toBeInstanceOf(THREE.Vector3);
            // Should be between mark and disc
            const distToMark = defPos.distanceTo(mark.movement.position);
            const distToDisc = defPos.distanceTo(discPos);
            expect(distToMark).toBeLessThan(mark.movement.position.distanceTo(discPos));
        });

        it('positions defender closer to disc than mark', () => {
            const mark = mockPlayer(10, 10, 'home');
            const discPos = new THREE.Vector3(0, 0, 0);

            const defPos = computeDefensivePosition(mark as any, discPos);

            const distToDisc = defPos.distanceTo(discPos);
            const markToDisc = mark.movement.position.distanceTo(discPos);

            expect(distToDisc).toBeLessThan(markToDisc);
        });
    });

    describe('shouldContestCatch', () => {
        it('returns true when defender is closer to disc than mark', () => {
            const defender = mockPlayer(5, 10, 'away');
            const mark = mockPlayer(10, 10, 'home');
            const discPos = new THREE.Vector3(4, 0, 10);

            const shouldContest = shouldContestCatch(defender as any, discPos, mark as any);

            expect(shouldContest).toBe(true);
        });

        it('returns false when defender is much farther from disc than mark', () => {
            const defender = mockPlayer(20, 10, 'away');
            const mark = mockPlayer(5, 10, 'home');
            const discPos = new THREE.Vector3(4, 0, 10);

            const shouldContest = shouldContestCatch(defender as any, discPos, mark as any);

            expect(shouldContest).toBe(false);
        });

        it('allows contest within 1m threshold even if slightly farther', () => {
            const defender = mockPlayer(10, 10, 'away');
            const mark = mockPlayer(9, 10, 'home');
            const discPos = new THREE.Vector3(10, 0, 10.5);

            const shouldContest = shouldContestCatch(defender as any, discPos, mark as any);

            expect(shouldContest).toBe(true);
        });
    });
});

describe('AI: TeamAI', () => {
    function createAIMockPlayer(
        x: number,
        z: number,
        team: 'home' | 'away',
        role: 'handler' | 'cutter' | 'deep_cutter',
        index: number,
        stats?: any,
    ): any {
        const movement = {
            position: new THREE.Vector3(x, 0, z),
            velocity: new THREE.Vector3(),
            facing: 0,
            stamina: 100,
            update: vi.fn(
                (
                    dt: number,
                    dir: { x: number; z: number },
                    _sprint: boolean,
                ) => {
                    movement.velocity.set(dir.x, 0, dir.z);
                    movement.position.x += dir.x * dt;
                    movement.position.z += dir.z * dt;
                },
            ),
        };

        return {
            movement,
            team,
            role,
            index,
            isControlled: false,
            holdingDisc: false,
            update: vi.fn(),
            stats: stats ?? null,
        };
    }

    const mockBridge = {
        predictThrow: () => [] as THREE.Vector3[],
    };

    function createMockDisc(pos: THREE.Vector3): any {
        return { position: pos, bridge: mockBridge };
    }

    function createTeam(players: any[]): any {
        return {
            players,
            getHolder: () => players.find((p) => p.holdingDisc),
        };
    }

    function createSevenPlayers(team: 'home' | 'away'): any[] {
        const roles: Array<'handler' | 'cutter' | 'deep_cutter'> = [
            'handler',
            'handler',
            'handler',
            'cutter',
            'cutter',
            'cutter',
            'deep_cutter',
        ];
        return roles.map((role, idx) =>
            createAIMockPlayer(idx * 2 - 6, idx * 4 + (team === 'home' ? 10 : 40), team, role, idx),
        );
    }

    function makeStats(overrides: Record<string, number>): any {
        return {
            getEffectiveStat: (key: string) => overrides[key] ?? 50,
        };
    }

    it('assigns man matchups immediately after reset', () => {
        const ai = new TeamAI();
        ai.setDefenseType('man');
        ai.resetForPoint();

        const defenders = createSevenPlayers('away');
        const offenders = createSevenPlayers('home');
        const team = createTeam(defenders);
        const opponent = createTeam(offenders);
        const disc = createMockDisc(new THREE.Vector3(0, 0, 30));

        ai.update(0.016, team, opponent, disc as any, false, 100, 0, 0, 0);

        expect((ai as any).matchups.size).toBeGreaterThan(0);
    });

    it('supports explicit personality presets with distinct tendencies', () => {
        Random.seed(333);
        const patient = new TeamAI();
        patient.setDifficulty('normal');
        patient.setPersonality('patient_small_ball');

        Random.seed(333);
        const huck = new TeamAI();
        huck.setDifficulty('normal');
        huck.setPersonality('huck_heavy');

        expect(patient.getDebugPersonality()).toBe('patient_small_ball');
        expect(huck.getDebugPersonality()).toBe('huck_heavy');

        const patientProfile = patient.getDebugProfile();
        const huckProfile = huck.getDebugProfile();
        expect(patientProfile.decisionInterval).toBeGreaterThan(
            huckProfile.decisionInterval,
        );
        expect(patientProfile.secondaryCutChance).toBeLessThan(
            huckProfile.secondaryCutChance,
        );

        const patientTendency = patient.getDebugTendency();
        const huckTendency = huck.getDebugTendency();
        expect(huckTendency.aggression).toBeGreaterThan(
            patientTendency.aggression,
        );
    });

    it('makes poach chaos materially more aggressive on defense', () => {
        Random.seed(404);
        const balanced = new TeamAI();
        balanced.setDifficulty('normal');
        balanced.setPersonality('balanced');

        Random.seed(404);
        const chaos = new TeamAI();
        chaos.setDifficulty('normal');
        chaos.setPersonality('poach_chaos');

        const balancedProfile = balanced.getDebugProfile();
        const chaosProfile = chaos.getDebugProfile();
        expect(chaosProfile.poachChance).toBeGreaterThan(
            balancedProfile.poachChance,
        );
        expect(chaosProfile.switchDistance).toBeLessThan(
            balancedProfile.switchDistance,
        );
        expect(chaos.getDebugTendency().defenseFlex).toBeGreaterThan(
            balanced.getDebugTendency().defenseFlex,
        );
    });

    it('assigns zone positions immediately after reset', () => {
        const ai = new TeamAI();
        ai.setDefenseType('zone_331');
        ai.resetForPoint();

        const defenders = createSevenPlayers('away');
        const offenders = createSevenPlayers('home');
        const team = createTeam(defenders);
        const opponent = createTeam(offenders);
        const disc = createMockDisc(new THREE.Vector3(0, 0, 30));

        ai.update(0.016, team, opponent, disc as any, false, 100, 0, 0, 0);

        expect((ai as any).zonePositions.size).toBeGreaterThan(0);
    });

    it('uses scripted handler cuts with timing and start positions', () => {
        const ai = new TeamAI();
        const offense = createSevenPlayers('home');
        const defense = createSevenPlayers('away');
        offense[0].holdingDisc = true;
        offense[1].movement.position.set(2, 0, 6);

        ai.setPlaybookContext(
            {
                id: 'f1',
                name: 'Test',
                positions: [
                    { role: 'handler', x: 0, z: 0 },
                    { role: 'handler', x: 2, z: 2 },
                    { role: 'handler', x: -2, z: 2 },
                    { role: 'cutter', x: -5, z: 10 },
                    { role: 'cutter', x: -5, z: 15 },
                    { role: 'cutter', x: -5, z: 20 },
                    { role: 'cutter', x: -5, z: 25 },
                ],
            } as any,
            {
                id: 'p1',
                name: 'Script',
                formationId: 'f1',
                cuts: [
                    {
                        playerRole: 'handler',
                        timing: 1.0,
                        startX: 2,
                        startZ: 6,
                        endX: 8,
                        endZ: 6,
                        priority: 2,
                    },
                ],
            } as any,
        );

        const disc = createMockDisc(new THREE.Vector3(0, 0, 0));
        ai.update(
            0.1,
            createTeam(offense),
            createTeam(defense),
            disc as any,
            true,
            100,
            0,
            0,
            0,
        );

        const before = offense[1].movement.position.clone();
        ai.update(
            1.1,
            createTeam(offense),
            createTeam(defense),
            disc as any,
            true,
            100,
            0,
            0,
            0,
        );
        const after = offense[1].movement.position.clone();

        expect(before.distanceTo(new THREE.Vector3(2, 0, 6))).toBeLessThan(1.0);
        expect(after.x).toBeGreaterThan(before.x);
    });

    it('activates multiple cutters under stall pressure', () => {
        Random.seed(123);
        const ai = new TeamAI();
        const offense = createSevenPlayers('home');
        const defense = createSevenPlayers('away');
        offense[0].holdingDisc = true;

        const disc = createMockDisc(offense[0].movement.position.clone());
        ai.update(
            0.2,
            createTeam(offense),
            createTeam(defense),
            disc as any,
            true,
            100,
            8,
            0,
            0,
        );

        const cutterSprints = offense
            .filter((p) => p.role !== 'handler')
            .map((p) =>
                p.movement.update.mock.calls.some(
                    (call: any[]) => call[2] === true,
                ),
            )
            .filter(Boolean).length;
        expect(ai.getDebugActiveCutters().length).toBeGreaterThanOrEqual(2);
        expect(cutterSprints).toBeGreaterThanOrEqual(2);
    });

    it('decays inactive cutter timers instead of drifting upward', () => {
        Random.seed(11);
        const ai = new TeamAI();
        const offense = createSevenPlayers('home');
        const defense = createSevenPlayers('away');
        offense[0].holdingDisc = true;

        // Lock out opportunistic second cutter activation for deterministic behavior.
        (ai as any).profile.secondaryCutChance = 0;
        (ai as any).activeCutterIdx = offense[3].index;
        (ai as any).cutTimers.set(offense[4], 2.0);

        ai.update(
            0.2,
            createTeam(offense),
            createTeam(defense),
            createMockDisc(new THREE.Vector3(0, 0, 10)),
            true,
            100,
            0,
            0,
            0,
        );

        const timerAfter = (ai as any).cutTimers.get(offense[4]) ?? 0;
        expect(timerAfter).toBeLessThan(2.0);
    });

    it('prioritizes open deep threats for primary cutter selection', () => {
        Random.seed(9);
        const ai = new TeamAI();
        ai.setDifficulty('hard');
        const offense = createSevenPlayers('home');
        const defense = createSevenPlayers('away');

        offense[0].holdingDisc = true;
        offense[6].movement.position.set(0, 0, 34); // deep cutter wide open
        offense[3].movement.position.set(-4, 0, 18);
        offense[4].movement.position.set(4, 0, 16);
        offense[5].movement.position.set(1, 0, 15);
        defense[3].movement.position.set(-3.8, 0, 18.2);
        defense[4].movement.position.set(4.1, 0, 16.3);
        defense[5].movement.position.set(1.2, 0, 14.8);
        defense[6].movement.position.set(12, 0, 25);

        const disc = createMockDisc(new THREE.Vector3(0, 0, 10));
        ai.update(
            0.2,
            createTeam(offense),
            createTeam(defense),
            disc as any,
            true,
            100,
            2,
            0,
            0,
        );

        expect(ai.getDebugActiveCutters()).toContain(6);
    });

    it('prefers skilled receiver when space is similar', () => {
        Random.seed(42);
        const thrower = createAIMockPlayer(
            0,
            0,
            'home',
            'handler',
            0,
            makeStats({
                throwAccuracy: 80,
                awareness: 80,
                forehand: 70,
                backhand: 70,
            }),
        );
        thrower.holdingDisc = true;
        const weakReceiver = createAIMockPlayer(
            -6,
            15,
            'home',
            'cutter',
            1,
            makeStats({ catching: 20, awareness: 30 }),
        );
        const strongReceiver = createAIMockPlayer(
            6,
            15,
            'home',
            'cutter',
            2,
            makeStats({ catching: 95, awareness: 90 }),
        );
        const defenders = [
            createAIMockPlayer(-20, 15, 'away', 'cutter', 0),
            createAIMockPlayer(20, 15, 'away', 'cutter', 1),
        ];

        const action = decideOffenseWithDisc(
            thrower,
            [thrower, weakReceiver, strongReceiver],
            defenders,
            2,
            100,
            0,
            0,
        );

        expect(action.type).toBe('throw');
        expect(action.throwParams!.direction.x).toBeGreaterThan(0);
    });

    it('contests in-flight discs when defender is in range', () => {
        Random.seed(77);
        const defender = createAIMockPlayer(0, 10, 'away', 'cutter', 0);
        const mark = createAIMockPlayer(3, 11, 'home', 'cutter', 1);
        const action = decideDefense(
            defender,
            mark,
            null,
            new THREE.Vector3(0.5, 1.2, 10.5),
            false,
            0,
            true,
            0.2,
        );
        expect(action.type).toBe('move');
        expect(action.sprint).toBe(true);
        expect(action.target?.x).toBeCloseTo(0.5, 1);
    });

    it('adapts force side based on sideline pressure', () => {
        const ai = new TeamAI();
        ai.setDefenseType('man');
        ai.resetForPoint();

        const defenders = createSevenPlayers('away');
        const offenders = createSevenPlayers('home');
        offenders[0].holdingDisc = true;

        ai.update(
            0.1,
            createTeam(defenders),
            createTeam(offenders),
            { position: new THREE.Vector3(14, 0, 40), state: 'held' } as any,
            false,
            100,
            2,
            0,
            0,
        );
        expect(ai.getDebugForceSide()).toBe(-1);

        ai.update(
            0.1,
            createTeam(defenders),
            createTeam(offenders),
            { position: new THREE.Vector3(-14, 0, 40), state: 'held' } as any,
            false,
            100,
            2,
            0,
            0,
        );
        expect(ai.getDebugForceSide()).toBe(1);
    });

    it('assigns a help defender in the red zone', () => {
        const ai = new TeamAI();
        ai.setDefenseType('man');
        ai.resetForPoint();

        const defenders = createSevenPlayers('away');
        const offenders = createSevenPlayers('home');
        offenders[0].holdingDisc = true;
        offenders.forEach((p, idx) => p.movement.position.set(idx - 3, 0, 10 + idx));

        ai.update(
            0.16,
            createTeam(defenders),
            createTeam(offenders),
            { position: new THREE.Vector3(2, 0, 11), state: 'held' } as any,
            false,
            100,
            6,
            0,
            0,
        );

        expect(ai.getDebugHelpDefenderIndex()).not.toBeNull();
    });
});

describe('Data: PlayerStats', () => {
    describe('PlayerStats constructor', () => {
        it('creates player with valid default attributes', () => {
            const player = new PlayerStats('p1', 'Alex', 'Chen', 'handler');

            expect(player.id).toBe('p1');
            expect(player.firstName).toBe('Alex');
            expect(player.lastName).toBe('Chen');
            expect(player.role).toBe('handler');
            expect(player.attributes.speed).toBeGreaterThanOrEqual(1);
            expect(player.attributes.speed).toBeLessThanOrEqual(100);
        });

        it('initializes all attribute fields', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'cutter');

            expect(player.attributes.speed).toBeDefined();
            expect(player.attributes.acceleration).toBeDefined();
            expect(player.attributes.stamina).toBeDefined();
            expect(player.attributes.throwPower).toBeDefined();
            expect(player.attributes.catching).toBeDefined();
            expect(player.attributes.marking).toBeDefined();
            expect(player.attributes.awareness).toBeDefined();
        });

        it('accepts partial attributes in constructor', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler', {
                speed: 80,
                throwAccuracy: 90,
            });

            expect(player.attributes.speed).toBe(80);
            expect(player.attributes.throwAccuracy).toBe(90);
            expect(player.attributes.stamina).toBe(50); // Default value
        });

        it('initializes career stats to zero', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'cutter');

            expect(player.career.gamesPlayed).toBe(0);
            expect(player.career.goals).toBe(0);
            expect(player.career.assists).toBe(0);
            expect(player.career.blocks).toBe(0);
        });
    });

    describe('getEffectiveStat', () => {
        it('returns base stat when no modifiers active', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler', {
                speed: 70,
            });
            player.form = 0;
            player.fatigue = 0;
            player.morale = 50;

            const effective = player.getEffectiveStat('speed');

            expect(effective).toBeCloseTo(70, 0);
        });

        it('applies positive form modifier', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler', {
                speed: 50,
            });
            player.form = 10; // +10%
            player.fatigue = 0;
            player.morale = 50;

            const effective = player.getEffectiveStat('speed');

            expect(effective).toBeGreaterThan(50);
            expect(effective).toBeCloseTo(55, 0);
        });

        it('applies fatigue penalty', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler', {
                speed: 50,
            });
            player.form = 0;
            player.fatigue = 50;
            player.morale = 50;

            const effective = player.getEffectiveStat('speed');

            expect(effective).toBeLessThan(50);
        });

        it('applies morale boost when morale is high', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler', {
                speed: 50,
            });
            player.form = 0;
            player.fatigue = 0;
            player.morale = 80;

            const effective = player.getEffectiveStat('speed');

            expect(effective).toBeGreaterThan(50);
        });

        it('clamps effective stat to valid range (1-100)', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler', {
                speed: 10,
            });
            player.form = -20;
            player.fatigue = 50;
            player.morale = 20;

            const effective = player.getEffectiveStat('speed');

            expect(effective).toBeGreaterThanOrEqual(1);
            expect(effective).toBeLessThanOrEqual(100);
        });
    });

    describe('train', () => {
        it('increases stat after training', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler', {
                speed: 50,
            });
            player.development.potential = 80;

            const initialSpeed = player.attributes.speed;
            player.train('speed', 10);

            expect(player.attributes.speed).toBeGreaterThan(initialSpeed);
        });

        it('does not increase stat beyond potential', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler', {
                speed: 75,
            });
            player.development.potential = 75;

            player.train('speed', 100);

            expect(player.attributes.speed).toBeLessThanOrEqual(75);
        });

        it('increases experience after training', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler');
            const initialXP = player.development.experience;

            player.train('speed', 10);

            expect(player.development.experience).toBeGreaterThan(initialXP);
        });
    });

    describe('ageYear', () => {
        it('increases age by 1', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler');
            const initialAge = player.development.age;

            player.ageYear();

            expect(player.development.age).toBe(initialAge + 1);
        });

        it('applies decline to physical stats after peak age', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler', {
                speed: 80,
                jumping: 70,
            });
            player.development.age = 25;
            player.development.peakAge = 25;

            // Age 4 years past peak
            player.ageYear();
            player.ageYear();
            player.ageYear();
            player.ageYear();

            expect(player.attributes.speed).toBeLessThan(80);
        });

        it('increases potential when under peak age', () => {
            const player = new PlayerStats('p1', 'Test', 'Player', 'handler');
            player.development.age = 20;
            player.development.peakAge = 27;
            const initialPotential = player.development.potential;

            player.ageYear();

            expect(player.development.potential).toBeGreaterThanOrEqual(initialPotential);
        });
    });

    describe('generatePlayer', () => {
        it('creates player with valid attribute ranges', () => {
            const player = generatePlayer();

            const attrs = Object.values(player.attributes);
            attrs.forEach(value => {
                expect(value).toBeGreaterThanOrEqual(1);
                expect(value).toBeLessThanOrEqual(99);
            });
        });

        it('creates handler with higher throwing stats', () => {
            const handler = generatePlayer('handler');
            const cutter = generatePlayer('cutter');

            expect(handler.attributes.throwAccuracy).toBeGreaterThanOrEqual(55);
            expect(handler.attributes.throwAccuracy).toBeGreaterThan(cutter.attributes.throwAccuracy - 20);
        });

        it('creates cutter with higher physical stats', () => {
            const cutter = generatePlayer('cutter');

            expect(cutter.attributes.speed).toBeGreaterThanOrEqual(55);
            expect(cutter.attributes.acceleration).toBeGreaterThanOrEqual(55);
        });

        it('sets specified age when provided', () => {
            const player = generatePlayer('handler', 25);

            expect(player.development.age).toBe(25);
        });

        it('generates unique player ID', () => {
            const player1 = generatePlayer();
            const player2 = generatePlayer();

            expect(player1.id).not.toBe(player2.id);
        });
    });

    describe('generateRoster', () => {
        it('generates correct roster size', () => {
            const roster = generateRoster(20);

            expect(roster).toHaveLength(20);
        });

        it('includes handlers, cutters, and hybrids', () => {
            const roster = generateRoster(20);

            const handlers = roster.filter(p => p.role === 'handler');
            const cutters = roster.filter(p => p.role === 'cutter');
            const hybrids = roster.filter(p => p.role === 'hybrid');

            expect(handlers.length).toBeGreaterThan(0);
            expect(cutters.length).toBeGreaterThan(0);
            expect(handlers.length + cutters.length + hybrids.length).toBe(20);
        });

        it('generates approximately 30% handlers', () => {
            const roster = generateRoster(20);
            const handlers = roster.filter(p => p.role === 'handler');

            expect(handlers.length).toBeGreaterThanOrEqual(4);
            expect(handlers.length).toBeLessThanOrEqual(8);
        });
    });

    describe('overallRating', () => {
        it('returns rating in valid range', () => {
            const player = generatePlayer();
            const rating = player.overallRating;

            expect(rating).toBeGreaterThanOrEqual(1);
            expect(rating).toBeLessThanOrEqual(100);
        });

        it('returns higher rating for player with better stats', () => {
            const weakPlayer = new PlayerStats('p1', 'Weak', 'Player', 'handler', {
                speed: 30, throwAccuracy: 30, catching: 30,
            });
            const strongPlayer = new PlayerStats('p2', 'Strong', 'Player', 'handler', {
                speed: 90, throwAccuracy: 90, catching: 90,
            });

            expect(strongPlayer.overallRating).toBeGreaterThan(weakPlayer.overallRating);
        });
    });
});

describe('Data: SaveLoad', () => {
    describe('getDefaultSettings', () => {
        it('returns valid settings object', () => {
            const settings = getDefaultSettings();

            expect(settings).toBeDefined();
            expect(settings.audio).toBeDefined();
            expect(settings.graphics).toBeDefined();
            expect(settings.gameplay).toBeDefined();
            expect(settings.controls).toBeDefined();
            expect(settings.accessibility).toBeDefined();
        });

        it('returns audio settings in valid range', () => {
            const settings = getDefaultSettings();

            expect(settings.audio.masterVolume).toBeGreaterThanOrEqual(0);
            expect(settings.audio.masterVolume).toBeLessThanOrEqual(1);
            expect(settings.audio.musicVolume).toBeGreaterThanOrEqual(0);
            expect(settings.audio.musicVolume).toBeLessThanOrEqual(1);
        });

        it('returns valid graphics quality setting', () => {
            const settings = getDefaultSettings();

            expect(['low', 'medium', 'high']).toContain(settings.graphics.quality);
        });

        it('includes all required key bindings', () => {
            const settings = getDefaultSettings();

            expect(settings.controls.keyBindings.moveForward).toBeDefined();
            expect(settings.controls.keyBindings.moveBack).toBeDefined();
            expect(settings.controls.keyBindings.sprint).toBeDefined();
            expect(settings.controls.keyBindings.pause).toBeDefined();
        });

        it('includes accessibility options', () => {
            const settings = getDefaultSettings();

            expect(settings.accessibility.colorBlindMode).toBeDefined();
            expect(settings.accessibility.highContrast).toBeDefined();
            expect(settings.accessibility.largeText).toBeDefined();
        });
    });

    describe('SaveManager settings', () => {
        beforeEach(() => {
            // Clear localStorage before each test
            localStorage.clear();
        });

        it('persists and loads settings', () => {
            const customSettings = {
                audio: {
                    masterVolume: 0.5,
                    musicVolume: 0.3,
                    sfxVolume: 0.7,
                    ambientVolume: 0.4,
                },
            };

            saveManager.saveSettings(customSettings);
            const loaded = saveManager.loadSettings();

            expect(loaded.audio.masterVolume).toBe(0.5);
            expect(loaded.audio.musicVolume).toBe(0.3);
        });

        it('merges partial settings with defaults', () => {
            saveManager.saveSettings({
                audio: { masterVolume: 0.5 },
            } as any);

            const loaded = saveManager.getSettings();

            expect(loaded.audio.masterVolume).toBe(0.5);
            expect(loaded.graphics).toBeDefined(); // Defaults preserved
        });
    });

    describe('createNewCareer', () => {
        it('creates career with specified player and team name', () => {
            const career = createNewCareer('John Doe', 'Sky Hawks');

            expect(career.playerName).toBe('John Doe');
            expect(career.teamName).toBe('Sky Hawks');
        });

        it('generates roster of correct size', () => {
            const career = createNewCareer('Test Player', 'Test Team');

            expect(career.team.roster).toHaveLength(15);
        });

        it('initializes team stats to zero', () => {
            const career = createNewCareer('Test Player', 'Test Team');

            expect(career.team.stats.wins).toBe(0);
            expect(career.team.stats.losses).toBe(0);
            expect(career.team.stats.pointsFor).toBe(0);
            expect(career.team.stats.pointsAgainst).toBe(0);
        });

        it('sets starting budget from constants', () => {
            const career = createNewCareer('Test Player', 'Test Team');

            expect(career.finances.budget).toBe(CAREER_CONSTANTS.STARTING_BUDGET);
        });

        it('initializes reputation values', () => {
            const career = createNewCareer('Test Player', 'Test Team');

            expect(career.reputation.overall).toBeGreaterThanOrEqual(0);
            expect(career.reputation.skill).toBeGreaterThanOrEqual(0);
            expect(career.reputation.spirit).toBeGreaterThanOrEqual(0);
        });

        it('includes default playbook with formations', () => {
            const career = createNewCareer('Test Player', 'Test Team');

            expect(career.playbook).toBeDefined();
            expect(career.playbook.formations).toHaveLength(2);
            expect(career.playbook.formations[0].name).toBe('Vertical Stack');
        });

        it('generates season schedule', () => {
            const career = createNewCareer('Test Player', 'Test Team');

            expect(career.schedule).toHaveLength(CAREER_CONSTANTS.DEFAULT_SEASON_LENGTH);
        });
    });

    describe('generateSeasonSchedule', () => {
        it('generates schedule of correct length', () => {
            const schedule = generateSeasonSchedule(1);

            expect(schedule).toHaveLength(CAREER_CONSTANTS.DEFAULT_SEASON_LENGTH);
        });

        it('includes tournament events', () => {
            const schedule = generateSeasonSchedule(1);
            const tournaments = schedule.filter(e => e.type === 'tournament');

            expect(tournaments.length).toBeGreaterThan(0);
        });

        it('includes practice events', () => {
            const schedule = generateSeasonSchedule(1);
            const practices = schedule.filter(e => e.type === 'practice');

            expect(practices.length).toBeGreaterThan(0);
        });

        it('includes rest events', () => {
            const schedule = generateSeasonSchedule(1);
            const rest = schedule.filter(e => e.type === 'rest');

            expect(rest.length).toBeGreaterThan(0);
        });

        it('assigns incrementing week dates', () => {
            const schedule = generateSeasonSchedule(1);

            for (let i = 1; i < schedule.length; i++) {
                expect(schedule[i].date).toBeGreaterThan(schedule[i - 1].date);
            }
        });

        it('includes valid practice focuses', () => {
            const schedule = generateSeasonSchedule(1);
            const practices = schedule.filter(e => e.type === 'practice') as any[];

            practices.forEach(practice => {
                expect(['offense', 'defense', 'conditioning', 'throws']).toContain(practice.focus);
            });
        });
    });

    describe('SaveManager core functionality', () => {
        beforeEach(() => {
            localStorage.clear();
            saveManager.deleteSave();
        });

        it('reports no save when none exists', () => {
            expect(saveManager.hasSave()).toBe(false);
        });

        it('reports save exists after saving', () => {
            saveManager.save({ tutorialCompleted: true });

            expect(saveManager.hasSave()).toBe(true);
        });

        it('creates new save with correct structure', () => {
            const newSave = saveManager.createNewSave();

            expect(newSave.version).toBe(1);
            expect(newSave.career).toBeNull();
            expect(newSave.achievements).toEqual([]);
            expect(newSave.stats).toBeDefined();
        });

        it('loads null when no save exists', () => {
            const loaded = saveManager.load();

            expect(loaded).toBeNull();
        });

        it('persists and loads save data', () => {
            const testData = {
                tutorialCompleted: true,
                quickMatchUnlocked: true,
            };

            saveManager.save(testData);
            const loaded = saveManager.load();

            expect(loaded?.tutorialCompleted).toBe(true);
            expect(loaded?.quickMatchUnlocked).toBe(true);
        });
    });
});
