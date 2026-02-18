// Gameplay physics and balance constants

import type { ThrowType } from '../gameplay/Throw';

export interface ThrowConfigData {
    baseSpeed: number;
    spinRate: number;
    noseAngle: number;
    hyzerDefault: number;
    upAngle: number;
    offAxis: number;
    accuracyMod: number;
}

export const THROW_CONFIGS: Record<ThrowType, ThrowConfigData> = {
    backhand: {
        baseSpeed: 25,
        spinRate: 80,
        noseAngle: 0.02,
        hyzerDefault: 0,
        upAngle: 0.08,
        offAxis: 0,
        accuracyMod: 1.0,
    },
    forehand: {
        baseSpeed: 28,
        spinRate: 100,
        noseAngle: 0.02,
        hyzerDefault: 0,
        upAngle: 0.08,
        offAxis: 0,
        accuracyMod: 1.0,
    },
    hammer: {
        baseSpeed: 22,
        spinRate: 90,
        noseAngle: 0.3,
        hyzerDefault: 0,
        upAngle: 0.5,
        offAxis: 0,
        accuracyMod: 0.85,
    },
    scoober: {
        baseSpeed: 20,
        spinRate: 85,
        noseAngle: -0.2,
        hyzerDefault: 0,
        upAngle: 0.4,
        offAxis: 0,
        accuracyMod: 0.8,
    },
    thumber: {
        baseSpeed: 18,
        spinRate: 60,
        noseAngle: 0.4,
        hyzerDefault: 0,
        upAngle: 0.35,
        offAxis: 0,
        accuracyMod: 0.75,
    },
    blade: {
        baseSpeed: 30,
        spinRate: 40,
        noseAngle: 1.4,
        hyzerDefault: 0,
        upAngle: -0.1,
        offAxis: 0,
        accuracyMod: 0.7,
    },
};

// Power curve for throw charging
export function calculateThrowPower(holdTime: number): number {
    if (holdTime < 0.45) return (holdTime / 0.45) * 0.3;
    if (holdTime < 0.75) return 0.3 + ((holdTime - 0.45) / 0.3) * 0.3;
    if (holdTime < 1.2) return 0.6 + ((holdTime - 0.75) / 0.45) * 0.3;
    if (holdTime < 1.5) return 0.9 + ((holdTime - 1.2) / 0.3) * 0.1;
    if (holdTime < 1.8) return 1.0 - ((holdTime - 1.5) / 0.3) * 0.05;
    return 0.85;
}

/** Arcade power curve: wide sweet spot, forgiving timing, no penalty for overcharging. */
export function calculateArcadeThrowPower(holdTime: number): number {
    if (holdTime < 0.25) return 0.50 + (holdTime / 0.25) * 0.15;            // 50-65%
    if (holdTime < 1.2)  return 0.65 + ((holdTime - 0.25) / 0.95) * 0.25;   // 65-90%
    if (holdTime < 1.8)  return 0.90 + ((holdTime - 1.2) / 0.6) * 0.10;     // 90-100%
    return 0.95;                                                              // plateau
}

// Player stat modifiers
export const STAT_MODIFIERS = {
    // Catch radius
    BASE_CATCH_RADIUS: 0.8,
    HEIGHT_CATCH_MODIFIER: 500, // divisor for height stat
    
    // Layout radius
    BASE_LAYOUT_RADIUS: 2.5,
    JUMPING_LAYOUT_MODIFIER: 100, // divisor for jumping stat
    
    // Movement
    SPEED_STAT_REFERENCE: 50, // stat value that gives 1.0x modifier
    ACCELERATION_STAT_REFERENCE: 50,
    SPRINT_SPEED_MULTIPLIER: 1.5,
    
    // Stat effects
    FORM_RANGE: 20, // +/- max form effect
    FATIGUE_PENALTY_MAX: 0.25, // max 25% reduction at 50 fatigue
    MORALE_BOOST_START: 50, // morale above this gives boost
    MORALE_BOOST_DIVISOR: 500, // divisor for morale boost calc
};

// Quick release window (ms)
export const QUICK_RELEASE_WINDOW = 500;

// Foul detection
export const FOUL_CONSTANTS = {
    CONTACT_DISTANCE_THRESHOLD: 0.5, // meters
    FOUL_COOLDOWN_MS: 5000,
    BASE_FOUL_CALL_CHANCE: 0.01,
    SPIRIT_FOUL_MODIFIER: 0.02,
};

// Animation timing
export const ANIMATION_TIMINGS = {
    LAYOUT_DURATION: 0.5, // seconds
    CELEBRATION_DURATION: 3,
    FRUSTRATION_DURATION: 2,
    THROW_ANIMATION_DURATION: 0.5,
};

// ----- AI Strategy Constants -----

// Horizontal stack lane spacing
export const HSTACK_LANE_COUNT = 4;
export const HSTACK_DEPTH_OFFSET = 15; // meters downfield from disc
export const HSTACK_LANE_WIDTH_FACTOR = 0.6; // fraction of half-field width per lane edge

