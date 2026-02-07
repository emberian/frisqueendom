export interface TeamPreset {
    name: string;
    primaryColor: number;    // hex color
    secondaryColor: number;
    motto: string;
    playStyle: 'balanced' | 'aggressive' | 'defensive';
    // Stat tendencies (0.8-1.2 multiplier)
    speedMod: number;
    throwPowerMod: number;
    catchMod: number;
}

export const TEAM_PRESETS: TeamPreset[] = [
    {
        name: "Storm",
        primaryColor: 0x1E3A8A,  // Deep blue
        secondaryColor: 0xE0E7FF, // Light blue
        motto: "Ride the Lightning",
        playStyle: 'balanced',
        speedMod: 1.0,
        throwPowerMod: 1.0,
        catchMod: 1.0,
    },
    {
        name: "Inferno",
        primaryColor: 0xDC2626,  // Bright red
        secondaryColor: 0xFEF2F2, // Light pink
        motto: "Burn Brighter",
        playStyle: 'aggressive',
        speedMod: 1.15,
        throwPowerMod: 1.2,
        catchMod: 0.85,
    },
    {
        name: "Tidal Wave",
        primaryColor: 0x0891B2,  // Cyan
        secondaryColor: 0xCFFAFE, // Light cyan
        motto: "Crash and Flow",
        playStyle: 'defensive',
        speedMod: 0.9,
        throwPowerMod: 0.85,
        catchMod: 1.15,
    },
    {
        name: "Thunderbolts",
        primaryColor: 0xFBBF24,  // Gold
        secondaryColor: 0x1F2937, // Dark gray
        motto: "Strike Fast",
        playStyle: 'aggressive',
        speedMod: 1.2,
        throwPowerMod: 1.1,
        catchMod: 0.9,
    },
    {
        name: "Night Owls",
        primaryColor: 0x4C1D95,  // Deep purple
        secondaryColor: 0xF3E8FF, // Light purple
        motto: "Silent Hunters",
        playStyle: 'defensive',
        speedMod: 0.85,
        throwPowerMod: 0.9,
        catchMod: 1.2,
    },
    {
        name: "Wildcats",
        primaryColor: 0xD97706,  // Orange
        secondaryColor: 0x1C1917, // Black
        motto: "Unleash the Beast",
        playStyle: 'aggressive',
        speedMod: 1.1,
        throwPowerMod: 1.15,
        catchMod: 0.8,
    },
    {
        name: "Cyclones",
        primaryColor: 0x059669,  // Teal
        secondaryColor: 0xECFDF5, // Light green
        motto: "Spin to Win",
        playStyle: 'balanced',
        speedMod: 1.05,
        throwPowerMod: 0.95,
        catchMod: 1.05,
    },
    {
        name: "Phoenix",
        primaryColor: 0xEF4444,  // Red-orange
        secondaryColor: 0xFEF3C7, // Light yellow
        motto: "Rise Again",
        playStyle: 'balanced',
        speedMod: 1.0,
        throwPowerMod: 1.05,
        catchMod: 0.95,
    },
    {
        name: "Glacier",
        primaryColor: 0x60A5FA,  // Ice blue
        secondaryColor: 0xF8FAFC, // Off white
        motto: "Freeze the Field",
        playStyle: 'defensive',
        speedMod: 0.8,
        throwPowerMod: 0.9,
        catchMod: 1.2,
    },
    {
        name: "Raptors",
        primaryColor: 0x7C3AED,  // Violet
        secondaryColor: 0xFDE047, // Bright yellow
        motto: "Hunt as One",
        playStyle: 'aggressive',
        speedMod: 1.15,
        throwPowerMod: 1.05,
        catchMod: 0.95,
    },
];

export function getTeamPreset(name: string): TeamPreset | undefined {
    return TEAM_PRESETS.find(preset => preset.name === name);
}
