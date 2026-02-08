import * as THREE from 'three';

export type CameraMode = 'follow_player' | 'follow_disc' | 'broadcast' | 'overview';

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

    setMode(mode: CameraMode): void {
        if (mode === this.mode) return;
        this.mode = mode;
        this.prevOffset.copy(this.currentOffset);
        this.transitionProgress = 0;

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

        _finalOffset.copy(this.currentOffset).multiplyScalar(zoomMod);
        this.camera.position.copy(this.target).add(_finalOffset);
        this.camera.lookAt(this.target);
    }

    /** Instantly snap to a mode + target with no transition or lerp. */
    snapTo(mode: CameraMode, target: THREE.Vector3): void {
        this.mode = mode;
        this.target.copy(target);
        this.transitionProgress = 1;

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
