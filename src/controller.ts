import type {
    ControllerInputEnvelope,
    ControllerJoinMessage,
    FullMatchState,
    RTCAnswerMessage,
    RTCIceCandidateMessage,
    RTCOfferMessage,
    RelayInboundMessage,
    RemoteControllerState,
    RoomMetadata,
    SpectatorJoinMessage,
} from './network/protocol';

// ── DOM References ──

const connectScreen = document.getElementById('connect-screen') as HTMLDivElement;
const gameScreen = document.getElementById('game-screen') as HTMLDivElement;
const rotatePrompt = document.getElementById('rotate-prompt') as HTMLDivElement;
const relayInput = document.getElementById('relay-url') as HTMLInputElement;
const roomInput = document.getElementById('room') as HTMLInputElement;
const accentColorInput = document.getElementById('accent-color') as HTMLInputElement;
const connectButton = document.getElementById('connect') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const roomListEl = document.getElementById('room-list') as HTMLDivElement;
const browserPanel = document.getElementById('browser-panel') as HTMLDivElement;

// Game screen elements
const hudHomeScore = document.getElementById('hud-home-score') as HTMLSpanElement;
const hudAwayScore = document.getElementById('hud-away-score') as HTMLSpanElement;
const hudStallFill = document.getElementById('hud-stall-fill') as HTMLDivElement;
const hudPhase = document.getElementById('hud-phase') as HTMLSpanElement;
const hudLatency = document.getElementById('hud-latency') as HTMLSpanElement;
const statusOverlay = document.getElementById('status-overlay') as HTMLDivElement;
const reconnectBanner = document.getElementById('reconnect-banner') as HTMLDivElement;
const reconnectText = document.getElementById('reconnect-text') as HTMLSpanElement;

// Touch zones + sticks
const moveZone = document.getElementById('move-zone') as HTMLDivElement;
const moveStick = document.getElementById('move-stick') as HTMLDivElement;
const aimZone = document.getElementById('aim-zone') as HTMLDivElement;
const aimStick = document.getElementById('aim-stick') as HTMLDivElement;

// Buttons
const btnSprint = document.getElementById('btn-sprint') as HTMLButtonElement;
const btnJump = document.getElementById('btn-jump') as HTMLButtonElement;
const btnSwitch = document.getElementById('btn-switch') as HTMLButtonElement;
const btnBackhand = document.getElementById('btn-backhand') as HTMLButtonElement;
const btnForehand = document.getElementById('btn-forehand') as HTMLButtonElement;
const btnDisconnect = document.getElementById('btn-disconnect') as HTMLButtonElement;
const modifierStrip = document.getElementById('modifier-strip') as HTMLDivElement;

// ── Router ──

interface Route {
    path: string;
    query: URLSearchParams;
}

function parseHash(): Route {
    const raw = window.location.hash.slice(1) || '/lobby';
    const qIdx = raw.indexOf('?');
    const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    const queryStr = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
    return { path: path || '/lobby', query: new URLSearchParams(queryStr) };
}

/** Push a new history entry and apply the route. */
function navigate(path: string, params?: Record<string, string>): void {
    const query = params && Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString() : '';
    history.pushState(null, '', '#' + path + query);
    applyRoute();
}

/** Replace the current hash without triggering navigation. */
function setHash(path: string, params?: Record<string, string>): void {
    const query = params && Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString() : '';
    history.replaceState(null, '', '#' + path + query);
}

let routeInProgress = false;

function applyRoute(): void {
    if (routeInProgress) return;
    routeInProgress = true;
    try {
        const route = parseHash();
        switch (route.path) {
            case '/play': {
                const rRelay = route.query.get('relay');
                const rRoom = route.query.get('room');
                const rColor = route.query.get('color');
                if (rRelay) relayInput.value = rRelay;
                if (rRoom) roomInput.value = rRoom;
                if (rColor) accentColorInput.value = rColor;
                // Already connected to same room? Just show game screen.
                const targetRoom = roomInput.value.trim() || 'fqd-room-1';
                if (socket && socket.readyState === WebSocket.OPEN && connectedRoom === targetRoom) {
                    showGameScreen();
                } else {
                    // Tear down old connection if any
                    if (socket) {
                        intentionalDisconnect = true;
                        disconnectRaw();
                    }
                    intentionalDisconnect = false;
                    connect();
                }
                break;
            }
            case '/lobby':
            default:
                if (socket) {
                    intentionalDisconnect = true;
                    disconnectRaw();
                }
                showConnectScreen();
                break;
        }
    } finally {
        routeInProgress = false;
    }
}

