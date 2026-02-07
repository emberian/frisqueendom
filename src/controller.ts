import type {
    ControllerInputEnvelope,
    ControllerJoinMessage,
    RTCAnswerMessage,
    RTCIceCandidateMessage,
    RTCOfferMessage,
    RelayInboundMessage,
    RemoteControllerState,
} from './network/protocol';

const relayInput = document.getElementById('relay-url') as HTMLInputElement;
const roomInput = document.getElementById('room') as HTMLInputElement;
const connectButton = document.getElementById('connect') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const movePad = document.getElementById('move-pad') as HTMLDivElement;
const moveKnob = document.getElementById('move-knob') as HTMLDivElement;
const aimPad = document.getElementById('aim-pad') as HTMLDivElement;
const aimReticle = document.getElementById('aim-reticle') as HTMLDivElement;

const STORAGE_RELAY = 'fqd_controller_relay';
const STORAGE_ROOM = 'fqd_controller_room';

type HoldAction =
    | 'throw'
    | 'forehand'
    | 'sprint'
    | 'jump'
    | 'hammer'
    | 'blade'
    | 'thumber'
    | 'high'
    | 'low'
    | 'curveLeft'
    | 'curveRight';

const holdState: Record<HoldAction, boolean> = {
    throw: false,
    forehand: false,
    sprint: false,
    jump: false,
    hammer: false,
    blade: false,
    thumber: false,
    high: false,
    low: false,
    curveLeft: false,
    curveRight: false,
};

const keyboard = new Set<string>();

let socket: WebSocket | null = null;
let peerConnection: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;
let useDataChannel = false;

const STUN_SERVERS: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};
let moveXTouch = 0;
let moveZTouch = 0;
let aimX = 0.5;
let aimY = 0.55;
let switchQueued = false;
let curveAccumulator = 0;
let gamepadSwitchPrev = false;
let gamepadMoveX = 0;
let gamepadMoveZ = 0;
let gamepadThrow = false;
let gamepadForehand = false;
let gamepadSprint = false;
let gamepadJump = false;
let gamepadHammer = false;
let gamepadBlade = false;
let gamepadThumber = false;
let gamepadHigh = false;
let gamepadLow = false;
let gamepadTimeout = false;
let gamepadFoul = false;
let gamepadPause = false;

const params = new URLSearchParams(window.location.search);
const defaultRelay = (() => {
    const fromQuery = params.get('relay');
    if (fromQuery) return fromQuery;
    const fromStorage = localStorage.getItem(STORAGE_RELAY);
    if (fromStorage) return fromStorage;
    if (window.location.protocol === 'https:') {
        return `wss://${window.location.host}/ws`;
    }
    return `ws://${window.location.host}/ws`;
})();
const defaultRoom =
    params.get('room') ||
    localStorage.getItem(STORAGE_ROOM) ||
    'fqd-room-1';

relayInput.value = defaultRelay;
roomInput.value = defaultRoom;
renderAimReticle();
setStatus('Disconnected.');

connectButton.addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        disconnect('Disconnected.');
        return;
    }
    connect();
});

window.addEventListener('keydown', (event) => {
    keyboard.add(event.code);
    if (event.code === 'KeyE') {
        switchQueued = true;
    }
});
window.addEventListener('keyup', (event) => {
    keyboard.delete(event.code);
});

window.addEventListener(
    'wheel',
    (event) => {
        curveAccumulator += event.deltaY > 0 ? -12 : 12;
    },
    { passive: true },
);

document.querySelectorAll<HTMLButtonElement>('.buttons button').forEach((button) => {
    const action = button.dataset.action;
    if (!action) return;
    if (button.dataset.hold === 'true') {
        bindHoldButton(button, action as HoldAction);
        return;
    }
    if (button.dataset.tap === 'true') {
        button.addEventListener('click', () => {
            if (action === 'switch') {
                switchQueued = true;
            }
            button.classList.add('active');
            window.setTimeout(() => button.classList.remove('active'), 120);
        });
    }
});

bindMovePad();
bindAimPad();

window.setInterval(() => {
    pollGamepad(1 / 30);
    applyCurveHolds(1 / 30);
    const payload: ControllerInputEnvelope = {
        type: 'controller_input',
        state: buildControllerState(),
    };
    const json = JSON.stringify(payload);
    if (useDataChannel && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(json);
    } else if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(json);
    }
}, 33);

