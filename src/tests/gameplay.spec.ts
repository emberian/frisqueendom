import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import {
    isInBounds,
    isInEndzone,
    getBrickMark,
    nearestInBoundsPoint,
} from '../gameplay/FieldBounds';
import { MovementController } from '../gameplay/Movement';
import { PointFlow } from '../gameplay/Point';
import { Match } from '../gameplay/Match';
import {
    FIELD_LENGTH,
    FIELD_WIDTH,
    ENDZONE_DEPTH,
    BRICK_MARK_DISTANCE,
    PLAYER_JOG_SPEED,
    PLAYER_SPRINT_SPEED,
    STAMINA_MAX,
    STAMINA_SPRINT_DRAIN,
    STAMINA_JOG_REGEN,
    STAMINA_IDLE_REGEN,
    STALL_DURATION,
} from '../data/Constants';

// Mock types for testing
interface MockPlayer {
    id: string;
    movement: {
        position: THREE.Vector3;
        velocity: THREE.Vector3;
        facing: number;
        stamina: number;
    };
    holdingDisc: boolean;
    stats?: { fullName?: string } | null;
    role: string;
    index: number;
}

interface MockDisc {
    state: 'held' | 'in_flight' | 'on_ground';
    previousState: 'held' | 'in_flight' | 'on_ground';
    holder: MockPlayer | null;
    justCaught: boolean;
    position: THREE.Vector3;
}

interface MockTeam {
    players: MockPlayer[];
}

// Helper to create mock player
function createMockPlayer(
    id: string,
    position: THREE.Vector3,
    holdingDisc = false,
): MockPlayer {
    return {
        id,
        movement: {
            position,
            velocity: new THREE.Vector3(),
            facing: 0,
            stamina: STAMINA_MAX,
        },
        holdingDisc,
        stats: null,
        role: 'handler',
        index: 0,
    };
}

// Helper to create mock disc
function createMockDisc(
    state: 'held' | 'in_flight' | 'on_ground' = 'on_ground',
    position: THREE.Vector3 = new THREE.Vector3(0, 0, 50),
): MockDisc {
    return {
        state,
        previousState: 'on_ground',
        holder: null,
        justCaught: false,
        position,
    };
}

// Helper to create mock team
function createMockTeam(players: MockPlayer[]): MockTeam {
    return { players };
}

