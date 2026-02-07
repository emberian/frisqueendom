import * as THREE from 'three';
import type { Player } from '../entities/Player';
import type { Disc } from '../entities/Disc';
import type { TeamSide } from '../data/Types';

const PICKUP_RADIUS = 0.8;
const _handPos = new THREE.Vector3();

export interface CatchResult {
    catcher: Player;
    isInterception: boolean;
    isLayout: boolean;
    catchQuality: 'perfect' | 'clean' | 'contested' | 'difficult';
    isContestedCatch?: boolean;
    isContestedDrop?: boolean;
    dropper?: Player;
}

export interface CatchOptions {
    pickupTeam?: TeamSide;
}

export function checkCatch(
    disc: Disc,
    allPlayers: Player[],
    options: CatchOptions = {},
): CatchResult | null {
    if (disc.state === 'in_flight') {
        return checkFlightCatch(disc, allPlayers);
    }
    if (disc.state === 'on_ground') {
        return checkPickup(disc, allPlayers, options.pickupTeam);
    }
    return null;
}

// Deterministic hash for contest resolution
function deterministicHash(x: number, y: number, z: number, frame: number): number {
    // Simple hash function for deterministic outcomes
    const a = Math.floor(x * 1000);
    const b = Math.floor(y * 1000);
    const c = Math.floor(z * 1000);
    const d = Math.floor(frame);
    const hash = ((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 50331653));
    return Math.abs(hash % 1000) / 1000;
}

interface CatchCandidate {
    player: Player;
    distance: number;
    isLayout: boolean;
    catchQuality: CatchResult['catchQuality'];
    speed: number;
}

function checkFlightCatch(
    disc: Disc,
    allPlayers: Player[],
): CatchResult | null {
    const candidates: CatchCandidate[] = [];
    const frameNumber = Math.floor(performance.now() / 16.67); // ~60fps frame count

    for (const player of allPlayers) {
        if (player.holdingDisc) continue;

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

            // Minimum facing requirement (forward 180° cone)
            if (dot > 0.0) {
                let quality: CatchResult['catchQuality'] = 'clean';
                if (handDist < catchRadius * 0.3) {
                    quality = 'perfect';
                } else if (handDist < catchRadius * 0.7) {
                    quality = 'clean';
                } else {
                    quality = 'difficult';
                }

                candidates.push({
                    player,
                    distance: handDist,
                    isLayout: false,
                    catchQuality: quality,
                    speed: player.movement.velocity.length(),
                });
            }
        }

        // Layout catch check - predict where disc will be
        const layoutRadius = player.getLayoutRadius();
        if (player.stats) {
            // Predict disc position at layout completion time
            const layoutTime = 0.3; // Time to complete layout
            const predictedDiscPos = disc.position.clone().add(
                disc.velocity.clone().multiplyScalar(layoutTime)
            );

            // Check if player can reach with layout
            const distToPrediction = player.movement.position.distanceTo(predictedDiscPos);

            if (distToPrediction < layoutRadius) {
                // Check if layout is possible (disc is in front and catchable height)
                const toPredicted = predictedDiscPos.clone().sub(player.movement.position);
                const heightOk = predictedDiscPos.y < 2.5 && predictedDiscPos.y > 0.5;

                if (heightOk && toPredicted.z > 0) { // Disc is in front
                    // Try to trigger layout
                    const canLayout = player.startLayout(predictedDiscPos);
                    if (canLayout) {
                        candidates.push({
                            player,
                            distance: distToPrediction,
                            isLayout: true,
                            catchQuality: 'difficult',
                            speed: player.movement.velocity.length(),
                        });

                    }
                }
            }
        }
    }

    if (candidates.length === 0) return null;

    // Check for contested catch situation
    if (candidates.length > 1) {
        // Find if there are opposing team players contesting
        const teams = new Set(candidates.map(c => c.player.team));
        if (teams.size > 1) {
            // Contested catch scenario
            candidates.sort((a, b) => a.distance - b.distance);
            const closest = candidates[0];
            const defender = candidates.find(c => c.player.team !== closest.player.team);

            if (defender) {
                const defenderDist = defender.distance;
                let blockChance = 0;

                // Calculate block chance based on defender distance
                if (defenderDist < 0.5) {
                    blockChance = 0.40;
                } else if (defenderDist < 1.0) {
                    blockChance = 0.20;
                } else if (defenderDist < 1.5) {
                    blockChance = 0.05;
                }

                // Factor in speed advantage (approaching vs stationary)
                const speedDiff = defender.speed - closest.speed;
                if (speedDiff > 2.0) {
                    blockChance += 0.1; // Defender closing fast
                } else if (speedDiff < -2.0) {
                    blockChance -= 0.1; // Attacker has momentum
                }

                // Clamp block chance
                blockChance = Math.max(0, Math.min(0.5, blockChance));

                // Deterministic roll
                const roll = deterministicHash(
                    disc.position.x,
                    disc.position.y,
                    disc.position.z,
                    frameNumber
                );

                if (roll < blockChance) {
                    // Contested drop - turnover
                    return {
                        catcher: closest.player,
                        isInterception: false,
                        isLayout: closest.isLayout,
                        catchQuality: 'contested',
                        isContestedDrop: true,
                        dropper: closest.player,
                    };
                } else {
                    // Contested catch success
                    const isInterception =
                        disc.thrownByTeam !== null && disc.thrownByTeam !== closest.player.team;

                    return {
                        catcher: closest.player,
                        isInterception,
                        isLayout: closest.isLayout,
                        catchQuality: 'contested',
                        isContestedCatch: true,
                    };
                }
            }
        }
    }

    // No contest - simple nearest player catch
    const nearest = candidates.reduce((prev, curr) =>
        curr.distance < prev.distance ? curr : prev
    );

    const isInterception =
        disc.thrownByTeam !== null && disc.thrownByTeam !== nearest.player.team;

    return {
        catcher: nearest.player,
        isInterception,
        isLayout: nearest.isLayout,
        catchQuality: nearest.catchQuality
    };
}

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

// Check if a disc is catchable (for AI decision making)
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
    
    // Simple linear prediction
    const playerSpeed = player.stats 
        ? player.stats.getEffectiveStat('speed') / 50 * 8
        : 6;
    const catchRadius = player.getCatchRadius();
    
    // Check multiple time steps
    for (let t = 0.1; t <= maxTime; t += 0.1) {
        const discPos = disc.position.clone().add(
            disc.velocity.clone().multiplyScalar(t)
        );
        
        // Check if disc is at catchable height
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
    
    // Can only layout to disc in front
    if (discDir.z < 0) return false;
    
    // Check if in layout range
    const layoutRange = player.getLayoutRadius();
    if (dist > layoutRange * 1.5) return false; // Too far
    
    // Predict intercept point
    const timeToReach = dist / (15 * (player.stats ? player.stats.getEffectiveStat('speed') / 50 : 1));
    const interceptPoint = disc.position.clone().add(
        disc.velocity.clone().multiplyScalar(timeToReach)
    );
    
    // Check if intercept is catchable height
    if (interceptPoint.y < 0.3 || interceptPoint.y > 2.5) return false;
    
    return player.startLayout(interceptPoint);
}
