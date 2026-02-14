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
    {
        name: "Maelstrom",
        primaryColor: 0x1B2838,  // Navy
        secondaryColor: 0xFF6B35, // Orange
        motto: "Into the Chaos",
        playStyle: 'aggressive',
        speedMod: 1.15,
        throwPowerMod: 1.1,
        catchMod: 0.9,
    },
    {
        name: "Ironworks",
        primaryColor: 0x36454F,  // Charcoal
        secondaryColor: 0xB7410E, // Rust
        motto: "Forged in Fire",
        playStyle: 'defensive',
        speedMod: 0.85,
        throwPowerMod: 0.85,
        catchMod: 1.2,
    },
    {
        name: "Coyotes",
        primaryColor: 0xC19A6B,  // Desert tan
        secondaryColor: 0x40E0D0, // Turquoise
        motto: "Howl at Dusk",
        playStyle: 'balanced',
        speedMod: 1.1,
        throwPowerMod: 0.95,
        catchMod: 1.0,
    },
    {
        name: "Valkyries",
        primaryColor: 0x71797E,  // Steel
        secondaryColor: 0xDAA520, // Gold
        motto: "Choose the Worthy",
        playStyle: 'aggressive',
        speedMod: 1.1,
        throwPowerMod: 1.15,
        catchMod: 0.85,
    },
    {
        name: "Monsoon",
        primaryColor: 0x008080,  // Dark teal
        secondaryColor: 0xC0C0C0, // Silver
        motto: "Season of Storms",
        playStyle: 'balanced',
        speedMod: 0.95,
        throwPowerMod: 1.0,
        catchMod: 1.1,
    },
    {
        name: "Firebirds",
        primaryColor: 0xB22222,  // Crimson
        secondaryColor: 0xFFD700, // Gold
        motto: "Born from Ashes",
        playStyle: 'aggressive',
        speedMod: 1.2,
        throwPowerMod: 1.05,
        catchMod: 0.85,
    },
    {
        name: "Timber",
        primaryColor: 0x228B22,  // Forest
        secondaryColor: 0xFFF8DC, // Cream
        motto: "Stand Tall",
        playStyle: 'defensive',
        speedMod: 0.85,
        throwPowerMod: 0.9,
        catchMod: 1.15,
    },
    {
        name: "Cosmos",
        primaryColor: 0x191970,  // Midnight
        secondaryColor: 0xFF00FF, // Magenta
        motto: "Beyond the Stars",
        playStyle: 'balanced',
        speedMod: 1.0,
        throwPowerMod: 1.1,
        catchMod: 0.95,
    },
    {
        name: "Undertow",
        primaryColor: 0x000080,  // Deep navy
        secondaryColor: 0x93E9BE, // Seafoam
        motto: "Pull You Under",
        playStyle: 'defensive',
        speedMod: 0.9,
        throwPowerMod: 0.85,
        catchMod: 1.2,
    },
    {
        name: "Voltage",
        primaryColor: 0xFFFF00,  // Electric yellow
        secondaryColor: 0x000000, // Black
        motto: "Maximum Charge",
        playStyle: 'aggressive',
        speedMod: 1.2,
        throwPowerMod: 1.15,
        catchMod: 0.8,
    },
    {
        name: "Granite",
        primaryColor: 0x808080,  // Gray
        secondaryColor: 0xFFFFFF, // White
        motto: "Unbreakable",
        playStyle: 'defensive',
        speedMod: 0.8,
        throwPowerMod: 0.9,
        catchMod: 1.2,
    },
    {
        name: "Mustangs",
        primaryColor: 0x8B4513,  // Brown
        secondaryColor: 0xFFEBCD, // Cream
        motto: "Run Wild",
        playStyle: 'balanced',
        speedMod: 1.15,
        throwPowerMod: 0.95,
        catchMod: 0.95,
    },
    {
        name: "Auroras",
        primaryColor: 0x50C878,  // Emerald
        secondaryColor: 0xEE82EE, // Violet
        motto: "Dance of Light",
        playStyle: 'balanced',
        speedMod: 1.0,
        throwPowerMod: 1.0,
        catchMod: 1.05,
    },
    {
        name: "Scorpions",
        primaryColor: 0x1A1A1A,  // Black
        secondaryColor: 0x39FF14, // Neon green
        motto: "Strike Silent",
        playStyle: 'aggressive',
        speedMod: 1.1,
        throwPowerMod: 1.2,
        catchMod: 0.8,
    },
    {
        name: "Kraken",
        primaryColor: 0x301934,  // Dark purple
        secondaryColor: 0x2E8B57, // Sea green
        motto: "From the Deep",
        playStyle: 'defensive',
        speedMod: 0.85,
        throwPowerMod: 0.95,
        catchMod: 1.15,
    },
    {
        name: "Bandits",
        primaryColor: 0x333333,  // Charcoal
        secondaryColor: 0xCC0000, // Red
        motto: "Take Everything",
        playStyle: 'aggressive',
        speedMod: 1.15,
        throwPowerMod: 1.1,
        catchMod: 0.85,
    },
    {
        name: "Zephyr",
        primaryColor: 0x87CEEB,  // Sky blue
        secondaryColor: 0xE6E6FA, // Lavender
        motto: "Gentle Force",
        playStyle: 'balanced',
        speedMod: 1.05,
        throwPowerMod: 0.95,
        catchMod: 1.05,
    },
    {
        name: "Rampage",
        primaryColor: 0x800000,  // Maroon
        secondaryColor: 0xC0C0C0, // Silver
        motto: "No Mercy",
        playStyle: 'aggressive',
        speedMod: 1.1,
        throwPowerMod: 1.2,
        catchMod: 0.8,
    },
    {
        name: "Sentinels",
        primaryColor: 0x003366,  // Navy
        secondaryColor: 0xFFCC00, // Gold
        motto: "Hold the Line",
        playStyle: 'defensive',
        speedMod: 0.9,
        throwPowerMod: 0.9,
        catchMod: 1.15,
    },
    {
        name: "Horizon",
        primaryColor: 0xFF6347,  // Sunset
        secondaryColor: 0x00008B, // Deep blue
        motto: "Chase the Sun",
        playStyle: 'balanced',
        speedMod: 1.05,
        throwPowerMod: 1.05,
        catchMod: 0.95,
    },
    {
        name: "Tempest",
        primaryColor: 0x2F4F4F,  // Dark slate
        secondaryColor: 0x7DF9FF, // Electric blue
        motto: "Unstoppable Force",
        playStyle: 'aggressive',
        speedMod: 1.15,
        throwPowerMod: 1.1,
        catchMod: 0.85,
    },
    {
        name: "Redwoods",
        primaryColor: 0x013220,  // Dark green
        secondaryColor: 0x654321, // Brown
        motto: "Deep Roots",
        playStyle: 'defensive',
        speedMod: 0.8,
        throwPowerMod: 0.85,
        catchMod: 1.2,
    },
];

export function getTeamPreset(name: string): TeamPreset | undefined {
    return TEAM_PRESETS.find(preset => preset.name === name);
}