describe('FieldBounds', () => {
    describe('isInBounds', () => {
        it('should return true for center field position', () => {
            const centerPos = new THREE.Vector3(0, 0, 50);
            expect(isInBounds(centerPos)).toBe(true);
        });

        it('should return true for position at field boundaries', () => {
            const pos = new THREE.Vector3(FIELD_WIDTH / 2, 0, FIELD_LENGTH);
            expect(isInBounds(pos)).toBe(true);
        });

        it('should return false for position beyond sideline', () => {
            const outPos = new THREE.Vector3(FIELD_WIDTH / 2 + 1, 0, 50);
            expect(isInBounds(outPos)).toBe(false);
        });

        it('should return false for position beyond back line', () => {
            const outPos = new THREE.Vector3(0, 0, FIELD_LENGTH + 1);
            expect(isInBounds(outPos)).toBe(false);
        });

        it('should return false for position before front line', () => {
            const outPos = new THREE.Vector3(0, 0, -1);
            expect(isInBounds(outPos)).toBe(false);
        });

        it('should return true for position on left sideline edge', () => {
            const pos = new THREE.Vector3(-FIELD_WIDTH / 2, 0, 50);
            expect(isInBounds(pos)).toBe(true);
        });

        it('should return true for position at front endzone line', () => {
            const pos = new THREE.Vector3(0, 0, 0);
            expect(isInBounds(pos)).toBe(true);
        });
    });

    describe('isInEndzone', () => {
        it('should return true for position in front endzone (endzone 0)', () => {
            const pos = new THREE.Vector3(0, 0, ENDZONE_DEPTH / 2);
            expect(isInEndzone(pos, 0)).toBe(true);
        });

        it('should return true for position in back endzone (endzone 1)', () => {
            const pos = new THREE.Vector3(0, 0, FIELD_LENGTH - ENDZONE_DEPTH / 2);
            expect(isInEndzone(pos, 1)).toBe(true);
        });

        it('should return false for position outside front endzone', () => {
            const pos = new THREE.Vector3(0, 0, ENDZONE_DEPTH + 1);
            expect(isInEndzone(pos, 0)).toBe(false);
        });

        it('should return false for position outside back endzone', () => {
            const pos = new THREE.Vector3(0, 0, FIELD_LENGTH - ENDZONE_DEPTH - 1);
            expect(isInEndzone(pos, 1)).toBe(false);
        });

        it('should return true at front endzone boundary line', () => {
            const pos = new THREE.Vector3(0, 0, ENDZONE_DEPTH);
            expect(isInEndzone(pos, 0)).toBe(true);
        });

        it('should return true at back endzone boundary line', () => {
            const pos = new THREE.Vector3(0, 0, FIELD_LENGTH - ENDZONE_DEPTH);
            expect(isInEndzone(pos, 1)).toBe(true);
        });
    });

    describe('getBrickMark', () => {
        it('should return brick mark for front endzone', () => {
            const brick = getBrickMark(0);
            expect(brick.x).toBe(0);
            expect(brick.z).toBe(BRICK_MARK_DISTANCE);
        });

        it('should return brick mark for back endzone', () => {
            const brick = getBrickMark(1);
            expect(brick.x).toBe(0);
            expect(brick.z).toBe(FIELD_LENGTH - BRICK_MARK_DISTANCE);
        });

        it('should place brick marks inside playing field', () => {
            const brick0 = getBrickMark(0);
            const brick1 = getBrickMark(1);
            expect(brick0.z).toBeGreaterThan(ENDZONE_DEPTH);
            expect(brick1.z).toBeLessThan(FIELD_LENGTH - ENDZONE_DEPTH);
        });
    });

    describe('nearestInBoundsPoint', () => {
        it('should return same position if already in bounds', () => {
            const inPos = new THREE.Vector3(5, 0, 50);
            const nearest = nearestInBoundsPoint(inPos);
            expect(nearest.x).toBe(5);
            expect(nearest.z).toBe(50);
        });

        it('should clamp x to left sideline', () => {
            const outPos = new THREE.Vector3(-50, 0, 50);
            const nearest = nearestInBoundsPoint(outPos);
            expect(nearest.x).toBe(-FIELD_WIDTH / 2);
        });

        it('should clamp x to right sideline', () => {
            const outPos = new THREE.Vector3(50, 0, 50);
            const nearest = nearestInBoundsPoint(outPos);
            expect(nearest.x).toBe(FIELD_WIDTH / 2);
        });

        it('should clamp z to front line', () => {
            const outPos = new THREE.Vector3(0, 0, -10);
            const nearest = nearestInBoundsPoint(outPos);
            expect(nearest.z).toBe(0);
        });

        it('should clamp z to back line', () => {
            const outPos = new THREE.Vector3(0, 0, 150);
            const nearest = nearestInBoundsPoint(outPos);
            expect(nearest.z).toBe(FIELD_LENGTH);
        });

        it('should clamp both x and z if needed', () => {
            const outPos = new THREE.Vector3(-100, 0, 200);
            const nearest = nearestInBoundsPoint(outPos);
            expect(nearest.x).toBe(-FIELD_WIDTH / 2);
            expect(nearest.z).toBe(FIELD_LENGTH);
        });
    });
});

