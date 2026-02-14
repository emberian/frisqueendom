import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Public interface -- mirrors the shape the game loop already reads from
// keyboard/mouse so callers can query touch state identically.
// ---------------------------------------------------------------------------

export interface TouchInputState {
    // Movement (from virtual joystick)
    moveX: number;   // -1 to 1
    moveZ: number;   // -1 to 1
    sprint: boolean;

    // Throw state
    isCharging: boolean;
    throwDirection: THREE.Vector2;  // normalised aim direction
    throwPower: number;             // 0-1 from hold duration
    isForehand: boolean;
    hyzerAdjust: number;            // -1 to 1

    // Actions
    jump: boolean;
    switchPlayer: boolean;
    fake: boolean;
    quickPass: boolean;
    layout: boolean;

    // Mouse-compatible position (for raycasting)
    mousePosition: { x: number; y: number };
    mouseButtons: { left: boolean; right: boolean };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

function applyDeadzone(value: number, deadzone: number): number {
    const abs = Math.abs(value);
    if (abs <= deadzone) return 0;
    return Math.sign(value) * ((abs - deadzone) / (1 - deadzone));
}

function vibrate(ms: number): void {
    try {
        navigator.vibrate?.(ms);
    } catch (_) {
        // Haptics unavailable -- ignore silently.
    }
}

// ---------------------------------------------------------------------------
// TouchControls
// ---------------------------------------------------------------------------

export class TouchControls {
    // --- DOM references ---
    private container: HTMLElement;
    private root: HTMLDivElement;
    private joystickElement: HTMLDivElement;
    private joystickKnob: HTMLDivElement;
    private throwPadElement: HTMLDivElement;
    private throwPadKnob: HTMLDivElement;
    private actionBar: HTMLDivElement;

    // --- State ---
    private state: TouchInputState;
    private active = false;
    private destroyed = false;

    // --- Joystick tracking ---
    private joystickTouchId: number | null = null;
    private readonly joystickRadius = 60; // outer ring radius
    private readonly knobRadius = 25;

    // --- Throw pad tracking ---
    private throwTouchId: number | null = null;
    private throwStartTime = 0;
    private throwCenterX = 0;
    private throwCenterY = 0;
    private readonly throwPadRadius = 70;
    private prevAngle: number | null = null;
    private cumulativeAngleDelta = 0;

    // --- Multi-touch forehand detection ---
    private secondFingerActive = false;

    // --- Gesture tracking ---
    private pinchStartDist: number | null = null;
    private pinchPrevDist: number | null = null;
    private zoomDelta = 0;
    private rotateDelta = { x: 0, y: 0 };
    private rotatePrevCenter: { x: number; y: number } | null = null;
    private doubleTapFired = false;
    private lastTapTime = 0;
    private lastTapX = 0;
    private lastTapY = 0;
    private swipeFromEdgeFired = false;
    private edgeTouchStartX: number | null = null;
    private edgeTouchStartY: number | null = null;

    // --- One-frame impulse flags ---
    private switchQueued = false;
    private fakeQueued = false;
    private quickPassQueued = false;
    private layoutQueued = false;
    private jumpActive = false;

    // --- Inactivity auto-hide ---
    private lastInteractionTime = 0;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly hideDelay = 3000;

    // --- Bound handlers (for removal) ---
    private readonly boundTouchStart: (e: TouchEvent) => void;
    private readonly boundTouchMove: (e: TouchEvent) => void;
    private readonly boundTouchEnd: (e: TouchEvent) => void;
    private readonly boundTouchCancel: (e: TouchEvent) => void;

    // --- Action button references (for showing FAKE during charge) ---
    private fakeButton: HTMLButtonElement | null = null;

