import * as THREE from 'three';
import type { Player } from '../entities/Player';
import type { Disc } from '../entities/Disc';
import type { TeamSide } from '../data/Types';
import { Random } from '../data/SeededRandom';

const PICKUP_RADIUS = 0.8;
const _handPos = new THREE.Vector3();
const _toDisc = new THREE.Vector3();

// ── Catch Timing ──────────────────────────────────────────────────────

export type CatchPhase = 'too_early' | 'early' | 'perfect' | 'late' | 'too_late';

/** Base half-window sizes (seconds). Each side of "perfect" centre. */
const BASE_PERFECT_HALF = 0.05;
const BASE_BOBBLE_HALF = 0.15; // extends from edge of perfect to this

export interface CatchTimingResult {
    phase: CatchPhase;
    /** Signed offset in seconds (negative = early, positive = late). */
    timingOffset: number;
    /** Did the player recover from a bobble? */
    recovered: boolean;
}

export interface CatchTimingContext {
    /** Weather condition - only 'rain' currently tightens the window. */
    weather?: 'clear' | 'rain' | 'wind';
}

/**
 * Evaluate catch timing for a single candidate.
 *
 * Timing is derived from:
 *  - time-to-reach: how long until the disc reaches the player's hand at
 *    current velocity (distance / closing speed).
 *  - catch readiness: how long the player has been in a position to catch
 *    (approximated by inverse of remaining distance ratio inside catch radius).
 *
 * The signed offset = readiness - timeToReach. Negative means hands close
 * before disc arrives (early); positive means hands close after (late).
 */
function evaluateCatchTiming(
    disc: Disc,
    player: Player,
    handDist: number,
    catchRadius: number,
    isLayout: boolean,
    ctx: CatchTimingContext = {},
): CatchTimingResult {
    // --- Compute time-to-reach from disc velocity toward player ---
    _toDisc.subVectors(player.getHandPosition(), disc.position);
    const discSpeed = disc.velocity.length();
    // Project disc velocity onto the disc-to-hand vector to get closing speed
    const closingSpeed = discSpeed > 0.001
        ? disc.velocity.dot(_toDisc) / (_toDisc.length() || 1)
        : 0;
    // Time until disc reaches hand position (clamped to avoid div-by-zero / negatives)
    const timeToReach = closingSpeed > 0.5 ? handDist / closingSpeed : 0;

    // --- Catch readiness: how "prepared" the player is ---
    // Modelled as proportion of catch radius already closed
    // (1.0 = disc right at hand, 0.0 = disc at edge of radius)
    const readinessFraction = 1.0 - Math.min(handDist / catchRadius, 1.0);
    // Convert to a time-like value so it can be compared to timeToReach
    const readinessTime = readinessFraction * 0.20; // full readiness ~ 0.20s

    // Signed offset: negative = early, positive = late
    // When the disc is not closing on the player (already within radius,
    // stationary, or moving away), both disc and player are co-located --
    // treat as near-perfect timing (offset ~ 0).
    const timingOffset = closingSpeed > 0.5
        ? readinessTime - timeToReach
        : 0;

    // --- Window modifiers ---
    let perfectHalf = BASE_PERFECT_HALF;
    let bobbleHalf = BASE_BOBBLE_HALF;

    // Disc speed: faster disc -> tighter window (scale by 1.0 - speed/50)
    const speedScale = Math.max(0.2, 1.0 - discSpeed / 50);
    perfectHalf *= speedScale;
    bobbleHalf *= speedScale;

    // Player catching stat: higher -> wider window (scale by 0.8 + catching/500)
    const catchingStat = player.stats
        ? player.stats.getEffectiveStat('catching')
        : 50;
    const statScale = 0.8 + catchingStat / 500;
    perfectHalf *= statScale;
    bobbleHalf *= statScale;

    // Layout catch: wider window (+0.05s each side)
    if (isLayout) {
        perfectHalf += 0.05;
        bobbleHalf += 0.05;
    }

    // Rain: tighter window (-0.02s each side, floored at 0.01)
    if (ctx.weather === 'rain') {
        perfectHalf = Math.max(0.01, perfectHalf - 0.02);
        bobbleHalf = Math.max(perfectHalf + 0.01, bobbleHalf - 0.02);
    }

    // --- Classify phase ---
    const absOffset = Math.abs(timingOffset);
    let phase: CatchPhase;
    let recovered = false;

    if (absOffset <= perfectHalf) {
        phase = 'perfect';
    } else if (absOffset <= bobbleHalf) {
        phase = timingOffset < 0 ? 'early' : 'late';
        // Bobble recovery
        const recoveryChance = timingOffset < 0
            ? 0.5 * (catchingStat / 100)   // early: 50% base scaled by catching
            : 0.4 * (catchingStat / 100);   // late: 40% base scaled by catching
        recovered = Random.chance(recoveryChance);
    } else {
        phase = timingOffset < 0 ? 'too_early' : 'too_late';
    }

    return { phase, timingOffset, recovered };
}

