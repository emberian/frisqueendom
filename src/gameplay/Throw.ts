import * as THREE from 'three';
import type { GameplayInputSource, InputViewport } from '../InputManager';
import { THROW_CONFIGS, calculateThrowPower, calculateArcadeThrowPower, QUICK_RELEASE_WINDOW } from '../data/GameplayConstants';
import type { ThrowParams } from '../data/Types';
import type { Player } from '../entities/Player';
import type { GameCamera } from '../rendering/Camera';
import { Random } from '../data/SeededRandom';

export type ThrowType = 'backhand' | 'forehand' | 'hammer' | 'scoober' | 'thumber' | 'blade';
export type ReleaseHeight = 'low' | 'normal' | 'high';

export type CutCall = 'in' | 'out' | 'deep' | 'under';

const _ndc = new THREE.Vector2();
const _tempDir = new THREE.Vector3();

// Throw configs and power curve now imported from GameplayConstants

export class ThrowController {
    private holdTime = 0;
    private isCharging = false;
    private throwType: ThrowType = 'backhand';
    private releaseHeight: ReleaseHeight = 'normal';
    private hyzerAccum = 0;
    private aimDirection = new THREE.Vector3(0, 0.1, 1);
    private raycaster = new THREE.Raycaster();
    private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.5);
    private intersectPoint = new THREE.Vector3();

    // Quick release state
    private lastThrowTime = 0;
    private quickReleaseAvailable = false;
    private continuationMode = false;

    // Fake/pump fake
    private isFake = false;
    private fakeTimer = 0;

    // Arcade mode: simplified controls for casual/young players
    arcadeMode = false;

    get power(): number {
        return this.arcadeMode
            ? calculateArcadeThrowPower(this.holdTime)
            : calculateThrowPower(this.holdTime);
    }

    get charging(): boolean {
        return this.isCharging;
    }

    get forehand(): boolean {
        return this.throwType === 'forehand' || this.throwType === 'hammer' || this.throwType === 'scoober';
    }

    get hyzer(): number {
        return this.hyzerAccum;
    }

    get direction(): THREE.Vector3 {
        return this.aimDirection;
    }
    
    get currentThrowType(): ThrowType {
        return this.throwType;
    }
    
    get isQuickRelease(): boolean {
        return this.quickReleaseAvailable && this.continuationMode;
    }

    update(
        dt: number,
        input: GameplayInputSource,
        player: Player,
        camera: THREE.PerspectiveCamera,
        viewport?: InputViewport,
    ): ThrowParams | null {
        // Update fake timer
        if (this.fakeTimer > 0) {
            this.fakeTimer -= dt;
            if (this.fakeTimer <= 0) {
                this.isFake = false;
            }
        }
        
        // Check for quick release window
        const timeSinceLastThrow = performance.now() - this.lastThrowTime;
        this.quickReleaseAvailable = timeSinceLastThrow < QUICK_RELEASE_WINDOW;
        
        // Determine throw type from input
        if (this.arcadeMode) {
            // Arcade: only backhand/forehand, no special throws
            this.throwType = input.mouseButtons.right ? 'forehand' : 'backhand';
            this.releaseHeight = 'normal';
            // No hyzer adjustment in arcade — consume scroll silently
            input.consumeScroll();
            this.hyzerAccum = 0;
        } else {
            this.updateThrowType(input);

            // Update release height
            if (input.isHighRelease()) {
                this.releaseHeight = 'high';
            } else if (input.isLowRelease()) {
                this.releaseHeight = 'low';
            } else {
                this.releaseHeight = 'normal';
            }

            // Hyzer from scroll (with different sensitivity for different throws)
            const scroll = input.consumeScroll();
            const hyzerSensitivity = this.throwType === 'blade' ? 0.002 : 0.001;
            this.hyzerAccum += scroll * hyzerSensitivity;
            this.hyzerAccum = Math.max(-0.6, Math.min(0.6, this.hyzerAccum));
        }

        // Compute aim direction from mouse
        this.updateAimDirection(input, camera, player, viewport);

        // Handle throw input
        if (input.mouseButtons.left) {
            if (!this.isCharging) {
                this.isCharging = true;
                this.holdTime = 0;
            } else {
                this.holdTime += dt;
            }
        } else if (this.isCharging) {
            // Release
            this.isCharging = false;
            const power = this.power;
            
            // Check for fake (very short hold)
            if (this.holdTime < 0.22) {
                this.triggerFake();
                this.holdTime = 0;
                return null;
            }
            
            const params = this.computeThrowParams(player, power);
            this.lastThrowTime = performance.now();
            this.holdTime = 0;
            this.hyzerAccum = 0;
            this.continuationMode = false;
            return params;
        }
        
        // Quick release with space while in continuation
        if (this.quickReleaseAvailable && input.isJumping() && this.continuationMode) {
            const params = this.computeThrowParams(player, 0.7); // Quick releases at 70% power
            this.lastThrowTime = performance.now();
            this.continuationMode = false;
            return params;
        }

        return null;
    }
    
    // Called when disc is caught to enable continuation
    onCatch(): void {
        this.continuationMode = true;
        this.lastThrowTime = performance.now(); // Reset window
    }
    
    private updateThrowType(input: GameplayInputSource): void {
        // Default based on mouse button
        if (input.mouseButtons.right) {
            this.throwType = 'forehand';
        } else {
            this.throwType = 'backhand';
        }
        
        // Special throws with key modifiers
        if (input.isHammerThrow()) {
            this.throwType = input.mouseButtons.right ? 'scoober' : 'hammer';
        } else if (input.isBladeThrow()) {
            this.throwType = 'blade';
        } else if (input.isThumberThrow()) {
            this.throwType = 'thumber';
        }
    }
    
    private updateAimDirection(
        input: GameplayInputSource,
        camera: THREE.PerspectiveCamera,
        player: Player,
        viewport?: InputViewport,
    ): void {
        const view = viewport ?? {
            x: 0,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight,
        };
        const localX = (input.mousePosition.x - view.x) / Math.max(1, view.width);
        const localY = (input.mousePosition.y - view.y) / Math.max(1, view.height);
        _ndc.set(localX * 2 - 1, -(localY * 2) + 1);
        this.raycaster.setFromCamera(_ndc, camera);
        
        // Adjust aim plane based on throw type
        let planeHeight = -1.5;
        if (this.throwType === 'hammer' || this.throwType === 'scoober') {
            planeHeight = -3.0; // Aim higher for overhead throws
        } else if (this.throwType === 'blade') {
            planeHeight = -0.5; // Aim lower for blades
        }
        this.aimPlane.constant = planeHeight;
        
        if (this.raycaster.ray.intersectPlane(this.aimPlane, this.intersectPoint)) {
            this.aimDirection
                .copy(this.intersectPoint)
                .sub(player.movement.position)
                .normalize();
            
            // Add throw-specific trajectory
            const config = THROW_CONFIGS[this.throwType];
            const loft = config.upAngle + this.power * 0.05;
            this.aimDirection.y += loft;
            this.aimDirection.normalize();
        }
    }

    private computeThrowParams(player: Player, power: number): ThrowParams {
        const config = THROW_CONFIGS[this.throwType];
        
        // Apply player stats if available
        let speed = power * config.baseSpeed;
        let spinRate = config.spinRate * power;
        let accuracy = 1.0;
        
        if (player.stats) {
            const stats = player.stats;
            const throwPower = stats.getEffectiveStat('throwPower');
            const throwAccuracy = stats.getEffectiveStat('throwAccuracy');
            
            // Adjust speed based on throw power stat
            speed *= (0.8 + throwPower / 100 * 0.4);
            
            // Adjust accuracy
            const throwSkill = this.throwType === 'forehand' || this.throwType === 'scoober'
                ? stats.getEffectiveStat('forehand')
                : this.throwType === 'backhand' || this.throwType === 'hammer'
                ? stats.getEffectiveStat('backhand')
                : 50;
            
            accuracy = (throwAccuracy / 100) * (throwSkill / 100) * config.accuracyMod;
            
            // Apply accuracy variance
            const variance = (1 - accuracy) * 0.1;
            this.aimDirection.x += (Random.next() - 0.5) * variance;
            this.aimDirection.y += (Random.next() - 0.5) * variance;
            this.aimDirection.normalize();
            
            // Update stamina
            stats.currentStamina -= power * 2;
        }
        
        // Determine release height
        let releaseHeight = 1.5;
        if (this.releaseHeight === 'low') {
            releaseHeight = 0.8;
        } else if (this.releaseHeight === 'high') {
            releaseHeight = 2.2;
        }
        
        // Special throw adjustments
        if (this.throwType === 'hammer' || this.throwType === 'scoober') {
            releaseHeight += 0.3; // Overhead release
        }

        return {
            position: player.movement.position.clone().setY(releaseHeight),
            direction: this.aimDirection.clone(),
            speed,
            spinRate,
            noseAngle: config.noseAngle + (0.05 - power * 0.09),
            hyzerAngle: this.hyzerAccum + config.hyzerDefault,
            releaseHeight,
            offAxis: config.offAxis,
            isForehand: this.forehand,
        };
    }
    
    private triggerFake(): void {
        this.isFake = true;
        this.fakeTimer = 0.5;
    }
    
    isFaking(): boolean {
        return this.isFake;
    }

    reset(): void {
        this.holdTime = 0;
        this.isCharging = false;
        this.hyzerAccum = 0;
        this.throwType = 'backhand';
        this.releaseHeight = 'normal';
        this.isFake = false;
        this.fakeTimer = 0;
    }
}