    constructor(container: HTMLElement) {
        this.container = container;

        this.state = TouchControls.defaultState();

        // Build the DOM
        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;inset:0;pointer-events:none;z-index:42;' +
            'user-select:none;-webkit-user-select:none;touch-action:none;';

        this.joystickElement = this.createJoystick();
        this.joystickKnob = this.joystickElement.querySelector('[data-knob]') as HTMLDivElement;
        this.root.appendChild(this.joystickElement);

        const throwResult = this.createThrowPad();
        this.throwPadElement = throwResult.pad;
        this.throwPadKnob = throwResult.knob;
        this.root.appendChild(this.throwPadElement);

        this.actionBar = this.createActionBar();
        this.root.appendChild(this.actionBar);

        container.appendChild(this.root);

        // Bind global touch handlers at the root level
        this.boundTouchStart = this.handleTouchStart.bind(this);
        this.boundTouchMove = this.handleTouchMove.bind(this);
        this.boundTouchEnd = this.handleTouchEnd.bind(this);
        this.boundTouchCancel = this.handleTouchEnd.bind(this);

        this.root.style.pointerEvents = 'auto';
        this.root.addEventListener('touchstart', this.boundTouchStart, { passive: false });
        this.root.addEventListener('touchmove', this.boundTouchMove, { passive: false });
        this.root.addEventListener('touchend', this.boundTouchEnd, { passive: false });
        this.root.addEventListener('touchcancel', this.boundTouchCancel, { passive: false });

        this.lastInteractionTime = performance.now();
        this.scheduleAutoHide();

        this.active = true;
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /** Returns a snapshot of the current touch input state. */
    getState(): TouchInputState {
        // Copy the current state and consume one-frame impulses
        const out: TouchInputState = {
            moveX: this.state.moveX,
            moveZ: this.state.moveZ,
            sprint: this.state.sprint,
            isCharging: this.state.isCharging,
            throwDirection: this.state.throwDirection.clone(),
            throwPower: this.state.throwPower,
            isForehand: this.state.isForehand,
            hyzerAdjust: this.state.hyzerAdjust,
            jump: this.jumpActive,
            switchPlayer: this.switchQueued,
            fake: this.fakeQueued,
            quickPass: this.quickPassQueued,
            layout: this.layoutQueued,
            mousePosition: { ...this.state.mousePosition },
            mouseButtons: { ...this.state.mouseButtons },
        };

        // Consume one-frame impulses
        this.switchQueued = false;
        this.fakeQueued = false;
        this.quickPassQueued = false;
        this.layoutQueued = false;

        return out;
    }

    /** Returns accumulated zoom delta from pinch gestures and resets it. */
    getZoomDelta(): number {
        const d = this.zoomDelta;
        this.zoomDelta = 0;
        return d;
    }

    /** Returns accumulated two-finger rotation delta and resets it. */
    getRotateDelta(): { x: number; y: number } {
        const d = { ...this.rotateDelta };
        this.rotateDelta.x = 0;
        this.rotateDelta.y = 0;
        return d;
    }

    /** Whether a double-tap on the field occurred (consume on read). */
    didDoubleTap(): boolean {
        const v = this.doubleTapFired;
        this.doubleTapFired = false;
        return v;
    }

    /** Whether user swiped from a screen edge (consume on read). */
    didSwipeFromEdge(): boolean {
        const v = this.swipeFromEdgeFired;
        this.swipeFromEdgeFired = false;
        return v;
    }

    show(): void {
        this.root.style.display = '';
        this.active = true;
        this.lastInteractionTime = performance.now();
        this.scheduleAutoHide();
    }

    hide(): void {
        this.root.style.display = 'none';
        this.active = false;
        this.releaseAllTouches();
    }

    static isTouchDevice(): boolean {
        if ('ontouchstart' in window) return true;
        if (navigator.maxTouchPoints > 0) return true;
        // Check coarse pointer media query
        if (typeof window.matchMedia === 'function' &&
            window.matchMedia('(pointer: coarse)').matches) return true;
        // Mobile user agent heuristic
        if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i
            .test(navigator.userAgent)) return true;
        return false;
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.active = false;

        this.root.removeEventListener('touchstart', this.boundTouchStart);
        this.root.removeEventListener('touchmove', this.boundTouchMove);
        this.root.removeEventListener('touchend', this.boundTouchEnd);
        this.root.removeEventListener('touchcancel', this.boundTouchCancel);

        if (this.hideTimer !== null) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }

