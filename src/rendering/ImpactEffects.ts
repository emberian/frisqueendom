import * as THREE from 'three';
import { ParticleSystem, PARTICLE_TYPE } from './Particles';
import type { EventBus } from '../core/EventBus';
import type { TeamSide } from '../data/Types';

// ── Team color lookup ──

const TEAM_COLORS: Record<TeamSide, number> = {
    home: 0x4488ff,
    away: 0xff4444,
};

// ── Effect Functions ──

/**
 * Disc Ground Impact - dust/dirt burst when disc hits the ground.
 * 8-12 particles, brown/tan, short-lived (0.3-0.5s), small radius.
 */
export function spawnGroundImpact(
    particles: ParticleSystem,
    position: THREE.Vector3,
): void {
    // Primary dust cloud - wispy particles that stay low
    particles.emit(
        position,
        8,              // count
        0xbb9966,       // brown/tan
        0.8,            // speed (low upward to keep dust near ground)
        0.4,            // life (0.4s)
        1.2,            // spread (modest horizontal spread)
        PARTICLE_TYPE.DUST,
        [0.06, 0.14],   // size range
    );
    // A few darker dirt specks that bounce
    particles.emit(
        position,
        4,              // count
        0x886644,       // darker brown
        1.5,            // speed (slightly higher for bouncing dirt)
        0.35,           // life
        0.8,            // spread
        PARTICLE_TYPE.CIRCLE,
        [0.02, 0.05],   // small specks
    );
}

/**
 * Catch Effect - sparkle burst at catch position.
 * 6-8 team-colored particles, very short-lived (0.2-0.3s).
 */
export function spawnCatchEffect(
    particles: ParticleSystem,
    position: THREE.Vector3,
    teamColor: number,
): void {
    // Quick spark burst in team color
    particles.emit(
        position,
        6,              // count
        teamColor,
        2.5,            // speed (snappy upward burst)
        0.25,           // life (very brief)
        1.5,            // spread
        PARTICLE_TYPE.SPARK,
        [0.04, 0.09],
    );
    // One expanding ring for visual punch
    particles.emit(
        position,
        2,              // count
        teamColor,
        0.3,            // speed (slow rise)
        0.3,            // life
        0.1,            // spread (tight, the ring sprite handles the visual width)
        PARTICLE_TYPE.RING,
        [0.2, 0.35],
    );
}

/**
 * Score Celebration - large confetti burst with team color + gold + white.
 * 20-30 particles, wider spread, longer duration (1-2s), drifts downward.
 */
export function spawnScoreEffect(
    particles: ParticleSystem,
    position: THREE.Vector3,
    teamColor: number,
): void {
    // Confetti in team color
    particles.emit(
        position,
        10,             // count
        teamColor,
        6,              // speed (high launch for celebration arc)
        1.8,            // life
        4,              // spread (wide)
        PARTICLE_TYPE.CONFETTI,
        [0.06, 0.12],
    );
    // Gold confetti
    particles.emit(
        position,
        8,              // count
        0xffd700,       // gold
        5.5,
        1.5,
        3.5,
        PARTICLE_TYPE.CONFETTI,
        [0.05, 0.11],
    );
    // White confetti
    particles.emit(
        position,
        6,              // count
        0xffffff,       // white
        5,
        1.6,
        3,
        PARTICLE_TYPE.CONFETTI,
        [0.05, 0.10],
    );
    // Firework sparkles for extra flair
    particles.emit(
        position,
        4,              // count
        teamColor,
        7,              // speed (shoots higher)
        1.2,            // life
        2.5,
        PARTICLE_TYPE.FIREWORK,
        [0.08, 0.15],
    );
    // Gold sparks
    particles.emit(
        position,
        4,
        0xffdd44,
        6,
        1.4,
        3,
        PARTICLE_TYPE.SPARK,
        [0.03, 0.07],
    );
}

/**
 * Block Effect - aggressive red/orange burst when disc is blocked.
 * 10 particles, quick and punchy.
 */
export function spawnBlockEffect(
    particles: ParticleSystem,
    position: THREE.Vector3,
): void {
    // Red burst
    particles.emit(
        position,
        6,              // count
        0xff3322,       // red
        4,              // speed (fast, aggressive)
        0.35,           // life (quick)
        2.5,            // spread (wide for impact feel)
        PARTICLE_TYPE.SPARK,
        [0.05, 0.12],
    );
    // Orange secondary
    particles.emit(
        position,
        4,              // count
        0xff8833,       // orange
        3.5,
        0.3,
        2,
        PARTICLE_TYPE.CIRCLE,
        [0.06, 0.10],
    );
}

// ── EventBus Wiring ──

/**
 * Connects impact effects to game events via the EventBus.
 * Returns an unsubscribe function that removes all listeners.
 *
 * Call this once during game setup:
 *   const detach = wireImpactEffects(particles, eventBus);
 *   // later, on cleanup:
 *   detach();
 */
export function wireImpactEffects(
    particles: ParticleSystem,
    eventBus: EventBus,
): () => void {
    const unsubs: (() => void)[] = [];

    // Disc catch -> sparkle burst
    unsubs.push(
        eventBus.on('disc_catch', (payload) => {
            const pos = new THREE.Vector3(
                payload.position.x,
                payload.position.y,
                payload.position.z,
            );
            const color = TEAM_COLORS[payload.team] ?? 0xffffff;
            spawnCatchEffect(particles, pos, color);
        }),
    );

    // Score -> celebration confetti
    unsubs.push(
        eventBus.on('score', (payload) => {
            // Score events don't carry a position, so we'd need the disc position
            // passed in or use a fallback. For now, the caller can invoke
            // spawnScoreEffect directly with the disc position. We still wire it
            // here using a zero-vector so it's ready for when position data is added.
            const color = TEAM_COLORS[payload.team] ?? 0xffffff;
            // The score event doesn't include position; callers should use
            // spawnScoreEffect() directly when they have the disc/endzone position.
            // This listener serves as a convenience hook for the common case.
            spawnScoreEffect(particles, new THREE.Vector3(0, 1, 0), color);
        }),
    );

    // Disc block -> aggressive red/orange burst
    unsubs.push(
        eventBus.on('disc_block', (_payload) => {
            // disc_block doesn't carry position data in the current event schema.
            // For now this is a no-op; call spawnBlockEffect() directly with the
            // disc position when wiring up in main.ts.
        }),
    );

    // Turnover (disc hits ground) -> dust burst
    unsubs.push(
        eventBus.on('turnover', (payload) => {
            const pos = new THREE.Vector3(
                payload.position.x,
                0.05, // just above ground
                payload.position.z,
            );
            spawnGroundImpact(particles, pos);
        }),
    );

    // Disc drop -> same dust burst as ground impact
    unsubs.push(
        eventBus.on('disc_drop', (_payload) => {
            // disc_drop doesn't carry position; call spawnGroundImpact() directly
            // with the disc position when wiring in main.ts.
        }),
    );

    return () => {
        for (const unsub of unsubs) unsub();
    };
}
