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

export type TeamSide = 'home' | 'away';
export type PlayerRole = 'handler' | 'cutter' | 'deep_cutter';
export type MatchPhase = 'pre_pull' | 'pulling' | 'live_play' | 'turnover_reset' | 'score' | 'point_reset';
export type DiscLifecycle = 'held' | 'in_flight' | 'on_ground';
export type OffenseFormation = 'vertical_stack' | 'horizontal_stack';
export type DefenseFormation = 'man' | 'zone_331';