// ── Contested Catches ─────────────────────────────────────────────────

export interface ContestedResult {
    winner: 'offense' | 'defense' | 'neither';
    type: 'clean_catch' | 'interception' | 'both_miss' | 'foul';
}

/**
 * Resolve a contested catch between an offensive and defensive candidate.
 *
 * Score components (each normalised roughly to 0..1):
 *  - positionAdvantage (0.3): inside position (closer to disc)
 *  - heightAdvantage (0.25): height stat + jump timing
 *  - statAdvantage (0.25): catching vs marking
 *  - timingAdvantage (0.2): who entered catch range first (lower distance = earlier)
 *
 * Outcomes:
 *  - Offense wins by 0.2+  -> clean_catch
 *  - Defense wins by 0.2+  -> interception (D!)
 *  - Within 0.2            -> both_miss (turnover)
 *  - Both within 0.5m      -> 15% foul chance
 */
function resolveContest(
    _disc: Disc,
    offenseCandidate: CatchCandidate,
    defenseCandidate: CatchCandidate,
): ContestedResult {
    const off = offenseCandidate;
    const def = defenseCandidate;

    // 1. Position advantage: closer to disc = between opponent and disc
    //    Normalised so 0m -> 1.0, catchRadius -> 0.0
    const maxDist = Math.max(off.distance, def.distance, 0.01);
    const offPosition = 1.0 - off.distance / maxDist;
    const defPosition = 1.0 - def.distance / maxDist;
    const positionAdvantage = offPosition - defPosition; // +1 favours offense

    // 2. Height advantage: height stat difference, normalised
    const offHeight = off.player.stats
        ? off.player.stats.getEffectiveStat('height')
        : 50;
    const defHeight = def.player.stats
        ? def.player.stats.getEffectiveStat('height')
        : 50;
    // Jump timing bonus: if layout (diving), add jumping stat contribution
    const offJump = off.isLayout && off.player.stats
        ? off.player.stats.getEffectiveStat('jumping') * 0.3
        : 0;
    const defJump = def.isLayout && def.player.stats
        ? def.player.stats.getEffectiveStat('jumping') * 0.3
        : 0;
    const heightAdvantage = ((offHeight + offJump) - (defHeight + defJump)) / 100;

    // 3. Stat advantage: offense catching vs defense marking (block_ability proxy)
    const offCatching = off.player.stats
        ? off.player.stats.getEffectiveStat('catching')
        : 50;
    const defMarking = def.player.stats
        ? def.player.stats.getEffectiveStat('marking')
        : 50;
    const statAdvantage = (offCatching - defMarking) / 100;

    // 4. Timing advantage: who entered catch range first (lower distance = earlier)
    const timingAdvantage = (def.distance - off.distance) / (maxDist || 1);

    // Composite scores
    const offenseScore =
        positionAdvantage * 0.3 +
        heightAdvantage * 0.25 +
        statAdvantage * 0.25 +
        timingAdvantage * 0.2;

    // Add deterministic noise
    const noise = (Random.next() - 0.5) * 0.2; // scaled by 0.1 variance (0.5 * 0.2)
    const finalDelta = offenseScore + noise; // positive = offense advantage

    // Foul check: both within very tight radius < 0.5m
    if (off.distance < 0.5 && def.distance < 0.5) {
        if (Random.chance(0.15)) {
            return { winner: 'neither', type: 'foul' };
        }
    }

    // Determine outcome
    if (finalDelta >= 0.2) {
        return { winner: 'offense', type: 'clean_catch' };
    } else if (finalDelta <= -0.2) {
        return { winner: 'defense', type: 'interception' };
    } else {
        return { winner: 'neither', type: 'both_miss' };
    }
}

