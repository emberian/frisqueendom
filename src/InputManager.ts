import * as THREE from 'three';

type TouchSpecialThrow = 'none' | 'hammer' | 'blade' | 'thumber';
type TouchReleaseMode = 'normal' | 'high' | 'low';

export interface InputViewport {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface GameplayInputSource {
    mousePosition: THREE.Vector2;
    mouseButtons: { left: boolean; right: boolean };
    update(dt: number, viewport?: InputViewport): void;
    getMovementDir(): { x: number; z: number };
    isSprinting(): boolean;
    isJumping(): boolean;
    isSwitchPlayer(): boolean;
    isSwitchToNearest(): boolean;
    isHammerThrow(): boolean;
    isBladeThrow(): boolean;
    isThumberThrow(): boolean;
    isHighRelease(): boolean;
    isLowRelease(): boolean;
    isPausePressed(): boolean;
    isCallingTimeout(): boolean;
    isCallingFoul(): boolean;
    isKeyDown(code: string): boolean;
    consumeScroll(): number;
}

interface InputManagerOptions {
    enableKeyboardMouse?: boolean;
    allowTouch?: boolean;
    gamepadOrder?: number | null;
}

export class InputManager implements GameplayInputSource {
    private keys = new Set<string>();
    mousePosition = new THREE.Vector2();
    mouseButtons = { left: false, right: false };
    private desktopMouseButtons = { left: false, right: false };
    private touchMouseButtons = { left: false, right: false };
    private gamepadMouseButtons = { left: false, right: false };
    scrollDelta = 0;
    private touchScrollDelta = 0;
    private gamepadScrollDelta = 0;
    private switchPressedLastFrame = false;
    private gamepadSwitchPressedLastFrame = false;
    private gamepadSwitchQueued = false;
    private gamepadNearestPressedLastFrame = false;
    private gamepadNearestQueued = false;
    private nearestPressedLastFrame = false;
    private gamepadMovement = new THREE.Vector2();
    private gamepadSprint = false;
    private gamepadJump = false;
    private gamepadHammer = false;
    private gamepadBlade = false;
    private gamepadThumber = false;
    private gamepadHighRelease = false;
    private gamepadLowRelease = false;
    private gamepadPause = false;
    private gamepadTimeout = false;
    private gamepadFoul = false;
    private lastAimDevice: 'mouse' | 'gamepad' = 'mouse';
    private readonly gamepadOrder: number | null;
    private readonly enableKeyboardMouse: boolean;
    private readonly allowTouch: boolean;
    private lastConnectedPadId: string | null = null;
    onGamepadChange: ((connected: boolean, id: string, index: number) => void) | null = null;

    private touchControlsEnabled = false;
    private touchMovement = new THREE.Vector2();
    private touchSprint = false;
    private touchJump = false;
    private touchSwitchQueued = false;
    private touchPauseQueued = false;
    private touchSpecialThrow: TouchSpecialThrow = 'none';
    private touchReleaseMode: TouchReleaseMode = 'normal';

    private touchUiRoot: HTMLDivElement | null = null;
    private joystickKnob: HTMLDivElement | null = null;
    private joystickPointerId: number | null = null;
    private readonly joystickRadius = 42;
    private hyzerIncreaseInterval: number | null = null;
    private hyzerDecreaseInterval: number | null = null;

