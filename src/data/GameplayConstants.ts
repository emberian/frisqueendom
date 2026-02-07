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

// Spirit scoring
export const SPIRIT_DEFAULTS = {
    RULES_KNOWLEDGE: 2,
    FOULS_BODY_CONTACT: 2,
    FAIR_MINDEDNESS: 2,
    POSITIVE_ATTITUDE: 2,
    COMMUNICATION: 2,
    MAX_CATEGORY_SCORE: 2,
};