// AI Throw decision helper
export function selectAIThrowType(
    thrower: Player,
    target: THREE.Vector3,
    distance: number,
    hasMark: boolean,
): ThrowType {
    const stats = thrower.stats;
    const dirToTarget = target.clone().sub(thrower.movement.position).normalize();
    const isBehind = dirToTarget.z < -0.3;
    
    // If marked and target is behind, consider high throws
    if (hasMark && isBehind) {
        if (stats) {
            const hammerSkill = stats.getEffectiveStat('backhand'); // Hammers use backhand
            const forehandSkill = stats.getEffectiveStat('forehand');
            
            if (hammerSkill > 60 && Random.next() < 0.5) {
                return 'hammer';
            }
            if (forehandSkill > 60 && Random.next() < 0.3) {
                return 'scoober';
            }
        }
    }
    
    // Blade for quick dumps over mark
    if (hasMark && distance < 10) {
        if (stats && stats.getEffectiveStat('throwPower') > 70 && Random.next() < 0.2) {
            return 'blade';
        }
    }
    
    // Default based on distance and preference
    if (stats) {
        const fhSkill = stats.getEffectiveStat('forehand');
        const bhSkill = stats.getEffectiveStat('backhand');
        return fhSkill > bhSkill ? 'forehand' : 'backhand';
    }
    
    return 'backhand';
}

