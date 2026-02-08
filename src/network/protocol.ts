export interface RemoteControllerState {
    moveX: number;
    moveZ: number;
    sprint: boolean;
    jump: boolean;
    switchPlayer: boolean;
    hammer: boolean;
    blade: boolean;
    thumber: boolean;
    highRelease: boolean;
    lowRelease: boolean;
    throwHeld: boolean;
    forehandHeld: boolean;
    aimX: number;
    aimY: number;
    curveDelta: number;
    timeout: boolean;
    foul: boolean;
    pause: boolean;
    accentColor?: string; // Hex color for player halo/accent
}

export interface RoomMetadata {
    room: string;
    homeName: string;
    awayName: string;
    homeScore: number;
    awayScore: number;
    phase: string;
    controllerCount: number;
    spectatorCount: number;
    lastUpdate: number;
    joinable: boolean;
}

export interface RoomListMessage {
    type: 'room_list';
    rooms: RoomMetadata[];
}

export interface ListRoomsMessage {
    type: 'list_rooms';
}

export interface HostMetadataMessage {
    type: 'host_metadata';
    metadata: Partial<RoomMetadata>;
}

export interface ControllerInputEnvelope {
    type: 'controller_input';
    state: RemoteControllerState;
    controllerId?: string;
}

export interface HostJoinMessage {
    type: 'join_host';
    room: string;
}

export interface ControllerJoinMessage {
    type: 'join_controller';
    room: string;
}

export interface PeerStateMessage {
    type: 'peer_state';
    connected: boolean;
    controllerCount?: number;
    spectatorCount?: number;
}

export interface RTCOfferMessage {
    type: 'rtc_offer';
    sdp: string;
    controllerId?: string;
}

export interface RTCAnswerMessage {
    type: 'rtc_answer';
    sdp: string;
    controllerId?: string;
}

export interface RTCIceCandidateMessage {
    type: 'rtc_ice';
    candidate: RTCIceCandidateInit;
    controllerId?: string;
}

export interface DiscState {
    pos: { x: number; y: number; z: number };
    vel: { x: number; y: number; z: number };
    state: string;
}

export interface PlayerState {
    id: string;
    pos: { x: number; z: number };
    facing: number;
    anim: string;
    animTime: number;
    holding: boolean;
    marking: boolean;
    markPct: number;
    accent: string | null;
}

export interface FullMatchState {
    timestamp: number;
    disc: DiscState;
    players: PlayerState[];
    score: [number, number];
    stall: number;
    phase: string;
    offenseTeam: string;
    statusText: string;
    statusTextActive: boolean;
    randomSeed: number;
}

export interface BroadcastStateMessage {
    type: 'broadcast_state';
    state: FullMatchState;
}

export interface SpectatorJoinMessage {
    type: 'join_spectator';
    room: string;
}

export type RelayOutboundMessage =
    | HostJoinMessage
    | ControllerJoinMessage
    | ControllerInputEnvelope
    | BroadcastStateMessage
    | SpectatorJoinMessage
    | ListRoomsMessage
    | HostMetadataMessage
    | RTCOfferMessage
    | RTCAnswerMessage
    | RTCIceCandidateMessage;

export type RelayInboundMessage =
    | PeerStateMessage
    | ControllerInputEnvelope
    | BroadcastStateMessage
    | RoomListMessage
    | RTCOfferMessage
    | RTCAnswerMessage
    | RTCIceCandidateMessage;