import type {
    ControllerInputEnvelope,
    HostJoinMessage,
    PeerStateMessage,
    RTCAnswerMessage,
    RTCIceCandidateMessage,
    RTCOfferMessage,
    RelayInboundMessage,
    RemoteControllerState,
} from './protocol';

interface LanRelayClientOptions {
    url: string;
    room: string;
    onControllerState: (state: RemoteControllerState) => void;
    onConnectionState: (connected: boolean, text: string) => void;
}

export class LanRelayClient {
    private readonly url: string;
    private readonly room: string;
    private readonly onControllerState: (state: RemoteControllerState) => void;
    private readonly onConnectionState: (connected: boolean, text: string) => void;

    private ws: WebSocket | null = null;
    private destroyed = false;
    private reconnectTimer: number | null = null;
    private reconnectDelay = 1000;
    private maxReconnectDelay = 10000;
    private controllerConnected = false;
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;

    private static readonly STUN_SERVERS: RTCConfiguration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ],
    };

    constructor(options: LanRelayClientOptions) {
        this.url = options.url;
        this.room = options.room;
        this.onControllerState = options.onControllerState;
        this.onConnectionState = options.onConnectionState;
    }

    async connect(): Promise<void> {
        if (this.ws || this.destroyed) return;

        this.onConnectionState(false, 'Connecting to relay server...');

        try {
            const ws = new WebSocket(this.url);
            this.ws = ws;

            ws.onopen = () => {
                if (this.ws !== ws) return;
                this.reconnectDelay = 1000;
                this.sendJoinHost();
                this.onConnectionState(false, `Host online (${this.room}) - waiting for controller`);
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
                if (this.controllerConnected) {
                    this.controllerConnected = false;
                    this.onConnectionState(false, 'Controller disconnected');
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
        this.closeWebRTC();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.controllerConnected = false;
    }

    private sendJoinHost(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const message: HostJoinMessage = {
            type: 'join_host',
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

        if (message.type === 'controller_input') {
            this.onControllerState(message.state);
        } else if (message.type === 'peer_state') {
            this.handlePeerState(message);
        } else if (message.type === 'rtc_answer') {
            void this.handleRTCAnswer(message);
        } else if (message.type === 'rtc_ice') {
            void this.handleRTCIce(message);
        }
    }

    private handlePeerState(message: PeerStateMessage): void {
        this.controllerConnected = message.connected;
        if (message.connected) {
            this.onConnectionState(true, `Controller connected (${this.room})`);
            void this.initWebRTC();
        } else {
            this.closeWebRTC();
            this.onConnectionState(false, `Host online (${this.room}) - waiting for controller`);
        }
    }

    private async initWebRTC(): Promise<void> {
        this.closeWebRTC();
        try {
            const pc = new RTCPeerConnection(LanRelayClient.STUN_SERVERS);
            this.peerConnection = pc;

            const dc = pc.createDataChannel('controller-input', { ordered: false });
            this.dataChannel = dc;

            dc.onopen = () => {
                console.log('[WebRTC] DataChannel open — receiving input via P2P');
            };
            dc.onmessage = (event) => {
                try {
                    const envelope = JSON.parse(event.data as string) as { type: string; state: RemoteControllerState };
                    if (envelope.type === 'controller_input') {
                        this.onControllerState(envelope.state);
                    }
                } catch { /* ignore malformed */ }
            };
            dc.onclose = () => {
                console.log('[WebRTC] DataChannel closed — using WebSocket fallback');
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignaling({ type: 'rtc_ice', candidate: event.candidate.toJSON() });
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignaling({ type: 'rtc_offer', sdp: offer.sdp! });
        } catch (err) {
            console.warn('[WebRTC] Failed to create offer, staying on WebSocket:', err);
            this.closeWebRTC();
        }
    }

    private async handleRTCAnswer(message: RTCAnswerMessage): Promise<void> {
        if (!this.peerConnection) return;
        try {
            await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: message.sdp });
        } catch (err) {
            console.warn('[WebRTC] Failed to set remote description:', err);
        }
    }

    private async handleRTCIce(message: RTCIceCandidateMessage): Promise<void> {
        if (!this.peerConnection) return;
        try {
            await this.peerConnection.addIceCandidate(message.candidate);
        } catch (err) {
            console.warn('[WebRTC] Failed to add ICE candidate:', err);
        }
    }

    private closeWebRTC(): void {
        if (this.dataChannel) {
            this.dataChannel.onopen = null;
            this.dataChannel.onmessage = null;
            this.dataChannel.onclose = null;
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.onicecandidate = null;
            this.peerConnection.close();
            this.peerConnection = null;
        }
    }

    private sendSignaling(msg: RTCOfferMessage | RTCAnswerMessage | RTCIceCandidateMessage): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(msg));
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
