import * as THREE from 'three';

export class InputManager {
    private keys = new Set<string>();
    mousePosition = new THREE.Vector2();
    mouseButtons = { left: false, right: false };
    scrollDelta = 0;

    constructor() {
        window.addEventListener('keydown', (e) => this.keys.add(e.code));
        window.addEventListener('keyup', (e) => this.keys.delete(e.code));
        window.addEventListener('mousemove', (e) =>
            this.mousePosition.set(e.clientX, e.clientY),
        );
        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouseButtons.left = true;
            if (e.button === 2) this.mouseButtons.right = true;
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouseButtons.left = false;
            if (e.button === 2) this.mouseButtons.right = false;
        });
        window.addEventListener('wheel', (e) => {
            this.scrollDelta += e.deltaY;
        });
        window.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    isKeyDown(code: string): boolean {
        return this.keys.has(code);
    }

    getMovementDir(): { x: number; z: number } {
        let x = 0,
            z = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
        return { x, z };
    }

    isSprinting(): boolean {
        return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    }

    isJumping(): boolean {
        return this.keys.has('Space');
    }

    isSwitchPlayer(): boolean {
        return this.keys.has('KeyE');
    }

    consumeScroll(): number {
        const d = this.scrollDelta;
        this.scrollDelta = 0;
        return d;
    }
}
