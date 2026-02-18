import * as THREE from 'three';
import type { Player } from '../entities/Player';
import {
    evaluateOpenness,
    computeLeadPass,
    computeCutTarget,
    computeHStackIsolationCut,
} from './Offense';
import { computeDefensivePosition, shouldContestCatch } from './Defense';
import { computeMarkPosition } from './Marking';
import type { ThrowParams } from '../data/Types';
import {
    THROW_CONFIGS,
    AI_DIFFICULTY_PROFILES,
    ARCHETYPE_PROFILES,
} from '../data/GameplayConstants';
import type { AIArchetype, ArchetypeProfile } from '../data/GameplayConstants';
import type { ThrowType } from '../gameplay/Throw';
import { Random } from '../data/SeededRandom';

const _target = new THREE.Vector3();
const _temp = new THREE.Vector3();
const _temp2 = new THREE.Vector3();
const _facing = new THREE.Vector3();
const _toMark = new THREE.Vector3();
const _laneVec = new THREE.Vector3();
const _toDef = new THREE.Vector3();
const _closestLane = new THREE.Vector3();
const _interceptPos = new THREE.Vector3();

export interface AIAction {
    type: 'move' | 'throw' | 'none';
    target?: THREE.Vector3;
    sprint?: boolean;
    throwParams?: ThrowParams;
    leadTarget?: THREE.Vector3;
}

export interface ReceiverEvaluation {
    receiverIndex: number;
    receiverPos: THREE.Vector3;
    score: number;
    selected: boolean;
}

/** Difficulty scaling profile passed into decision functions */
export interface DifficultyScaling {
    reactionDelay: number;
    throwAccuracyVariance: number;
    readQuality: number;
    poachAggression: number;
    decisionThreshold: number;
    dropChance: number;
    missOpenChance: number;
}

/**
 * Get a difficulty scaling profile by name.
 * Used by TeamAI to pass the right profile for teammates vs opponents.
 */
export function getDifficultyScaling(
    key: keyof typeof AI_DIFFICULTY_PROFILES,
): DifficultyScaling {
    return { ...AI_DIFFICULTY_PROFILES[key] };
}

/**
 * Get an archetype profile by name.
 */
export function getArchetypeProfile(archetype: AIArchetype): ArchetypeProfile {
    return ARCHETYPE_PROFILES[archetype];
}

