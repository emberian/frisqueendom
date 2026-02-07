export interface PlayerCosmetic {
    headShape: 'circle' | 'square' | 'triangle';
    headSize: number;      // 0.8-1.2 multiplier
    lineThickness: number; // 0.03-0.06
    hasHeadband: boolean;
    headbandColor: number;
    hasWristbands: boolean;
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
    },
    Slim: {
        headShape: 'circle',
        headSize: 0.8,
        lineThickness: 0.03,
        hasHeadband: false,
        headbandColor: 0xFFFFFF,
        hasWristbands: false,
    },
    Captain: {
        headShape: 'circle',
        headSize: 1.1,
        lineThickness: 0.05,
        hasHeadband: true,
        headbandColor: 0xFFD700,
        hasWristbands: true,
    },
    Rookie: {
        headShape: 'triangle',
        headSize: 0.9,
        lineThickness: 0.035,
        hasHeadband: false,
        headbandColor: 0xFFFFFF,
        hasWristbands: false,
    },
};

/**
 * Applies cosmetic customization to a stickman object.
 * Note: This function assumes the stickman object has properties for visual customization.
 * Actual implementation depends on the stickman rendering structure.
 *
 * @param stickman - The stickman object to customize (typically from StickmanRenderer)
 * @param cosmetic - The cosmetic configuration to apply
 */
export function applyCosmetic(stickman: any, cosmetic: PlayerCosmetic): void {
    // Apply head shape (implementation depends on stickman structure)
    if (stickman.setHeadShape) {
        stickman.setHeadShape(cosmetic.headShape);
    }

    // Apply head size
    if (stickman.setHeadSize) {
        stickman.setHeadSize(cosmetic.headSize);
    }

    // Apply line thickness
    if (stickman.setLineThickness) {
        stickman.setLineThickness(cosmetic.lineThickness);
    } else if (stickman.material && stickman.material.linewidth !== undefined) {
        stickman.material.linewidth = cosmetic.lineThickness;
    }

    // Apply headband
    if (stickman.setHeadband) {
        stickman.setHeadband(cosmetic.hasHeadband, cosmetic.headbandColor);
    }

    // Apply wristbands
    if (stickman.setWristbands) {
        stickman.setWristbands(cosmetic.hasWristbands);
    }

    // Store cosmetic data for later reference
    if (stickman.cosmetic === undefined) {
        stickman.cosmetic = {};
    }
    Object.assign(stickman.cosmetic, cosmetic);
}
