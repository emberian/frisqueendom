export type TimeOfDay = 'morning' | 'midday' | 'golden_hour' | 'sunset' | 'night';
export type WeatherCondition = 'clear' | 'overcast' | 'rain' | 'cold' | 'hot';

export interface EnvironmentConfig {
    timeOfDay: TimeOfDay;
    weather: WeatherCondition;
}

export interface SkyConfig {
    topColor: number;
    horizonColor: number;
    bottomColor: number;
    sunPosition: { x: number; y: number; z: number };
    sunIntensity: number;
    sunColor: number;
    ambientIntensity: number;
    ambientColor: number;
    fogColor: number;
    fogDensity: number;
}

export const SKY_PRESETS: Record<TimeOfDay, SkyConfig> = {
    morning: {
        topColor: 0x6baed6,
        horizonColor: 0xffd4a0,
        bottomColor: 0xf5e6c8,
        sunPosition: { x: -40, y: 15, z: 30 },
        sunIntensity: 1.0,
        sunColor: 0xffeedd,
        ambientIntensity: 0.6,
        ambientColor: 0x8090b0,
        fogColor: 0xd4c8b0,
        fogDensity: 0.004,
    },
    midday: {
        topColor: 0x4a90d9,
        horizonColor: 0x87ceeb,
        bottomColor: 0xf5e6c8,
        sunPosition: { x: 30, y: 50, z: 20 },
        sunIntensity: 1.5,
        sunColor: 0xffffff,
        ambientIntensity: 0.8,
        ambientColor: 0x404060,
        fogColor: 0x87ceeb,
        fogDensity: 0.003,
    },
    golden_hour: {
        topColor: 0x5a7ab5,
        horizonColor: 0xffb366,
        bottomColor: 0xf5c070,
        sunPosition: { x: 50, y: 12, z: -20 },
        sunIntensity: 1.2,
        sunColor: 0xffcc88,
        ambientIntensity: 0.5,
        ambientColor: 0x805530,
        fogColor: 0xdda060,
        fogDensity: 0.004,
    },
    sunset: {
        topColor: 0x2d1b69,
        horizonColor: 0xff6633,
        bottomColor: 0xcc4400,
        sunPosition: { x: 60, y: 5, z: -30 },
        sunIntensity: 0.8,
        sunColor: 0xff8844,
        ambientIntensity: 0.35,
        ambientColor: 0x553322,
        fogColor: 0xaa5533,
        fogDensity: 0.005,
    },
    night: {
        topColor: 0x0a0a2e,
        horizonColor: 0x1a1a3e,
        bottomColor: 0x0a0a1a,
        sunPosition: { x: 0, y: -10, z: 0 },
        sunIntensity: 0.0,
        sunColor: 0x000000,
        ambientIntensity: 0.15,
        ambientColor: 0x222244,
        fogColor: 0x0a0a2e,
        fogDensity: 0.006,
    },
};

export interface WeatherEffects {
    catchDifficultyMod: number; // multiplier on catch radius (rain = 0.85)
    staminaDrainMod: number; // multiplier on stamina drain (hot = 1.3)
    discGlideMod: number; // multiplier on lift (cold = 0.9)
    groundSlippery: boolean; // disc slides on ground (rain)
}

export const WEATHER_EFFECTS: Record<WeatherCondition, WeatherEffects> = {
    clear: {
        catchDifficultyMod: 1.0,
        staminaDrainMod: 1.0,
        discGlideMod: 1.0,
        groundSlippery: false,
    },
    overcast: {
        catchDifficultyMod: 1.0,
        staminaDrainMod: 1.0,
        discGlideMod: 1.0,
        groundSlippery: false,
    },
    rain: {
        catchDifficultyMod: 0.85,
        staminaDrainMod: 1.1,
        discGlideMod: 0.95,
        groundSlippery: true,
    },
    cold: {
        catchDifficultyMod: 0.95,
        staminaDrainMod: 0.85,
        discGlideMod: 0.9,
        groundSlippery: false,
    },
    hot: {
        catchDifficultyMod: 1.0,
        staminaDrainMod: 1.3,
        discGlideMod: 1.05,
        groundSlippery: false,
    },
};