export function decideOffenseWithDisc(
    player: Player,
    teammates: Player[],
    defenders: Player[],
    stallCount: number,
    attackingEndzone: number,
    windSpeed: number = 0,
    windDir: number = 0,
    evalBuffer?: ReceiverEvaluation[],
    scaling?: DifficultyScaling,
    archetype?: ArchetypeProfile,
): AIAction {
    let bestReceiver: Player | null = null;
    let bestScore = -Infinity;
    let bestOpenness = 0;
    const attackDir = attackingEndzone === 0 ? -1 : 1;

    // Archetype bias: gunslingers throw earlier, grinders wait
    const throwBias = archetype?.throwBias ?? 0;
    // Difficulty scaling: readQuality affects how well AI evaluates options
    const readQualityMod = scaling?.readQuality ?? 0.65;
    // Miss open receivers at legend difficulty for teammates
    const missOpenChance = scaling?.missOpenChance ?? 0;

    let nearestDef: Player | null = null;
    let nearestDefDist = Infinity;
    for (const d of defenders) {
        const dDist = d.movement.position.distanceTo(player.movement.position);
        if (dDist < nearestDefDist) {
            nearestDefDist = dDist;
            nearestDef = d;
        }
    }

    const throwerSkill = player.stats
        ? (player.stats.getEffectiveStat('throwAccuracy') +
              player.stats.getEffectiveStat('awareness')) /
          200
        : 0.55;

    for (const tm of teammates) {
        if (tm === player || tm.holdingDisc) continue;

        // Legend teammate: occasionally miss seeing an open target
        if (missOpenChance > 0 && Random.next() < missOpenChance) continue;

        const openness = evaluateOpenness(
            player,
            tm,
            defenders,
            attackingEndzone,
        );
        const dist = player.movement.position.distanceTo(tm.movement.position);
        const yardGain =
            (tm.movement.position.z - player.movement.position.z) * attackDir;
        const gainScore = Math.max(-0.4, Math.min(1.2, yardGain / 24));
        const receiverSkill = tm.stats
            ? (tm.stats.getEffectiveStat('catching') +
                  tm.stats.getEffectiveStat('awareness')) /
              200
            : 0.5;
        const difficultyPenalty = Math.min(
            1.5,
            dist / 28 + tm.movement.velocity.length() / 11,
        );
        const windPenalty =
            Math.min(1, windSpeed / 9) * Math.min(1, dist / 25);
        const pressurePenalty =
            nearestDefDist < 2.8
                ? ((2.8 - nearestDefDist) / 2.8) * 0.2
                : 0;
        const resetBonus = stallCount >= 6 && yardGain < 4 ? 0.22 : 0;
        const bailoutBonus = stallCount >= 8 ? 0.18 : 0;

        // Read quality scales how much openness matters vs noise
        const opennessWeight = 0.45 + readQualityMod * 0.15;
        const noiseScale = Math.max(0, 0.12 * (1 - readQualityMod));
        const readNoise = (Random.next() - 0.5) * noiseScale;

        // Penalise long throws to covered receivers more heavily
        const coveragePenalty = openness < 0.5 && dist > 20
            ? (1 - openness) * (dist - 20) / 30 * 0.3
            : 0;

        const score =
            openness * opennessWeight +
            gainScore * (0.2 + throwBias * 0.1) +
            receiverSkill * 0.16 +
            throwerSkill * 0.12 +
            resetBonus +
            bailoutBonus -
            difficultyPenalty * 0.22 -
            windPenalty * 0.12 -
            pressurePenalty -
            coveragePenalty +
            readNoise;

        if (evalBuffer) {
            evalBuffer.push({
                receiverIndex: tm.index,
                receiverPos: tm.movement.position.clone(),
                score,
                selected: false,
            });
        }

        if (score > bestScore) {
            bestScore = score;
            bestOpenness = openness;
            bestReceiver = tm;
        }
    }

    if (evalBuffer && bestReceiver) {
        const entry = evalBuffer.find(e => e.receiverIndex === bestReceiver!.index);
        if (entry) entry.selected = true;
    }

    // Archetype throwBias lowers threshold (gunslinger throws earlier)
    const baseThreshold =
        stallCount < 3 ? 0.08 : stallCount < 5 ? -0.05 : stallCount < 7 ? -0.2 : -0.5;
    const threshold = baseThreshold - throwBias * 0.12 - (scaling?.decisionThreshold ?? 0.08) * 0.5;
    // At stall 8+ still prefer a dump/reset over a wild huck into coverage
    if (!bestReceiver || (bestScore < threshold && stallCount < 8)) {
        return { type: 'none' };
    }
    if (stallCount >= 8 && bestOpenness < 0.15 && bestScore < -0.3) {
        return { type: 'none' }; // Stall out rather than guaranteed turnover
    }

    const dist = player.movement.position.distanceTo(
        bestReceiver.movement.position,
    );
    // Speed scales with distance but with diminishing returns past 20m
    const distFactor = dist <= 20 ? dist * 0.55 : 11 + (dist - 20) * 0.3;
    const speed = Math.max(
        12,
        Math.min(26, 10 + distFactor + bestOpenness * 0.5 + bestScore * 0.3),
    );

    const leadTarget = computeLeadPass(player, bestReceiver, speed);
    const direction = _temp.copy(leadTarget).sub(player.movement.position).normalize();

    let throwType: ThrowType = 'backhand';
    const toReceiver = _temp2
        .copy(bestReceiver.movement.position)
        .sub(player.movement.position);
    // Use attacking direction as facing reference for forehand/backhand,
    // since the player should face roughly toward the endzone they attack.
    _facing.set(0, 0, attackDir);
    // cross = -(_facing × toReceiver).y, so cross < 0 means receiver
    // is to the RIGHT of the facing direction (forehand side).
    const cross = _facing.x * toReceiver.z - _facing.z * toReceiver.x;
    const isForehandSide = cross < 0;
    throwType = isForehandSide ? 'forehand' : 'backhand';

    if (player.stats) {
        const fh = player.stats.getEffectiveStat('forehand');
        const bh = player.stats.getEffectiveStat('backhand');
        if (Math.abs(fh - bh) > 12) {
            throwType = fh > bh ? 'forehand' : 'backhand';
        }
    }

    const isMarked = nearestDefDist < 2.5;
    if (isMarked && nearestDef) {
        _toMark
            .copy(nearestDef.movement.position)
            .sub(player.movement.position)
            .normalize();
        const dot = _toMark.dot(direction);
        if (dot > 0.72) {
            if (dist > 15 && Random.next() < 0.55) {
                throwType = throwType === 'forehand' ? 'scoober' : 'hammer';
            } else if (dist < 11 && Random.next() < 0.5) {
                throwType = 'blade';
            }
        }
    }

    const config = THROW_CONFIGS[throwType];
    direction.y = config.upAngle + (speed / 30) * 0.05;
    direction.normalize();

    if (windSpeed > 2) {
        const windX = Math.sin(windDir) * windSpeed;
        const windZ = Math.cos(windDir) * windSpeed;
        const flightTime = dist / speed;
        const comp = 0.06 * flightTime;
        direction.x -= windX * comp;
        direction.z -= windZ * comp;
        direction.normalize();
    }

    const throwParams: ThrowParams = {
        position: player.movement.position.clone().setY(1.5),
        direction: direction.clone(),
        speed,
        spinRate: config.spinRate * (0.95 + Random.next() * 0.1),
        noseAngle: config.noseAngle + (0.05 - (speed / 30) * 0.1),
        hyzerAngle: config.hyzerDefault + (throwType === 'forehand' ? -0.05 : 0.05),
        releaseHeight: 1.5,
        offAxis: config.offAxis,
        isForehand:
            throwType === 'forehand' ||
            throwType === 'hammer' ||
            throwType === 'scoober',
    };

    return { type: 'throw', throwParams, leadTarget: leadTarget.clone() };
}

