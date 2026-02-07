import type {
    BroadcastStateMessage,
    ControllerInputEnvelope,
    FullMatchState,
    HostJoinMessage,
    HostMetadataMessage,
    ListRoomsMessage,
    PeerStateMessage,
    RTCAnswerMessage,
    RTCIceCandidateMessage,
    RTCOfferMessage,
    RelayInboundMessage,
    RemoteControllerState,
    RoomMetadata,
    SpectatorJoinMessage,
} from './protocol';

interface LanRelayClientOptions {
    url: string;
    room?: string;
    role?: 'host' | 'spectator' | 'browser';
    onControllerState?: (id: string, state: RemoteControllerState) => void;
    onBroadcastState?: (state: FullMatchState) => void;
    onRoomList?: (rooms: RoomMetadata[]) => void;
    onConnectionState: (connected: boolean, text: string) => void;
}

export class LanRelayClient {
    private readonly url: string;
    private readonly room?: string;
    private readonly role: 'host' | 'spectator' | 'browser';
    private readonly onControllerState?: (id: string, state: RemoteControllerState) => void;
    private readonly onBroadcastState?: (state: FullMatchState) => void;
    private readonly onRoomList?: (rooms: RoomMetadata[]) => void;
    private readonly onConnectionState: (connected: boolean, text: string) => void;

    private ws: WebSocket | null = null;
    private destroyed = false;
    private reconnectTimer: number | null = null;
    private reconnectDelay = 1000;
    private maxReconnectDelay = 10000;
    private controllerCount = 0;
    private spectatorCount = 0;
    
    // Multi-peer support
    private peers = new Map<string, {
        pc: RTCPeerConnection;
        dc: RTCDataChannel | null;
    }>();