// ── Core types ────────────────────────────────────────────────────────

export interface CatchResult {
    catcher: Player;
    isInterception: boolean;
    isLayout: boolean;
    catchQuality: 'perfect' | 'clean' | 'contested' | 'difficult';
    isContestedCatch?: boolean;
    isContestedDrop?: boolean;
    dropper?: Player;
    /** Catch timing phase (only present for in-flight catches). */
    catchPhase?: CatchPhase;
    /** Detailed contested result (only present for contested catches). */
    contestedResult?: ContestedResult;
}

export interface CatchOptions {
    pickupTeam?: TeamSide;
    /** Pass weather for timing window adjustments. */
    weather?: 'clear' | 'rain' | 'wind';
}

// ── Public API ────────────────────────────────────────────────────────

export function checkCatch(
    disc: Disc,
    allPlayers: Player[],
    options: CatchOptions = {},
): CatchResult | null {
    if (disc.state === 'in_flight') {
        return checkFlightCatch(disc, allPlayers, options);
    }
    if (disc.state === 'on_ground') {
        return checkPickup(disc, allPlayers, options.pickupTeam);
    }
    return null;
}

// ── Deterministic hash (legacy, kept for backward compat) ─────────────

function deterministicHash(x: number, y: number, z: number, frame: number): number {
    const a = Math.floor(x * 1000);
    const b = Math.floor(y * 1000);
    const c = Math.floor(z * 1000);
    const d = Math.floor(frame);
    const hash = ((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 50331653));
    return Math.abs(hash % 1000) / 1000;
}

// ── Internal types ────────────────────────────────────────────────────

interface CatchCandidate {
    player: Player;
    distance: number;
    isLayout: boolean;
    catchQuality: CatchResult['catchQuality'];
    speed: number;
    catchTiming?: CatchTimingResult;
}

// ── Flight catch evaluation ───────────────────────────────────────────