export function decideOffenseWithoutDisc(
    player: Player,
    discPos: THREE.Vector3,
    isActiveCutter: boolean,
    cutTimer: number,
    attackingEndzone: number,
    defenders: Player[],
    hstackLaneIndex?: number,
    archetype?: ArchetypeProfile,
): AIAction {
    if (!isActiveCutter) {
        // Hold stack position
        return { type: 'none' };
    }

    // Archetype cut timing variance: rookies clear too early/late
    const cutTimingVariance = archetype?.cutTimingVariance ?? 0;
    const clearThreshold = 2.5 + (Random.next() - 0.5) * cutTimingVariance * 4;

    // Find nearest defender
    let nearestDef: Player | null = null;
    let nearestDefDist = Infinity;
    for (const d of defenders) {
        const dist = d.movement.position.distanceTo(player.movement.position);
        if (dist < nearestDefDist) {
            nearestDefDist = dist;
            nearestDef = d;
        }
    }

    if (cutTimer > clearThreshold) {
        // Clear out - jog (not sprint) to far side to conserve energy
        const clearX =
            player.movement.position.x > 0 ? -15 : 15;
        _target.set(clearX, 0, player.movement.position.z);
        return { type: 'move', target: _target, sprint: false };
    }

    // --- Pre-cut deceleration: brief pause/deceleration before cutting ---
    // For the first ~0.4s of the cut, slow down to "sell the fake"
    const preCutDelay = 0.4;
    if (cutTimer < preCutDelay) {
        // Stand still or drift slightly to sell the jab step
        // Use a slow drift in the opposite direction of the eventual cut
        _target.copy(player.movement.position);
        // Small backward drift (opposite to disc) to simulate a fake
        const dir = attackingEndzone === 0 ? -1 : 1;
        _target.z += dir * 1.5; // drift slightly deeper to fake deep then cut under
        return { type: 'move', target: _target, sprint: false };
    }

    // Decide cut direction based on defender position
    let cutType: 'in' | 'deep' = 'in';
    if (nearestDef) {
        const defToDisc = discPos.z - nearestDef.movement.position.z;
        const playerToDisc = discPos.z - player.movement.position.z;
        // If defender is between player and disc (shading under), cut deep
        if (
            Math.sign(defToDisc) === Math.sign(playerToDisc) &&
            Math.abs(defToDisc) < Math.abs(playerToDisc)
        ) {
            cutType = 'deep';
        }
    }

    // Low disc_iq archetype: sometimes pick the wrong cut direction
    if (archetype && archetype.disc_iq < 0.4 && Random.next() < 0.15) {
        cutType = cutType === 'in' ? 'deep' : 'in';
    }

    // Horizontal stack: use lane-based isolation cut
    if (hstackLaneIndex !== undefined && hstackLaneIndex >= 0) {
        const target = computeHStackIsolationCut(
            player,
            hstackLaneIndex,
            discPos,
            attackingEndzone,
            cutType,
        );
        return { type: 'move', target, sprint: true };
    }

    const target = computeCutTarget(
        player,
        discPos,
        attackingEndzone,
        cutType,
    );
    return { type: 'move', target, sprint: true };
}