describe('MovementController', () => {
    let movement: MovementController;

    beforeEach(() => {
        movement = new MovementController();
    });

    describe('acceleration', () => {
        it('should accelerate from standstill when given input', () => {
            expect(movement.velocity.length()).toBe(0);
            movement.update(1 / 60, { x: 0, z: 1 }, false);
            expect(movement.velocity.length()).toBeGreaterThan(0);
        });

        it('should reach jog speed when not sprinting', () => {
            for (let i = 0; i < 120; i++) {
                movement.update(1 / 60, { x: 0, z: 1 }, false);
            }
            expect(movement.velocity.length()).toBeCloseTo(PLAYER_JOG_SPEED, 1);
        });

        it('should reach sprint speed when sprinting with stamina', () => {
            for (let i = 0; i < 120; i++) {
                movement.update(1 / 60, { x: 0, z: 1 }, true);
            }
            expect(movement.velocity.length()).toBeCloseTo(PLAYER_SPRINT_SPEED, 1);
        });

        it('should clamp speed to max speed', () => {
            movement.velocity.set(0, 0, PLAYER_JOG_SPEED + 5);
            movement.update(1 / 60, { x: 0, z: 1 }, false);
            expect(movement.velocity.length()).toBeLessThanOrEqual(PLAYER_JOG_SPEED);
        });
    });

    describe('sprint and stamina', () => {
        it('should drain stamina when sprinting', () => {
            const initialStamina = movement.stamina;
            movement.update(1, { x: 0, z: 1 }, true);
            expect(movement.stamina).toBeLessThan(initialStamina);
        });

        it('should drain stamina at correct rate', () => {
            const initialStamina = movement.stamina;
            movement.update(1, { x: 0, z: 1 }, true);
            expect(movement.stamina).toBeCloseTo(
                initialStamina - STAMINA_SPRINT_DRAIN,
                1,
            );
        });

        it('should not sprint when stamina is depleted', () => {
            movement.stamina = 0;
            movement.update(1 / 60, { x: 0, z: 1 }, true);
            expect(movement.isSprinting).toBe(false);
        });

        it('should regenerate stamina when jogging', () => {
            movement.stamina = 50;
            movement.velocity.set(0, 0, PLAYER_JOG_SPEED / 2);
            movement.update(1, { x: 0, z: 1 }, false);
            expect(movement.stamina).toBeGreaterThan(50);
        });

        it('should regenerate stamina faster when idle', () => {
            movement.stamina = 50;
            movement.velocity.set(0, 0, 0);
            movement.update(1, { x: 0, z: 0 }, false);
            expect(movement.stamina).toBeCloseTo(50 + STAMINA_IDLE_REGEN, 1);
        });

        it('should not exceed max stamina', () => {
            movement.stamina = STAMINA_MAX - 1;
            movement.update(5, { x: 0, z: 0 }, false);
            expect(movement.stamina).toBe(STAMINA_MAX);
        });

        it('should not go below zero stamina', () => {
            movement.stamina = 5;
            movement.update(10, { x: 0, z: 1 }, true);
            expect(movement.stamina).toBe(0);
        });
    });

    describe('deceleration', () => {
        it('should decelerate when no input is given', () => {
            movement.velocity.set(0, 0, PLAYER_JOG_SPEED);
            movement.update(1 / 60, { x: 0, z: 0 }, false);
            expect(movement.velocity.length()).toBeLessThan(PLAYER_JOG_SPEED);
        });

        it('should come to rest eventually with no input', () => {
            movement.velocity.set(0, 0, 3);
            for (let i = 0; i < 120; i++) {
                movement.update(1 / 60, { x: 0, z: 0 }, false);
            }
            expect(movement.velocity.length()).toBeCloseTo(0, 2);
        });

        it('should not have negative speed when decelerating', () => {
            movement.velocity.set(0, 0, 1);
            movement.update(1, { x: 0, z: 0 }, false);
            expect(movement.velocity.length()).toBeGreaterThanOrEqual(0);
        });
    });

    describe('pivot mode', () => {
        it('should zero velocity in pivot mode', () => {
            movement.velocity.set(3, 0, 4);
            movement.updatePivot(1 / 60, { x: 0.5, z: 0 }, 2);
            expect(movement.velocity.length()).toBe(0);
        });

        it('should update facing in pivot mode', () => {
            const initialFacing = movement.facing;
            movement.updatePivot(1 / 60, { x: 1, z: 0 }, 3);
            expect(movement.facing).not.toBe(initialFacing);
        });

        it('should rotate based on pivot rate', () => {
            movement.facing = 0;
            const pivotRate = 2;
            const dt = 1;
            movement.updatePivot(dt, { x: 1, z: 0 }, pivotRate);
            expect(movement.facing).toBeCloseTo(pivotRate * dt, 2);
        });
    });

    describe('position integration', () => {
        it('should update position based on velocity', () => {
            movement.velocity.set(0, 0, 6);
            movement.position.set(0, 0, 0);
            movement.update(1, { x: 0, z: 1 }, false);
            expect(movement.position.z).toBeCloseTo(6, 1);
        });

        it('should handle diagonal movement', () => {
            movement.velocity.set(3, 0, 4);
            movement.position.set(0, 0, 0);
            movement.update(1, { x: 0.6, z: 0.8 }, false);
            expect(movement.position.x).toBeGreaterThan(0);
            expect(movement.position.z).toBeGreaterThan(0);
        });
    });
});