// Zone 3-3-1 geometry
export const ZONE_CUP_DEPTH = 3; // meters ahead of disc
export const ZONE_CUP_WING_SPREAD = 3; // lateral offset for cup wings
export const ZONE_MID_DEPTH = 12; // mids depth ahead of disc
export const ZONE_MID_SPREAD_FACTOR = 0.45; // fraction of half-field for outer mids
export const ZONE_DEEP_DEPTH = 25; // deep safety depth ahead of disc
export const ZONE_SHIFT_X_WEIGHT = 0.4; // how much cup/mids track disc lateral position
export const ZONE_SHIFT_Z_WEIGHT = 0.2; // how much cup/mids track disc depth

// Zone offense
export const ZONE_OFFENSE_SWING_THRESHOLD = 4; // seconds before swinging
export const ZONE_OFFENSE_POPPER_DEPTH = 8; // meters downfield for popper
export const ZONE_OFFENSE_WING_SPREAD = 0.42; // fraction of half-field for wing stretch
export const ZONE_OFFENSE_CRASH_OPENNESS = 1.4; // openness threshold to crash

// AI Difficulty Scaling
export const AI_DIFFICULTY_PROFILES = {
    // For "Rookie" difficulty (easy): opponents are bad, teammates are smart
    rookie_opponent: {
        reactionDelay: 0.22,
        throwAccuracyVariance: 0.14,
        readQuality: 0.35,
        poachAggression: 0.06,
        decisionThreshold: 0.15,
        dropChance: 0.0,
        missOpenChance: 0.0,
    },
    rookie_teammate: {
        reactionDelay: 0.06,
        throwAccuracyVariance: 0.02,
        readQuality: 0.9,
        poachAggression: 0.18,
        decisionThreshold: 0.04,
        dropChance: 0.0,
        missOpenChance: 0.0,
    },
    // For "Pro" difficulty (normal): both sides competent
    pro: {
        reactionDelay: 0.10,
        throwAccuracyVariance: 0.05,
        readQuality: 0.65,
        poachAggression: 0.14,
        decisionThreshold: 0.08,
        dropChance: 0.0,
        missOpenChance: 0.0,
    },
    // For "Legend" difficulty (hard): teammates make mistakes, opponents are elite
    legend_opponent: {
        reactionDelay: 0.04,
        throwAccuracyVariance: 0.01,
        readQuality: 0.95,
        poachAggression: 0.32,
        decisionThreshold: 0.02,
        dropChance: 0.0,
        missOpenChance: 0.0,
    },
    legend_teammate: {
        reactionDelay: 0.14,
        throwAccuracyVariance: 0.08,
        readQuality: 0.5,
        poachAggression: 0.10,
        decisionThreshold: 0.12,
        dropChance: 0.04,
        missOpenChance: 0.06,
    },
};

// AI Personality Archetypes
export type AIArchetype = 'captain' | 'gunslinger' | 'grinder' | 'athlete' | 'rookie_player' | 'veteran';

export interface ArchetypeProfile {
    aggression: number; // 0-1
    disc_iq: number; // 0-1
    discipline: number; // 0-1
    throwBias: number; // positive = favor risky throws, negative = favor safe
    cutTimingVariance: number; // higher = more inconsistent cuts
    decisionSpeedMult: number; // multiplier on decision interval
}

export const ARCHETYPE_PROFILES: Record<AIArchetype, ArchetypeProfile> = {
    captain: {
        aggression: 0.5,
        disc_iq: 0.9,
        discipline: 0.8,
        throwBias: -0.05,
        cutTimingVariance: 0.06,
        decisionSpeedMult: 0.92,
    },
    gunslinger: {
        aggression: 0.9,
        disc_iq: 0.5,
        discipline: 0.3,
        throwBias: 0.25,
        cutTimingVariance: 0.12,
        decisionSpeedMult: 0.80,
    },
    grinder: {
        aggression: 0.3,
        disc_iq: 0.7,
        discipline: 0.95,
        throwBias: -0.15,
        cutTimingVariance: 0.04,
        decisionSpeedMult: 1.05,
    },
    athlete: {
        aggression: 0.75,
        disc_iq: 0.35,
        discipline: 0.5,
        throwBias: 0.10,
        cutTimingVariance: 0.14,
        decisionSpeedMult: 0.85,
    },
    rookie_player: {
        aggression: 0.5,
        disc_iq: 0.3,
        discipline: 0.3,
        throwBias: 0.05,
        cutTimingVariance: 0.20,
        decisionSpeedMult: 1.15,
    },
    veteran: {
        aggression: 0.5,
        disc_iq: 0.92,
        discipline: 0.82,
        throwBias: -0.08,
        cutTimingVariance: 0.03,
        decisionSpeedMult: 0.95,
    },
};

// Spirit scoring
export const SPIRIT_DEFAULTS = {
    RULES_KNOWLEDGE: 2,
    FOULS_BODY_CONTACT: 2,
    FAIR_MINDEDNESS: 2,
    POSITIVE_ATTITUDE: 2,
    COMMUNICATION: 2,
    MAX_CATEGORY_SCORE: 2,
};
