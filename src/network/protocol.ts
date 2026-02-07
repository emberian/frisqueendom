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
}

export interface ControllerInputEnvelope {
    type: 'controller_input';
    state: RemoteControllerState;
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
}

export interface RTCOfferMessage {
    type: 'rtc_offer';
    sdp: string;
}

export interface RTCAnswerMessage {
    type: 'rtc_answer';
    sdp: string;
}

export interface RTCIceCandidateMessage {
    type: 'rtc_ice';
    candidate: RTCIceCandidateInit;
}

export type RelayOutboundMessage =
    | HostJoinMessage
    | ControllerJoinMessage
    | ControllerInputEnvelope
    | RTCOfferMessage
    | RTCAnswerMessage
    | RTCIceCandidateMessage;

export type RelayInboundMessage =
    | PeerStateMessage
    | ControllerInputEnvelope
    | RTCOfferMessage
    | RTCAnswerMessage
    | RTCIceCandidateMessage;