window.addEventListener('popstate', () => applyRoute());

// ── Constants ──

const STORAGE_RELAY = 'fqd_controller_relay';
const STORAGE_ROOM = 'fqd_controller_room';
const MOVE_STICK_RADIUS = 60;
const AIM_STICK_RADIUS = 50;
const AIM_SENSITIVITY = 1.8;
const STALL_MAX = 10;
const HUD_THROTTLE_MS = 100; // 10Hz HUD updates

const STUN_SERVERS: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

// ── State ──

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

let moveXTouch = 0;
let moveZTouch = 0;
let aimX = 0.5;
let aimY = 0.55;
let switchQueued = false;
let curveAccumulator = 0;

// Gamepad state
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

// Reconnect state
let reconnectTimer: number | null = null;
let reconnectDelay = 1000;
let intentionalDisconnect = false;
let connectedRoom = '';

// Game state HUD
let latestMatchState: FullMatchState | null = null;
let lastBroadcastTime = 0;
let lastHudUpdate = 0;

// Browser (lobby) WebSocket
let browserWs: WebSocket | null = null;

// ── Init ──

// Resolve defaults from (1) hash query, (2) search query, (3) localStorage, (4) protocol sniff
const hashRoute = parseHash();
const searchParams = new URLSearchParams(window.location.search);

const defaultRelay = (() => {
    const fromHash = hashRoute.query.get('relay');
    if (fromHash) return fromHash;
    const fromSearch = searchParams.get('relay');
    if (fromSearch) return fromSearch;
    const fromStorage = localStorage.getItem(STORAGE_RELAY);
    if (fromStorage) return fromStorage;
    if (window.location.protocol === 'https:') {
        return `wss://${window.location.host}/ws`;
    }
    return `ws://${window.location.host}/ws`;
})();
const defaultRoom =
    hashRoute.query.get('room') ||
    searchParams.get('room') ||
    localStorage.getItem(STORAGE_ROOM) ||
    'fqd-room-1';

relayInput.value = defaultRelay;
roomInput.value = defaultRoom;
setStatus('Disconnected');

// Migrate legacy ?room=&relay= search params to hash route
if (!window.location.hash && (searchParams.has('room') || searchParams.has('relay'))) {
    const params: Record<string, string> = {};
    if (searchParams.get('relay')) params.relay = searchParams.get('relay')!;
    if (searchParams.get('room')) params.room = searchParams.get('room')!;
    // Replace URL to strip search params and use hash instead
    setHash('/play', params);
    history.replaceState(null, '', window.location.pathname + window.location.hash);
}

initBrowser();
// Let the router decide which screen to show (and auto-connect if #/play)
applyRoute();

// ── Screen Transitions ──

function showConnectScreen(): void {
    connectScreen.style.display = 'flex';
    gameScreen.style.display = 'none';
    rotatePrompt.classList.remove('active');
    connectButton.textContent = 'Connect';
    connectButton.disabled = false;
}

function showGameScreen(): void {
    connectScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    rotatePrompt.classList.add('active');
    reconnectBanner.style.display = 'none';
}

function setStatus(text: string, connected = false): void {
    statusEl.textContent = text;
    if (connected) {
        statusEl.classList.add('connected');
        if (browserPanel) browserPanel.style.display = 'none';
    } else {
        statusEl.classList.remove('connected');
        if (browserPanel) browserPanel.style.display = 'flex';
    }
}

// ── Floating Virtual Sticks ──

function bindFloatingZone(
    zone: HTMLElement,
    stick: HTMLElement,
    radius: number,
    onMove: (x: number, y: number) => void,
    onRelease: () => void,
): void {
    const base = stick.querySelector('.stick-base') as HTMLElement;
    const knob = stick.querySelector('.stick-knob') as HTMLElement;
    let pointerId: number | null = null;
    let originX = 0;
    let originY = 0;

    zone.addEventListener('pointerdown', (e) => {
        if (pointerId !== null) return;
        pointerId = e.pointerId;
        zone.setPointerCapture(e.pointerId);

        originX = e.clientX;
        originY = e.clientY;
        stick.style.display = 'block';
        base.style.left = originX + 'px';
        base.style.top = originY + 'px';
        knob.style.left = originX + 'px';
        knob.style.top = originY + 'px';

        haptic(15);
        e.preventDefault();
    });

    zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pointerId) return;
        const dx = e.clientX - originX;
        const dy = e.clientY - originY;
        const dist = Math.hypot(dx, dy);
        const capped = Math.min(radius, dist);
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 0;

        knob.style.left = (originX + nx * capped) + 'px';
        knob.style.top = (originY + ny * capped) + 'px';

        onMove(
            clamp(nx * capped / radius, -1, 1),
            clamp(-ny * capped / radius, -1, 1),
        );
        e.preventDefault();
    });

    const release = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        stick.style.display = 'none';
        onRelease();
        if (zone.hasPointerCapture(e.pointerId)) {
            zone.releasePointerCapture(e.pointerId);
        }
        e.preventDefault();
    };

    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
}

