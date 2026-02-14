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

// ============================================================================
// Feature 1: Colorblind Jersey Patterns
// ============================================================================

export type JerseyPattern = 'solid' | 'stripes' | 'dots' | 'chevrons' | 'diagonal';

export interface PatternDescriptor {
    type: JerseyPattern;
    primaryColor: number;
    secondaryColor: number;  // pattern overlay color
    scale: number;  // pattern size
}

/**
 * Returns the jersey pattern assigned to a team when colorblind mode is active.
 * Team 0 (home) gets stripes, Team 1 (away) gets dots.
 *
 * @param teamIndex - 0 for home, 1 for away
 * @returns The JerseyPattern for that team
 */
export function getColorblindPattern(teamIndex: number): JerseyPattern {
    return teamIndex === 0 ? 'stripes' : 'dots';
}

/**
 * Returns the full pattern descriptor for a team, taking colorblind mode into account.
 * When colorblind mode is off, teams use solid patterns with default colors.
 * When colorblind mode is on, teams get distinct patterns plus adjusted colors.
 *
 * @param teamIndex - 0 for home, 1 for away
 * @param colorblindMode - Whether colorblind mode is active
 * @returns PatternDescriptor with type, colors, and scale
 */
export function getTeamPattern(teamIndex: number, colorblindMode: boolean): PatternDescriptor {
    if (!colorblindMode) {
        // Default: solid colors, no pattern overlay needed
        const defaultColors = applyColorBlindPalette('none');
        const primary = teamIndex === 0 ? defaultColors.teamA : defaultColors.teamB;
        return {
            type: 'solid',
            primaryColor: primary,
            secondaryColor: primary,
            scale: 1.0,
        };
    }

    // Colorblind mode: assign distinct patterns and use white/black overlays for contrast
    const pattern = getColorblindPattern(teamIndex);
    const palette = applyColorBlindPalette('deuteranopia'); // most common form
    const primary = teamIndex === 0 ? palette.teamA : palette.teamB;

    // Secondary color is a high-contrast overlay: white on dark primaries, black on light ones
    const r = (primary >> 16) & 0xFF;
    const g = (primary >> 8) & 0xFF;
    const b = primary & 0xFF;
    const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const secondaryColor = brightness < 128 ? 0xFFFFFF : 0x000000;

    return {
        type: pattern,
        primaryColor: primary,
        secondaryColor,
        scale: teamIndex === 0 ? 1.0 : 0.8,  // slightly smaller dots vs stripes
    };
}

// ============================================================================
// Feature 2: Key Remapping System
// ============================================================================

export interface KeyBindings {
    moveForward: string;
    moveBack: string;
    moveLeft: string;
    moveRight: string;
    sprint: string;
    jump: string;
    switchPlayer: string;
    quickPass: string;
    fake: string;
    timeout: string;
    foulCall: string;
    cutIn: string;
    cutOut: string;
    cutDeep: string;
    cutUnder: string;
    pause: string;
    minimap: string;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
    moveForward: 'KeyW',
    moveBack: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    sprint: 'ShiftLeft',
    jump: 'Space',
    switchPlayer: 'KeyE',
    quickPass: 'KeyQ',
    fake: 'KeyF',
    timeout: 'KeyC',
    foulCall: 'KeyV',
    cutIn: 'Digit1',
    cutOut: 'Digit2',
    cutDeep: 'Digit3',
    cutUnder: 'Digit4',
    pause: 'Escape',
    minimap: 'KeyM',
};

const KEY_BINDINGS_STORAGE_KEY = 'frisqueendom_keybindings';

/**
 * Loads key bindings from localStorage, falling back to defaults for any
 * missing keys. Returns a complete KeyBindings object.
 *
 * @returns The user's saved key bindings merged with defaults
 */
export function loadKeyBindings(): KeyBindings {
    try {
        const stored = localStorage.getItem(KEY_BINDINGS_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as Partial<KeyBindings>;
            return { ...DEFAULT_KEY_BINDINGS, ...parsed };
        }
    } catch {
        // Corrupted or unavailable localStorage — use defaults
    }
    return { ...DEFAULT_KEY_BINDINGS };
}

/**
 * Saves key bindings to localStorage.
 *
 * @param bindings - The KeyBindings to persist
 */
export function saveKeyBindings(bindings: KeyBindings): void {
    try {
        localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(bindings));
    } catch {
        // localStorage may be full or unavailable — silently fail
    }
}

/**
 * Reverse lookup: given a keyboard event code (e.g. 'KeyW'), returns the
 * action name (e.g. 'moveForward') or null if no action is bound to that code.
 *
 * @param code - The KeyboardEvent.code string
 * @param bindings - The current key bindings
 * @returns The action name, or null if unbound
 */
export function getKeyAction(code: string, bindings: KeyBindings): string | null {
    const entries = Object.entries(bindings) as [keyof KeyBindings, string][];
    for (const [action, boundCode] of entries) {
        if (boundCode === code) {
            return action;
        }
    }
    return null;
}

// ============================================================================
// Feature 3: Audio Subtitle System
// ============================================================================

export interface Subtitle {
    text: string;
    duration: number;  // seconds
    priority: 'low' | 'medium' | 'high';
    icon?: string;  // emoji or short text icon
}

// Pre-defined subtitle constants for common game audio cues
export const SUBTITLE_STALL = (count: number): Subtitle => ({
    text: count >= 10 ? `Stalling ${count}!` : `Stalling ${count}`,
    duration: 1.5,
    priority: count >= 7 ? 'high' : 'medium',
    icon: count >= 7 ? '\u23F0' : undefined,  // alarm clock emoji at high counts
});