function connect(): void {
    const url = relayInput.value.trim();
    const room = roomInput.value.trim() || 'fqd-room-1';
    if (!url) {
        setStatus('Relay URL is required.');
        return;
    }

    localStorage.setItem(STORAGE_RELAY, url);
    localStorage.setItem(STORAGE_ROOM, room);

    setStatus('Connecting...');
    const ws = new WebSocket(url);
    socket = ws;
    connectButton.textContent = 'Connecting';
    connectButton.disabled = true;

    ws.addEventListener('open', () => {
        const joinMessage: ControllerJoinMessage = {
            type: 'join_controller',
            room,
        };
        ws.send(JSON.stringify(joinMessage));
        setStatus(`Connected to room ${room}.`);
        connectButton.textContent = 'Disconnect';
        connectButton.disabled = false;
    });

    ws.addEventListener('message', (event) => {
        try {
            const msg = JSON.parse(event.data as string) as RelayInboundMessage;
            if (msg.type === 'rtc_offer') {
                void handleRTCOffer(msg, ws);
            } else if (msg.type === 'rtc_ice') {
                void handleRTCIce(msg);
            }
        } catch { /* ignore */ }
    });

    ws.addEventListener('close', () => {
        if (socket === ws) {
            socket = null;
        }
        closeWebRTC();
        connectButton.textContent = 'Connect';
        connectButton.disabled = false;
        setStatus('Disconnected.');
    });

    ws.addEventListener('error', () => {
        setStatus('Connection failed.');
        ws.close();
    });
}

function disconnect(message: string): void {
    closeWebRTC();
    if (socket) {
        socket.close();
        socket = null;
    }
    connectButton.textContent = 'Connect';
    connectButton.disabled = false;
    setStatus(message);
}

async function handleRTCOffer(msg: RTCOfferMessage, ws: WebSocket): Promise<void> {
    closeWebRTC();
    try {
        const pc = new RTCPeerConnection(STUN_SERVERS);
        peerConnection = pc;

        pc.ondatachannel = (event) => {
            const dc = event.channel;
            dataChannel = dc;
            dc.onopen = () => {
                useDataChannel = true;
                console.log('[WebRTC] DataChannel open — sending input via P2P');
            };
            dc.onclose = () => {
                useDataChannel = false;
                console.log('[WebRTC] DataChannel closed — falling back to WebSocket');
            };
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignaling(ws, { type: 'rtc_ice', candidate: event.candidate.toJSON() });
            }
        };

        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignaling(ws, { type: 'rtc_answer', sdp: answer.sdp! });
    } catch (err) {
        console.warn('[WebRTC] Failed to handle offer, staying on WebSocket:', err);
        closeWebRTC();
    }
}

async function handleRTCIce(msg: RTCIceCandidateMessage): Promise<void> {
    if (!peerConnection) return;
    try {
        await peerConnection.addIceCandidate(msg.candidate);
    } catch (err) {
        console.warn('[WebRTC] Failed to add ICE candidate:', err);
    }
}

function closeWebRTC(): void {
    useDataChannel = false;
    if (dataChannel) {
        dataChannel.onopen = null;
        dataChannel.onclose = null;
        dataChannel.close();
        dataChannel = null;
    }
    if (peerConnection) {
        peerConnection.ondatachannel = null;
        peerConnection.onicecandidate = null;
        peerConnection.close();
        peerConnection = null;
    }
}

function sendSignaling(ws: WebSocket, msg: RTCAnswerMessage | RTCIceCandidateMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
}