// Move zone: absolute stick position → moveX/Z
bindFloatingZone(
    moveZone,
    moveStick,
    MOVE_STICK_RADIUS,
    (x, y) => {
        moveXTouch = x;
        moveZTouch = y;
    },
    () => {
        moveXTouch = 0;
        moveZTouch = 0;
    },
);

// Aim zone: relative delta → accumulated aimX/Y
bindFloatingZone(
    aimZone,
    aimStick,
    AIM_STICK_RADIUS,
    (x, y) => {
        aimX = clamp(aimX + x * 0.02 * AIM_SENSITIVITY, 0, 1);
        aimY = clamp(aimY - y * 0.02 * AIM_SENSITIVITY, 0, 1);
    },
    () => { /* aim persists on release */ },
);

// ── Button Bindings ──

function bindHoldButton(button: HTMLElement, action: HoldAction): void {
    let pid: number | null = null;

    button.addEventListener('pointerdown', (e) => {
        pid = e.pointerId;
        holdState[action] = true;
        button.classList.add('active');
        button.setPointerCapture(e.pointerId);
        haptic(30);
        e.preventDefault();
        e.stopPropagation();
    });

    const release = (e: PointerEvent) => {
        if (pid !== null && e.pointerId !== pid) return;
        holdState[action] = false;
        pid = null;
        button.classList.remove('active');
        if (button.hasPointerCapture(e.pointerId)) {
            button.releasePointerCapture(e.pointerId);
        }
        e.preventDefault();
    };

    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
}

function bindThrowTrigger(button: HTMLElement, action: 'throw' | 'forehand'): void {
    let pid: number | null = null;

    button.addEventListener('pointerdown', (e) => {
        pid = e.pointerId;
        holdState[action] = true;
        button.classList.add('active');
        button.setPointerCapture(e.pointerId);
        updateModifierStrip();
        haptic(30);
        e.preventDefault();
        e.stopPropagation();
    });

    const release = (e: PointerEvent) => {
        if (pid !== null && e.pointerId !== pid) return;
        holdState[action] = false;
        pid = null;
        button.classList.remove('active');
        updateModifierStrip();
        haptic(80);
        if (button.hasPointerCapture(e.pointerId)) {
            button.releasePointerCapture(e.pointerId);
        }
        e.preventDefault();
    };

    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
}

function updateModifierStrip(): void {
    const throwing = holdState.throw || holdState.forehand;
    modifierStrip.classList.toggle('visible', throwing);
}

// Wire buttons
bindHoldButton(btnSprint, 'sprint');
bindHoldButton(btnJump, 'jump');
bindThrowTrigger(btnBackhand, 'throw');
bindThrowTrigger(btnForehand, 'forehand');

// Switch: tap
btnSwitch.addEventListener('pointerdown', (e) => {
    switchQueued = true;
    btnSwitch.classList.add('active');
    haptic(30);
    window.setTimeout(() => btnSwitch.classList.remove('active'), 120);
    e.preventDefault();
    e.stopPropagation();
});

// Modifier buttons
modifierStrip.querySelectorAll<HTMLButtonElement>('.mod-btn').forEach((btn) => {
    const action = btn.dataset.action as HoldAction | undefined;
    if (action) {
        bindHoldButton(btn, action);
    }
});

// Disconnect button
btnDisconnect.addEventListener('click', () => {
    navigate('/lobby');
});

// ── Keyboard ──

window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    keyboard.add(e.code);
    if (e.code === 'KeyE') switchQueued = true;
    if (!e.metaKey && !e.ctrlKey && e.code !== 'F12' && e.code !== 'F11' && e.code !== 'F5') {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    keyboard.delete(e.code);
    if (!e.metaKey && !e.ctrlKey && e.code !== 'F12' && e.code !== 'F11' && e.code !== 'F5') {
        e.preventDefault();
    }
});