    private readonly onKeyDown = (e: KeyboardEvent) => {
        this.keys.add(e.code);
        // Prevent default for game-related keys to avoid browser interference (e.g. Firefox quick search)
        if (!e.metaKey && !e.ctrlKey && e.code !== 'F12' && e.code !== 'F11' && e.code !== 'F5') {
            e.preventDefault();
        }
    };
    private readonly onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.code);
        if (!e.metaKey && !e.ctrlKey && e.code !== 'F12' && e.code !== 'F11' && e.code !== 'F5') {
            e.preventDefault();
        }
    };
    private readonly onMouseMove = (e: MouseEvent) => {
        this.mousePosition.set(e.clientX, e.clientY);
        this.lastAimDevice = 'mouse';
    };
    private readonly onMouseDown = (e: MouseEvent) => {
        if (e.button === 0) this.desktopMouseButtons.left = true;
        if (e.button === 2) this.desktopMouseButtons.right = true;
        this.syncMouseButtons();
    };
    private readonly onMouseUp = (e: MouseEvent) => {
        if (e.button === 0) this.desktopMouseButtons.left = false;
        if (e.button === 2) this.desktopMouseButtons.right = false;
        this.syncMouseButtons();
    };
    private readonly onWheel = (e: WheelEvent) => {
        this.scrollDelta += e.deltaY;
        e.preventDefault();
    };
    private readonly onContextMenu = (e: Event) => {
        e.preventDefault();
    };
    private readonly onBlur = () => {
        this.keys.clear();
        this.desktopMouseButtons.left = false;
        this.desktopMouseButtons.right = false;
        this.touchMouseButtons.left = false;
        this.touchMouseButtons.right = false;
        this.syncMouseButtons();
        this.scrollDelta = 0;
        this.touchScrollDelta = 0;
        this.touchMovement.set(0, 0);
        this.touchSprint = false;
        this.touchJump = false;
        this.touchSwitchQueued = false;
        this.touchPauseQueued = false;
        this.touchSpecialThrow = 'none';
        this.touchReleaseMode = 'normal';
        this.resetJoystickVisual();
        this.clearHyzerIntervals();
        this.switchPressedLastFrame = false;
        this.gamepadSwitchPressedLastFrame = false;
        this.gamepadSwitchQueued = false;
        this.gamepadNearestPressedLastFrame = false;
        this.gamepadNearestQueued = false;
        this.nearestPressedLastFrame = false;
        this.gamepadMovement.set(0, 0);
        this.gamepadSprint = false;
        this.gamepadJump = false;
        this.gamepadHammer = false;
        this.gamepadBlade = false;
        this.gamepadThumber = false;
        this.gamepadHighRelease = false;
        this.gamepadLowRelease = false;
        this.gamepadPause = false;
        this.gamepadTimeout = false;
        this.gamepadFoul = false;
        this.gamepadMouseButtons.left = false;
        this.gamepadMouseButtons.right = false;
        this.gamepadScrollDelta = 0;
        this.syncMouseButtons();
    };

    constructor(options: InputManagerOptions = {}) {
        this.enableKeyboardMouse = options.enableKeyboardMouse ?? true;
        this.allowTouch = options.allowTouch ?? true;
        this.gamepadOrder =
            options.gamepadOrder === undefined ? 0 : options.gamepadOrder;

        if (this.enableKeyboardMouse) {
            window.addEventListener('keydown', this.onKeyDown);
            window.addEventListener('keyup', this.onKeyUp);
            window.addEventListener('mousemove', this.onMouseMove);
            window.addEventListener('mousedown', this.onMouseDown);
            window.addEventListener('mouseup', this.onMouseUp);
            window.addEventListener('wheel', this.onWheel);
            window.addEventListener('contextmenu', this.onContextMenu);
            window.addEventListener('blur', this.onBlur);
        }

        this.mousePosition.set(window.innerWidth * 0.5, window.innerHeight * 0.45);
        this.touchControlsEnabled =
            this.enableKeyboardMouse &&
            this.allowTouch &&
            this.shouldEnableTouchControls();
        if (this.touchControlsEnabled) {
            this.createTouchControls();
            this.mousePosition.set(window.innerWidth * 0.72, window.innerHeight * 0.58);
        }
    }

    update(dt: number, viewport?: InputViewport): void {
        this.pollGamepad(dt, viewport);
        this.syncMouseButtons();
    }

    isKeyDown(code: string): boolean {
        return this.keys.has(code);
    }

    getMovementDir(): { x: number; z: number } {
        let x = 0;
        let z = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;

        if (this.touchControlsEnabled) {
            x += this.touchMovement.x;
            z += this.touchMovement.y;
        }
        x += this.gamepadMovement.x;
        z += this.gamepadMovement.y;

        const magSq = x * x + z * z;
        if (magSq > 1) {
            const invMag = 1 / Math.sqrt(magSq);
            x *= invMag;
            z *= invMag;
        }

        return { x, z };
    }

    isSprinting(): boolean {
        return (
            this.keys.has('ShiftLeft') ||
            this.keys.has('ShiftRight') ||
            this.touchSprint ||
            this.gamepadSprint
        );
    }

    isJumping(): boolean {
        return this.keys.has('Space') || this.touchJump || this.gamepadJump;
    }

    isSwitchPlayer(): boolean {
        const switchPressed = this.keys.has('KeyE');
        const justPressed = switchPressed && !this.switchPressedLastFrame;
        this.switchPressedLastFrame = switchPressed;

        if (this.touchSwitchQueued) {
            this.touchSwitchQueued = false;
            return true;
        }
        if (this.gamepadSwitchQueued) {
            this.gamepadSwitchQueued = false;
            return true;
        }
        return justPressed;
    }

    isSwitchToNearest(): boolean {
        const nearestPressed = this.keys.has('Tab');
        const justPressed = nearestPressed && !this.nearestPressedLastFrame;
        this.nearestPressedLastFrame = nearestPressed;

        if (this.gamepadNearestQueued) {
            this.gamepadNearestQueued = false;
            return true;
        }
        return justPressed;
    }

    // Special throw modifiers
    isHammerThrow(): boolean {
        return (
            this.keys.has('KeyQ') ||
            this.touchSpecialThrow === 'hammer' ||
            this.gamepadHammer
        );
    }

    isBladeThrow(): boolean {
        return (
            this.keys.has('KeyB') ||
            this.touchSpecialThrow === 'blade' ||
            this.gamepadBlade
        );
    }

    isThumberThrow(): boolean {
        return (
            this.keys.has('KeyT') ||
            this.touchSpecialThrow === 'thumber' ||
            this.gamepadThumber
        );
    }

    // Release height modifiers
    isHighRelease(): boolean {
        return (
            this.keys.has('KeyR') ||
            this.touchReleaseMode === 'high' ||
            this.gamepadHighRelease
        );
    }

    isLowRelease(): boolean {
        return (
            this.keys.has('KeyF') ||
            this.touchReleaseMode === 'low' ||
            this.gamepadLowRelease
        );
    }

    // Game control
    isPausePressed(): boolean {
        if (this.touchPauseQueued) {
            this.touchPauseQueued = false;
            return true;
        }
        return this.keys.has('Escape') || this.gamepadPause;
    }

    isCallingTimeout(): boolean {
        return this.keys.has('KeyC') || this.gamepadTimeout;
    }

    isCallingFoul(): boolean {
        return this.keys.has('KeyV') || this.gamepadFoul;
    }

    isTouchControlsEnabled(): boolean {
        return this.touchControlsEnabled;
    }

    consumeScroll(): number {
        const d = this.scrollDelta + this.touchScrollDelta + this.gamepadScrollDelta;
        this.scrollDelta = 0;
        this.touchScrollDelta = 0;
        this.gamepadScrollDelta = 0;
        return d;
    }

    destroy(): void {
        if (this.enableKeyboardMouse) {
            window.removeEventListener('keydown', this.onKeyDown);
            window.removeEventListener('keyup', this.onKeyUp);
            window.removeEventListener('mousemove', this.onMouseMove);
            window.removeEventListener('mousedown', this.onMouseDown);
            window.removeEventListener('mouseup', this.onMouseUp);
            window.removeEventListener('wheel', this.onWheel);
            window.removeEventListener('contextmenu', this.onContextMenu);
            window.removeEventListener('blur', this.onBlur);
        }
        this.clearHyzerIntervals();
        this.touchUiRoot?.remove();
        this.touchUiRoot = null;
        this.onBlur();
    }

    private shouldEnableTouchControls(): boolean {
        const params = new URLSearchParams(window.location.search);
        const forced = params.get('touchControls') === '1';
        if (forced) return true;

        const hasTouch =
            navigator.maxTouchPoints > 0 ||
            'ontouchstart' in window;
        const coarsePointer =
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(pointer: coarse)').matches;
        return hasTouch && (coarsePointer || window.innerWidth <= 1024);
    }

    private syncMouseButtons(): void {
        this.mouseButtons.left =
            this.desktopMouseButtons.left ||
            this.touchMouseButtons.left ||
            this.gamepadMouseButtons.left;
        this.mouseButtons.right =
            this.desktopMouseButtons.right ||
            this.touchMouseButtons.right ||
            this.gamepadMouseButtons.right;
    }

    private pollGamepad(dt: number, viewport?: InputViewport): void {
        if (this.gamepadOrder === null || typeof navigator.getGamepads !== 'function') {
            return;
        }

        const gamepads = Array.from(navigator.getGamepads()).filter(
            (pad): pad is Gamepad => pad !== null,
        );
        gamepads.sort((a, b) => a.index - b.index);
        const pad = gamepads[this.gamepadOrder];

        // Detect connection changes
        const padId = pad?.id ?? null;
        if (padId !== this.lastConnectedPadId) {
            if (padId && !this.lastConnectedPadId) {
                this.onGamepadChange?.(true, padId, pad!.index);
            } else if (!padId && this.lastConnectedPadId) {
                this.onGamepadChange?.(false, this.lastConnectedPadId, -1);
            }
            this.lastConnectedPadId = padId;
        }

        if (!pad) {
            this.gamepadMovement.set(0, 0);
            this.gamepadSprint = false;
            this.gamepadJump = false;
            this.gamepadHammer = false;
            this.gamepadBlade = false;
            this.gamepadThumber = false;
            this.gamepadHighRelease = false;
            this.gamepadLowRelease = false;
            this.gamepadPause = false;
            this.gamepadTimeout = false;
            this.gamepadFoul = false;
            this.gamepadMouseButtons.left = false;
            this.gamepadMouseButtons.right = false;
            this.gamepadSwitchPressedLastFrame = false;
            this.gamepadNearestPressedLastFrame = false;
            return;
        }

        const leftX = applyResponseCurve(applyDeadzone(pad.axes[0] ?? 0, 0.16));
        const leftY = applyResponseCurve(applyDeadzone(pad.axes[1] ?? 0, 0.16));
        this.gamepadMovement.set(leftX, -leftY);

        const rightX = applyDeadzone(pad.axes[2] ?? 0, 0.2);
        const rightY = applyDeadzone(pad.axes[3] ?? 0, 0.2);

        const triggerLeft = pad.buttons[6]?.value ?? 0;
        const triggerRight = pad.buttons[7]?.value ?? 0;

        this.gamepadSprint =
            this.isGamepadButtonPressed(pad, 10) || this.isGamepadButtonPressed(pad, 4);
        this.gamepadJump = this.isGamepadButtonPressed(pad, 0);

        const switchPressed = this.isGamepadButtonPressed(pad, 2);
        if (switchPressed && !this.gamepadSwitchPressedLastFrame) {
            this.gamepadSwitchQueued = true;
        }
        this.gamepadSwitchPressedLastFrame = switchPressed;

        this.gamepadHammer = this.isGamepadButtonPressed(pad, 3);
        // Y also queues switch-to-nearest (game loop decides context: throw modifier vs switch)
        const nearestPressed = this.isGamepadButtonPressed(pad, 3);
        if (nearestPressed && !this.gamepadNearestPressedLastFrame) {
            this.gamepadNearestQueued = true;
        }
        this.gamepadNearestPressedLastFrame = nearestPressed;
        this.gamepadBlade = this.isGamepadButtonPressed(pad, 1);
        this.gamepadThumber = this.isGamepadButtonPressed(pad, 5);
        this.gamepadHighRelease = this.isGamepadButtonPressed(pad, 12);
        this.gamepadLowRelease = this.isGamepadButtonPressed(pad, 13);
        this.gamepadPause =
            this.isGamepadButtonPressed(pad, 9) && !this.isGamepadButtonPressed(pad, 8);
        this.gamepadTimeout = this.isGamepadButtonPressed(pad, 8);
        this.gamepadFoul = this.isGamepadButtonPressed(pad, 11);

        this.gamepadMouseButtons.left = triggerRight > 0.35;
        this.gamepadMouseButtons.right = triggerLeft > 0.35;

        const curveInput =
            (this.isGamepadButtonPressed(pad, 15) ? 1 : 0) -
            (this.isGamepadButtonPressed(pad, 14) ? 1 : 0);
        if (curveInput !== 0) {
            this.gamepadScrollDelta += curveInput * dt * 220;
        }

        const activeViewport: InputViewport =
            viewport ?? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };

        if (Math.abs(rightX) > 0.01 || Math.abs(rightY) > 0.01) {
            this.lastAimDevice = 'gamepad';
            const speedPxPerSec = 920;
            const x = this.mousePosition.x + rightX * speedPxPerSec * dt;
            const y = this.mousePosition.y + rightY * speedPxPerSec * dt;
            this.mousePosition.set(
                clamp(x, activeViewport.x, activeViewport.x + activeViewport.width),
                clamp(y, activeViewport.y, activeViewport.y + activeViewport.height),
            );
            return;
        }

        if (this.lastAimDevice === 'gamepad') {
            this.mousePosition.set(
                clamp(
                    this.mousePosition.x,
                    activeViewport.x,
                    activeViewport.x + activeViewport.width,
                ),
                clamp(
                    this.mousePosition.y,
                    activeViewport.y,
                    activeViewport.y + activeViewport.height,
                ),
            );
        }
    }

    triggerRumble(durationMs: number, strong = 0.6, weak = 0.3): void {
        if (this.gamepadOrder === null || typeof navigator.getGamepads !== 'function') return;
        const gamepads = Array.from(navigator.getGamepads()).filter(
            (p): p is Gamepad => p !== null,
        );
        gamepads.sort((a, b) => a.index - b.index);
        const pad = gamepads[this.gamepadOrder];
        if (!pad?.vibrationActuator) return;
        pad.vibrationActuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: durationMs,
            strongMagnitude: strong,
            weakMagnitude: weak,
        }).catch(() => { /* not supported */ });
    }

    private isGamepadButtonPressed(pad: Gamepad, index: number): boolean {
        const button = pad.buttons[index];
        if (!button) return false;
        return button.pressed || button.value > 0.5;
    }

    private createTouchControls(): void {
        const ui = document.getElementById('ui');
        if (!ui) return;

        const root = document.createElement('div');
        root.style.cssText =
            'position:absolute;inset:0;pointer-events:none;z-index:42;user-select:none;-webkit-user-select:none;';
        ui.appendChild(root);
        this.touchUiRoot = root;

        const leftDock = document.createElement('div');
        leftDock.style.cssText =
            'position:absolute;left:max(20px,env(safe-area-inset-left));bottom:max(20px,env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:16px;';
        root.appendChild(leftDock);

        const joystickBase = document.createElement('div');
        joystickBase.style.cssText =
            'width:128px;height:128px;border-radius:50%;pointer-events:auto;touch-action:none;' +
            'border:2px solid rgba(255,255,255,0.2);background:radial-gradient(circle at 30% 30%,rgba(130,220,255,0.15),rgba(7,18,34,0.7));' +
            'box-shadow:0 10px 30px rgba(0,0,0,0.5);position:relative;backdrop-filter:blur(4px);';
        leftDock.appendChild(joystickBase);

        const joystickLabel = document.createElement('div');
        joystickLabel.textContent = 'MOVE';
        joystickLabel.style.cssText =
            'position:absolute;left:50%;top:12px;transform:translateX(-50%);font-family:monospace;font-size:10px;font-weight:bold;letter-spacing:0.15em;color:rgba(255,255,255,0.5);';
        joystickBase.appendChild(joystickLabel);

        const joystickKnob = document.createElement('div');
        joystickKnob.style.cssText =
            'width:56px;height:56px;border-radius:50%;position:absolute;left:50%;top:50%;' +
            'transform:translate(-50%,-50%);background:linear-gradient(145deg,rgba(255,209,102,0.95),rgba(255,122,34,0.9));' +
            'border:1px solid rgba(255,255,255,0.6);box-shadow:0 6px 12px rgba(0,0,0,0.4),inset 0 2px 4px rgba(255,255,255,0.3);' +
            'transition:transform 0.05s linear;';
        joystickBase.appendChild(joystickKnob);
        this.joystickKnob = joystickKnob;

        const sprintButton = this.createTouchButton('SPRINT');
        sprintButton.style.width = '110px';
        sprintButton.style.height = '48px';
        leftDock.appendChild(sprintButton);

        const rightDock = document.createElement('div');
        rightDock.style.cssText =
            'position:absolute;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));' +
            'display:grid;grid-template-columns:repeat(2,minmax(0,84px));gap:12px;';
        root.appendChild(rightDock);

        const advancedPanel = document.createElement('div');
        advancedPanel.style.cssText =
            'position:absolute;right:max(20px,env(safe-area-inset-right));' +
            'bottom:calc(max(20px,env(safe-area-inset-bottom)) + 260px);' +
            'display:none;grid-template-columns:repeat(2,minmax(0,84px));gap:12px;pointer-events:auto;';
        root.appendChild(advancedPanel);

        const throwButton = this.createTouchButton('THROW');
        throwButton.style.cssText +=
            'grid-column:span 2;height:72px;font-size:16px;font-weight:bold;letter-spacing:0.12em;' +
            'background:linear-gradient(155deg,rgba(255,122,34,1.0),rgba(255,77,109,0.95));' +
            'box-shadow:0 8px 24px rgba(255,77,109,0.4);';
        rightDock.appendChild(throwButton);

        const forehandButton = this.createTouchButton('FOREHAND');
        rightDock.appendChild(forehandButton);

        const jumpButton = this.createTouchButton('JUMP');
        rightDock.appendChild(jumpButton);

        const switchButton = this.createTouchButton('SWITCH');
        rightDock.appendChild(switchButton);

        const pauseButton = this.createTouchButton('PAUSE');
        rightDock.appendChild(pauseButton);

        const toolsButton = this.createTouchButton('TOOLS');
        toolsButton.style.cssText += 'grid-column:span 2;font-size:12px;opacity:0.8;';
        rightDock.appendChild(toolsButton);

        const specButton = this.createTouchButton('SPEC OFF');
        advancedPanel.appendChild(specButton);

        const releaseButton = this.createTouchButton('RELEASE N');
        advancedPanel.appendChild(releaseButton);

        const hyzerMinusButton = this.createTouchButton('CURVE -');
        advancedPanel.appendChild(hyzerMinusButton);

        const hyzerPlusButton = this.createTouchButton('CURVE +');
        advancedPanel.appendChild(hyzerPlusButton);

        let advancedOpen = false;
        const syncToolsState = () => {
            advancedPanel.style.display = advancedOpen ? 'grid' : 'none';
            toolsButton.textContent = advancedOpen ? 'TOOLS ▲' : 'TOOLS ▼';
            toolsButton.style.borderColor = advancedOpen
                ? 'rgba(255,209,102,0.95)'
                : 'rgba(255,255,255,0.2)';
        };
        toolsButton.addEventListener('click', () => {
            advancedOpen = !advancedOpen;
            syncToolsState();
            // Pulse effect
            toolsButton.style.transform = 'scale(0.95)';
            setTimeout(() => toolsButton.style.transform = 'scale(1)', 100);
        });
        syncToolsState();

        const updateJoystickFromPointer = (
            clientX: number,
            clientY: number,
        ): void => {
            const rect = joystickBase.getBoundingClientRect();
            const centerX = rect.left + rect.width * 0.5;
            const centerY = rect.top + rect.height * 0.5;
            const dx = clientX - centerX;
            const dy = clientY - centerY;
            const dist = Math.hypot(dx, dy);
            const clamped = Math.min(this.joystickRadius, dist);
            const nx = dist > 0 ? dx / dist : 0;
            const ny = dist > 0 ? dy / dist : 0;

            const tx = nx * clamped;
            const ty = ny * clamped;

            // Apply small deadzone for stability
            const deadzone = 0.08;
            const normalizedDist = clamped / this.joystickRadius;
            const finalMag = normalizedDist < deadzone ? 0 : (normalizedDist - deadzone) / (1 - deadzone);

            this.touchMovement.set(nx * finalMag, -(ny * finalMag));
            joystickKnob.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
        };

        joystickBase.addEventListener('pointerdown', (e) => {
            if (this.joystickPointerId !== null) return;
            this.joystickPointerId = e.pointerId;
            joystickBase.setPointerCapture(e.pointerId);
            updateJoystickFromPointer(e.clientX, e.clientY);
            e.preventDefault();
        });
        joystickBase.addEventListener('pointermove', (e) => {
            if (e.pointerId !== this.joystickPointerId) return;
            updateJoystickFromPointer(e.clientX, e.clientY);
            e.preventDefault();
        });

        const releaseJoystickPointer = (e: PointerEvent) => {
            if (e.pointerId !== this.joystickPointerId) return;
            if (joystickBase.hasPointerCapture(e.pointerId)) {
                joystickBase.releasePointerCapture(e.pointerId);
            }
            this.joystickPointerId = null;
            this.touchMovement.set(0, 0);
            this.resetJoystickVisual();
            e.preventDefault();
        };
        joystickBase.addEventListener('pointerup', releaseJoystickPointer);
        joystickBase.addEventListener('pointercancel', releaseJoystickPointer);

        this.bindHoldButton(
            sprintButton,
            () => {
                this.touchSprint = true;
            },
            () => {
                this.touchSprint = false;
            },
        );

        this.bindHoldButton(
            jumpButton,
            () => {
                this.touchJump = true;
            },
            () => {
                this.touchJump = false;
            },
        );

        this.bindHoldButton(
            forehandButton,
            () => {
                this.touchMouseButtons.right = true;
                this.syncMouseButtons();
            },
            () => {
                this.touchMouseButtons.right = false;
                this.syncMouseButtons();
            },
        );

        this.bindHoldButton(
            throwButton,
            (e) => {
                this.touchMouseButtons.left = true;
                this.syncMouseButtons();
                this.mousePosition.set(e.clientX, e.clientY);
            },
            () => {
                this.touchMouseButtons.left = false;
                this.syncMouseButtons();
            },
            (e) => {
                this.mousePosition.set(e.clientX, e.clientY);
            },
        );

        switchButton.addEventListener('click', () => {
            this.touchSwitchQueued = true;
            switchButton.style.transform = 'scale(0.92)';
            setTimeout(() => switchButton.style.transform = 'scale(1)', 100);
        });

        const updateSpecialButton = () => {
            const label =
                this.touchSpecialThrow === 'none'
                    ? 'SPEC OFF'
                    : this.touchSpecialThrow.toUpperCase();
            specButton.textContent = label;
            specButton.style.borderColor =
                this.touchSpecialThrow === 'none'
                    ? 'rgba(255,255,255,0.2)'
                    : 'rgba(255,209,102,0.95)';
        };
        specButton.addEventListener('click', () => {
            if (this.touchSpecialThrow === 'none') {
                this.touchSpecialThrow = 'hammer';
            } else if (this.touchSpecialThrow === 'hammer') {
                this.touchSpecialThrow = 'blade';
            } else if (this.touchSpecialThrow === 'blade') {
                this.touchSpecialThrow = 'thumber';
            } else {
                this.touchSpecialThrow = 'none';
            }
            updateSpecialButton();
            specButton.style.transform = 'scale(0.92)';
            setTimeout(() => specButton.style.transform = 'scale(1)', 100);
        });
        updateSpecialButton();

        const updateReleaseButton = () => {
            const label =
                this.touchReleaseMode === 'normal'
                    ? 'RELEASE N'
                    : this.touchReleaseMode === 'high'
                    ? 'RELEASE H'
                    : 'RELEASE L';
            releaseButton.textContent = label;
            releaseButton.style.borderColor =
                this.touchReleaseMode === 'normal'
                    ? 'rgba(255,255,255,0.2)'
                    : 'rgba(143,220,255,0.95)';
        };
        releaseButton.addEventListener('click', () => {
            if (this.touchReleaseMode === 'normal') {
                this.touchReleaseMode = 'high';
            } else if (this.touchReleaseMode === 'high') {
                this.touchReleaseMode = 'low';
            } else {
                this.touchReleaseMode = 'normal';
            }
            updateReleaseButton();
            releaseButton.style.transform = 'scale(0.92)';
            setTimeout(() => releaseButton.style.transform = 'scale(1)', 100);
        });
        updateReleaseButton();

        this.bindHyzerButton(hyzerMinusButton, -80, false);
        this.bindHyzerButton(hyzerPlusButton, 80, true);

        pauseButton.addEventListener('click', () => {
            this.touchPauseQueued = true;
            pauseButton.style.transform = 'scale(0.92)';
            setTimeout(() => pauseButton.style.transform = 'scale(1)', 100);
        });
    }

    private createTouchButton(label: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.style.cssText =
            'pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;' +
            'min-height:48px;padding:8px 10px;border-radius:14px;' +
            'border:1.5px solid rgba(255,255,255,0.2);' +
            'background:linear-gradient(150deg,rgba(15,30,50,0.85),rgba(5,15,30,0.95));' +
            'backdrop-filter:blur(6px);' +
            'box-shadow:0 6px 16px rgba(0,0,0,0.4),inset 0 1px 1px rgba(255,255,255,0.1);' +
            'color:rgba(255,255,255,0.95);' +
            'font-family:monospace;font-size:12px;font-weight:bold;letter-spacing:0.05em;text-transform:uppercase;' +
            'display:flex;align-items:center;justify-content:center;transition:transform 0.1s, border-color 0.1s;';
        return button;
    }

    private bindHoldButton(
        button: HTMLButtonElement,
        onPress: (e: PointerEvent) => void,
        onRelease: () => void,
        onMove?: (e: PointerEvent) => void,
    ): void {
        let pointerId: number | null = null;

        const setActive = (active: boolean) => {
            button.style.transform = active ? 'scale(0.96)' : 'scale(1)';
            button.style.borderColor = active
                ? 'rgba(255,209,102,0.95)'
                : 'rgba(255,255,255,0.3)';
        };

        button.addEventListener('pointerdown', (e) => {
            if (pointerId !== null) return;
            pointerId = e.pointerId;
            button.setPointerCapture(e.pointerId);
            setActive(true);
            onPress(e);
            e.preventDefault();
        });

        button.addEventListener('pointermove', (e) => {
            if (e.pointerId !== pointerId || !onMove) return;
            onMove(e);
            e.preventDefault();
        });

        const release = (e: PointerEvent) => {
            if (e.pointerId !== pointerId) return;
            if (button.hasPointerCapture(e.pointerId)) {
                button.releasePointerCapture(e.pointerId);
            }
            pointerId = null;
            setActive(false);
            onRelease();
            e.preventDefault();
        };

        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
    }

    private bindHyzerButton(
        button: HTMLButtonElement,
        amount: number,
        increase: boolean,
    ): void {
        const setActive = (active: boolean) => {
            button.style.transform = active ? 'scale(0.96)' : 'scale(1)';
            button.style.borderColor = active
                ? 'rgba(143,220,255,0.95)'
                : 'rgba(255,255,255,0.3)';
        };

        button.addEventListener('pointerdown', (e) => {
            if (increase && this.hyzerIncreaseInterval !== null) return;
            if (!increase && this.hyzerDecreaseInterval !== null) return;

            setActive(true);
            this.touchScrollDelta += amount;
            const intervalId = window.setInterval(() => {
                this.touchScrollDelta += amount;
            }, 90);

            if (increase) {
                this.hyzerIncreaseInterval = intervalId;
            } else {
                this.hyzerDecreaseInterval = intervalId;
            }
            e.preventDefault();
        });

        const release = (e: PointerEvent) => {
            setActive(false);
            if (increase && this.hyzerIncreaseInterval !== null) {
                window.clearInterval(this.hyzerIncreaseInterval);
                this.hyzerIncreaseInterval = null;
            }
            if (!increase && this.hyzerDecreaseInterval !== null) {
                window.clearInterval(this.hyzerDecreaseInterval);
                this.hyzerDecreaseInterval = null;
            }
            e.preventDefault();
        };

        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('pointerleave', release);
    }

    private clearHyzerIntervals(): void {
        if (this.hyzerIncreaseInterval !== null) {
            window.clearInterval(this.hyzerIncreaseInterval);
            this.hyzerIncreaseInterval = null;
        }
        if (this.hyzerDecreaseInterval !== null) {
            window.clearInterval(this.hyzerDecreaseInterval);
            this.hyzerDecreaseInterval = null;
        }
    }

    private resetJoystickVisual(): void {
        if (!this.joystickKnob) return;
        this.joystickKnob.style.transform = 'translate(-50%,-50%)';
    }
}

function applyDeadzone(value: number, deadzone: number): number {
    const abs = Math.abs(value);
    if (abs <= deadzone) return 0;
    const scaled = (abs - deadzone) / (1 - deadzone);
    return Math.sign(value) * Math.min(1, scaled);
}

/** Slight exponential curve for analog stick — more precision near center, full range preserved. */
function applyResponseCurve(value: number): number {
    const abs = Math.abs(value);
    return Math.sign(value) * abs * abs * (2 - abs);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
