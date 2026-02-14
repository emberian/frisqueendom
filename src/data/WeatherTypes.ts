export type TimeOfDay = 'morning' | 'midday' | 'golden_hour' | 'sunset' | 'night';
export type WeatherCondition = 'clear' | 'overcast' | 'rain' | 'cold' | 'hot';
export type Venue = 'park' | 'tournament' | 'stadium';

export interface EnvironmentConfig {
    timeOfDay: TimeOfDay;
    weather: WeatherCondition;
    venue?: Venue;
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
    hemiSkyColor: number;
    hemiGroundColor: number;
    hemiIntensity: number;
    fogColor: number;
    fogDensity: number;
    shadowBias: number;
    /** Night mode uses 4 stadium-style directional lights instead of the sun */
    useStadiumLights: boolean;
    /** Stadium light positions (4 corners above the field) */
    stadiumLights?: { x: number; y: number; z: number; intensity: number; color: number }[];
}

export const SKY_PRESETS: Record<TimeOfDay, SkyConfig> = {
    morning: {
        topColor: 0x6baed6,
        horizonColor: 0xffd4a0,
        bottomColor: 0xf5e6c8,
        sunPosition: { x: -40, y: 15, z: 30 },
        sunIntensity: 1.0,
        sunColor: 0xffeedd,       // ~3500K warm golden
        ambientIntensity: 0.6,
        ambientColor: 0x8090b0,
        hemiSkyColor: 0x88aacc,
        hemiGroundColor: 0x886644,
        hemiIntensity: 0.4,
        fogColor: 0xd4c8b0,
        fogDensity: 0.004,        // subtle mist
        shadowBias: -0.0003,
        useStadiumLights: false,
    },
    midday: {
        topColor: 0x4a90d9,
        horizonColor: 0x87ceeb,
        bottomColor: 0xf5e6c8,
        sunPosition: { x: 5, y: 80, z: 10 }, // nearly overhead (~80 deg elevation)
        sunIntensity: 1.8,
        sunColor: 0xffffff,       // harsh bright white
        ambientIntensity: 0.8,
        ambientColor: 0x404060,
        hemiSkyColor: 0x88bbee,
        hemiGroundColor: 0x446622,
        hemiIntensity: 0.5,
        fogColor: 0x87ceeb,
        fogDensity: 0.002,        // clear
        shadowBias: -0.0002,
        useStadiumLights: false,
    },
    golden_hour: {
        topColor: 0x5a7ab5,
        horizonColor: 0xffb366,
        bottomColor: 0xf5c070,
        sunPosition: { x: 50, y: 12, z: -20 }, // low ~20 deg
        sunIntensity: 1.2,
        sunColor: 0xffaa55,       // rich warm orange ~2500K
        ambientIntensity: 0.45,
        ambientColor: 0x805530,
        hemiSkyColor: 0x7799bb,
        hemiGroundColor: 0xaa7733,
        hemiIntensity: 0.35,
        fogColor: 0xdda060,
        fogDensity: 0.004,
        shadowBias: -0.0004,
        useStadiumLights: false,
    },
    sunset: {
        topColor: 0x2d1b69,
        horizonColor: 0xff6633,
        bottomColor: 0xcc4400,
        sunPosition: { x: 60, y: 5, z: -30 }, // on horizon ~5 deg
        sunIntensity: 0.8,
        sunColor: 0xff8844,       // orange silhouette
        ambientIntensity: 0.3,
        ambientColor: 0x553322,
        hemiSkyColor: 0x442266,   // purple
        hemiGroundColor: 0x663311,
        hemiIntensity: 0.25,
        fogColor: 0xaa5533,
        fogDensity: 0.005,
        shadowBias: -0.0005,
        useStadiumLights: false,
    },
    night: {
        topColor: 0x0a0a2e,
        horizonColor: 0x1a1a3e,
        bottomColor: 0x0a0a1a,
        sunPosition: { x: 0, y: -10, z: 0 },
        sunIntensity: 0.0,        // no sun
        sunColor: 0x000000,
        ambientIntensity: 0.12,
        ambientColor: 0x182244,   // slight blue tint
        hemiSkyColor: 0x111133,
        hemiGroundColor: 0x0a0a0a,
        hemiIntensity: 0.1,
        fogColor: 0x0a0a2e,
        fogDensity: 0.006,
        shadowBias: -0.0004,
        useStadiumLights: true,
        stadiumLights: [
            { x: -30, y: 40, z: -10, intensity: 1.0, color: 0xeeeeff },
            { x: 30, y: 40, z: -10, intensity: 1.0, color: 0xeeeeff },
            { x: -30, y: 40, z: 110, intensity: 1.0, color: 0xeeeeff },
            { x: 30, y: 40, z: 110, intensity: 1.0, color: 0xeeeeff },
        ],
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
