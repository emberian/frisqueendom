import * as THREE from 'three';
import { InputManager } from '../InputManager';
import type { ThrowParams } from '../data/Types';
import type { Player } from '../entities/Player';
import type { Disc } from '../entities/Disc';
import type { GameCamera } from '../rendering/Camera';

function powerCurve(holdTime: number): number {
    if (holdTime < 0.3) return (holdTime / 0.3) * 0.3;
    if (holdTime < 0.5) return 0.3 + ((holdTime - 0.3) / 0.2) * 0.3;
    if (holdTime < 0.8) return 0.6 + ((holdTime - 0.5) / 0.3) * 0.3;
    if (holdTime < 1.0) return 0.9 + ((holdTime - 0.8) / 0.2) * 0.1;
    if (holdTime < 1.2) return 1.0 - ((holdTime - 1.0) / 0.2) * 0.05;
    return 0.85;
}

export class ThrowController {
    private holdTime = 0;
    private isCharging = false;
    private isForehand = false;
    private hyzerAccum = 0;
    private aimDirection = new THREE.Vector3(0, 0.1, 1);
    private raycaster = new THREE.Raycaster();
    private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.5);
    private intersectPoint = new THREE.Vector3();

    get power(): number {
        return powerCurve(this.holdTime);
    }

    get charging(): boolean {
        return this.isCharging;
    }

    get forehand(): boolean {
        return this.isForehand;
    }

    get hyzer(): number {
        return this.hyzerAccum;
    }

    get direction(): THREE.Vector3 {
        return this.aimDirection;
    }

    update(
        dt: number,
        input: InputManager,
        player: Player,
        camera: THREE.PerspectiveCamera,
    ): ThrowParams | null {
        // Forehand toggle
        this.isForehand = input.mouseButtons.right;

        // Hyzer from scroll
        const scroll = input.consumeScroll();
        this.hyzerAccum += scroll * 0.001;
        this.hyzerAccum = Math.max(-0.5, Math.min(0.5, this.hyzerAccum));

        // Compute aim direction from mouse
        const ndc = new THREE.Vector2(
            (input.mousePosition.x / window.innerWidth) * 2 - 1,
            -(input.mousePosition.y / window.innerHeight) * 2 + 1,
        );
        this.raycaster.setFromCamera(ndc, camera);
        if (this.raycaster.ray.intersectPlane(this.aimPlane, this.intersectPoint)) {
            this.aimDirection
                .copy(this.intersectPoint)
                .sub(player.movement.position)
                .normalize();
            // Add loft
            const loft = 0.05 + this.power * 0.1;
            this.aimDirection.y = loft;
            this.aimDirection.normalize();
        }

        if (input.mouseButtons.left) {
            this.isCharging = true;
            this.holdTime += dt;
        } else if (this.isCharging) {
            // Release
            this.isCharging = false;
            const power = this.power;
            const params = this.computeThrowParams(player, power);
            this.holdTime = 0;
            this.hyzerAccum = 0;
            return params;
        }

        return null;
    }

    private computeThrowParams(player: Player, power: number): ThrowParams {
        const speed = power * (this.isForehand ? 28 : 25);
        const spinRate = (this.isForehand ? 100 : 80) * power * 1.1;
        const noseAngle = 0.05 - power * 0.02;

        return {
            position: player.movement.position
                .clone()
                .setY(1.5),
            direction: this.aimDirection.clone(),
            speed,
            spinRate,
            noseAngle,
            hyzerAngle: this.hyzerAccum,
            releaseHeight: 1.5,
            offAxis: 0,
            isForehand: this.isForehand,
        };
    }

    reset(): void {
        this.holdTime = 0;
        this.isCharging = false;
        this.hyzerAccum = 0;
    }
}