        this.root.remove();
    }

    // ------------------------------------------------------------------
    // DOM construction
    // ------------------------------------------------------------------

    private createJoystick(): HTMLDivElement {
        const outer = document.createElement('div');
        outer.dataset.role = 'joystick';
        outer.style.cssText =
            'position:absolute;bottom:40px;left:40px;width:120px;height:120px;' +
            'border-radius:50%;pointer-events:auto;touch-action:none;' +
            'background:rgba(255,255,255,0.15);' +
            'border:2px solid rgba(255,255,255,0.25);' +
            'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
            'box-shadow:0 6px 20px rgba(0,0,0,0.35);' +
            'transition:opacity 0.25s;';

        const knob = document.createElement('div');
        knob.dataset.knob = '';
        knob.style.cssText =
            'position:absolute;width:50px;height:50px;border-radius:50%;' +
            'left:50%;top:50%;transform:translate(-50%,-50%);' +
            'background:rgba(255,255,255,0.4);' +
            'border:1.5px solid rgba(255,255,255,0.6);' +
            'box-shadow:0 4px 10px rgba(0,0,0,0.3),inset 0 1px 3px rgba(255,255,255,0.25);' +
            'transition:transform 0.06s ease-out;';
        outer.appendChild(knob);

        return outer;
    }

    private createThrowPad(): { pad: HTMLDivElement; knob: HTMLDivElement } {
        const pad = document.createElement('div');
        pad.dataset.role = 'throwpad';
        pad.style.cssText =
            'position:absolute;bottom:40px;right:40px;width:140px;height:140px;' +
            'border-radius:50%;pointer-events:auto;touch-action:none;' +
            'background:rgba(255,255,255,0.12);' +
            'border:2px solid rgba(255,255,255,0.25);' +
            'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
            'box-shadow:0 6px 20px rgba(0,0,0,0.35);' +
            'transition:opacity 0.25s,background 0.2s;';

        const label = document.createElement('div');
        label.textContent = 'AIM & THROW';
        label.style.cssText =
            'position:absolute;left:50%;top:14px;transform:translateX(-50%);' +
            'font-family:monospace;font-size:9px;font-weight:bold;' +
            'letter-spacing:0.12em;color:rgba(255,255,255,0.45);' +
            'white-space:nowrap;pointer-events:none;';
        pad.appendChild(label);

        const knob = document.createElement('div');
        knob.dataset.throwknob = '';
        knob.style.cssText =
            'position:absolute;width:44px;height:44px;border-radius:50%;' +
            'left:50%;top:50%;transform:translate(-50%,-50%);' +
            'background:linear-gradient(145deg,rgba(255,140,50,0.9),rgba(255,70,100,0.85));' +
            'border:1.5px solid rgba(255,255,255,0.5);' +
            'box-shadow:0 4px 12px rgba(255,77,109,0.35);' +
            'transition:transform 0.06s ease-out;' +
            'pointer-events:none;';
        pad.appendChild(knob);

        return { pad, knob };
    }

    private createActionBar(): HTMLDivElement {
        const bar = document.createElement('div');
        bar.dataset.role = 'actionbar';
        bar.style.cssText =
            'position:absolute;bottom:40px;left:50%;transform:translateX(-50%);' +
            'display:flex;flex-direction:row;gap:8px;align-items:flex-end;' +
            'pointer-events:auto;touch-action:none;';

        const makeBtn = (text: string, role: string): HTMLButtonElement => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = text;
            btn.dataset.action = role;
            btn.style.cssText =
                'width:50px;height:50px;border-radius:14px;' +
                'border:1.5px solid rgba(255,255,255,0.2);' +
                'background:linear-gradient(150deg,rgba(15,30,50,0.85),rgba(5,15,30,0.95));' +
                'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
                'box-shadow:0 4px 12px rgba(0,0,0,0.35),inset 0 1px 1px rgba(255,255,255,0.08);' +
                'color:rgba(255,255,255,0.9);font-family:monospace;font-size:9px;' +
                'font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;' +
                'pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;' +
                'display:flex;align-items:center;justify-content:center;' +
                'transition:transform 0.1s ease,border-color 0.15s ease;';
            return btn;
        };

