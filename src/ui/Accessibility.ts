export interface AccessibilitySettings {
    colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
    highContrast: boolean;
    reducedMotion: boolean;
    screenReaderHints: boolean;
    fontSize: 'small' | 'medium' | 'large';
    buttonSize: 'normal' | 'large';
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
    colorBlindMode: 'none',
    highContrast: false,
    reducedMotion: false,
    screenReaderHints: false,
    fontSize: 'medium',
    buttonSize: 'normal',
};

export interface ColorPalette {
    teamA: number;
    teamB: number;
    disc: number;
    field: number;
}

/**
 * Returns adjusted color palette for different types of color blindness.
 * Uses scientifically-validated color combinations for maximum distinction.
 *
 * @param mode - The type of color blindness mode
 * @returns Color palette with adjusted colors
 */
export function applyColorBlindPalette(mode: string): ColorPalette {
    switch (mode) {
        case 'protanopia':
            // Red-blind: use blue vs yellow
            return {
                teamA: 0x0077BB,   // Blue
                teamB: 0xEE7733,   // Yellow-orange
                disc: 0xFFFFFF,    // White
                field: 0x2D5016,   // Dark green
            };

        case 'deuteranopia':
            // Green-blind: use blue vs orange
            return {
                teamA: 0x0077BB,   // Blue
                teamB: 0xCC3311,   // Orange-red
                disc: 0xFFFFFF,    // White
                field: 0x4A5568,   // Gray-green
            };

        case 'tritanopia':
            // Blue-blind: use red vs cyan
            return {
                teamA: 0xEE3377,   // Red-pink
                teamB: 0x009988,   // Cyan-teal
                disc: 0xFFFFFF,    // White
                field: 0x6B7280,   // Gray
            };

        case 'none':
        default:
            // Default colors
            return {
                teamA: 0xFF3333,   // Red
                teamB: 0x3333FF,   // Blue
                disc: 0xFFFFFF,    // White
                field: 0x228B22,   // Forest green
            };
    }
}

/**
 * Calculates accessible font size based on base size and user preference.
 *
 * @param base - Base font size in pixels
 * @param setting - Font size setting ('small', 'medium', 'large')
 * @returns Adjusted font size
 */
export function getAccessibleFontSize(base: number, setting: string): number {
    switch (setting) {
        case 'small':
            return base * 0.875;  // 87.5% of base
        case 'large':
            return base * 1.25;   // 125% of base
        case 'medium':
        default:
            return base;
    }
}

/**
 * Determines if motion should be reduced based on accessibility settings.
 *
 * @param settings - Accessibility settings object
 * @returns True if motion should be reduced
 */
export function shouldReduceMotion(settings: AccessibilitySettings): boolean {
    return settings.reducedMotion;
}

/**
 * Generates accessible ARIA label text for screen readers.
 *
 * @param context - The context identifier (e.g., 'score', 'possession', 'throw')
 * @param data - Object containing relevant data for the label
 * @returns Screen reader-friendly text
 */
export function generateAriaLabel(context: string, data: Record<string, any>): string {
    switch (context) {
        case 'score':
            return `Score: Team ${data.teamA || 0} to ${data.teamB || 0}`;

        case 'possession':
            return `${data.team || 'Unknown team'} has possession`;

        case 'throw':
            return `Disc thrown with ${data.power || 0}% power at ${data.angle || 0} degrees`;

        case 'catch':
            return `${data.player || 'Player'} caught the disc`;

        case 'turnover':
            return `Turnover: ${data.reason || 'disc dropped'}`;

        case 'goal':
            return `Goal scored by ${data.team || 'team'}! Score is now ${data.scoreA || 0} to ${data.scoreB || 0}`;

        case 'gameStart':
            return `Game starting. ${data.teamA || 'Team A'} versus ${data.teamB || 'Team B'}`;

        case 'gameEnd':
            return `Game over. ${data.winner || 'Team'} wins ${data.scoreWinner || 0} to ${data.scoreLoser || 0}`;

        case 'halfTime':
            return `Half time. Score: ${data.scoreA || 0} to ${data.scoreB || 0}`;

        case 'playerSelect':
            return `Player ${data.number || 0} selected. Position: ${data.position || 'unknown'}`;

        case 'menu':
            return `${data.menuName || 'Menu'} opened. ${data.optionCount || 0} options available`;

        case 'button':
            return `${data.label || 'Button'}. ${data.description || ''}`;

        case 'windCondition':
            return `Wind: ${data.speed || 0} meters per second, ${data.direction || 'unknown'} direction`;

        default:
            return data.fallback || 'Game update';
    }
}

/**
 * Gets button size multiplier based on accessibility settings.
 *
 * @param settings - Accessibility settings object
 * @returns Size multiplier (1.0 for normal, 1.5 for large)
 */
export function getButtonSizeMultiplier(settings: AccessibilitySettings): number {
    return settings.buttonSize === 'large' ? 1.5 : 1.0;
}

/**
 * Applies high contrast adjustments to a color.
 *
 * @param color - Original color value
 * @param highContrast - Whether high contrast mode is enabled
 * @returns Adjusted color value
 */
export function applyHighContrast(color: number, highContrast: boolean): number {
    if (!highContrast) {
        return color;
    }

    // Extract RGB components
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;

    // Calculate perceived brightness (using ITU-R BT.709 coefficients)
    const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Push towards pure black or pure white
    if (brightness < 128) {
        return 0x000000;  // Black
    } else {
        return 0xFFFFFF;  // White
    }
}
