import * as THREE from 'three';

export interface ThrowParams {
    position: THREE.Vector3;
    direction: THREE.Vector3;
    speed: number;
    spinRate: number;
    noseAngle: number;
    hyzerAngle: number;
    releaseHeight: number;
    offAxis: number;
    isForehand: boolean;
}

export interface PlayerState {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    facing: number;
    stamina: number;
    holdingDisc: boolean;
    team: TeamSide;
    role: PlayerRole;
}

export interface MatchConfig {
    scoreTarget: number;      // 11, 13, 15, or custom
    winByTwo: boolean;        // require 2-point lead to win
    pointCap: number;         // hard cap (e.g., 17), 0 = no cap
    timedHalves: boolean;     // enable timed mode
    halfLengthMinutes: number; // minutes per half if timed
    halfAt: number;           // switch ends at this score (default: scoreTarget/2 rounded up)
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
    scoreTarget: 15,
    winByTwo: false,
    pointCap: 0,
    timedHalves: false,
    halfLengthMinutes: 24,
    halfAt: 8,
};

export type TeamSide = 'home' | 'away';
export type PlayerRole = 'handler' | 'cutter' | 'deep_cutter';
export type MatchPhase = 'pre_pull' | 'pulling' | 'live_play' | 'turnover_reset' | 'score' | 'point_reset' | 'timeout';
export type DiscLifecycle = 'held' | 'in_flight' | 'on_ground';
export type OffenseFormation = 'vertical_stack' | 'horizontal_stack' | 'hex' | 'zone_offense';
export type DefenseFormation = 'man' | 'zone_331' | 'zone_cup' | 'zone_wall' | 'surround';
