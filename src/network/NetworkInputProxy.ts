import * as THREE from 'three';
import type { GameplayInputSource, InputViewport } from '../InputManager';
import type { RemoteControllerState } from './protocol';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export class NetworkInputProxy implements GameplayInputSource {
    mousePosition = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5);
    mouseButtons = { left: false, right: false };

    private movement = new THREE.Vector2();
    private sprint = false;
    private jump = false;
    private switchQueued = false;
    private hammer = false;
    private blade = false;
    private thumber = false;
    private highRelease = false;
    private lowRelease = false;
    private timeout = false;
    private foul = false;
    private pause = false;
    private curveDelta = 0;
    private aimX = 0.5;
    private aimY = 0.5;
    private accentColor: string | undefined;

    applyState(state: RemoteControllerState): void {
        this.movement.set(state.moveX, state.moveZ);
        this.sprint = state.sprint;
        this.jump = state.jump;
        this.switchQueued = this.switchQueued || state.switchPlayer;
        this.hammer = state.hammer;
        this.blade = state.blade;
        this.thumber = state.thumber;
        this.highRelease = state.highRelease;
        this.lowRelease = state.lowRelease;
        this.mouseButtons.left = state.throwHeld;
        this.mouseButtons.right = state.forehandHeld;
        this.aimX = clamp(state.aimX, 0, 1);
        this.aimY = clamp(state.aimY, 0, 1);
        this.curveDelta += state.curveDelta;
        this.timeout = state.timeout;
        this.foul = state.foul;
        this.pause = state.pause;
        this.accentColor = state.accentColor;
    }

    getAccentColor(): string | undefined {
        return this.accentColor;
    }

    update(_dt: number, viewport?: InputViewport): void {
        const vp =
            viewport ??
            ({
                x: 0,
                y: 0,
                width: window.innerWidth,
                height: window.innerHeight,
            } satisfies InputViewport);
        this.mousePosition.set(
            vp.x + this.aimX * vp.width,
            vp.y + this.aimY * vp.height,
        );
    }

    getMovementDir(): { x: number; z: number } {
        return { x: this.movement.x, z: this.movement.y };
    }

    isSprinting(): boolean {
        return this.sprint;
    }

    isJumping(): boolean {
        return this.jump;
    }

    isSwitchPlayer(): boolean {
        if (!this.switchQueued) return false;
        this.switchQueued = false;
        return true;
    }

    isSwitchToNearest(): boolean {
        return false; // Not supported on remote controllers yet
    }

    isHammerThrow(): boolean {
        return this.hammer;
    }

    isBladeThrow(): boolean {
        return this.blade;
    }

    isThumberThrow(): boolean {
        return this.thumber;
    }

    isHighRelease(): boolean {
        return this.highRelease;
    }

    isLowRelease(): boolean {
        return this.lowRelease;
    }

    isPausePressed(): boolean {
        return this.pause;
    }

    isCallingTimeout(): boolean {
        return this.timeout;
    }

    isCallingFoul(): boolean {
        return this.foul;
    }

    isKeyDown(_code: string): boolean {
        return false;
    }

    consumeScroll(): number {
        const delta = this.curveDelta;
        this.curveDelta = 0;
        return delta;
    }
}
