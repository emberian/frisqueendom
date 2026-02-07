import * as THREE from 'three';

export class InputManager {
    private keys = new Set<string>();
    mousePosition = new THREE.Vector2();
    mouseButtons = { left: false, right: false };
    scrollDelta = 0;
    private switchPressedLastFrame = false;
    
    // Touch input for mobile
    private touchStart = new THREE.Vector2();
    private touchCurrent = new THREE.Vector2();
    private isTouching = false;

    private readonly onKeyDown = (e: KeyboardEvent) => {
        this.keys.add(e.code);
    };
    private readonly onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.code);
    };
    private readonly onMouseMove = (e: MouseEvent) => {
        this.mousePosition.set(e.clientX, e.clientY);
    };
    private readonly onMouseDown = (e: MouseEvent) => {
        if (e.button === 0) this.mouseButtons.left = true;
        if (e.button === 2) this.mouseButtons.right = true;
    };
    private readonly onMouseUp = (e: MouseEvent) => {
        if (e.button === 0) this.mouseButtons.left = false;
        if (e.button === 2) this.mouseButtons.right = false;
    };
    private readonly onWheel = (e: WheelEvent) => {
        this.scrollDelta += e.deltaY;
    };
    private readonly onContextMenu = (e: Event) => {
        e.preventDefault();
    };
    private readonly onTouchStart = (e: TouchEvent) => {
        if (e.touches.length > 0) {
            this.isTouching = true;
            this.touchStart.set(e.touches[0].clientX, e.touches[0].clientY);
            this.touchCurrent.copy(this.touchStart);
            this.mouseButtons.left = true;
            this.mousePosition.copy(this.touchCurrent);
        }
    };
    private readonly onTouchMove = (e: TouchEvent) => {
        if (e.touches.length > 0) {
            this.touchCurrent.set(e.touches[0].clientX, e.touches[0].clientY);
            this.mousePosition.copy(this.touchCurrent);
        }
    };
    private readonly onTouchEnd = () => {
        this.isTouching = false;
        this.mouseButtons.left = false;
    };
    private readonly onBlur = () => {
        this.keys.clear();
        this.mouseButtons.left = false;
        this.mouseButtons.right = false;
        this.scrollDelta = 0;
        this.isTouching = false;
        this.switchPressedLastFrame = false;
    };

    constructor() {
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('wheel', this.onWheel);
        window.addEventListener('contextmenu', this.onContextMenu);
        
        // Touch events for mobile
        window.addEventListener('touchstart', this.onTouchStart, { passive: false });
        
        window.addEventListener('touchmove', this.onTouchMove, { passive: false });
        
        window.addEventListener('touchend', this.onTouchEnd);
        window.addEventListener('touchcancel', this.onTouchEnd);
        window.addEventListener('blur', this.onBlur);
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
        const switchPressed = this.keys.has('KeyE');
        const justPressed = switchPressed && !this.switchPressedLastFrame;
        this.switchPressedLastFrame = switchPressed;
        return justPressed;
    }
    
    // Special throw modifiers
    isHammerThrow(): boolean {
        return this.keys.has('KeyQ');
    }
    
    isBladeThrow(): boolean {
        return this.keys.has('KeyB');
    }
    
    isThumberThrow(): boolean {
        return this.keys.has('KeyT');
    }
    
    // Release height modifiers
    isHighRelease(): boolean {
        return this.keys.has('KeyR');
    }
    
    isLowRelease(): boolean {
        return this.keys.has('KeyF');
    }
    
    // Game control
    isPausePressed(): boolean {
        return this.keys.has('Escape');
    }
    
    isCallingTimeout(): boolean {
        return this.keys.has('KeyC');
    }
    
    isCallingFoul(): boolean {
        return this.keys.has('KeyV');
    }
    
    // Touch input getters
    getTouchJoystick(): { x: number; y: number } | null {
        if (!this.isTouching) return null;
        return {
            x: (this.touchCurrent.x - this.touchStart.x) / 50,
            y: (this.touchCurrent.y - this.touchStart.y) / 50,
        };
    }

    consumeScroll(): number {
        const d = this.scrollDelta;
        this.scrollDelta = 0;
        return d;
    }

    destroy(): void {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('wheel', this.onWheel);
        window.removeEventListener('contextmenu', this.onContextMenu);
        window.removeEventListener('touchstart', this.onTouchStart);
        window.removeEventListener('touchmove', this.onTouchMove);
        window.removeEventListener('touchend', this.onTouchEnd);
        window.removeEventListener('touchcancel', this.onTouchEnd);
        window.removeEventListener('blur', this.onBlur);
        this.onBlur();
    }
}