window.addEventListener(
    'wheel',
    (e) => {
        curveAccumulator += e.deltaY > 0 ? -12 : 12;
        e.preventDefault();
    },
    { passive: false },
);

// ── Connection ──

connectButton.addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        navigate('/lobby');
        return;
    }
    const relay = relayInput.value.trim();
    const room = roomInput.value.trim() || 'fqd-room-1';
    const params: Record<string, string> = { room };
    if (relay) params.relay = relay;
    navigate('/play', params);
});

function connect(): void {
    const url = relayInput.value.trim();
    const room = roomInput.value.trim() || 'fqd-room-1';
    if (!url) {
        setStatus('Relay URL is required.');
        navigate('/lobby');
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
        // Join as controller
        const joinMsg: ControllerJoinMessage = { type: 'join_controller', room };
        ws.send(JSON.stringify(joinMsg));

        // Also join as spectator to receive game state
        const spectateMsg: SpectatorJoinMessage = { type: 'join_spectator', room };
        ws.send(JSON.stringify(spectateMsg));

        connectedRoom = room;
        setStatus(`Connected: ${room}`, true);
        connectButton.textContent = 'Disconnect';
        connectButton.disabled = false;

        // Reset reconnect state
        reconnectDelay = 1000;
        reconnectBanner.style.display = 'none';

        // Update hash to reflect connected state (replace, don't push)
        setHash('/play', { room, relay: url });
        showGameScreen();
    });

    ws.addEventListener('message', (event) => {
        try {
            const msg = JSON.parse(event.data as string) as RelayInboundMessage;
            if (msg.type === 'rtc_offer') {
                void handleRTCOffer(msg, ws);
            } else if (msg.type === 'rtc_ice') {
                void handleRTCIce(msg);
            } else if (msg.type === 'broadcast_state') {
                handleBroadcastState(msg.state);
            }
        } catch { /* ignore */ }
    });

    ws.addEventListener('close', () => {
        if (socket === ws) socket = null;
        closeWebRTC();

        if (!intentionalDisconnect) {
            scheduleReconnect();
        } else {
            setStatus('Disconnected');
        }
    });

    ws.addEventListener('error', () => {
        setStatus('Connection failed');
        ws.close();
        // Go back to lobby on connection failure
        navigate('/lobby');
    });
}

/** Close connection without navigating — used by the router. */
function disconnectRaw(): void {
    closeWebRTC();
    if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (socket) {
        socket.close();
        socket = null;
    }
    connectedRoom = '';
    connectButton.textContent = 'Connect';
    connectButton.disabled = false;
    setStatus('Disconnected');
}

function scheduleReconnect(): void {
    if (intentionalDisconnect) return;

    reconnectBanner.style.display = 'block';
    const delaySec = Math.round(reconnectDelay / 1000);
    reconnectText.textContent = `Reconnecting in ${delaySec}s...`;

    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        reconnectText.textContent = 'Reconnecting...';
        connect();
    }, reconnectDelay);

    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
}

// ── WebRTC ──

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
                console.log('[WebRTC] DataChannel open — P2P input');
            };
            dc.onclose = () => {
                useDataChannel = false;
                console.log('[WebRTC] DataChannel closed — WebSocket fallback');
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
        console.warn('[WebRTC] Failed to handle offer:', err);
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

// ── Game State HUD ──

function handleBroadcastState(state: FullMatchState): void {
    const prevState = latestMatchState;
    latestMatchState = state;
    lastBroadcastTime = performance.now();

    // Throttle DOM updates
    if (lastBroadcastTime - lastHudUpdate < HUD_THROTTLE_MS) return;
    lastHudUpdate = lastBroadcastTime;

    // Score
    hudHomeScore.textContent = String(state.score[0]);
    hudAwayScore.textContent = String(state.score[1]);

    // Stall bar
    const stallPct = Math.min(100, (state.stall / STALL_MAX) * 100);
    hudStallFill.style.width = stallPct + '%';
    hudStallFill.style.background =
        stallPct < 50 ? '#38d67a' :
        stallPct < 70 ? '#ffc646' :
        stallPct < 90 ? '#ff8a2a' : '#ff4f5e';

    // Phase
    hudPhase.textContent = state.phase.replace(/_/g, ' ').toUpperCase();

    // Status text overlay
    if (state.statusTextActive && state.statusText) {
        statusOverlay.textContent = state.statusText;
        statusOverlay.classList.add('visible');
    } else {
        statusOverlay.classList.remove('visible');
    }

    // Haptic on events
    if (prevState) {
        if (state.statusText !== prevState.statusText && state.statusTextActive) {
            if (state.statusText === 'SCORE!' || state.statusText === 'TURNOVER') {
                haptic([50, 30, 50]);
            }
        }
    }
}

// ── Room Browser ──

function initBrowser(): void {
    const url = relayInput.value.trim() || defaultRelay;
    try {
        const ws = new WebSocket(url);
        browserWs = ws;
        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'list_rooms' }));
        };
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'room_list') {
                    updateLobbyUI(msg.rooms);
                }
            } catch { /* ignore */ }
        };
        setInterval(() => {
            if (!socket && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'list_rooms' }));
            }
        }, 5000);
    } catch { /* ignore connection errors for browser */ }
}

