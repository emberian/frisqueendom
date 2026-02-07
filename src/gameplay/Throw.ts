import * as THREE from 'three';
import { InputManager } from '../InputManager';
import { THROW_CONFIGS, calculateThrowPower, QUICK_RELEASE_WINDOW } from '../data/GameplayConstants';
import type { ThrowParams } from '../data/Types';
import type { Player } from '../entities/Player';
import type { GameCamera } from '../rendering/Camera';

export type ThrowType = 'backhand' | 'forehand' | 'hammer' | 'scoober' | 'thumber' | 'blade';
export type ReleaseHeight = 'low' | 'normal' | 'high';

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

    get power(): number {
        return calculateThrowPower(this.holdTime);
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
        input: InputManager,
        player: Player,
        camera: THREE.PerspectiveCamera,
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

        // Compute aim direction from mouse
        this.updateAimDirection(input, camera, player);

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
            if (this.holdTime < 0.15) {
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
    
    private updateThrowType(input: InputManager): void {
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
        input: InputManager,
        camera: THREE.PerspectiveCamera,
        player: Player,
    ): void {
        const ndc = new THREE.Vector2(
            (input.mousePosition.x / window.innerWidth) * 2 - 1,
            -(input.mousePosition.y / window.innerHeight) * 2 + 1,
        );
        this.raycaster.setFromCamera(ndc, camera);
        
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
            this.aimDirection.x += (Math.random() - 0.5) * variance;
            this.aimDirection.y += (Math.random() - 0.5) * variance;
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
            noseAngle: config.noseAngle + (this.power - 0.5) * 0.05,
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
            
            if (hammerSkill > 60 && Math.random() < 0.5) {
                return 'hammer';
            }
            if (forehandSkill > 60 && Math.random() < 0.3) {
                return 'scoober';
            }
        }
    }
    
    // Blade for quick dumps over mark
    if (hasMark && distance < 10) {
        if (stats && stats.getEffectiveStat('throwPower') > 70 && Math.random() < 0.2) {
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
