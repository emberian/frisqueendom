export interface PlayerCosmetic {
    headShape: 'circle' | 'square' | 'triangle';
    headSize: number;      // 0.8-1.2 multiplier
    lineThickness: number; // 0.03-0.06
    hasHeadband: boolean;
    headbandColor: number;
    hasWristbands: boolean;
    height?: number;       // 0.85-1.15 multiplier
}

export interface CosmeticTarget {
    setHeadShape?(shape: string): void;
    setHeadSize?(size: number): void;
    setHeadband?(enabled: boolean, color: number): void;
    setWristbands?(enabled: boolean): void;
    setHeight?(multiplier: number): void;
}

export const DEFAULT_COSMETIC: PlayerCosmetic = {
    headShape: 'circle',
    headSize: 1.0,
    lineThickness: 0.04,
    hasHeadband: false,
    headbandColor: 0xFFFFFF,
    hasWristbands: false,
};

export const COSMETIC_PRESETS: Record<string, PlayerCosmetic> = {
    Classic: {
        headShape: 'circle',
        headSize: 1.0,
        lineThickness: 0.04,
        hasHeadband: false,
        headbandColor: 0xFFFFFF,
        hasWristbands: false,
    },
    Bold: {
        headShape: 'square',
        headSize: 1.2,
        lineThickness: 0.06,
        hasHeadband: true,
        headbandColor: 0xFF0000,
        hasWristbands: true,
        height: 1.1,
    },
    Slim: {
        headShape: 'circle',
        headSize: 0.8,
        lineThickness: 0.03,
        hasHeadband: false,
        headbandColor: 0xFFFFFF,
        hasWristbands: false,
        height: 0.9,
    },
    Captain: {
        headShape: 'circle',
        headSize: 1.1,
        lineThickness: 0.05,
        hasHeadband: true,
        headbandColor: 0xFFD700,
        hasWristbands: true,
        height: 1.05,
    },
    Rookie: {
        headShape: 'triangle',
        headSize: 0.9,
        lineThickness: 0.035,
        hasHeadband: false,
        headbandColor: 0xFFFFFF,
        hasWristbands: false,
        height: 0.95,
    },
};

/**
 * Applies cosmetic customization to a stickman object.
 *
 * @param stickman - The stickman object to customize (implements CosmeticTarget)
 * @param cosmetic - The cosmetic configuration to apply
 */
export function applyCosmetic(stickman: CosmeticTarget, cosmetic: PlayerCosmetic): void {
    // Apply head shape
    if (stickman.setHeadShape) {
        stickman.setHeadShape(cosmetic.headShape);
    }

    // Apply head size
    if (stickman.setHeadSize) {
        stickman.setHeadSize(cosmetic.headSize);
    }

    // Apply headband
    if (stickman.setHeadband) {
        stickman.setHeadband(cosmetic.hasHeadband, cosmetic.headbandColor);
    }

    // Apply wristbands
    if (stickman.setWristbands) {
        stickman.setWristbands(cosmetic.hasWristbands);
    }

    // Apply height variation
    if (stickman.setHeight && cosmetic.height !== undefined) {
        stickman.setHeight(cosmetic.height);
    }
}
