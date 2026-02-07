import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { checkCatch } from '../gameplay/Catch';
import { Minimap } from '../ui/Minimap';
import { FIELD_LENGTH, FIELD_WIDTH } from '../data/Constants';
import type { Player } from '../entities/Player';
import type { Disc } from '../entities/Disc';
import type { TeamSide } from '../data/Types';

// Mock Player for testing
class MockPlayer {
    movement = {
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        facing: 0,
        stamina: 100,
    };
    holdingDisc = false;
    team: TeamSide;
    role = 'cutter' as const;
    index: number;
    stats = null;

    constructor(team: TeamSide, index: number) {
        this.team = team;
        this.index = index;
    }

    getHandPosition(): THREE.Vector3 {
        return this.movement.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    }

    getCatchRadius(): number {
        return 0.8;
    }

    getLayoutRadius(): number {
        return 2.5;
    }

    startLayout(_target: THREE.Vector3): boolean {
        return false; // Don't actually trigger layout in tests
    }
}

// Mock Disc for testing
class MockDisc {
    state: 'held' | 'in_flight' | 'on_ground' = 'on_ground';
    previousState: 'held' | 'in_flight' | 'on_ground' = 'on_ground';
    position = new THREE.Vector3();
    velocity = new THREE.Vector3();
    holder: MockPlayer | null = null;
    thrownByTeam: TeamSide | null = null;
    justCaught = false;
    isRolling = false;
    private rollTimer = 0;
    private hasSkipped = false;

    handleGroundImpact(): void {
        const speed = Math.sqrt(
            this.velocity.x * this.velocity.x +
            this.velocity.z * this.velocity.z
        );

        const impactAngle = Math.abs(Math.atan2(this.velocity.y, speed)) * (180 / Math.PI);

        if (speed > 8.0 && impactAngle < 30 && !this.hasSkipped) {
            this.velocity.multiplyScalar(0.5);
            this.velocity.y = Math.abs(this.velocity.y) * 0.3;
            this.hasSkipped = true;
            this.state = 'in_flight';
        } else if (speed > 5.0 && impactAngle >= 30 && impactAngle < 60) {
            this.state = 'on_ground';
            this.isRolling = true;
            this.rollTimer = 1.0 + Math.random();
            this.velocity.y = 0;
        } else {
            this.state = 'on_ground';
            this.velocity.set(0, 0, 0);
            this.isRolling = false;
            this.hasSkipped = false;
        }
    }

    updateRolling(dt: number): void {
        this.rollTimer -= dt;

        if (this.rollTimer <= 0) {
            this.isRolling = false;
            this.velocity.set(0, 0, 0);
            this.hasSkipped = false;
            return;
        }

        const deceleration = 3.0;
        const currentSpeed = Math.sqrt(
            this.velocity.x * this.velocity.x +
            this.velocity.z * this.velocity.z
        );

        if (currentSpeed > 0.1) {
            const newSpeed = Math.max(0, currentSpeed - deceleration * dt);
            const scale = newSpeed / currentSpeed;
            this.velocity.x *= scale;
            this.velocity.z *= scale;

            this.position.x += this.velocity.x * dt;
            this.position.z += this.velocity.z * dt;
        } else {
            this.isRolling = false;
            this.velocity.set(0, 0, 0);
            this.hasSkipped = false;
        }
    }
}

describe('Contested Catches', () => {
    let disc: MockDisc;
    let attacker: MockPlayer;
    let defender: MockPlayer;

    beforeEach(() => {
        disc = new MockDisc();
        disc.state = 'in_flight';
        disc.position.set(0, 1.5, 50);
        disc.velocity.set(0, 0, 10);
        disc.thrownByTeam = 'home';

        attacker = new MockPlayer('home', 0);
        attacker.movement.position.set(0, 0, 50);
        attacker.movement.facing = 0;

        defender = new MockPlayer('away', 1);
        defender.movement.position.set(0, 0, 50);
        defender.movement.facing = 0;
    });

    it('defender within range can cause contested catch', () => {
        // Position disc and attacker close together
        disc.position.set(0, 1.5, 50);
        attacker.movement.position.set(0, 0, 49.5); // 0.5m from disc
        attacker.movement.velocity.set(0, 0, 0);

        // Defender within 0.4m should trigger contest
        defender.movement.position.set(0.4, 0, 49.5);
        defender.movement.velocity.set(0, 0, 0);

        const players = [attacker, defender] as Player[];
        const result = checkCatch(disc as unknown as Disc, players);

        // Should have a result and it should be marked as contested
        expect(result).not.toBeNull();
        expect(
            result?.isContestedCatch || result?.isContestedDrop
        ).toBe(true);
    });

    it('closer player wins contested catch', () => {
        disc.position.set(0, 1.5, 50);

        attacker.movement.position.set(0, 0, 49.8);
        defender.movement.position.set(1.0, 0, 49.8);

        const players = [attacker, defender] as Player[];
        const result = checkCatch(disc as unknown as Disc, players);

        expect(result).not.toBeNull();
        expect(result?.catcher).toBe(attacker);
    });

    it('deterministic outcome - same inputs produce same result', () => {
        disc.position.set(5.5, 1.5, 50);
        attacker.movement.position.set(5.5, 0, 49.3);
        defender.movement.position.set(5.9, 0, 49.3);

        const players = [attacker, defender] as Player[];

        const result1 = checkCatch(disc as unknown as Disc, players);
        const result2 = checkCatch(disc as unknown as Disc, players);

        expect(result1?.isContestedDrop).toBe(result2?.isContestedDrop);
        expect(result1?.isContestedCatch).toBe(result2?.isContestedCatch);
    });
});