function checkFlightCatch(
    disc: Disc,
    allPlayers: Player[],
    options: CatchOptions = {},
): CatchResult | null {
    const candidates: CatchCandidate[] = [];
    const frameNumber = Math.floor(performance.now() / 16.67); // ~60fps frame count
    const timingCtx: CatchTimingContext = { weather: options.weather };

    for (const player of allPlayers) {
        if (player.holdingDisc) continue;
        // Self-pass forbidden: thrower cannot catch their own throw
        if (player === disc.thrownBy) continue;

        // Standard catch check
        _handPos.copy(player.getHandPosition());
        const handDist = _handPos.distanceTo(disc.position);
        const catchRadius = player.getCatchRadius();

        if (handDist < catchRadius) {
            // Check if facing roughly toward disc
            const toDisc = disc.position
                .clone()
                .sub(player.movement.position)
                .normalize();
            const playerForward = new THREE.Vector3(
                Math.sin(player.movement.facing),
                0,
                Math.cos(player.movement.facing),
            );
            const dot = toDisc.x * playerForward.x + toDisc.z * playerForward.z;

            // Minimum facing requirement (forward 180 degree cone)
            if (dot > 0.0) {
                // Evaluate catch timing
                const timing = evaluateCatchTiming(
                    disc, player, handDist, catchRadius, false, timingCtx,
                );

                // Whiff on too_early / too_late (miss entirely)
                if (timing.phase === 'too_early' || timing.phase === 'too_late') {
                    continue;
                }

                // Bobble phases that were not recovered also miss
                if ((timing.phase === 'early' || timing.phase === 'late') && !timing.recovered) {
                    continue;
                }

                // Derive quality from timing phase
                let quality: CatchResult['catchQuality'];
                if (timing.phase === 'perfect') {
                    quality = handDist < catchRadius * 0.3 ? 'perfect' : 'clean';
                } else {
                    // Recovered bobble
                    quality = 'difficult';
                }

                candidates.push({
                    player,
                    distance: handDist,
                    isLayout: false,
                    catchQuality: quality,
                    speed: player.movement.velocity.length(),
                    catchTiming: timing,
                });
            }
        }

        // Layout catch check - predict where disc will be
        const layoutRadius = player.getLayoutRadius();
        if (player.stats) {
            const layoutTime = 0.3;
            const predictedDiscPos = disc.position.clone().add(
                disc.velocity.clone().multiplyScalar(layoutTime),
            );
            const distToPrediction = player.movement.position.distanceTo(predictedDiscPos);

            if (distToPrediction < layoutRadius) {
                const toPredicted = predictedDiscPos.clone().sub(player.movement.position);
                const heightOk = predictedDiscPos.y < 2.5 && predictedDiscPos.y > 0.5;

                // Check disc is roughly in front of the player (not behind)
                const facingX = Math.sin(player.movement.facing);
                const facingZ = Math.cos(player.movement.facing);
                const forwardDot = toPredicted.x * facingX + toPredicted.z * facingZ;

                if (heightOk && forwardDot > 0) {
                    const canLayout = player.startLayout(predictedDiscPos);
                    if (canLayout) {
                        // Evaluate timing for layout (wider window)
                        const layoutTiming = evaluateCatchTiming(
                            disc, player, distToPrediction, layoutRadius, true, timingCtx,
                        );

                        // Layout whiffs on extreme mistiming
                        if (layoutTiming.phase === 'too_early' || layoutTiming.phase === 'too_late') {
                            continue;
                        }
                        if ((layoutTiming.phase === 'early' || layoutTiming.phase === 'late') && !layoutTiming.recovered) {
                            continue;
                        }

                        candidates.push({
                            player,
                            distance: distToPrediction,
                            isLayout: true,
                            catchQuality: 'difficult',
                            speed: player.movement.velocity.length(),
                            catchTiming: layoutTiming,
                        });
                    }
                }
            }
        }
    }

    if (candidates.length === 0) return null;

    // Check for contested catch situation
    if (candidates.length > 1) {
        const teams = new Set(candidates.map(c => c.player.team));
        if (teams.size > 1) {
            // Contested catch scenario
            candidates.sort((a, b) => a.distance - b.distance);
            const closest = candidates[0];
            const opponent = candidates.find(c => c.player.team !== closest.player.team);

            if (opponent) {
                // Determine which is offense, which is defense
                const closestIsOffense = disc.thrownByTeam !== null
                    ? closest.player.team === disc.thrownByTeam
                    : true; // default to closest = offense if unknown

                const offenseCandidate = closestIsOffense ? closest : opponent;
                const defenseCandidate = closestIsOffense ? opponent : closest;

                // Resolve contest with the new scoring system
                const contested = resolveContest(disc, offenseCandidate, defenseCandidate);

                if (contested.type === 'foul') {
                    // Foul: disc goes back to offense (closest player gets it but flagged)
                    return {
                        catcher: offenseCandidate.player,
                        isInterception: false,
                        isLayout: offenseCandidate.isLayout,
                        catchQuality: 'contested',
                        isContestedDrop: true,
                        dropper: offenseCandidate.player,
                        catchPhase: offenseCandidate.catchTiming?.phase,
                        contestedResult: contested,
                    };
                }

                if (contested.type === 'both_miss') {
                    // Both miss - disc falls, turnover
                    return {
                        catcher: closest.player,
                        isInterception: false,
                        isLayout: closest.isLayout,
                        catchQuality: 'contested',
                        isContestedDrop: true,
                        dropper: closest.player,
                        catchPhase: closest.catchTiming?.phase,
                        contestedResult: contested,
                    };
                }

                if (contested.type === 'interception') {
                    // Defense wins - interception (D!)
                    return {
                        catcher: defenseCandidate.player,
                        isInterception: true,
                        isLayout: defenseCandidate.isLayout,
                        catchQuality: 'contested',
                        isContestedCatch: true,
                        catchPhase: defenseCandidate.catchTiming?.phase,
                        contestedResult: contested,
                    };
                }

                // clean_catch: offense wins
                const isInterception =
                    disc.thrownByTeam !== null && disc.thrownByTeam !== offenseCandidate.player.team;

                return {
                    catcher: offenseCandidate.player,
                    isInterception,
                    isLayout: offenseCandidate.isLayout,
                    catchQuality: 'contested',
                    isContestedCatch: true,
                    catchPhase: offenseCandidate.catchTiming?.phase,
                    contestedResult: contested,
                };
            }
        }
    }

    // No contest - simple nearest player catch
    const nearest = candidates.reduce((prev, curr) =>
        curr.distance < prev.distance ? curr : prev,
    );

    const isInterception =
        disc.thrownByTeam !== null && disc.thrownByTeam !== nearest.player.team;

    return {
        catcher: nearest.player,
        isInterception,
        isLayout: nearest.isLayout,
        catchQuality: nearest.catchQuality,
        catchPhase: nearest.catchTiming?.phase,
    };
}