// ----- Quick Pass Infrastructure -----

/**
 * Compute throw parameters for a quick pass to the best open teammate.
 * Returns null if no good passing option exists.
 */
export function computeQuickPass(
    player: Player,
    teammates: Player[],
    opponents: Player[],
): ThrowParams | null {
    const throwerPos = player.movement.position;

    // Score each teammate
    let bestScore = -Infinity;
    let bestTarget: Player | null = null;

    for (const tm of teammates) {
        if (tm === player) continue;
        if (tm.holdingDisc) continue;

        const tmPos = tm.movement.position;
        const distToThrower = throwerPos.distanceTo(tmPos);

        // Skip teammates that are too close or too far
        if (distToThrower < 3 || distToThrower > 40) continue;

        // Score 1: Distance from nearest defender (more space = better)
        let nearestDefDist = Infinity;
        for (const opp of opponents) {
            const d = tmPos.distanceTo(opp.movement.position);
            if (d < nearestDefDist) nearestDefDist = d;
        }

        // Score 2: Clear throwing lane (check if any defender is close to the line)
        _tempDir.subVectors(tmPos, throwerPos).normalize();
        let laneScore = 1.0;
        for (const opp of opponents) {
            // Project opponent position onto throw line
            const oppVec = opp.movement.position.clone().sub(throwerPos);
            const projDist = oppVec.dot(_tempDir);
            if (projDist < 0 || projDist > distToThrower) continue; // Behind or beyond target

            // Perpendicular distance from throw lane
            const projPoint = throwerPos.clone().addScaledVector(_tempDir, projDist);
            const perpDist = opp.movement.position.distanceTo(projPoint);

            if (perpDist < 1.5) {
                laneScore *= 0.1; // Heavily penalize blocked lanes
            } else if (perpDist < 3.0) {
                laneScore *= 0.5; // Somewhat risky
            }
        }

        // Score 3: Distance preference (prefer medium-range, 8-20m)
        let distScore: number;
        if (distToThrower < 8) {
            distScore = distToThrower / 8;
        } else if (distToThrower < 20) {
            distScore = 1.0;
        } else {
            distScore = 1.0 - (distToThrower - 20) / 20;
        }

        // Composite score
        const defenderSeparation = Math.min(nearestDefDist / 5, 1.0); // Normalize to 0-1
        const score = defenderSeparation * 0.4 + laneScore * 0.4 + distScore * 0.2;

        if (score > bestScore) {
            bestScore = score;
            bestTarget = tm;
        }
    }

    // Threshold: require a minimum quality pass
    if (!bestTarget || bestScore < 0.3) {
        return null;
    }

    // Compute throw parameters aimed at the best target
    const targetPos = bestTarget.movement.position;
    const dir = new THREE.Vector3().subVectors(targetPos, throwerPos).normalize();

    // Add slight loft for the pass
    dir.y += 0.1;
    dir.normalize();

    const dist = throwerPos.distanceTo(targetPos);
    const power = 0.6; // 60% power for quick pass
    const config = THROW_CONFIGS['backhand'];
    const speed = power * config.baseSpeed;

    // Lead the target slightly based on their velocity
    const leadDir = dir.clone();
    if (bestTarget.movement.velocity.lengthSq() > 0.25) {
        const leadTime = dist / speed * 0.5; // Partial lead
        leadDir.addScaledVector(bestTarget.movement.velocity, leadTime / dist);
        leadDir.normalize();
        leadDir.y = dir.y; // Preserve loft
        leadDir.normalize();
    }

    return {
        position: throwerPos.clone().setY(1.5),
        direction: leadDir,
        speed,
        spinRate: config.spinRate * power,
        noseAngle: config.noseAngle + (0.05 - power * 0.09),
        hyzerAngle: config.hyzerDefault,
        releaseHeight: 1.5,
        offAxis: config.offAxis,
        isForehand: false,
    };
}

