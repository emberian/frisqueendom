import * as THREE from 'three';

export type CameraMode = 'follow_player' | 'follow_disc' | 'broadcast';

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
        }
    }

    update(dt: number, followTarget: THREE.Vector3): void {
        // Smooth offset transition
        if (this.transitionProgress < 1) {
            this.transitionProgress = Math.min(1, this.transitionProgress + dt * 2);
            const t = this.transitionProgress * this.transitionProgress * (3 - 2 * this.transitionProgress); // smoothstep
            this.currentOffset.lerpVectors(this.prevOffset, this.targetOffset, t);
        }

        // Exponential smoothing
        this.target.lerp(followTarget, 1 - Math.exp(-3 * dt));

        this.camera.position.copy(this.target).add(this.currentOffset);
        this.camera.lookAt(this.target);
    }

    handleResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }
}