function updateLobbyUI(rooms: RoomMetadata[]): void {
    // Clear children safely
    while (roomListEl.firstChild) roomListEl.removeChild(roomListEl.firstChild);

    const joinable = rooms.filter(r => r.joinable);
    if (joinable.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'font-size:0.85rem; color:rgba(255,255,255,0.3); text-align:center; padding:10px;';
        empty.textContent = 'No public games found.';
        roomListEl.appendChild(empty);
        return;
    }

    for (const room of joinable) {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.05); border-radius:8px; cursor:pointer;';

        const info = document.createElement('div');
        info.style.cssText = 'display:flex; flex-direction:column; gap:2px;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:14px; font-weight:bold;';
        title.textContent = `${room.homeName} vs ${room.awayName}`;

        const detail = document.createElement('div');
        detail.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.5);';
        detail.textContent = `${room.homeScore} - ${room.awayScore} \u2022 ${room.controllerCount}/14 players`;

        const joinEl = document.createElement('div');
        joinEl.style.cssText = 'font-size:11px; font-weight:bold; color:var(--accent);';
        joinEl.textContent = 'JOIN \u2192';

        info.appendChild(title);
        info.appendChild(detail);
        item.appendChild(info);
        item.appendChild(joinEl);

        item.addEventListener('click', () => {
            const relay = relayInput.value.trim();
            const params: Record<string, string> = { room: room.room };
            if (relay) params.relay = relay;
            navigate('/play', params);
        });

        roomListEl.appendChild(item);
    }
}

// ── Gamepad ──

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
    gamepadTimeout = isButtonPressed(pad, 8);
    gamepadFoul = isButtonPressed(pad, 11);
    gamepadPause = isButtonPressed(pad, 9) && !isButtonPressed(pad, 8);

    const switchPressed = isButtonPressed(pad, 2);
    if (switchPressed && !gamepadSwitchPrev) switchQueued = true;
    gamepadSwitchPrev = switchPressed;

    const curveAxis = (isButtonPressed(pad, 15) ? 1 : 0) - (isButtonPressed(pad, 14) ? 1 : 0);
    if (curveAxis !== 0) curveAccumulator += curveAxis * dt * 220;
}

// ── Build State ──

function applyCurveHolds(dt: number): void {
    if (holdState.curveLeft) curveAccumulator -= dt * 220;
    if (holdState.curveRight) curveAccumulator += dt * 220;
    if (keyboard.has('KeyZ')) curveAccumulator -= dt * 220;
    if (keyboard.has('KeyX')) curveAccumulator += dt * 220;
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
        accentColor: accentColorInput.value,
    };
    curveAccumulator = 0;
    return state;
}

// ── Main Loop (30Hz) ──

setInterval(() => {
    pollGamepad(1 / 30);
    applyCurveHolds(1 / 30);

    // Latency indicator
    if (latestMatchState) {
        const elapsed = performance.now() - lastBroadcastTime;
        if (elapsed < 300) {
            hudLatency.textContent = '\u25CF';
            hudLatency.style.color = '#4ade80';
        } else if (elapsed < 1500) {
            hudLatency.textContent = '\u25CF';
            hudLatency.style.color = '#ffc646';
        } else {
            hudLatency.textContent = '\u25CF';
            hudLatency.style.color = '#ff4f5e';
        }
    }

    // Send input
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

// ── Utilities ──

function haptic(pattern: number | number[]): void {
    try {
        navigator.vibrate?.(pattern);
    } catch { /* not all browsers support */ }
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

function isButtonPressed(pad: Gamepad, index: number): boolean {
    const button = pad.buttons[index];
    if (!button) return false;
    return button.pressed || button.value > 0.5;
}