function buildControllerState(): RemoteControllerState {
    const moveXKeyboard =
        (keyboard.has('KeyD') || keyboard.has('ArrowRight') ? 1 : 0) -
        (keyboard.has('KeyA') || keyboard.has('ArrowLeft') ? 1 : 0);
    const moveZKeyboard =
        (keyboard.has('KeyW') || keyboard.has('ArrowUp') ? 1 : 0) -
        (keyboard.has('KeyS') || keyboard.has('ArrowDown') ? 1 : 0);

    let moveX = moveXKeyboard + moveXTouch + gamepadMoveX;
    let moveZ = moveZKeyboard + moveZTouch + gamepadMoveZ;
    const magSq = moveX * moveX + moveZ * moveZ;
    if (magSq > 1) {
        const inv = 1 / Math.sqrt(magSq);
        moveX *= inv;
        moveZ *= inv;
    }

    const switchNow = switchQueued;
    switchQueued = false;

    const state: RemoteControllerState = {
        moveX: clamp(moveX, -1, 1),
        moveZ: clamp(moveZ, -1, 1),
        sprint:
            holdState.sprint ||
            keyboard.has('ShiftLeft') ||
            keyboard.has('ShiftRight') ||
            gamepadSprint,
        jump: holdState.jump || keyboard.has('Space') || gamepadJump,
        switchPlayer: switchNow,
        hammer: holdState.hammer || keyboard.has('KeyQ') || gamepadHammer,
        blade: holdState.blade || keyboard.has('KeyB') || gamepadBlade,
        thumber: holdState.thumber || keyboard.has('KeyT') || gamepadThumber,
        highRelease: holdState.high || keyboard.has('KeyR') || gamepadHigh,
        lowRelease: holdState.low || keyboard.has('KeyF') || gamepadLow,
        throwHeld: holdState.throw || keyboard.has('KeyJ') || gamepadThrow,
        forehandHeld: holdState.forehand || keyboard.has('KeyU') || gamepadForehand,
        aimX: clamp(aimX, 0, 1),
        aimY: clamp(aimY, 0, 1),
        curveDelta: curveAccumulator,
        timeout: keyboard.has('KeyC') || gamepadTimeout,
        foul: keyboard.has('KeyV') || gamepadFoul,
        pause: keyboard.has('Escape') || gamepadPause,
    };
    curveAccumulator = 0;
    return state;
}

function applyCurveHolds(dt: number): void {
    if (holdState.curveLeft) {
        curveAccumulator -= dt * 220;
    }
    if (holdState.curveRight) {
        curveAccumulator += dt * 220;
    }
    if (keyboard.has('KeyZ')) {
        curveAccumulator -= dt * 220;
    }
    if (keyboard.has('KeyX')) {
        curveAccumulator += dt * 220;
    }
}

function pollGamepad(dt: number): void {
    if (typeof navigator.getGamepads !== 'function') return;
    const pad = Array.from(navigator.getGamepads()).find((g): g is Gamepad => g !== null);
    if (!pad) {
        gamepadMoveX = 0;
        gamepadMoveZ = 0;
        gamepadThrow = false;
        gamepadForehand = false;
        gamepadSprint = false;
        gamepadJump = false;
        gamepadHammer = false;
        gamepadBlade = false;
        gamepadThumber = false;
        gamepadHigh = false;
        gamepadLow = false;
        gamepadTimeout = false;
        gamepadFoul = false;
        gamepadPause = false;
        gamepadSwitchPrev = false;
        return;
    }

    gamepadMoveX = applyDeadzone(pad.axes[0] ?? 0, 0.16);
    gamepadMoveZ = -applyDeadzone(pad.axes[1] ?? 0, 0.16);

    const aimAxisX = applyDeadzone(pad.axes[2] ?? 0, 0.2);
    const aimAxisY = applyDeadzone(pad.axes[3] ?? 0, 0.2);
    if (Math.abs(aimAxisX) > 0.01 || Math.abs(aimAxisY) > 0.01) {
        aimX = clamp(aimX + aimAxisX * dt * 0.95, 0, 1);
        aimY = clamp(aimY + aimAxisY * dt * 0.95, 0, 1);
        renderAimReticle();
    }

    gamepadThrow = (pad.buttons[7]?.value ?? 0) > 0.35;
    gamepadForehand = (pad.buttons[6]?.value ?? 0) > 0.35;
    gamepadJump = isButtonPressed(pad, 0);
    gamepadSprint = isButtonPressed(pad, 4) || isButtonPressed(pad, 10);
    gamepadHammer = isButtonPressed(pad, 3);
    gamepadBlade = isButtonPressed(pad, 1);
    gamepadThumber = isButtonPressed(pad, 5);
    gamepadHigh = isButtonPressed(pad, 12);
    gamepadLow = isButtonPressed(pad, 13);
    gamepadTimeout = isButtonPressed(pad, 6);
    gamepadFoul = isButtonPressed(pad, 11);
    gamepadPause = isButtonPressed(pad, 9);

    const switchPressed = isButtonPressed(pad, 2) || isButtonPressed(pad, 8);
    if (switchPressed && !gamepadSwitchPrev) {
        switchQueued = true;
    }
    gamepadSwitchPrev = switchPressed;

    const curveAxis = (isButtonPressed(pad, 15) ? 1 : 0) - (isButtonPressed(pad, 14) ? 1 : 0);
    if (curveAxis !== 0) {
        curveAccumulator += curveAxis * dt * 220;
    }
}