export function decideDefense(
    player: Player,
    mark: Player | null,
    discHolder: Player | null,
    discPos: THREE.Vector3,
    isMarker: boolean,
    stallCount: number = 0,
    discInFlight: boolean = false,
    poachChance: number = 0.12,
    forceSide: number = 1,
    scaling?: DifficultyScaling,
    attackingEndzone: number = 0,
): AIAction {
    // Difficulty-scaled poach aggression
    const effectivePoachChance = scaling
        ? poachChance * (0.5 + scaling.poachAggression * 3.5)
        : poachChance;

    if (!mark) {
        if (discInFlight && player.movement.position.distanceTo(discPos) < 5) {
            return { type: 'move', target: discPos, sprint: true };
        }
        return { type: 'none' };
    }

    if (discInFlight && shouldContestCatch(player, discPos, mark)) {
        return { type: 'move', target: discPos, sprint: true };
    }

    if (isMarker && discHolder) {
        const markPos = computeMarkPosition(discHolder, forceSide, stallCount);
        return { type: 'move', target: markPos, sprint: stallCount > 6 };
    }

    if (discHolder && !isMarker) {
        _laneVec.copy(mark.movement.position).sub(discHolder.movement.position);
        const laneLen = _laneVec.length();
        if (laneLen > 0.1) {
            _laneVec.multiplyScalar(1 / laneLen);
            _toDef.copy(player.movement.position).sub(discHolder.movement.position);
            const proj = _toDef.dot(_laneVec);
            if (proj > 1 && proj < laneLen - 0.5) {
                _closestLane
                    .copy(_laneVec)
                    .multiplyScalar(proj)
                    .add(discHolder.movement.position);
                const laneDist = player.movement.position.distanceTo(_closestLane);
                const poachWindow = 1.25 + effectivePoachChance * 0.9;
                const poachRoll =
                    effectivePoachChance + Math.min(0.18, stallCount * 0.015);
                if (laneDist < poachWindow && Random.next() < poachRoll) {
                    const intercept = _closestLane
                        .clone()
                        .addScaledVector(_laneVec, Math.min(2.5, laneLen - proj));
                    return { type: 'move', target: intercept, sprint: true };
                }
            }
        }
    }

    const defPos = computeDefensivePosition(mark, discPos, forceSide, attackingEndzone);
    const dist = player.movement.position.distanceTo(mark.movement.position);
    const sprint = dist > 2.5;
    return { type: 'move', target: defPos, sprint };
}