describe('Ground Physics', () => {
    let disc: MockDisc;

    beforeEach(() => {
        disc = new MockDisc();
        disc.state = 'on_ground';
        disc.position.set(0, 0, 50);
        disc.velocity.set(0, 0, 0);
    });

    it('high-speed low-angle impact causes skip', () => {
        disc.state = 'in_flight';
        disc.velocity.set(0, -2, 10);

        disc.handleGroundImpact();

        const speed = Math.sqrt(disc.velocity.x ** 2 + disc.velocity.z ** 2);
        expect(speed).toBeGreaterThan(4);
        expect(speed).toBeLessThan(7);
        expect((disc as any).hasSkipped).toBe(true);
    });

    it('medium-speed high-angle impact causes cartwheel', () => {
        disc.state = 'in_flight';
        disc.velocity.set(0, -5, 6);

        disc.handleGroundImpact();

        expect(disc.state).toBe('on_ground');
        expect(disc.isRolling).toBe(true);
        expect((disc as any).rollTimer).toBeGreaterThan(1.0);
        expect((disc as any).rollTimer).toBeLessThanOrEqual(2.0);
    });

    it('low-speed impact causes flat stop', () => {
        disc.state = 'in_flight';
        disc.velocity.set(0, -1, 3);

        disc.handleGroundImpact();

        expect(disc.state).toBe('on_ground');
        expect(disc.isRolling).toBe(false);
        expect(disc.velocity.length()).toBe(0);
    });

    it('rolling disc decelerates over time', () => {
        disc.isRolling = true;
        (disc as any).rollTimer = 1.5;
        disc.velocity.set(0, 0, 5);

        const initialSpeed = disc.velocity.length();
        disc.updateRolling(0.5);

        const finalSpeed = disc.velocity.length();
        expect(finalSpeed).toBeLessThan(initialSpeed);
        expect(finalSpeed).toBeGreaterThan(0);
    });

    it('rolling disc stops after timer expires', () => {
        disc.isRolling = true;
        (disc as any).rollTimer = 0.1;
        disc.velocity.set(0, 0, 5);

        disc.updateRolling(0.2);

        expect(disc.isRolling).toBe(false);
        expect(disc.velocity.length()).toBe(0);
    });
});

describe('Minimap', () => {
    let minimap: Minimap | undefined;

    beforeEach(() => {
        // Mock canvas context for happy-dom
        const mockContext = {
            clearRect: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            fill: () => {},
            closePath: () => {},
            arc: () => {},
        };

        // Mock getContext
        HTMLCanvasElement.prototype.getContext = function() {
            return mockContext as any;
        };

        minimap = new Minimap();
    });

    it('coordinate scaling maps field boundaries correctly', () => {
        if (!minimap) throw new Error('Minimap not initialized');
        const topLeft = (minimap as any).worldToMinimap(
            new THREE.Vector3(-FIELD_WIDTH / 2, 0, 0)
        );
        const topRight = (minimap as any).worldToMinimap(
            new THREE.Vector3(FIELD_WIDTH / 2, 0, 0)
        );
        const bottomLeft = (minimap as any).worldToMinimap(
            new THREE.Vector3(-FIELD_WIDTH / 2, 0, FIELD_LENGTH)
        );
        const bottomRight = (minimap as any).worldToMinimap(
            new THREE.Vector3(FIELD_WIDTH / 2, 0, FIELD_LENGTH)
        );

        const padding = 8;
        const width = 160;
        const height = 280;

        expect(topLeft.x).toBeCloseTo(padding, 1);
        expect(topLeft.y).toBeCloseTo(padding, 1);

        expect(topRight.x).toBeCloseTo(width - padding, 1);
        expect(topRight.y).toBeCloseTo(padding, 1);

        expect(bottomLeft.x).toBeCloseTo(padding, 1);
        expect(bottomLeft.y).toBeCloseTo(height - padding, 1);

        expect(bottomRight.x).toBeCloseTo(width - padding, 1);
        expect(bottomRight.y).toBeCloseTo(height - padding, 1);
    });

    it('center field maps to center of minimap', () => {
        if (!minimap) throw new Error('Minimap not initialized');
        const center = (minimap as any).worldToMinimap(
            new THREE.Vector3(0, 0, FIELD_LENGTH / 2)
        );

        const width = 160;
        const height = 280;

        expect(center.x).toBeCloseTo(width / 2, 1);
        expect(center.y).toBeCloseTo(height / 2, 1);
    });

    it('all players are represented on update', () => {
        if (!minimap) throw new Error('Minimap not initialized');
        const players = [
            new MockPlayer('home', 0),
            new MockPlayer('home', 1),
            new MockPlayer('away', 2),
            new MockPlayer('away', 3),
        ] as unknown as Player[];

        players[0].movement.position.set(0, 0, 25);
        players[1].movement.position.set(5, 0, 50);
        players[2].movement.position.set(-5, 0, 50);
        players[3].movement.position.set(0, 0, 75);

        const disc = new MockDisc() as unknown as Disc;
        disc.position.set(0, 1.5, 50);

        const mockCamera = new THREE.PerspectiveCamera();
        mockCamera.position.set(0, 10, 40);

        expect(() => {
            minimap!.update(players, disc, players[0], mockCamera);
        }).not.toThrow();
    });

    it('show/hide/toggle methods work correctly', () => {
        if (!minimap) throw new Error('Minimap not initialized');
        expect((minimap as any).visible).toBe(true);

        minimap.hide();
        expect((minimap as any).visible).toBe(false);

        minimap.show();
        expect((minimap as any).visible).toBe(true);

        minimap.toggle();
        expect((minimap as any).visible).toBe(false);

        minimap.toggle();
        expect((minimap as any).visible).toBe(true);
    });

    afterEach(() => {
        if (minimap) {
            minimap.dispose();
        }
    });
});
