import * as THREE from 'three';

export type CameraMode = 'follow_player' | 'follow_disc' | 'broadcast' | 'overview';

// Shake presets for main.ts integration
export const SHAKE_LAYOUT = { intensity: 0.12, duration: 0.3 };
export const SHAKE_SCORE = { intensity: 0.08, duration: 0.2 };
export const SHAKE_BLOCK = { intensity: 0.1, duration: 0.15 };

const _tempCenter = new THREE.Vector3();
const _finalOffset = new THREE.Vector3();

export class GameCamera {
    camera: THREE.PerspectiveCamera;
    private target = new THREE.Vector3();
    private currentOffset = new THREE.Vector3(0, 10, -14);
    private mode: CameraMode = 'follow_player';
    private transitionProgress = 1;
    private prevOffset = new THREE.Vector3();
    private targetOffset = new THREE.Vector3();

    // Screen shake state
    private shakeIntensity = 0;
    private shakeDuration = 0;
    private shakeTimer = 0;

    // Look-ahead
    private lookAheadVelocity = new THREE.Vector3();

    // Dynamic FOV
    private baseFov = 60;
    private currentFov = 60;
    private targetFov = 60;

    // Crash zoom
    private crashZoomProgress = 0;
    private crashZoomActive = false;

    constructor() {
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            500,
        );
        this.camera.position.set(0, 15, -5);
        this.camera.lookAt(0, 0, 50);
    }

    private applyModeOffset(mode: CameraMode): void {
        switch (mode) {
            case 'follow_player':
                this.targetOffset.set(0, 12, -18);
                break;
            case 'follow_disc':
                this.targetOffset.set(0, 18, -25);
                break;
            case 'broadcast':
                this.targetOffset.set(-40, 25, 0);
                break;
            case 'overview':
                this.targetOffset.set(-55, 45, 0);
                break;
        }
    }

    setMode(mode: CameraMode): void {
        if (mode === this.mode) return;
        this.mode = mode;
        this.prevOffset.copy(this.currentOffset);
        this.transitionProgress = 0;
        this.applyModeOffset(mode);
    }

    /**
     * Trigger a screen shake effect.
     * @param intensity - amplitude in world units (0.05 = subtle, 0.15 = medium, 0.3 = heavy)
     * @param duration - seconds (typically 0.15-0.3)
     */
    triggerShake(intensity: number, duration: number): void {
        // Only override if the new shake is stronger than the current remaining one
        const currentRemaining = this.shakeIntensity * Math.max(0, 1 - this.shakeTimer / this.shakeDuration);
        if (intensity > currentRemaining || this.shakeDuration <= 0) {
            this.shakeIntensity = intensity;
            this.shakeDuration = duration;
            this.shakeTimer = 0;
        }
    }

    /**
     * Set look-ahead velocity for the followed target.
     * Camera offsets in the direction of movement.
     */
    setLookAheadVelocity(vx: number, vz: number): void {
        this.lookAheadVelocity.set(vx, 0, vz);
    }

    /**
     * Set whether the player is sprinting (widens FOV).
     */
    setSprintFov(isSprinting: boolean): void {
        this.targetFov = isSprinting ? 72 : this.baseFov;
    }

    /**
     * Trigger crash zoom on score (briefly pulls camera in).
     */
    triggerCrashZoom(): void {
        this.crashZoomActive = true;
        this.crashZoomProgress = 0;
    }

    update(dt: number, followTargets: THREE.Vector3 | THREE.Vector3[]): void {
        const targets = Array.isArray(followTargets) ? followTargets : null;
        if (targets) {
            if (targets.length === 0) return;
            _tempCenter.set(0, 0, 0);
            for (const t of targets) _tempCenter.add(t);
            _tempCenter.divideScalar(targets.length);
        } else {
            _tempCenter.copy(followTargets as THREE.Vector3);
        }

        // Smooth offset transition
        if (this.transitionProgress < 1) {
            this.transitionProgress = Math.min(1, this.transitionProgress + dt * 2);
            const t = this.transitionProgress * this.transitionProgress * (3 - 2 * this.transitionProgress);
            this.currentOffset.lerpVectors(this.prevOffset, this.targetOffset, t);
        }

        // Exponential smoothing
        this.target.lerp(_tempCenter, 1 - Math.exp(-4 * dt));

        // Look-ahead: offset target in direction of movement
        if (this.lookAheadVelocity.lengthSq() > 0.1) {
            const speed = this.lookAheadVelocity.length();
            const lookAheadDist = Math.min(speed * 0.4, 5);
            this.target.x += (this.lookAheadVelocity.x / speed) * lookAheadDist;
            this.target.z += (this.lookAheadVelocity.z / speed) * lookAheadDist;
        }

        // Dynamic FOV
        this.currentFov = THREE.MathUtils.lerp(this.currentFov, this.targetFov, 1 - Math.exp(-4 * dt));
        if (Math.abs(this.currentFov - this.camera.fov) > 0.1) {
            this.camera.fov = this.currentFov;
            this.camera.updateProjectionMatrix();
        }

        // Crash zoom (0.3s pull-in then ease back)
        let crashZoomScale = 1.0;
        if (this.crashZoomActive) {
            this.crashZoomProgress += dt;
            if (this.crashZoomProgress < 0.3) {
                // Pull in: quadratic ease-out
                const t = this.crashZoomProgress / 0.3;
                crashZoomScale = 1.0 - 0.35 * t * (2 - t);
            } else if (this.crashZoomProgress < 0.9) {
                // Ease back out
                const t = (this.crashZoomProgress - 0.3) / 0.6;
                crashZoomScale = 0.65 + 0.35 * t * t;
            } else {
                this.crashZoomActive = false;
                this.crashZoomProgress = 0;
            }
        }

        // Adjust zoom based on target spread if multiple targets
        let zoomMod = 1.0;
        if (targets && targets.length > 1) {
            let maxDistSq = 0;
            for (const t of targets) {
                const dSq = t.distanceToSquared(_tempCenter);
                if (dSq > maxDistSq) maxDistSq = dSq;
            }
            const spread = Math.sqrt(maxDistSq);
            zoomMod = 1.0 + Math.min(spread * 0.05, 0.8);
        }

        _finalOffset.copy(this.currentOffset).multiplyScalar(zoomMod * crashZoomScale);
        this.camera.position.copy(this.target).add(_finalOffset);
        this.camera.lookAt(this.target);

        // Screen shake (applied after camera positioning)
        if (this.shakeTimer < this.shakeDuration && this.shakeIntensity > 0) {
            this.shakeTimer += dt;
            // Linear decay from full intensity to zero over duration
            const progress = Math.min(1, this.shakeTimer / this.shakeDuration);
            const amplitude = this.shakeIntensity * (1 - progress);

            // High-frequency oscillation on each axis with slightly different frequencies
            // for organic, non-repeating feel
            const freqX = 37;  // ~37Hz
            const freqY = 43;  // ~43Hz
            const freqZ = 31;  // ~31Hz
            const time = this.shakeTimer;

            const offsetX = Math.sin(time * freqX * Math.PI * 2) * amplitude;
            const offsetY = Math.sin(time * freqY * Math.PI * 2) * amplitude * 0.7;
            const offsetZ = Math.sin(time * freqZ * Math.PI * 2) * amplitude * 0.4;

            this.camera.position.x += offsetX;
            this.camera.position.y += offsetY;
            this.camera.position.z += offsetZ;

            if (progress >= 1) {
                this.shakeIntensity = 0;
                this.shakeDuration = 0;
                this.shakeTimer = 0;
            }
        }
    }

    /** Instantly snap to a mode + target with no transition or lerp. */
    snapTo(mode: CameraMode, target: THREE.Vector3): void {
        this.mode = mode;
        this.target.copy(target);
        this.transitionProgress = 1;
        this.applyModeOffset(mode);
        this.currentOffset.copy(this.targetOffset);
        this.prevOffset.copy(this.targetOffset);

        this.camera.position.copy(this.target).add(this.currentOffset);
        this.camera.lookAt(this.target);
    }

    handleResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }
}