// Collision avoidance: nearby player list is set per-frame by TeamAI
let _nearbyPlayers: Player[] = [];
const _avoidance = new THREE.Vector3();

/**
 * Set the list of nearby teammates for collision avoidance.
 * Called once per frame by TeamAI before individual player updates.
 */
export function setNearbyPlayersForAvoidance(players: Player[]): void {
    _nearbyPlayers = players;
}

export function moveToward(
    player: Player,
    target: THREE.Vector3,
    dt: number,
    sprint: boolean,
): void {
    _temp.copy(target).sub(player.movement.position);
    _temp.y = 0;
    const dist = _temp.length();

    if (dist < 0.5) {
        player.movement.update(dt, { x: 0, z: 0 }, false);
        return;
    }

    // Base movement direction
    let dirX = _temp.x / dist;
    let dirZ = _temp.z / dist;

    // --- Collision avoidance: repel from nearby teammates ---
    const avoidRadius = 2.5; // Start avoiding when within 2.5m
    const avoidStrength = 3.0; // Strength of avoidance push
    _avoidance.set(0, 0, 0);
    for (const other of _nearbyPlayers) {
        if (other === player || other.holdingDisc) continue;
        const dx = player.movement.position.x - other.movement.position.x;
        const dz = player.movement.position.z - other.movement.position.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < avoidRadius * avoidRadius && dSq > 0.01) {
            const d = Math.sqrt(dSq);
            // Inverse-linear repulsion: stronger when closer
            const force = (avoidRadius - d) / avoidRadius * avoidStrength;
            _avoidance.x += (dx / d) * force;
            _avoidance.z += (dz / d) * force;
        }
    }

    // Blend avoidance into movement direction
    const avoidLen = Math.sqrt(_avoidance.x * _avoidance.x + _avoidance.z * _avoidance.z);
    if (avoidLen > 0.01) {
        // Avoidance is weighted less than target direction, but enough to prevent stacking
        const avoidWeight = Math.min(0.6, avoidLen * 0.3);
        dirX = dirX * (1 - avoidWeight) + (_avoidance.x / avoidLen) * avoidWeight;
        dirZ = dirZ * (1 - avoidWeight) + (_avoidance.z / avoidLen) * avoidWeight;
        // Re-normalize
        const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (len > 0.01) {
            dirX /= len;
            dirZ /= len;
        }
    }

    // Don't sprint when stamina is low
    const canSprint = sprint && player.movement.stamina > 10;
    player.movement.update(dt, { x: dirX, z: dirZ }, canSprint);
}

/**
 * Find the earliest point on a ballistic disc trajectory that a player can
 * reach in time while the disc is at catchable height.
 * Uses simple JS extrapolation (velocity + gravity) to avoid WASM borrow issues.
 */
export function findBestIntercept(
    player: Player,
    discPos: THREE.Vector3,
    discVel: THREE.Vector3,
): THREE.Vector3 | null {
    const sprintSpeed = player.movement.sprintSpeed;
    const catchRadius = player.getCatchRadius();
    const gravity = -9.81;
    const steps = 30;
    const timeStep = 0.1; // 3 seconds total

    for (let i = 0; i < steps; i++) {
        const t = (i + 1) * timeStep;
        const x = discPos.x + discVel.x * t;
        const y = discPos.y + discVel.y * t + 0.5 * gravity * t * t;
        const z = discPos.z + discVel.z * t;

        // Disc must be at catchable height
        if (y < 0.3 || y > 3.0) continue;

        const dx = player.movement.position.x - x;
        const dz = player.movement.position.z - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= sprintSpeed * t + catchRadius) {
            return _interceptPos.set(x, 0, z);
        }
    }
    return null;
}
