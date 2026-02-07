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

function checkFlightCatch(
    disc: Disc,
    allPlayers: Player[],
): CatchResult | null {
    let nearest: Player | null = null;
    let nearestDist = Infinity;
    let isLayout = false;
    let catchQuality: CatchResult['catchQuality'] = 'clean';
    
    for (const player of allPlayers) {
        if (player.holdingDisc) continue;

        // Standard catch check
        _handPos.copy(player.getHandPosition());
        const handDist = _handPos.distanceTo(disc.position);
        const catchRadius = player.getCatchRadius();

        if (handDist < catchRadius && handDist < nearestDist) {
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
                nearest = player;
                nearestDist = handDist;
                isLayout = false;
                
                // Determine catch quality
                if (handDist < catchRadius * 0.3) {
                    catchQuality = 'perfect';
                } else if (handDist < catchRadius * 0.7) {
                    catchQuality = 'clean';
                } else {
                    catchQuality = 'difficult';
                }
            }
        }
        
        // Layout catch check - predict where disc will be
        const layoutRadius = player.getLayoutRadius();
        if (!nearest && player.stats) {
            // Predict disc position at layout completion time
            const layoutTime = 0.3; // Time to complete layout
            const predictedDiscPos = disc.position.clone().add(
                disc.velocity.clone().multiplyScalar(layoutTime)
            );
            
            // Check if player can reach with layout
            const distToPrediction = player.movement.position.distanceTo(predictedDiscPos);
            
            if (distToPrediction < layoutRadius && distToPrediction < nearestDist + 1) {
                // Check if layout is possible (disc is in front and catchable height)
                const toPredicted = predictedDiscPos.clone().sub(player.movement.position);
                const heightOk = predictedDiscPos.y < 2.5 && predictedDiscPos.y > 0.5;
                
                if (heightOk && toPredicted.z > 0) { // Disc is in front
                    // Try to trigger layout
                    const canLayout = player.startLayout(predictedDiscPos);
                    if (canLayout) {
                        nearest = player;
                        nearestDist = distToPrediction;
                        isLayout = true;
                        catchQuality = 'difficult';
                        
                        // Update stats
                        if (player.stats) {
                            player.stats.career.blocks++; // Track layouts as defensive plays
                        }
                    }
                }
            }
        }
    }

    if (nearest) {
        const isInterception =
            disc.thrownByTeam !== null && disc.thrownByTeam !== nearest.team;
        
        // Trigger catch animation
        if (isLayout) {
            // Layout animation already triggered
        } else {
            // Normal catch - could add catch animation here
        }
        
        // Update stats based on catch quality
        if (nearest.stats) {
            nearest.stats.career.completions++;
            if (isInterception) {
                nearest.stats.career.blocks++;
            }
        }
        
        return { catcher: nearest, isInterception, isLayout, catchQuality };
    }
    return null;
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