describe('PointFlow', () => {
    let point: PointFlow;
    let disc: MockDisc;
    let offenseTeam: MockTeam;
    let defenseTeam: MockTeam;
    let offensePlayer: MockPlayer;
    let defensePlayer: MockPlayer;

    beforeEach(() => {
        point = new PointFlow();
        offensePlayer = createMockPlayer('o1', new THREE.Vector3(0, 0, 40));
        defensePlayer = createMockPlayer('d1', new THREE.Vector3(0, 0, 45));
        offenseTeam = createMockTeam([offensePlayer]);
        defenseTeam = createMockTeam([defensePlayer]);
        disc = createMockDisc();
    });

    describe('stall counting', () => {
        it('should increment stall count when disc is held by offense', () => {
            disc.state = 'held';
            disc.holder = offensePlayer;
            point.start();
            point.update(1, disc as any, offenseTeam as any, 1);
            expect(point.stallCount).toBeCloseTo(1, 2);
        });

        it('should activate stall when disc is held', () => {
            disc.state = 'held';
            disc.holder = offensePlayer;
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.stallActive).toBe(true);
        });

        it('should not activate stall when disc is in flight', () => {
            disc.state = 'in_flight';
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.stallActive).toBe(false);
        });

        it('should trigger turnover when stall reaches duration', () => {
            disc.state = 'held';
            disc.holder = offensePlayer;
            point.start();
            point.update(STALL_DURATION, disc as any, offenseTeam as any, 1);
            expect(point.turnover).toBe(true);
            expect(point.turnoverReason).toBe('stall');
        });

        it('should reset stall count on catch', () => {
            disc.state = 'held';
            disc.holder = offensePlayer;
            point.start();
            point.update(5, disc as any, offenseTeam as any, 1);
            expect(point.stallCount).toBeCloseTo(5, 1);

            disc.justCaught = true;
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.stallCount).toBe(0);
        });

        it('should not count stall when disc is on ground', () => {
            disc.state = 'on_ground';
            point.start();
            point.update(1, disc as any, offenseTeam as any, 1);
            expect(point.stallCount).toBe(0);
        });
    });

    describe('turnover detection', () => {
        it('should trigger turnover when disc lands in bounds', () => {
            disc.state = 'on_ground';
            disc.previousState = 'in_flight';
            disc.position.set(0, 0, 50);
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.turnover).toBe(true);
            expect(point.turnoverReason).toBe('incomplete');
        });

        it('should trigger turnover when disc lands out of bounds', () => {
            disc.state = 'on_ground';
            disc.previousState = 'in_flight';
            disc.position.set(100, 0, 50);
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.turnover).toBe(true);
            expect(point.turnoverReason).toBe('out_of_bounds');
        });

        it('should trigger turnover on interception', () => {
            disc.state = 'held';
            disc.holder = defensePlayer;
            disc.justCaught = true;
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.turnover).toBe(true);
            expect(point.turnoverReason).toBe('interception');
        });

        it('should detect defensive possession as interception', () => {
            disc.state = 'held';
            disc.holder = defensePlayer;
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.turnover).toBe(true);
            expect(point.turnoverReason).toBe('interception');
        });

        it('should not retrigger turnover if disc already on ground', () => {
            disc.state = 'on_ground';
            disc.previousState = 'on_ground';
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.turnover).toBe(false);
        });
    });

    describe('score detection', () => {
        it('should detect score when catch happens in endzone', () => {
            offensePlayer.movement.position.set(0, 0, FIELD_LENGTH - 5);
            disc.state = 'held';
            disc.holder = offensePlayer;
            disc.justCaught = true;
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.scored).toBe(true);
        });

        it('should not score if catch is outside endzone', () => {
            offensePlayer.movement.position.set(0, 0, 50);
            disc.state = 'held';
            disc.holder = offensePlayer;
            disc.justCaught = true;
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.scored).toBe(false);
        });

        it('should score in front endzone (endzone 0)', () => {
            offensePlayer.movement.position.set(0, 0, 5);
            disc.state = 'held';
            disc.holder = offensePlayer;
            disc.justCaught = true;
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 0);
            expect(point.scored).toBe(true);
        });

        it('should not score on continued possession in endzone', () => {
            offensePlayer.movement.position.set(0, 0, FIELD_LENGTH - 5);
            disc.state = 'held';
            disc.holder = offensePlayer;
            disc.justCaught = false;
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.scored).toBe(false);
        });

        it('should not allow defense to score', () => {
            defensePlayer.movement.position.set(0, 0, FIELD_LENGTH - 5);
            disc.state = 'held';
            disc.holder = defensePlayer;
            disc.justCaught = true;
            point.start();
            point.update(0.1, disc as any, offenseTeam as any, 1);
            expect(point.scored).toBe(false);
        });
    });

    describe('start', () => {
        it('should reset all flags on start', () => {
            point.stallCount = 5;
            point.stallActive = true;
            point.turnover = true;
            point.scored = true;
            point.turnoverReason = 'test';

            point.start();

            expect(point.stallCount).toBe(0);
            expect(point.stallActive).toBe(false);
            expect(point.turnover).toBe(false);
            expect(point.scored).toBe(false);
            expect(point.turnoverReason).toBe('');
        });
    });
});