function bindHoldButton(button: HTMLButtonElement, action: HoldAction): void {
    let pointerId: number | null = null;
    button.addEventListener('pointerdown', (event) => {
        pointerId = event.pointerId;
        holdState[action] = true;
        button.classList.add('active');
        button.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    const release = (event: PointerEvent) => {
        if (pointerId !== null && event.pointerId !== pointerId) return;
        holdState[action] = false;
        pointerId = null;
        button.classList.remove('active');
        if (button.hasPointerCapture(event.pointerId)) {
            button.releasePointerCapture(event.pointerId);
        }
        event.preventDefault();
    };

    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
}

function bindMovePad(): void {
    const radius = 70;
    let pointerId: number | null = null;

    const update = (clientX: number, clientY: number): void => {
        const rect = movePad.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const distance = Math.hypot(dx, dy);
        const capped = Math.min(radius, distance);
        const nx = distance > 0 ? dx / distance : 0;
        const ny = distance > 0 ? dy / distance : 0;
        const tx = nx * capped;
        const ty = ny * capped;
        moveXTouch = clamp(tx / radius, -1, 1);
        moveZTouch = clamp(-ty / radius, -1, 1);
        moveKnob.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
    };

    movePad.addEventListener('pointerdown', (event) => {
        pointerId = event.pointerId;
        movePad.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
        event.preventDefault();
    });
    movePad.addEventListener('pointermove', (event) => {
        if (pointerId !== event.pointerId) return;
        update(event.clientX, event.clientY);
        event.preventDefault();
    });
    const release = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        pointerId = null;
        moveXTouch = 0;
        moveZTouch = 0;
        moveKnob.style.transform = 'translate(-50%, -50%)';
        if (movePad.hasPointerCapture(event.pointerId)) {
            movePad.releasePointerCapture(event.pointerId);
        }
        event.preventDefault();
    };
    movePad.addEventListener('pointerup', release);
    movePad.addEventListener('pointercancel', release);
}

function bindAimPad(): void {
    let pointerId: number | null = null;
    const update = (clientX: number, clientY: number): void => {
        const rect = aimPad.getBoundingClientRect();
        aimX = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        aimY = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
        renderAimReticle();
    };

    aimPad.addEventListener('pointerdown', (event) => {
        pointerId = event.pointerId;
        aimPad.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
        event.preventDefault();
    });
    aimPad.addEventListener('pointermove', (event) => {
        if (pointerId !== event.pointerId) return;
        update(event.clientX, event.clientY);
        event.preventDefault();
    });
    const release = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        pointerId = null;
        if (aimPad.hasPointerCapture(event.pointerId)) {
            aimPad.releasePointerCapture(event.pointerId);
        }
        event.preventDefault();
    };
    aimPad.addEventListener('pointerup', release);
    aimPad.addEventListener('pointercancel', release);
}

function renderAimReticle(): void {
    aimReticle.style.left = `${aimX * 100}%`;
    aimReticle.style.top = `${aimY * 100}%`;
}

function setStatus(text: string): void {
    statusEl.textContent = text;
}

function isButtonPressed(pad: Gamepad, index: number): boolean {
    const button = pad.buttons[index];
    if (!button) return false;
    return button.pressed || button.value > 0.5;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function applyDeadzone(value: number, deadzone: number): number {
    const abs = Math.abs(value);
    if (abs <= deadzone) return 0;
    const scaled = (abs - deadzone) / (1 - deadzone);
    return Math.sign(value) * Math.min(1, scaled);
}