    private static readonly STUN_SERVERS: RTCConfiguration = {
        iceServers: [
            { urls: 'stun:stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ],
    };

    constructor(options: LanRelayClientOptions) {
        this.url = options.url;
        this.room = options.room;
        this.role = options.role ?? 'host';
        this.onControllerState = options.onControllerState;
        this.onBroadcastState = options.onBroadcastState;
        this.onRoomList = options.onRoomList;
        this.onConnectionState = options.onConnectionState;
    }

    async connect(): Promise<void> {
        if (this.ws || this.destroyed) return;

        this.onConnectionState(false, `Connecting to relay server as ${this.role}...`);

        try {
            const ws = new WebSocket(this.url);
            this.ws = ws;

            ws.onopen = () => {
                if (this.ws !== ws) return;
                this.reconnectDelay = 1000;
                if (this.role === 'host' && this.room) {
                    this.sendJoinHost();
                    const isSolo = this.room.startsWith('solo-');
                    this.onConnectionState(false, isSolo ? `Broadcasting solo play (${this.room})` : `Host online (${this.room}) - waiting for controllers`);
                } else if (this.role === 'spectator' && this.room) {
                    this.sendJoinSpectator();
                    this.onConnectionState(true, `Spectating match (${this.room})`);
                } else if (this.role === 'browser') {
                    this.listRooms();
                    this.onConnectionState(true, 'Relay connected');
                }
            };

            ws.onmessage = (event) => {
                if (this.ws !== ws) return;
                this.handleMessage(event.data);
            };

            ws.onerror = () => {
                if (this.ws !== ws) return;
                this.onConnectionState(false, 'Relay connection error');
            };

            ws.onclose = () => {
                if (this.ws !== ws) return;
                this.ws = null;
                if (this.controllerCount > 0 || this.role === 'spectator') {
                    this.controllerCount = 0;
                    this.onConnectionState(false, 'Disconnected from relay');
                }
                this.scheduleReconnect();
            };

            await new Promise<void>((resolve, reject) => {
                const onOpen = () => {
                    cleanup();
                    resolve();
                };
                const onError = () => {
                    cleanup();
                    reject(new Error('WebSocket connection failed'));
                };
                const cleanup = () => {
                    ws.removeEventListener('open', onOpen);
                    ws.removeEventListener('error', onError);
                };
                ws.addEventListener('open', onOpen);
                ws.addEventListener('error', onError);
            });
        } catch (error) {
            this.onConnectionState(false, 'Failed to connect to relay server');
            this.ws = null;
            this.scheduleReconnect();
            throw error;
        }
    }

    destroy(): void {
        this.destroyed = true;
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.closeAllWebRTC();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.controllerCount = 0;
    }

    broadcastState(state: FullMatchState): void {
        if (this.role !== 'host' || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const message: BroadcastStateMessage = {
            type: 'broadcast_state',
            state,
        };
        this.ws.send(JSON.stringify(message));
    }

    listRooms(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const message: ListRoomsMessage = { type: 'list_rooms' };
        this.ws.send(JSON.stringify(message));
    }

    updateMetadata(metadata: Partial<RoomMetadata>): void {
        if (this.role !== 'host' || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const message: HostMetadataMessage = {
            type: 'host_metadata',
            metadata,
        };
        this.ws.send(JSON.stringify(message));
    }

    private sendJoinHost(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.room) return;
        const message: HostJoinMessage = {
            type: 'join_host',
            room: this.room,
        };
        this.ws.send(JSON.stringify(message));
    }

    private sendJoinSpectator(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.room) return;
        const message: SpectatorJoinMessage = {
            type: 'join_spectator',
            room: this.room,
        };
        this.ws.send(JSON.stringify(message));
    }

    private handleMessage(data: string | Blob | ArrayBuffer): void {
        let message: RelayInboundMessage;
        try {
            const text = typeof data === 'string' ? data : String(data);
            message = JSON.parse(text) as RelayInboundMessage;
        } catch {
            return;
        }

        if (message.type === 'controller_input' && message.controllerId) {
            this.onControllerState?.(message.controllerId, message.state);
        } else if (message.type === 'broadcast_state') {
            this.onBroadcastState?.(message.state);
        } else if (message.type === 'room_list') {
            this.onRoomList?.(message.rooms);
        } else if (message.type === 'peer_state') {
            this.handlePeerState(message);
        } else if (message.type === 'rtc_answer' && message.controllerId) {
            void this.handleRTCAnswer(message.controllerId, message);
        } else if (message.type === 'rtc_ice' && message.controllerId) {
            void this.handleRTCIce(message.controllerId, message);
        }
    }

    private handlePeerState(message: PeerStateMessage): void {
        if (this.role !== 'host') return;

        this.controllerCount = message.controllerCount ?? (message.connected ? 1 : 0);
        
        if (this.controllerCount > 0) {
            this.onConnectionState(true, `${this.controllerCount} controller(s) connected (${this.room})`);
        } else {
            this.closeAllWebRTC();
            this.onConnectionState(false, `Host online (${this.room}) - waiting for controllers`);
        }
    }

    private async handleRTCAnswer(id: string, message: RTCAnswerMessage): Promise<void> {
        const peer = this.peers.get(id);
        if (!peer) return;
        try {
            await peer.pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
        } catch (err) {
            console.warn(`[WebRTC] Failed to set remote description for ${id}:`, err);
        }
    }

    private async handleRTCIce(id: string, message: RTCIceCandidateMessage): Promise<void> {
        const peer = this.peers.get(id);
        if (!peer) return;
        try {
            await peer.pc.addIceCandidate(message.candidate);
        } catch (err) {
            console.warn(`[WebRTC] Failed to add ICE candidate for ${id}:`, err);
        }
    }

    private closeAllWebRTC(): void {
        for (const peer of this.peers.values()) {
            peer.dc?.close();
            peer.pc.close();
        }
        this.peers.clear();
    }

    private scheduleReconnect(): void {
        if (this.destroyed) return;
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
        }

        this.onConnectionState(false, `Reconnecting in ${Math.round(this.reconnectDelay / 1000)}s...`);

        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.destroyed) {
                void this.connect();
            }
        }, this.reconnectDelay);

        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }
}
