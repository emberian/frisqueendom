import * as THREE from 'three';

export class PostFX {
    timeScale = 1.0;
    private shakeAmplitude = 0;
    private shakeFrequency = 30;
    private shakeDecay = 0;
    private shakeTimer = 0;
    private slowMoTimer = 0;
    private slowMoTarget = 1.0;

    triggerScoreEffect(): void {
        this.slowMoTimer = 0.5;
        this.slowMoTarget = 0.25;
        this.shakeAmplitude = 0.1;
        this.shakeDecay = 8;
        this.shakeTimer = 0;
    }

    triggerLayoutEffect(): void {
        this.slowMoTimer = 0.4;
        this.slowMoTarget = 0.25;
        this.shakeAmplitude = 0.04;
        this.shakeDecay = 15;
        this.shakeTimer = 0;
    }

    triggerBlockShake(): void {
        this.shakeAmplitude = 0.07;
        this.shakeDecay = 10;
        this.shakeTimer = 0;
    }

    triggerSmallShake(): void {
        this.shakeAmplitude = 0.05;
        this.shakeDecay = 12;
        this.shakeTimer = 0;
    }

    update(dt: number, camera: THREE.PerspectiveCamera): void {
        // Slow-mo
        if (this.slowMoTimer > 0) {
            this.timeScale = this.slowMoTarget;
            this.slowMoTimer -= dt; // use real dt, not scaled
            if (this.slowMoTimer <= 0) {
                this.slowMoTimer = 0;
            }
        } else if (this.timeScale < 1.0) {
            this.timeScale = Math.min(1.0, this.timeScale + dt * 3);
        }

        // Screen shake
        if (this.shakeAmplitude > 0.001) {
            this.shakeTimer += dt;
            const decay = Math.exp(-this.shakeDecay * this.shakeTimer);
            const offsetX =
                this.shakeAmplitude *
                decay *
                Math.sin(this.shakeTimer * this.shakeFrequency);
            const offsetY =
                this.shakeAmplitude *
                decay *
                Math.cos(this.shakeTimer * this.shakeFrequency * 1.3);

            camera.position.x += offsetX;
            camera.position.y += offsetY;

            if (decay < 0.01) {
                this.shakeAmplitude = 0;
            }
        }
    }
}