// ── Ground pickup ─────────────────────────────────────────────────────

function checkPickup(
    disc: Disc,
    allPlayers: Player[],
    pickupTeam?: TeamSide,
): CatchResult | null {
    let nearest: Player | null = null;
    let nearestDist = Infinity;

    for (const player of allPlayers) {
        if (player.holdingDisc) continue;
        if (pickupTeam && player.team !== pickupTeam) continue;
        const dist = player.movement.position.distanceTo(disc.position);
        if (dist < PICKUP_RADIUS && dist < nearestDist) {
            nearest = player;
            nearestDist = dist;
        }
    }

    if (nearest) {
        return {
            catcher: nearest,
            isInterception: false,
            isLayout: false,
            catchQuality: 'clean',
        };
    }
    return null;
}

// ── AI helpers ────────────────────────────────────────────────────────

export function isDiscCatchable(
    disc: Disc,
    player: Player,
    maxTime: number = 2.0,
): { catchable: boolean; timeToCatch: number; position: THREE.Vector3 } {
    const result = {
        catchable: false,
        timeToCatch: Infinity,
        position: new THREE.Vector3(),
    };

    if (disc.state !== 'in_flight') return result;

    const playerSpeed = player.stats
        ? player.stats.getEffectiveStat('speed') / 50 * 8
        : 6;
    const catchRadius = player.getCatchRadius();

    for (let t = 0.1; t <= maxTime; t += 0.1) {
        const discPos = disc.position.clone().add(
            disc.velocity.clone().multiplyScalar(t),
        );

        if (discPos.y < 0 || discPos.y > 3) continue;

        const distToPlayer = player.movement.position.distanceTo(discPos);
        const maxReach = playerSpeed * t + catchRadius;

        if (distToPlayer <= maxReach) {
            result.catchable = true;
            result.timeToCatch = t;
            result.position.copy(discPos);
            break;
        }
    }

    return result;
}

// Layout attempt (for manual player input)
export function attemptLayout(
    player: Player,
    disc: Disc,
): boolean {
    if (disc.state !== 'in_flight') return false;

    const discDir = disc.position.clone().sub(player.movement.position);
    const dist = discDir.length();

    // Check disc is roughly in front of the player (not behind)
    const facingX = Math.sin(player.movement.facing);
    const facingZ = Math.cos(player.movement.facing);
    const forwardDot = discDir.x * facingX + discDir.z * facingZ;
    if (forwardDot < 0) return false;

    const layoutRange = player.getLayoutRadius();
    if (dist > layoutRange * 1.5) return false;

    const timeToReach = dist / (15 * (player.stats ? player.stats.getEffectiveStat('speed') / 50 : 1));
    const interceptPoint = disc.position.clone().add(
        disc.velocity.clone().multiplyScalar(timeToReach),
    );

    if (interceptPoint.y < 0.3 || interceptPoint.y > 2.5) return false;

    return player.startLayout(interceptPoint);
}