export const SUBTITLE_UP: Subtitle = {
    text: 'Up!',
    duration: 2.0,
    priority: 'medium',
    icon: '\uD83E\uDD4F',  // flying disc emoji
};

export const SUBTITLE_WIND_GUST: Subtitle = {
    text: 'Wind gust approaching',
    duration: 3.0,
    priority: 'low',
    icon: '\uD83D\uDCA8',  // wind emoji
};

export const SUBTITLE_FOUL: Subtitle = {
    text: 'Foul!',
    duration: 3.0,
    priority: 'high',
    icon: '\u26A0\uFE0F',  // warning emoji
};

export const SUBTITLE_SCORE: Subtitle = {
    text: 'Score!',
    duration: 4.0,
    priority: 'high',
    icon: '\uD83C\uDF89',  // party popper emoji
};

const MAX_VISIBLE_SUBTITLES = 3;

export class SubtitleManager {
    private container: HTMLDivElement;
    private queue: { subtitle: Subtitle; expireTime: number }[];
    private enabled: boolean;

    constructor() {
        this.queue = [];
        this.enabled = false;
        this.container = document.createElement('div');
        this.applyContainerStyles();
        document.body.appendChild(this.container);
    }

    private applyContainerStyles(): void {
        const s = this.container.style;
        s.position = 'fixed';
        s.bottom = '8%';
        s.left = '50%';
        s.transform = 'translateX(-50%)';
        s.display = 'flex';
        s.flexDirection = 'column';
        s.alignItems = 'center';
        s.gap = '4px';
        s.pointerEvents = 'none';
        s.zIndex = '9999';
        s.maxWidth = '600px';
        s.width = '90%';
    }

    private createSubtitleElement(subtitle: Subtitle): HTMLDivElement {
        const el = document.createElement('div');
        const es = el.style;
        es.background = 'rgba(0, 0, 0, 0.75)';
        es.color = '#FFFFFF';
        es.padding = '6px 16px';
        es.borderRadius = '4px';
        es.fontSize = '14px';
        es.fontFamily = 'sans-serif';
        es.textAlign = 'center';
        es.lineHeight = '1.4';
        es.transition = 'opacity 0.3s ease';
        es.opacity = '1';
        es.whiteSpace = 'nowrap';

        if (subtitle.priority === 'high') {
            es.fontWeight = 'bold';
            es.borderLeft = '3px solid #FF4444';
        }

        const text = subtitle.icon ? `${subtitle.icon} ${subtitle.text}` : subtitle.text;
        el.textContent = text;
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', subtitle.priority === 'high' ? 'assertive' : 'polite');

        return el;
    }

    /**
     * Enable or disable subtitle display.
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.container.style.display = enabled ? 'flex' : 'none';
        if (!enabled) {
            this.clear();
        }
    }

    /**
     * Show a subtitle. Uses `performance.now() / 1000` as the current time
     * reference for computing expiry.
     */
    show(subtitle: Subtitle): void {
        if (!this.enabled) return;

        const now = performance.now() / 1000;
        const expireTime = now + subtitle.duration;

        this.queue.push({ subtitle, expireTime });

        // Enforce max visible: drop oldest low-priority items if over limit
        while (this.queue.length > MAX_VISIBLE_SUBTITLES) {
            this.queue.shift();
        }

        this.render();
    }

    /**
     * Remove expired subtitles based on current time (seconds).
     */
    update(currentTime: number): void {
        if (!this.enabled) return;

        const before = this.queue.length;
        this.queue = this.queue.filter(entry => entry.expireTime > currentTime);
        if (this.queue.length !== before) {
            this.render();
        }
    }

    /**
     * Remove all active subtitles.
     */
    clear(): void {
        this.queue = [];
        this.render();
    }

    /**
     * Remove the container from the DOM and clean up.
     */
    destroy(): void {
        this.clear();
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }

    private render(): void {
        // Clear existing children
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }

        // Render visible subtitles, newest at bottom
        for (const entry of this.queue) {
            const el = this.createSubtitleElement(entry.subtitle);
            this.container.appendChild(el);
        }
    }
}

// ============================================================================
// Feature 4: HUD Size Scaling
// ============================================================================

const HUD_SCALE_STORAGE_KEY = 'frisqueendom_hud_scale';
const HUD_SCALE_CSS_PROPERTY = '--hud-scale';
const VALID_HUD_SCALES = [0.75, 1.0, 1.25, 1.5];

/**
 * Sets the HUD scale factor. Clamps to nearest valid value (0.75, 1.0, 1.25, 1.5).
 * Stores the preference in localStorage and sets the CSS custom property on :root.
 *
 * @param scale - Desired scale factor
 */
export function setHUDScale(scale: number): void {
    // Clamp to nearest valid scale
    let closest = VALID_HUD_SCALES[0];
    let minDist = Math.abs(scale - closest);
    for (const valid of VALID_HUD_SCALES) {
        const dist = Math.abs(scale - valid);
        if (dist < minDist) {
            minDist = dist;
            closest = valid;
        }
    }

    document.documentElement.style.setProperty(HUD_SCALE_CSS_PROPERTY, String(closest));

    try {
        localStorage.setItem(HUD_SCALE_STORAGE_KEY, String(closest));
    } catch {
        // localStorage may be unavailable
    }
}

/**
 * Gets the current HUD scale factor from localStorage, defaulting to 1.0.
 *
 * @returns The current HUD scale
 */
export function getHUDScale(): number {
    try {
        const stored = localStorage.getItem(HUD_SCALE_STORAGE_KEY);
        if (stored) {
            const parsed = parseFloat(stored);
            if (!isNaN(parsed) && VALID_HUD_SCALES.includes(parsed)) {
                return parsed;
            }
        }
    } catch {
        // localStorage may be unavailable
    }
    return 1.0;
}

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