// ----- Cut Call Infrastructure -----

/**
 * Compute the target position for a called cut.
 * @param cutter The player who should make the cut
 * @param discPosition Current disc position
 * @param cutType The type of cut to make
 * @returns Target position the cutter should run to
 */
export function computeCutTarget(
    cutter: Player,
    discPosition: THREE.Vector3,
    cutType: CutCall,
): THREE.Vector3 {
    const cutterPos = cutter.movement.position;
    const toDisc = new THREE.Vector3().subVectors(discPosition, cutterPos);
    toDisc.y = 0;
    const distToDisc = toDisc.length();
    const toDiscDir = toDisc.clone().normalize();

    // Lateral direction (perpendicular to disc direction on the XZ plane)
    const lateral = new THREE.Vector3(-toDiscDir.z, 0, toDiscDir.x);

    // Downfield direction: use the sign of toDisc.z to determine "deep" direction
    // Positive Z is generally "downfield" but we use the disc-to-cutter relationship
    const downfield = new THREE.Vector3(0, 0, toDiscDir.z >= 0 ? 1 : -1);

    switch (cutType) {
        case 'in': {
            // Toward the disc, 5-10m
            const cutDist = Math.min(distToDisc * 0.7, 10);
            const targetDist = Math.max(5, cutDist);
            return cutterPos.clone().addScaledVector(toDiscDir, targetDist);
        }

        case 'out': {
            // Away from disc laterally, 8-12m
            // Pick the lateral side the cutter is already leaning toward
            const lateralBias = cutterPos.x - discPosition.x;
            const sign = lateralBias >= 0 ? 1 : -1;
            const lateralDir = lateral.clone().multiplyScalar(sign);
            const distance = 8 + Random.next() * 4; // 8-12m
            return cutterPos.clone().addScaledVector(lateralDir, distance);
        }

        case 'deep': {
            // Downfield, 15-25m
            const distance = 15 + Random.next() * 10; // 15-25m
            // Slightly away from disc laterally to create space
            const lateralOffset = (Random.next() - 0.5) * 4;
            return cutterPos.clone()
                .addScaledVector(downfield, distance)
                .addScaledVector(lateral, lateralOffset);
        }

        case 'under': {
            // Toward disc and slightly downfield, 8-15m
            const towardDisc = toDiscDir.clone();
            // Blend toward disc with downfield
            towardDisc.addScaledVector(downfield, 0.3).normalize();
            const distance = 8 + Random.next() * 7; // 8-15m
            return cutterPos.clone().addScaledVector(towardDisc, distance);
        }
    }
}