        const switchBtn = makeBtn('SWITCH', 'switch');
        switchBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.switchQueued = true;
            this.animateButtonPress(switchBtn);
            vibrate(10);
            this.markInteraction();
        });
        bar.appendChild(switchBtn);

        const layoutBtn = makeBtn('LAYOUT', 'layout');
        layoutBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.layoutQueued = true;
            this.animateButtonPress(layoutBtn);
            vibrate(10);
            this.markInteraction();
        });
        bar.appendChild(layoutBtn);

        const jumpBtn = makeBtn('JUMP', 'jump');
        let jumpTouchId: number | null = null;
        jumpBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (jumpTouchId !== null) return;
            const t = e.changedTouches[0];
            if (!t) return;
            jumpTouchId = t.identifier;
            this.jumpActive = true;
            jumpBtn.style.transform = 'scale(0.92)';
            jumpBtn.style.borderColor = 'rgba(255,209,102,0.9)';
            vibrate(10);
            this.markInteraction();
        });
        const releaseJump = (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === jumpTouchId) {
                    jumpTouchId = null;
                    this.jumpActive = false;
                    jumpBtn.style.transform = 'scale(1)';
                    jumpBtn.style.borderColor = 'rgba(255,255,255,0.2)';
                    break;
                }
            }
        };
        jumpBtn.addEventListener('touchend', releaseJump);
        jumpBtn.addEventListener('touchcancel', releaseJump);
        bar.appendChild(jumpBtn);

        const fakeBtn = makeBtn('FAKE', 'fake');
        fakeBtn.style.display = 'none'; // hidden until charging
        fakeBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.fakeQueued = true;
            this.animateButtonPress(fakeBtn);
            vibrate(10);
            this.markInteraction();
        });
        bar.appendChild(fakeBtn);
        this.fakeButton = fakeBtn;

        return bar;
    }

    private animateButtonPress(btn: HTMLButtonElement): void {
        btn.style.transform = 'scale(0.88)';
        btn.style.borderColor = 'rgba(255,209,102,0.9)';
        setTimeout(() => {
            btn.style.transform = 'scale(1)';
            btn.style.borderColor = 'rgba(255,255,255,0.2)';
        }, 120);
    }

    // ------------------------------------------------------------------
    // Touch event routing
    // ------------------------------------------------------------------

    private handleTouchStart(e: TouchEvent): void {
        e.preventDefault();
        this.markInteraction();
        this.showControls();

        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const target = document.elementFromPoint(t.clientX, t.clientY);

            // Check if touch is on a button in the action bar
            if (target instanceof HTMLButtonElement && target.dataset.action) {
                // Let the button's own handler fire -- do not claim the touch
                continue;
            }

            if (this.isInsideElement(t, this.joystickElement) &&
                this.joystickTouchId === null) {
                this.joystickTouchId = t.identifier;
                this.updateJoystick(t);
                continue;
            }

            if (this.isInsideElement(t, this.throwPadElement)) {
                if (this.throwTouchId === null) {
                    this.throwTouchId = t.identifier;
                    this.throwStartTime = performance.now();
                    const rect = this.throwPadElement.getBoundingClientRect();
                    this.throwCenterX = rect.left + rect.width * 0.5;
                    this.throwCenterY = rect.top + rect.height * 0.5;
                    this.prevAngle = null;
                    this.cumulativeAngleDelta = 0;
                    this.state.isCharging = true;
                    this.state.mouseButtons.left = true;
                    this.updateThrowPad(t);
                    this.showFakeButton(true);
                    vibrate(10);

                    // Set initial mouse position for raycaster aim
                    this.state.mousePosition.x = t.clientX;
                    this.state.mousePosition.y = t.clientY;
                } else {
                    // Second finger on throw pad area -> forehand
                    this.secondFingerActive = true;
                    this.state.isForehand = true;
                    this.state.mouseButtons.right = true;
                    vibrate(10);
                }
                continue;
            }

            // Touch on empty area -- check for edge swipe or double-tap
            this.handleEmptyAreaTouchStart(t);
        }
    }

    private handleTouchMove(e: TouchEvent): void {
        e.preventDefault();

        // Check for two-finger gestures on empty area
        this.updateTwoFingerGestures(e);

        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];

            if (t.identifier === this.joystickTouchId) {
                this.updateJoystick(t);
                continue;
            }

            if (t.identifier === this.throwTouchId) {
                this.updateThrowPad(t);
                continue;
            }
        }
    }

    private handleTouchEnd(e: TouchEvent): void {
        e.preventDefault();

        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];

            if (t.identifier === this.joystickTouchId) {
                this.joystickTouchId = null;
                this.resetJoystick();
                continue;
            }

            if (t.identifier === this.throwTouchId) {
                this.throwTouchId = null;
                this.releaseThrow();
                continue;
            }

            // Second finger release (forehand modifier)
            if (this.secondFingerActive) {
                // Check if any remaining touches are the second finger
                let foundSecond = false;
                for (let j = 0; j < e.touches.length; j++) {
                    const remaining = e.touches[j];
                    if (remaining.identifier !== this.joystickTouchId &&
                        remaining.identifier !== this.throwTouchId) {
                        foundSecond = true;
                        break;
                    }
                }
                if (!foundSecond) {
                    this.secondFingerActive = false;
                    this.state.isForehand = false;
                    this.state.mouseButtons.right = false;
                }
            }

            // Edge swipe detection on end
            this.handleEdgeSwipeEnd(t);
        }

        // Reset pinch state when fewer than 2 fingers remain on empty area
        this.checkGestureReset(e);
    }

    // ------------------------------------------------------------------
    // Joystick logic
    // ------------------------------------------------------------------

    private updateJoystick(touch: Touch): void {
        const rect = this.joystickElement.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        const dx = touch.clientX - cx;
        const dy = touch.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const maxDist = this.joystickRadius;
        const clamped = Math.min(maxDist, dist);
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 0;

        // Visual knob position
        const kx = nx * clamped;
        const ky = ny * clamped;
        this.joystickKnob.style.transform =
            `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

        // Apply deadzone
        const norm = clamped / maxDist;
        const effective = applyDeadzone(norm, 0.08);

        this.state.moveX = nx * effective;
        this.state.moveZ = -(ny * effective); // screen Y is inverted for world Z
        this.state.sprint = norm > 0.7;
    }

    private resetJoystick(): void {
        this.state.moveX = 0;
        this.state.moveZ = 0;
        this.state.sprint = false;
        this.joystickKnob.style.transform = 'translate(-50%,-50%)';
    }

    // ------------------------------------------------------------------
    // Throw pad logic -- full parity with mouse hold+aim
    // ------------------------------------------------------------------

    private updateThrowPad(touch: Touch): void {
        const dx = touch.clientX - this.throwCenterX;
        const dy = touch.clientY - this.throwCenterY;
        const dist = Math.hypot(dx, dy);
        const maxDist = this.throwPadRadius;
        const clamped = Math.min(maxDist, dist);

        // Aim direction from center of pad
        if (dist > 4) { // Small dead zone to prevent jitter
            this.state.throwDirection.set(dx / dist, dy / dist);
        }

        // Visual knob movement
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 0;
        const kx = nx * clamped;
        const ky = ny * clamped;
        this.throwPadKnob.style.transform =
            `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

        // Power from hold duration -- same exponential curve as mouse hold:
        //   power = 1 - e^(-t/tau) where tau ~ 0.7s gives ~75% at 1s, ~95% at 2s
        const elapsed = (performance.now() - this.throwStartTime) / 1000;
        const tau = 0.7;
        this.state.throwPower = clamp(1 - Math.exp(-elapsed / tau), 0, 1);

        // Drag distance can further modulate power (reduce if pulled back toward center)
        const distFactor = clamp(clamped / maxDist, 0.3, 1);
        this.state.throwPower *= distFactor;

        // Circular drag -> hyzer adjust
        if (dist > maxDist * 0.4) {
            const angle = Math.atan2(dy, dx);
            if (this.prevAngle !== null) {
                let delta = angle - this.prevAngle;
                // Normalize to [-PI, PI]
                if (delta > Math.PI) delta -= 2 * Math.PI;
                if (delta < -Math.PI) delta += 2 * Math.PI;
                this.cumulativeAngleDelta += delta;
            }
            this.prevAngle = angle;
            // Map cumulative angle to hyzer range
            // ~PI radians of circular motion -> full hyzer range
            this.state.hyzerAdjust = clamp(this.cumulativeAngleDelta / Math.PI, -1, 1);
        }

        // Convert throw pad position to viewport coordinates for raycaster aiming.
        // Map the pad's drag direction into a screen-space offset from center
        // of the viewport so the existing raycaster-based aiming works.
        const screenCx = window.innerWidth * 0.5;
        const screenCy = window.innerHeight * 0.5;
        const aimScale = Math.min(window.innerWidth, window.innerHeight) * 0.35;
        this.state.mousePosition.x = screenCx + this.state.throwDirection.x * aimScale;
        this.state.mousePosition.y = screenCy + this.state.throwDirection.y * aimScale;

        // Visual feedback: tint pad background when charging
        const powerPct = Math.round(this.state.throwPower * 100);
        const r = Math.round(255 * this.state.throwPower);
        const g = Math.round(100 * (1 - this.state.throwPower));
        this.throwPadElement.style.background =
            `rgba(${r},${g},50,${0.12 + 0.2 * this.state.throwPower})`;
        this.throwPadElement.style.borderColor =
            `rgba(255,${200 - powerPct},${100 - powerPct * 0.8},${0.3 + 0.4 * this.state.throwPower})`;
    }

    private releaseThrow(): void {
        this.state.isCharging = false;
        this.state.throwPower = 0;
        this.state.mouseButtons.left = false;
        this.state.hyzerAdjust = 0;
        this.prevAngle = null;
        this.cumulativeAngleDelta = 0;
        this.secondFingerActive = false;
        this.state.isForehand = false;
        this.state.mouseButtons.right = false;

        // Reset throw pad visuals
        this.throwPadKnob.style.transform = 'translate(-50%,-50%)';
        this.throwPadElement.style.background = 'rgba(255,255,255,0.12)';
        this.throwPadElement.style.borderColor = 'rgba(255,255,255,0.25)';

        this.showFakeButton(false);
    }

    private showFakeButton(visible: boolean): void {
        if (this.fakeButton) {
            this.fakeButton.style.display = visible ? 'flex' : 'none';
        }
    }

    // ------------------------------------------------------------------
    // Gestures (pinch zoom, two-finger rotate, double-tap, edge swipe)
    // ------------------------------------------------------------------

    private handleEmptyAreaTouchStart(touch: Touch): void {
        // Edge swipe detection
        const edgeThreshold = 20;
        if (touch.clientX < edgeThreshold ||
            touch.clientX > window.innerWidth - edgeThreshold ||
            touch.clientY < edgeThreshold) {
            this.edgeTouchStartX = touch.clientX;
            this.edgeTouchStartY = touch.clientY;
        }

        // Double-tap detection
        const now = performance.now();
        const dt = now - this.lastTapTime;
        const dx = touch.clientX - this.lastTapX;
        const dy = touch.clientY - this.lastTapY;
        if (dt < 350 && Math.hypot(dx, dy) < 40) {
            this.doubleTapFired = true;
            vibrate(15);
        }
        this.lastTapTime = now;
        this.lastTapX = touch.clientX;
        this.lastTapY = touch.clientY;
    }

    private updateTwoFingerGestures(e: TouchEvent): void {
        // We need exactly 2 active touches that are NOT joystick or throwpad
        const freeTouches: Touch[] = [];
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            if (t.identifier !== this.joystickTouchId &&
                t.identifier !== this.throwTouchId) {
                freeTouches.push(t);
            }
        }
        if (freeTouches.length < 2) {
            this.pinchStartDist = null;
            this.pinchPrevDist = null;
            this.rotatePrevCenter = null;
            return;
        }

        const t1 = freeTouches[0];
        const t2 = freeTouches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const cx = (t1.clientX + t2.clientX) * 0.5;
        const cy = (t1.clientY + t2.clientY) * 0.5;

        // Pinch zoom
        if (this.pinchPrevDist !== null) {
            const delta = dist - this.pinchPrevDist;
            this.zoomDelta += delta; // positive = fingers apart = zoom in
        }
        this.pinchPrevDist = dist;

        // Two-finger drag -> rotation
        if (this.rotatePrevCenter !== null) {
            this.rotateDelta.x += cx - this.rotatePrevCenter.x;
            this.rotateDelta.y += cy - this.rotatePrevCenter.y;
        }
        this.rotatePrevCenter = { x: cx, y: cy };
    }

    private handleEdgeSwipeEnd(touch: Touch): void {
        if (this.edgeTouchStartX === null || this.edgeTouchStartY === null) return;
        const dx = touch.clientX - this.edgeTouchStartX;
        const dy = touch.clientY - this.edgeTouchStartY;
        const dist = Math.hypot(dx, dy);
        if (dist > 60) {
            this.swipeFromEdgeFired = true;
            vibrate(15);
        }
        this.edgeTouchStartX = null;
        this.edgeTouchStartY = null;
    }

    private checkGestureReset(e: TouchEvent): void {
        let freeCount = 0;
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            if (t.identifier !== this.joystickTouchId &&
                t.identifier !== this.throwTouchId) {
                freeCount++;
            }
        }
        if (freeCount < 2) {
            this.pinchStartDist = null;
            this.pinchPrevDist = null;
            this.rotatePrevCenter = null;
        }
    }

    // ------------------------------------------------------------------
    // Utility
    // ------------------------------------------------------------------

    private isInsideElement(touch: Touch, el: HTMLElement): boolean {
        const rect = el.getBoundingClientRect();
        return (
            touch.clientX >= rect.left &&
            touch.clientX <= rect.right &&
            touch.clientY >= rect.top &&
            touch.clientY <= rect.bottom
        );
    }

    private releaseAllTouches(): void {
        if (this.joystickTouchId !== null) {
            this.joystickTouchId = null;
            this.resetJoystick();
        }
        if (this.throwTouchId !== null) {
            this.throwTouchId = null;
            this.releaseThrow();
        }
        this.jumpActive = false;
        this.secondFingerActive = false;
        this.state.isForehand = false;
        this.state.mouseButtons.left = false;
        this.state.mouseButtons.right = false;
        this.pinchStartDist = null;
        this.pinchPrevDist = null;
        this.rotatePrevCenter = null;
    }

    private markInteraction(): void {
        this.lastInteractionTime = performance.now();
        this.showControls();
        this.scheduleAutoHide();
    }

    private showControls(): void {
        this.joystickElement.style.opacity = '1';
        this.throwPadElement.style.opacity = '1';
        this.actionBar.style.opacity = '1';
    }

    private hideControlsGently(): void {
        this.joystickElement.style.opacity = '0.3';
        this.throwPadElement.style.opacity = '0.3';
        this.actionBar.style.opacity = '0.3';
    }

    private scheduleAutoHide(): void {
        if (this.hideTimer !== null) {
            clearTimeout(this.hideTimer);
        }
        this.hideTimer = setTimeout(() => {
            // Only fade if nothing is actively being touched
            if (this.joystickTouchId === null && this.throwTouchId === null) {
                this.hideControlsGently();
            } else {
                // Re-schedule if still touching
                this.scheduleAutoHide();
            }
        }, this.hideDelay);
    }

    private static defaultState(): TouchInputState {
        return {
            moveX: 0,
            moveZ: 0,
            sprint: false,
            isCharging: false,
            throwDirection: new THREE.Vector2(0, -1),
            throwPower: 0,
            isForehand: false,
            hyzerAdjust: 0,
            jump: false,
            switchPlayer: false,
            fake: false,
            quickPass: false,
            layout: false,
            mousePosition: { x: 0, y: 0 },
            mouseButtons: { left: false, right: false },
        };
    }
}