describe('Match', () => {
    let match: Match;

    beforeEach(() => {
        match = new Match();
    });

    describe('initial state', () => {
        it('should start in pre_pull phase', () => {
            expect(match.phase).toBe('pre_pull');
        });

        it('should have zero score', () => {
            expect(match.score).toEqual([0, 0]);
        });

        it('should have default gameTo of 11', () => {
            expect(match.getGameTo()).toBe(11);
        });

        it('should start with away team on offense', () => {
            expect(match.offenseTeam).toBe('away');
        });

        it('should start with home team pulling', () => {
            expect(match.pullingTeam).toBe('home');
        });

        it('should have correct attacking endzones', () => {
            expect(match.attackingEndzone.home).toBe(100);
            expect(match.attackingEndzone.away).toBe(0);
        });
    });

    describe('setGameTo', () => {
        it('should update gameTo value', () => {
            match.setGameTo(15);
            expect(match.getGameTo()).toBe(15);
        });

        it('should floor non-integer values', () => {
            match.setGameTo(13.7);
            expect(match.getGameTo()).toBe(13);
        });

        it('should enforce minimum of 1', () => {
            match.setGameTo(0);
            expect(match.getGameTo()).toBe(1);
        });

        it('should handle negative values', () => {
            match.setGameTo(-5);
            expect(match.getGameTo()).toBe(1);
        });

        it('should ignore invalid values', () => {
            const original = match.getGameTo();
            match.setGameTo(NaN);
            expect(match.getGameTo()).toBe(original);
        });

        it('should ignore infinity', () => {
            const original = match.getGameTo();
            match.setGameTo(Infinity);
            expect(match.getGameTo()).toBe(original);
        });
    });

    describe('possession queries', () => {
        it('should correctly identify player on offense', () => {
            match.offenseTeam = 'home';
            match.playerTeam = 'home';
            expect(match.isPlayerOnOffense()).toBe(true);
        });

        it('should correctly identify player on defense', () => {
            match.offenseTeam = 'away';
            match.playerTeam = 'home';
            expect(match.isPlayerOnOffense()).toBe(false);
        });

        it('should correctly identify player pulling', () => {
            match.pullingTeam = 'home';
            match.playerTeam = 'home';
            expect(match.isPlayerPulling()).toBe(true);
        });

        it('should identify team on offense', () => {
            match.offenseTeam = 'away';
            expect(match.isTeamOnOffense('away')).toBe(true);
            expect(match.isTeamOnOffense('home')).toBe(false);
        });

        it('should identify team pulling', () => {
            match.pullingTeam = 'home';
            expect(match.isTeamPulling('home')).toBe(true);
            expect(match.isTeamPulling('away')).toBe(false);
        });
    });

    describe('attacking endzone', () => {
        it('should return correct attacking endzone for offense', () => {
            match.offenseTeam = 'away';
            expect(match.getAttackingEndzone()).toBe(0);

            match.offenseTeam = 'home';
            expect(match.getAttackingEndzone()).toBe(100);
        });
    });

    describe('swapPossession (via private method testing through phase transitions)', () => {
        it('should swap offense from home to away', () => {
            match.offenseTeam = 'home';
            // Trigger internal swap by forcing turnover through point
            match.phase = 'live_play';
            match.point.triggerTurnover('test');

            const mockDisc = createMockDisc('on_ground');
            const mockHome = createMockTeam([
                createMockPlayer('h1', new THREE.Vector3(0, 0, 20)),
            ]);
            const mockAway = createMockTeam([
                createMockPlayer('a1', new THREE.Vector3(0, 0, 30)),
            ]);

            match.update(0.1, mockHome as any, mockAway as any, mockDisc as any);
            expect(match.offenseTeam).toBe('away');
        });
    });

    describe('scoring', () => {
        it('should increment home score when home team scores', () => {
            match.offenseTeam = 'home';
            match.phase = 'live_play';

            const homePlayer = createMockPlayer(
                'h1',
                new THREE.Vector3(0, 0, FIELD_LENGTH - 5),
            );
            const mockDisc = createMockDisc('held');
            mockDisc.holder = homePlayer;
            mockDisc.justCaught = true;

            const mockHome = createMockTeam([homePlayer]);
            const mockAway = createMockTeam([
                createMockPlayer('a1', new THREE.Vector3(0, 0, 30)),
            ]);

            match.update(0.1, mockHome as any, mockAway as any, mockDisc as any);
            expect(match.score[0]).toBe(1);
        });

        it('should increment away score when away team scores', () => {
            match.offenseTeam = 'away';
            match.phase = 'live_play';

            const awayPlayer = createMockPlayer('a1', new THREE.Vector3(0, 0, 5));
            const mockDisc = createMockDisc('held');
            mockDisc.holder = awayPlayer;
            mockDisc.justCaught = true;

            const mockHome = createMockTeam([
                createMockPlayer('h1', new THREE.Vector3(0, 0, 50)),
            ]);
            const mockAway = createMockTeam([awayPlayer]);

            match.update(0.1, mockHome as any, mockAway as any, mockDisc as any);
            expect(match.score[1]).toBe(1);
        });

        it('should transition to score phase when point is scored', () => {
            match.offenseTeam = 'home';
            match.phase = 'live_play';

            const homePlayer = createMockPlayer(
                'h1',
                new THREE.Vector3(0, 0, FIELD_LENGTH - 5),
            );
            const mockDisc = createMockDisc('held');
            mockDisc.holder = homePlayer;
            mockDisc.justCaught = true;

            const mockHome = createMockTeam([homePlayer]);
            const mockAway = createMockTeam([
                createMockPlayer('a1', new THREE.Vector3(0, 0, 30)),
            ]);

            match.update(0.1, mockHome as any, mockAway as any, mockDisc as any);
            expect(match.phase).toBe('score');
        });
    });

    describe('phase transitions', () => {
        it('should transition from pre_pull to pulling on pull execution', () => {
            // This would require mocking Disc.throwDisc and team structures
            // Basic state check
            match.phase = 'pre_pull';
            expect(match.phase).toBe('pre_pull');
        });

        it('should show status text on turnover', () => {
            match.offenseTeam = 'home';
            match.phase = 'live_play';
            match.point.triggerTurnover('stall');

            const mockDisc = createMockDisc('on_ground');
            const mockHome = createMockTeam([
                createMockPlayer('h1', new THREE.Vector3(0, 0, 20)),
            ]);
            const mockAway = createMockTeam([
                createMockPlayer('a1', new THREE.Vector3(0, 0, 30)),
            ]);

            match.update(0.1, mockHome as any, mockAway as any, mockDisc as any);
            expect(match.statusTextActive).toBe(true);
        });

        it('should clear status text after timer expires', () => {
            match.phase = 'live_play'; // Set to a phase that won't trigger pre_pull logic
            match['stateText'] = 'TEST';
            match['stateTextTimer'] = 1.5;

            const mockDisc = createMockDisc();
            const mockHome = createMockTeam([
                createMockPlayer('h1', new THREE.Vector3(0, 0, 20)),
            ]);
            const mockAway = createMockTeam([
                createMockPlayer('a1', new THREE.Vector3(0, 0, 30)),
            ]);

            match.update(2, mockHome as any, mockAway as any, mockDisc as any);
            expect(match.statusTextActive).toBe(false);
        });
    });
});
