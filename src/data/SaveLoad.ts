// Save/Load system using localStorage

import { PlayerStats, generatePlayer, generateRoster } from './PlayerStats';
import type { PlayerAttributes } from './PlayerStats';
import { CAREER_CONSTANTS } from './CareerConstants';
import { Random } from './SeededRandom';
import { TEAM_PRESETS } from './TeamPresets';

const SAVE_KEY = 'frisqueendom_save_v1';
const SETTINGS_KEY = 'frisqueendom_settings_v1';
const REPLAY_KEY_PREFIX = 'frisqueendom_replay_';

const SAVE_SCHEMA_VERSION = 2; // Bump from implicit v1

export interface TeamData {
    id: string;
    name: string;
    shortName: string;
    primaryColor: number;
    secondaryColor: number;
    roster: PlayerStats[];
    startingLineupIds: string[];
    offenseLineupIds: string[];
    defenseLineupIds: string[];
    playbookId: string;
    stats: TeamSeasonStats;
}

export interface TeamSeasonStats {
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    spiritScore: number;
    tournamentWins: number;
}

export interface PlaybookData {
    id: string;
    name: string;
    formations: Formation[];
    plays: Play[];
}

export interface Formation {
    id: string;
    name: string;
    positions: PositionAssignment[];
}

export interface PositionAssignment {
    role: 'handler' | 'cutter';
    x: number;
    z: number;
}

export interface Play {
    id: string;
    name: string;
    formationId: string;
    cuts: CutInstruction[];
}

export interface CutInstruction {
    playerRole: 'handler' | 'cutter';
    timing: number; // seconds after disc movement
    startX: number;
    startZ: number;
    endX: number;
    endZ: number;
    priority: number;
}

export interface MatchResult {
    id: string;
    date: number;
    opponentTeamId?: string;
    opponentName: string;
    opponentRating: number;
    playerScore: number;
    opponentScore: number;
    playerSpirit: number;
    opponentSpirit: number;
    stats: MatchPlayerStats[];
    highlights: PlayHighlight[];
}

export interface MatchPlayerStats {
    playerId: string;
    goals: number;
    assists: number;
    blocks: number;
    throwaways: number;
    drops: number;
    completions: number;
    attempts: number;
    plusMinus: number;
    playingTime: number; // seconds
}

export interface PlayHighlight {
    type: 'goal' | 'block' | 'layout_catch' | 'layout_d' | 'huck' | 'callahan';
    playerId: string;
    timestamp: number; // game time in seconds
    description: string;
}

export interface TournamentData {
    id: string;
    name: string;
    tier: 'local' | 'regional' | 'national' | 'elite';
    teams: string[]; // team IDs
    schedule: TournamentMatch[];
    completed: boolean;
    champion?: string;
}

export interface TournamentMatch {
    round: number;
    teamA: string;
    teamB: string;
    scoreA?: number;
    scoreB?: number;
    completed: boolean;
}

export type CareerDifficulty = 'easy' | 'normal' | 'hard';
export type CareerModeVariant = 'club' | 'college';
export type SeasonPhase = 'offseason' | 'preseason' | 'regular' | 'postseason';
export type TeamCultureTrait = 'competitive' | 'spirited' | 'athletic' | 'cerebral' | 'clutch';

export type HomeRegion =
    | 'Northeast'
    | 'Southeast'
    | 'Midwest'
    | 'Southwest'
    | 'West';

export interface CareerOpponentData {
    teamId: string;
    teamName: string;
    rating: number;
    primaryColor: number;
    secondaryColor: number;
    difficulty: CareerDifficulty;
}

export interface TeamCulture {
    competitive: number;
    spirited: number;
    athletic: number;
    cerebral: number;
    clutch: number;
}

export type TryoutDrill = 'sprint' | 'throwing' | 'cutting' | 'scrimmage';
export type RecruitPersonality =
    | 'team_first'
    | 'showboat'
    | 'grinder'
    | 'analyst'
    | 'wildcard';

export interface RecruitCandidate {
    id: string;
    name: string;
    age: number;
    experience: number;
    potential: number;
    personality: RecruitPersonality;
    knownStats: Partial<PlayerAttributes>;
    hiddenStats: Partial<PlayerAttributes>;
    teamPreference: number;
    salaryExpectation: number;
    otherOfferCount: number;
    drillsCompleted: TryoutDrill[];
}

export interface TryoutState {
    id: string;
    season: number;
    week: number;
    announcementPosted: boolean;
    candidates: RecruitCandidate[];
    drillsRun: TryoutDrill[];
    offersMade: string[];
    completed: boolean;
}

export interface ScoutingReport {
    id: string;
    season: number;
    week: number;
    teamId: string;
    teamName: string;
    strengths: string[];
    weaknesses: string[];
    tendencies: string[];
    keyPlayers: string[];
    confidence: number;
    recommendedFormationId?: string;
    recommendedDefense?: 'man' | 'zone_331';
    recommendedPracticeFocus?: 'offense' | 'defense' | 'conditioning' | 'throws';
    gamePlan?: string;
}

export interface SimulationResult {
    homeScore: number;
    awayScore: number;
    pointLog: { scorer: string; assister: string; team: 'home' | 'away' }[];
    highlights: { description: string; player: string; type: string }[];
    stats: { playerId: string; goals: number; assists: number; blocks: number; turnovers: number }[];
    spiritScores: [number, number];
    mvp: string;
}

export interface ScoutReport {
    teamName: string;
    overallRating: number;
    offenseStyle: string;
    defenseStyle: string;
    keyPlayers: { name: string; role: string; rating: number }[];
    weaknesses: string[];
}

export type CultureEvent =
    | { type: 'win_vs_higher'; opponentRating: number; playerRating: number }
    | { type: 'spirit_award' }
    | { type: 'hard_practice' }
    | { type: 'complex_playbook' }
    | { type: 'close_game_win'; pointDiff: number };

export interface CultureBonuses {
    closeGameStatsBonus: number;
    recruitingAppealBonus: number;
    physicalStatsBonus: number;
    aiDecisionBonus: number;
    clutchComposureBonus: number;
}

export interface SpiritIncident {
    id: string;
    season: number;
    week: number;
    severity: 'positive' | 'negative';
    description: string;
    delta: number;
}

export interface CareerAward {
    id: string;
    season: number;
    week: number;
    title: string;
    description: string;
}

export interface CareerMilestone {
    id: string;
    title: string;
    description: string;
    reward: string;
    target: number;
    progress: number;
    completed: boolean;
    completedAtSeason?: number;
}

export interface MentorshipPair {
    mentorId: string;
    menteeId: string;
    startedSeason: number;
    startedWeek: number;
    sessions: number;
}

export interface CareerData {
    playerName: string;
    teamName: string;
    mode: CareerModeVariant;
    difficulty: CareerDifficulty;
    homeRegion: HomeRegion;
    division: number;
    careerSlot: number;
    currentDate: Date;
    season: number;
    week: number;
    seasonPhase: SeasonPhase;
    collegeYear: number;
    team: TeamData;
    captainIds: string[];
    chemistry: Record<string, number>;
    culture: TeamCulture;
    spiritHistory: number[];
    spiritIncidents: SpiritIncident[];
    awards: CareerAward[];
    milestones: CareerMilestone[];
    prestigeLevel: number;
    nationalsTitles: number;
    unlockedGameplay: string[];
    scoutingReports: ScoutingReport[];
    mentorships: MentorshipPair[];
    activeTryout: TryoutState | null;
    playbook: PlaybookData;
    activeFormationId: string;
    activePlayId: string | null;
    schedule: SeasonEvent[];
    matchHistory: MatchResult[];
    standings: LeagueStanding[];
    finances: TeamFinances;
    reputation: TeamReputation;
}

export type SeasonEvent =
    | {
          id: string;
          type: 'tournament';
          title: string;
          phase: SeasonPhase;
          tournamentId: string;
          tier: 'local' | 'regional' | 'national' | 'elite';
          opponent: CareerOpponentData;
          date: number;
      }
    | {
          id: string;
          type: 'practice';
          title: string;
          phase: SeasonPhase;
          focus: 'offense' | 'defense' | 'conditioning' | 'throws';
          date: number;
      }
    | {
          id: string;
          type: 'rest';
          title: string;
          phase: SeasonPhase;
          date: number;
      }
    | {
          id: string;
          type: 'tryout';
          title: string;
          phase: SeasonPhase;
          stage: 'announce' | 'drill' | 'offers';
          date: number;
      }
    | {
          id: string;
          type: 'scouting';
          title: string;
          phase: SeasonPhase;
          targetTeamId?: string;
          date: number;
      }
    | {
          id: string;
          type: 'bonding';
          title: string;
          phase: SeasonPhase;
          effect: 'morale' | 'culture' | 'spirit';
          date: number;
      };

export interface LeagueStanding {
    teamId: string;
    teamName: string;
    wins: number;
    losses: number;
    pointDiff: number;
    spirit: number;
    rating: number;
    primaryColor: number;
    secondaryColor: number;
}

export interface BudgetLineItem {
    source: string;
    amount: number;
}

export interface TeamFinances {
    budget: number;
    playerSalaries: number;
    tournamentFees: number;
    travelCosts: number;
    revenue: number;
    income: BudgetLineItem[];
    expenses: BudgetLineItem[];
}

export interface TeamReputation {
    overall: number;
    skill: number;
    spirit: number;
    fanSupport: number;
    recruitmentAppeal: number;
}

export interface GameSettings {
    audio: {
        masterVolume: number;
        musicVolume: number;
        sfxVolume: number;
        ambientVolume: number;
    };
    graphics: {
        quality: 'low' | 'medium' | 'high';
        grassDensity: number;
        shadows: boolean;
        particles: boolean;
        vsync: boolean;
    };
    gameplay: {
        cameraShake: boolean;
        screenShake: boolean;
        slowMotionReplays: boolean;
        autoSwitchOnCatch: boolean;
        showTrajectory: boolean;
        stallWarnings: boolean;
    };
    controls: {
        mouseSensitivity: number;
        invertY: boolean;
        keyBindings: Record<string, string>;
    };
    accessibility: {
        colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
        highContrast: boolean;
        largeText: boolean;
        uiScale: number;
        reducedMotion: boolean;
    };
}

// ---------------------------------------------------------------------------
// New v2 types
// ---------------------------------------------------------------------------

export interface ChallengeProgressEntry {
    bestMedal: 'none' | 'bronze' | 'silver' | 'gold' | 'diamond';
    bestScore: number;
    attempts: number;
    lastAttempt: number; // timestamp
}

export interface RivalryEntry {
    teamId: string;
    teamName: string;
    wins: number;
    losses: number;
    lastPlayed: number; // timestamp
}

export interface SaveData {
    version: number;
    schemaVersion: number;
    lastSaved: number;
    career: CareerData | null;
    careers: Array<CareerData | null>;
    activeCareerSlot: number;
    quickMatchUnlocked: boolean;
    tutorialCompleted: boolean;
    achievements: string[];
    stats: GlobalStats;
    progression: ProgressionData;
    settings: GameSettings;
    challengeProgress: Record<string, ChallengeProgressEntry>;
    rivalries: RivalryEntry[];
}

export interface GlobalStats {
    totalGamesPlayed: number;
    totalPointsScored: number;
    careerGoals: number;
    careerAssists: number;
    careerBlocks: number;
    careerTurnovers: number;
    careerCompletions: number;
    careerAttempts: number;
    layoutCatches: number;
    skyWins: number;
    totalThrowDistanceMeters: number;
    totalPointsPlayed: number;
    totalWins: number;
    totalLosses: number;
    totalSpiritScore: number;
    bestHuckDistance: number;
    fastestScore: number;
    longestGame: number;
}

export type DailyChallengeMetric =
    | 'team_goals'
    | 'team_blocks'
    | 'team_completions'
    | 'no_stall_turnovers'
    | 'win_match';

export interface DailyChallengeState {
    id: string;
    title: string;
    description: string;
    metric: DailyChallengeMetric;
    target: number;
    progress: number;
    rewardXp: number;
    completed: boolean;
}

export interface ProgressionData {
    level: number;
    experience: number;
    unlockedCosmetics: string[];
    equippedCosmetics: Record<string, string>;
    dailyChallengeDate: string;
    dailyChallenges: DailyChallengeState[];
}

// Default settings
export function getDefaultSettings(): GameSettings {
    return {
        audio: {
            masterVolume: 0.8,
            musicVolume: 0.6,
            sfxVolume: 0.9,
            ambientVolume: 0.7,
        },
        graphics: {
            quality: 'medium',
            grassDensity: 20000,
            shadows: true,
            particles: true,
            vsync: true,
        },
        gameplay: {
            cameraShake: true,
            screenShake: true,
            slowMotionReplays: true,
            autoSwitchOnCatch: true,
            showTrajectory: true,
            stallWarnings: true,
        },
        controls: {
            mouseSensitivity: 1.0,
            invertY: false,
            keyBindings: {
                moveForward: 'KeyW',
                moveBack: 'KeyS',
                moveLeft: 'KeyA',
                moveRight: 'KeyD',
                sprint: 'ShiftLeft',
                switchPlayer: 'Space',
                pause: 'Escape',
                callTimeout: 'KeyT',
                callFoul: 'KeyF',
            },
        },
        accessibility: {
            colorBlindMode: 'none',
            highContrast: false,
            largeText: false,
            uiScale: 1.3,
            reducedMotion: false,
        },
    };
}

function clampUiScale(value: number): number {
    if (!Number.isFinite(value)) return 1.3;
    return Math.max(1.0, Math.min(2.0, value));
}

function mergeSettings(
    base: GameSettings,
    incoming: Partial<GameSettings> | null | undefined,
): GameSettings {
    const parsed = incoming || {};
    const merged: GameSettings = {
        ...base,
        ...parsed,
        audio: { ...base.audio, ...(parsed.audio || {}) },
        graphics: { ...base.graphics, ...(parsed.graphics || {}) },
        gameplay: { ...base.gameplay, ...(parsed.gameplay || {}) },
        controls: {
            ...base.controls,
            ...(parsed.controls || {}),
            keyBindings: {
                ...base.controls.keyBindings,
                ...((parsed.controls && parsed.controls.keyBindings) || {}),
            },
        },
        accessibility: {
            ...base.accessibility,
            ...(parsed.accessibility || {}),
            uiScale: clampUiScale(
                parsed.accessibility?.uiScale ??
                    (parsed.accessibility?.largeText ? 1.35 : base.accessibility.uiScale),
            ),
        },
    };
    merged.accessibility.largeText = merged.accessibility.uiScale >= 1.2;
    return merged;
}

export function getDefaultProgressionData(): ProgressionData {
    return {
        level: 1,
        experience: 0,
        unlockedCosmetics: [],
        equippedCosmetics: {},
        dailyChallengeDate: '',
        dailyChallenges: [],
    };
}

// ---------------------------------------------------------------------------
// Defaults generator
// ---------------------------------------------------------------------------

export function createDefaultSaveData(): SaveData {
    return {
        version: 1,
        schemaVersion: SAVE_SCHEMA_VERSION,
        lastSaved: Date.now(),
        career: null,
        careers: [null, null, null],
        activeCareerSlot: 0,
        quickMatchUnlocked: false,
        tutorialCompleted: false,
        achievements: [],
        stats: {
            totalGamesPlayed: 0,
            totalPointsScored: 0,
            careerGoals: 0,
            careerAssists: 0,
            careerBlocks: 0,
            careerTurnovers: 0,
            careerCompletions: 0,
            careerAttempts: 0,
            layoutCatches: 0,
            skyWins: 0,
            totalThrowDistanceMeters: 0,
            totalPointsPlayed: 0,
            totalWins: 0,
            totalLosses: 0,
            totalSpiritScore: 0,
            bestHuckDistance: 0,
            fastestScore: 0,
            longestGame: 0,
        },
        progression: getDefaultProgressionData(),
        settings: getDefaultSettings(),
        challengeProgress: {},
        rivalries: [],
    };
}

// ---------------------------------------------------------------------------
// Settings validation
// ---------------------------------------------------------------------------

function clampVolume(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.8;
    return Math.max(0, Math.min(1, n));
}

const VALID_QUALITY_VALUES = new Set<string>(['low', 'medium', 'high']);
const VALID_COLORBLIND_MODES = new Set<string>(['none', 'protanopia', 'deuteranopia', 'tritanopia']);

export function validateSettings(raw: Partial<GameSettings> | null | undefined): GameSettings {
    const defaults = getDefaultSettings();
    if (!raw || typeof raw !== 'object') return defaults;

    const merged = mergeSettings(defaults, raw);

    // Clamp audio volumes to [0, 1]
    merged.audio.masterVolume = clampVolume(merged.audio.masterVolume);
    merged.audio.musicVolume = clampVolume(merged.audio.musicVolume);
    merged.audio.sfxVolume = clampVolume(merged.audio.sfxVolume);
    merged.audio.ambientVolume = clampVolume(merged.audio.ambientVolume);

    // Validate quality enum
    if (!VALID_QUALITY_VALUES.has(merged.graphics.quality)) {
        merged.graphics.quality = defaults.graphics.quality;
    }

    // Clamp grass density to a sane range
    if (!Number.isFinite(merged.graphics.grassDensity) || merged.graphics.grassDensity < 0) {
        merged.graphics.grassDensity = defaults.graphics.grassDensity;
    }
    merged.graphics.grassDensity = Math.max(0, Math.min(100000, merged.graphics.grassDensity));

    // Ensure booleans
    merged.graphics.shadows = !!merged.graphics.shadows;
    merged.graphics.particles = !!merged.graphics.particles;
    merged.graphics.vsync = !!merged.graphics.vsync;

    // Gameplay booleans
    merged.gameplay.cameraShake = !!merged.gameplay.cameraShake;
    merged.gameplay.screenShake = !!merged.gameplay.screenShake;
    merged.gameplay.slowMotionReplays = !!merged.gameplay.slowMotionReplays;
    merged.gameplay.autoSwitchOnCatch = !!merged.gameplay.autoSwitchOnCatch;
    merged.gameplay.showTrajectory = !!merged.gameplay.showTrajectory;
    merged.gameplay.stallWarnings = !!merged.gameplay.stallWarnings;

    // Controls
    const sensitivity = Number(merged.controls.mouseSensitivity);
    merged.controls.mouseSensitivity = Number.isFinite(sensitivity)
        ? Math.max(0.1, Math.min(5.0, sensitivity))
        : defaults.controls.mouseSensitivity;
    merged.controls.invertY = !!merged.controls.invertY;

    // Accessibility
    if (!VALID_COLORBLIND_MODES.has(merged.accessibility.colorBlindMode)) {
        merged.accessibility.colorBlindMode = defaults.accessibility.colorBlindMode;
    }
    merged.accessibility.highContrast = !!merged.accessibility.highContrast;
    merged.accessibility.largeText = !!merged.accessibility.largeText;
    merged.accessibility.uiScale = clampUiScale(merged.accessibility.uiScale);
    merged.accessibility.reducedMotion = !!merged.accessibility.reducedMotion;

    return merged;
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

function migrateV1toV2(data: Record<string, unknown>): Record<string, unknown> {
    // Add new v2 fields with defaults
    if (!data.challengeProgress || typeof data.challengeProgress !== 'object') {
        data.challengeProgress = {};
    }
    if (!Array.isArray(data.rivalries)) {
        data.rivalries = [];
    }
    if (!data.settings || typeof data.settings !== 'object') {
        data.settings = getDefaultSettings();
    }
    data.schemaVersion = 2;
    return data;
}

/**
 * Migrate raw save data from any older schemaVersion to the latest.
 * Designed as a chain: v1 -> v2 -> v3 -> ... (extend by adding cases).
 */
export function migrateSaveData(data: Record<string, unknown>): Record<string, unknown> {
    let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1;

    if (version < 2) {
        migrateV1toV2(data);
        version = 2;
    }

    // Future migrations go here:
    // if (version < 3) { migrateV2toV3(data); version = 3; }

    data.schemaVersion = SAVE_SCHEMA_VERSION;
    return data;
}

// ---------------------------------------------------------------------------
// Save data validation
// ---------------------------------------------------------------------------

/**
 * Deep-merge defaults into a partial save object, returning a fully valid
 * SaveData. Returns null if the raw data is fundamentally unusable (e.g.
 * not an object at all).
 */
export function validateSaveData(raw: unknown): SaveData | null {
    if (!raw || typeof raw !== 'object') return null;

    const data = raw as Record<string, unknown>;

    // If it doesn't look like a save at all, bail out
    if (typeof data.lastSaved !== 'number' && typeof data.version !== 'number') {
        return null;
    }

    const defaults = createDefaultSaveData();

    // Run migration first so new fields exist
    if (typeof data.schemaVersion !== 'number' || data.schemaVersion < SAVE_SCHEMA_VERSION) {
        migrateSaveData(data);
    }

    // Deep-merge each section against defaults
    const result: SaveData = {
        version: typeof data.version === 'number' ? data.version : defaults.version,
        schemaVersion: SAVE_SCHEMA_VERSION,
        lastSaved: typeof data.lastSaved === 'number' ? data.lastSaved : defaults.lastSaved,
        career: (data.career as CareerData | null) ?? defaults.career,
        careers: Array.isArray(data.careers)
            ? (data.careers as Array<CareerData | null>)
            : defaults.careers,
        activeCareerSlot: typeof data.activeCareerSlot === 'number'
            ? Math.max(0, Math.min(2, Math.floor(data.activeCareerSlot)))
            : defaults.activeCareerSlot,
        quickMatchUnlocked: typeof data.quickMatchUnlocked === 'boolean'
            ? data.quickMatchUnlocked
            : defaults.quickMatchUnlocked,
        tutorialCompleted: typeof data.tutorialCompleted === 'boolean'
            ? data.tutorialCompleted
            : defaults.tutorialCompleted,
        achievements: Array.isArray(data.achievements)
            ? (data.achievements as string[])
            : defaults.achievements,
        stats: data.stats && typeof data.stats === 'object'
            ? { ...defaults.stats, ...(data.stats as Partial<GlobalStats>) }
            : defaults.stats,
        progression: data.progression && typeof data.progression === 'object'
            ? {
                  ...defaults.progression,
                  ...(data.progression as Partial<ProgressionData>),
                  unlockedCosmetics: Array.isArray((data.progression as ProgressionData).unlockedCosmetics)
                      ? (data.progression as ProgressionData).unlockedCosmetics
                      : defaults.progression.unlockedCosmetics,
                  dailyChallenges: Array.isArray((data.progression as ProgressionData).dailyChallenges)
                      ? (data.progression as ProgressionData).dailyChallenges
                      : defaults.progression.dailyChallenges,
                  equippedCosmetics: (data.progression as ProgressionData).equippedCosmetics || defaults.progression.equippedCosmetics,
              }
            : defaults.progression,
        settings: data.settings && typeof data.settings === 'object'
            ? validateSettings(data.settings as Partial<GameSettings>)
            : defaults.settings,
        challengeProgress: data.challengeProgress && typeof data.challengeProgress === 'object'
            ? (data.challengeProgress as Record<string, ChallengeProgressEntry>)
            : defaults.challengeProgress,
        rivalries: Array.isArray(data.rivalries)
            ? (data.rivalries as RivalryEntry[])
            : defaults.rivalries,
    };

    return result;
}

// Save manager class
export class SaveManager {
    private static instance: SaveManager;
    private cache: SaveData | null = null;
    private settings: GameSettings;

    private constructor() {
        this.settings = this.loadSettings();
    }

    static getInstance(): SaveManager {
        if (!SaveManager.instance) {
            SaveManager.instance = new SaveManager();
        }
        return SaveManager.instance;
    }

    // Check if save exists
    hasSave(): boolean {
        return localStorage.getItem(SAVE_KEY) !== null;
    }

    // Load save data
    load(): SaveData | null {
        if (this.cache) return this.cache;

        const data = localStorage.getItem(SAVE_KEY);
        if (!data) return null;

        try {
            const parsed = JSON.parse(data);

            // Validate structure; returns null if fundamentally corrupt
            const validated = validateSaveData(parsed);
            if (!validated) {
                console.warn('Save data failed validation, returning defaults');
                const defaults = createDefaultSaveData();
                this.cache = defaults;
                return this.cache;
            }

            // Run legacy migration (lineup ids, careers array, etc.)
            this.cache = this.migrateSave(validated);
            return this.cache;
        } catch (e) {
            console.error('Failed to load save:', e);
            return null;
        }
    }

    // Save data
    save(data: Partial<SaveData>): void {
        const existing = this.load() || this.createNewSave();
        const merged = {
            ...existing,
            ...data,
            lastSaved: Date.now(),
            schemaVersion: SAVE_SCHEMA_VERSION,
        };

        this.cache = merged as SaveData;

        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(merged));
        } catch (e) {
            console.error('Failed to save:', e);
            // Handle quota exceeded
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
                this.cleanupOldReplays();
                try {
                    localStorage.setItem(SAVE_KEY, JSON.stringify(merged));
                } catch (e2) {
                    alert('Save failed: Storage quota exceeded. Please clear some replays.');
                }
            }
        }
    }

    // Create new save
    createNewSave(): SaveData {
        return createDefaultSaveData();
    }

    // Delete save
    deleteSave(): void {
        localStorage.removeItem(SAVE_KEY);
        this.cache = null;
    }

    // Reset save to fresh defaults and persist
    resetToDefaults(): SaveData {
        const fresh = createDefaultSaveData();
        this.cache = fresh;
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(fresh));
        } catch (e) {
            console.error('Failed to persist defaults:', e);
        }
        return fresh;
    }

    // Export save to string (for backup)
    exportSave(): string {
        const data = this.load();
        if (!data) return '';
        return btoa(JSON.stringify(data));
    }

    // Import save from string
    importSave(saveString: string): boolean {
        try {
            const parsed = JSON.parse(atob(saveString));
            const validated = validateSaveData(parsed);
            if (!validated) return false;
            const data = this.migrateSave(validated);
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
            this.cache = data;
            return true;
        } catch (e) {
            console.error('Failed to import save:', e);
            return false;
        }
    }

    // Migrate old save versions (legacy lineup/career-slot migrations)
    private migrateSave(data: any): SaveData {
        // Version 1 is current
        if (!data.version) {
            data.version = 1;
        }
        const defaultStats = this.createNewSave().stats;
        data.stats = {
            ...defaultStats,
            ...(data.stats || {}),
        };
        if (!data.progression) {
            data.progression = getDefaultProgressionData();
        } else {
            const defaults = getDefaultProgressionData();
            data.progression = {
                ...defaults,
                ...data.progression,
                unlockedCosmetics:
                    Array.isArray(data.progression.unlockedCosmetics)
                        ? data.progression.unlockedCosmetics
                        : defaults.unlockedCosmetics,
                dailyChallenges:
                    Array.isArray(data.progression.dailyChallenges)
                        ? data.progression.dailyChallenges
                        : defaults.dailyChallenges,
                equippedCosmetics:
                    data.progression.equippedCosmetics || defaults.equippedCosmetics,
            };
        }

        // Ensure v2 fields survive legacy migration
        if (!data.settings || typeof data.settings !== 'object') {
            data.settings = getDefaultSettings();
        }
        if (!data.challengeProgress || typeof data.challengeProgress !== 'object') {
            data.challengeProgress = {};
        }
        if (!Array.isArray(data.rivalries)) {
            data.rivalries = [];
        }
        if (typeof data.schemaVersion !== 'number') {
            data.schemaVersion = SAVE_SCHEMA_VERSION;
        }

        if (!Array.isArray(data.careers)) {
            data.careers = [data.career || null, null, null];
        } else {
            data.careers = data.careers.slice(0, 3);
            while (data.careers.length < 3) data.careers.push(null);
        }

        if (typeof data.activeCareerSlot !== 'number') {
            data.activeCareerSlot = 0;
        }
        data.activeCareerSlot = Math.max(0, Math.min(2, Math.floor(data.activeCareerSlot)));

        for (let i = 0; i < data.careers.length; i++) {
            const career = data.careers[i];
            if (career?.team && !Array.isArray(career.team.startingLineupIds)) {
                career.team.startingLineupIds = (career.team.roster || [])
                    .slice(0, 7)
                    .map((player: PlayerStats) => player.id);
            }
            if (career?.team && !Array.isArray(career.team.offenseLineupIds)) {
                career.team.offenseLineupIds = Array.isArray(career.team.startingLineupIds)
                    ? [...career.team.startingLineupIds]
                    : (career.team.roster || [])
                          .slice(0, 7)
                          .map((player: PlayerStats) => player.id);
            }
            if (career?.team && !Array.isArray(career.team.defenseLineupIds)) {
                career.team.defenseLineupIds = (career.team.roster || [])
                    .slice()
                    .sort(
                        (a: PlayerStats, b: PlayerStats) =>
                            b.attributes.marking + b.attributes.speed - (a.attributes.marking + a.attributes.speed),
                    )
                    .slice(0, 7)
                    .map((player: PlayerStats) => player.id);
            }
            if (career && !Array.isArray(career.mentorships)) {
                career.mentorships = [];
            }
        }

        data.career = data.careers[data.activeCareerSlot] || data.career || null;
        return data;
    }

    // Settings management
    loadSettings(): GameSettings {
        const data = localStorage.getItem(SETTINGS_KEY);
        if (!data) return getDefaultSettings();

        try {
            return mergeSettings(getDefaultSettings(), JSON.parse(data));
        } catch (e) {
            return getDefaultSettings();
        }
    }

    saveSettings(settings: Partial<GameSettings>): void {
        this.settings = mergeSettings(this.settings, settings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    }

    getSettings(): GameSettings {
        return this.settings;
    }

    // Replay management
    saveReplay(matchId: string, replayData: any): void {
        const key = REPLAY_KEY_PREFIX + matchId;
        try {
            localStorage.setItem(key, JSON.stringify({
                date: Date.now(),
                data: replayData,
            }));
        } catch (e) {
            this.cleanupOldReplays();
            localStorage.setItem(key, JSON.stringify({ date: Date.now(), data: replayData }));
        }
    }

    loadReplay(matchId: string): any | null {
        const key = REPLAY_KEY_PREFIX + matchId;
        const data = localStorage.getItem(key);
        if (!data) return null;

        try {
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    listReplays(): { id: string; date: number }[] {
        const replays: { id: string; date: number }[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(REPLAY_KEY_PREFIX)) {
                try {
                    const data = JSON.parse(localStorage.getItem(key)!);
                    replays.push({
                        id: key.replace(REPLAY_KEY_PREFIX, ''),
                        date: data.date,
                    });
                } catch (e) {
                    // Skip invalid replays
                }
            }
        }
        return replays.sort((a, b) => b.date - a.date);
    }

    deleteReplay(matchId: string): void {
        localStorage.removeItem(REPLAY_KEY_PREFIX + matchId);
    }

    private cleanupOldReplays(): void {
        const replays = this.listReplays();
        // Keep only 10 most recent
        for (let i = 10; i < replays.length; i++) {
            this.deleteReplay(replays[i].id);
        }
    }

    // Achievement tracking
    unlockAchievement(achievementId: string): void {
        const save = this.load();
        if (save && !save.achievements.includes(achievementId)) {
            save.achievements.push(achievementId);
            this.save(save);
        }
    }

    hasAchievement(achievementId: string): boolean {
        const save = this.load();
        return save ? save.achievements.includes(achievementId) : false;
    }

    // Global stats updates
    updateStats(updates: Partial<GlobalStats>): void {
        const save = this.load();
        if (save) {
            save.stats = { ...save.stats, ...updates };
            this.save(save);
        }
    }

    getStats(): GlobalStats {
        const save = this.load();
        return save ? save.stats : this.createNewSave().stats;
    }

    getProgression(): ProgressionData {
        const save = this.load();
        return save ? save.progression : getDefaultProgressionData();
    }

    saveProgression(progression: ProgressionData): void {
        const save = this.load() || this.createNewSave();
        save.progression = progression;
        this.save(save);
    }
}

// Helper functions
export const saveManager = SaveManager.getInstance();

// Career-specific helpers
export const CAREER_HOME_REGIONS: HomeRegion[] = [
    'Northeast',
    'Southeast',
    'Midwest',
    'Southwest',
    'West',
];

const PRACTICE_FOCUSES: Array<
    'offense' | 'defense' | 'conditioning' | 'throws'
> = ['offense', 'defense', 'conditioning', 'throws'];

interface ScheduleTemplateEntry {
    type: SeasonEvent['type'];
    phase: SeasonPhase;
    title: string;
    tier?: 'local' | 'regional' | 'national' | 'elite';
    focus?: 'offense' | 'defense' | 'conditioning' | 'throws';
    stage?: 'announce' | 'drill' | 'offers';
    effect?: 'morale' | 'culture' | 'spirit';
}

const SEASON_TEMPLATE: ScheduleTemplateEntry[] = [
    // Off-season
    { type: 'tryout', stage: 'announce', phase: 'offseason', title: 'Tryout Announcement Window' },
    { type: 'tryout', stage: 'drill', phase: 'offseason', title: 'Open Tryout Drills' },
    { type: 'practice', focus: 'conditioning', phase: 'preseason', title: 'Preseason Conditioning Camp' },
    { type: 'scouting', phase: 'preseason', title: 'Preseason Scouting Scrimmage' },
    // Regular season
    { type: 'tournament', tier: 'local', phase: 'regular', title: 'Kickoff Classic' },
    { type: 'practice', focus: 'offense', phase: 'regular', title: 'Offense Session' },
    { type: 'tournament', tier: 'local', phase: 'regular', title: 'Spring Open' },
    { type: 'scouting', phase: 'regular', title: 'Film And Scouting Week' },
    { type: 'tournament', tier: 'local', phase: 'regular', title: 'Section Tune-Up' },
    { type: 'practice', focus: 'defense', phase: 'regular', title: 'Defensive Install' },
    { type: 'bonding', effect: 'culture', phase: 'regular', title: 'Community Fundraiser Night' },
    { type: 'tournament', tier: 'regional', phase: 'regular', title: 'Regional Qualifier' },
    { type: 'practice', focus: 'throws', phase: 'regular', title: 'Throwing Lab' },
    { type: 'tournament', tier: 'regional', phase: 'regular', title: 'Regional Series' },
    { type: 'rest', phase: 'regular', title: 'Recovery Week' },
    { type: 'tournament', tier: 'national', phase: 'regular', title: 'National Circuit 1' },
    // Post-season
    { type: 'tournament', tier: 'national', phase: 'postseason', title: 'Sectionals Championship' },
    { type: 'tournament', tier: 'national', phase: 'postseason', title: 'Regionals Championship' },
    { type: 'tournament', tier: 'elite', phase: 'postseason', title: 'Nationals Semifinal' },
    { type: 'tournament', tier: 'elite', phase: 'postseason', title: 'Nationals Final' },
];

const MILESTONE_DEFINITIONS: Array<
    Pick<CareerMilestone, 'id' | 'title' | 'description' | 'reward' | 'target'>
> = [
    {
        id: 'first_win',
        title: 'First Win',
        description: 'Win your first career match.',
        reward: 'Custom jersey designs',
        target: 1,
    },
    {
        id: 'tournament_champ',
        title: 'Tournament Champ',
        description: 'Win a postseason tournament.',
        reward: 'Stadium field venue',
        target: 1,
    },
    {
        id: 'division_climber',
        title: 'Division Climber',
        description: 'Promote to Division 2 or higher.',
        reward: 'Advanced playbook options',
        target: 1,
    },
    {
        id: 'spirit_award',
        title: 'Spirit Award',
        description: 'Receive a Spirit Award in a season.',
        reward: 'Spirit-focused recruits',
        target: 1,
    },
    {
        id: 'dynasty',
        title: 'Dynasty',
        description: 'Win Nationals three times.',
        reward: 'Prestige mode badge',
        target: 3,
    },
    {
        id: 'undefeated',
        title: 'Undefeated',
        description: 'Finish a season without a loss.',
        reward: 'Golden disc cosmetic',
        target: 1,
    },
    {
        id: 'iron_person',
        title: 'Iron Person',
        description: 'Record a full-match iron player appearance.',
        reward: 'Endurance training bonus',
        target: 1,
    },
    {
        id: 'hundred_ds',
        title: '100 Ds',
        description: 'Accumulate 100 career blocks.',
        reward: 'The Wall title',
        target: 100,
    },
    {
        id: 'thousand_goals',
        title: '1000 Goals',
        description: 'Accumulate 1000 career goals.',
        reward: 'Crown cosmetic',
        target: 1000,
    },
];

export interface NewCareerOptions {
    mode?: CareerModeVariant;
    difficulty?: CareerDifficulty;
    homeRegion?: HomeRegion;
    primaryColor?: number;
    secondaryColor?: number;
    division?: number;
    slot?: number;
    prestigeLevel?: number;
}

interface ScheduleGenerationOptions {
    standings?: LeagueStanding[];
    playerTeamId?: string;
    baseDifficulty?: CareerDifficulty;
    division?: number;
    mode?: CareerModeVariant;
}

function clampCareerSlot(slot: number): number {
    return Math.max(0, Math.min(2, Math.floor(slot)));
}

function divisionTeamCount(division: number): number {
    return division === 4
        ? CAREER_CONSTANTS.DIVISION4_TEAM_COUNT
        : CAREER_CONSTANTS.DIVISION1_TO_3_TEAM_COUNT;
}

function divisionBaseRating(division: number): number {
    const clamped = Math.max(
        CAREER_CONSTANTS.DIVISION_MIN,
        Math.min(CAREER_CONSTANTS.DIVISION_MAX, division),
    );
    return (
        CAREER_CONSTANTS.OPPONENT_RATING_BASE +
        (CAREER_CONSTANTS.DIVISION_MAX - clamped) *
            CAREER_CONSTANTS.DIVISION_RATING_STEP
    );
}

function difficultyFromRating(
    rating: number,
    baseDifficulty: CareerDifficulty,
): CareerDifficulty {
    const baseline =
        baseDifficulty === 'easy'
            ? 54
            : baseDifficulty === 'hard'
            ? 64
            : 59;
    if (rating <= baseline - 4) return 'easy';
    if (rating >= baseline + 4) return 'hard';
    return 'normal';
}

function buildOpponentData(
    standing: LeagueStanding,
    baseDifficulty: CareerDifficulty,
): CareerOpponentData {
    return {
        teamId: standing.teamId,
        teamName: standing.teamName,
        rating: standing.rating,
        primaryColor: standing.primaryColor,
        secondaryColor: standing.secondaryColor,
        difficulty: difficultyFromRating(standing.rating, baseDifficulty),
    };
}

function createInitialStandings(
    team: TeamData,
    division: number,
): LeagueStanding[] {
    const standings: LeagueStanding[] = [];
    const teamCount = divisionTeamCount(division);
    const ratingBase = divisionBaseRating(division);

    standings.push({
        teamId: team.id,
        teamName: team.name,
        wins: 0,
        losses: 0,
        pointDiff: 0,
        spirit: team.stats.spiritScore,
        rating: Math.round(ratingBase + 1),
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor,
    });

    let presetIdx = 0;
    while (standings.length < teamCount) {
        const preset = TEAM_PRESETS[presetIdx % TEAM_PRESETS.length];
        presetIdx++;
        const teamName = `${preset.name} ${standings.length}`;
        standings.push({
            teamId: `ai_team_${Date.now()}_${standings.length}`,
            teamName,
            wins: 0,
            losses: 0,
            pointDiff: 0,
            spirit: 7 + Random.next() * 2.5,
            rating: Math.round(
                ratingBase + (Random.next() - 0.5) * CAREER_CONSTANTS.AI_RATING_RANGE,
            ),
            primaryColor: preset.primaryColor,
            secondaryColor: preset.secondaryColor,
        });
    }

    return standings;
}

function fallbackOpponent(
    week: number,
    baseDifficulty: CareerDifficulty,
): CareerOpponentData {
    const preset = TEAM_PRESETS[week % TEAM_PRESETS.length];
    const rating = Math.round(
        CAREER_CONSTANTS.OPPONENT_RATING_BASE +
            (Random.next() - 0.5) * CAREER_CONSTANTS.AI_RATING_RANGE,
    );
    return {
        teamId: `fallback_${week}_${Date.now()}`,
        teamName: preset.name,
        rating,
        primaryColor: preset.primaryColor,
        secondaryColor: preset.secondaryColor,
        difficulty: difficultyFromRating(rating, baseDifficulty),
    };
}

function defaultCulture(): TeamCulture {
    return {
        competitive: 50,
        spirited: 50,
        athletic: 50,
        cerebral: 50,
        clutch: 50,
    };
}

function defaultMilestones(): CareerMilestone[] {
    return MILESTONE_DEFINITIONS.map((definition) => ({
        ...definition,
        progress: 0,
        completed: false,
    }));
}

function defaultCaptainIds(roster: PlayerStats[]): string[] {
    const ranked = [...roster].sort((a, b) => {
        const scoreA = a.attributes.spirit + a.attributes.awareness + (a.traits.leader ? 15 : 0);
        const scoreB = b.attributes.spirit + b.attributes.awareness + (b.traits.leader ? 15 : 0);
        return scoreB - scoreA;
    });
    const count = Math.min(
        CAREER_CONSTANTS.MAX_CAPTAINS,
        Math.max(CAREER_CONSTANTS.MIN_CAPTAINS, Math.floor(roster.length / 9)),
    );
    return ranked.slice(0, count).map((player) => player.id);
}

function chemistryKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function defaultChemistry(roster: PlayerStats[]): Record<string, number> {
    const chemistry: Record<string, number> = {};
    for (let i = 0; i < roster.length; i++) {
        for (let j = i + 1; j < roster.length; j++) {
            const a = roster[i];
            const b = roster[j];
            const spiritGap = Math.abs(a.attributes.spirit - b.attributes.spirit);
            const roleSynergy =
                (a.role === 'handler' && b.role === 'cutter') ||
                (a.role === 'cutter' && b.role === 'handler')
                    ? 1.2
                    : a.role === b.role
                    ? -0.4
                    : 0.2;
            const base = roleSynergy + (8 - spiritGap / 12);
            const clamped = Math.max(
                CAREER_CONSTANTS.CHEMISTRY_MIN,
                Math.min(CAREER_CONSTANTS.CHEMISTRY_MAX, Math.round(base + Random.next() * 2 - 1)),
            );
            chemistry[chemistryKey(a.id, b.id)] = clamped;
        }
    }
    return chemistry;
}

function completeLineupIds(seed: string[], roster: PlayerStats[]): string[] {
    const unique = new Set<string>();
    const lineup: string[] = [];
    for (const id of seed) {
        if (unique.has(id)) continue;
        if (!roster.some((player) => player.id === id)) continue;
        unique.add(id);
        lineup.push(id);
        if (lineup.length >= 7) break;
    }
    for (const player of roster) {
        if (lineup.length >= 7) break;
        if (unique.has(player.id)) continue;
        unique.add(player.id);
        lineup.push(player.id);
    }
    return lineup.slice(0, 7);
}

function defaultOffenseLineupIds(roster: PlayerStats[]): string[] {
    const ranked = [...roster].sort((a, b) => {
        const scoreA =
            a.attributes.throwAccuracy * 1.15 +
            a.attributes.awareness * 0.95 +
            a.attributes.catching * 0.7 +
            a.overallRating * 0.45;
        const scoreB =
            b.attributes.throwAccuracy * 1.15 +
            b.attributes.awareness * 0.95 +
            b.attributes.catching * 0.7 +
            b.overallRating * 0.45;
        return scoreB - scoreA;
    });
    return completeLineupIds(
        ranked.slice(0, 7).map((player) => player.id),
        roster,
    );
}

function defaultDefenseLineupIds(roster: PlayerStats[]): string[] {
    const ranked = [...roster].sort((a, b) => {
        const scoreA =
            a.attributes.marking * 1.25 +
            a.attributes.speed * 1 +
            a.attributes.stamina * 0.8 +
            a.attributes.jumping * 0.55 +
            a.overallRating * 0.35;
        const scoreB =
            b.attributes.marking * 1.25 +
            b.attributes.speed * 1 +
            b.attributes.stamina * 0.8 +
            b.attributes.jumping * 0.55 +
            b.overallRating * 0.35;
        return scoreB - scoreA;
    });
    return completeLineupIds(
        ranked.slice(0, 7).map((player) => player.id),
        roster,
    );
}

function randomPersonality(): RecruitPersonality {
    const roll = Random.next();
    if (roll < 0.22) return 'team_first';
    if (roll < 0.4) return 'showboat';
    if (roll < 0.62) return 'grinder';
    if (roll < 0.82) return 'analyst';
    return 'wildcard';
}

function sampleRecruitKnownStats(player: PlayerStats): Partial<PlayerAttributes> {
    return {
        spirit: Math.round(player.attributes.spirit),
        stamina: Math.round(player.attributes.stamina),
    };
}

function sampleRecruitHiddenStats(player: PlayerStats): Partial<PlayerAttributes> {
    return {
        speed: Math.round(player.attributes.speed),
        acceleration: Math.round(player.attributes.acceleration),
        throwPower: Math.round(player.attributes.throwPower),
        throwAccuracy: Math.round(player.attributes.throwAccuracy),
        awareness: Math.round(player.attributes.awareness),
        catching: Math.round(player.attributes.catching),
    };
}

function generateTryoutCandidates(
    count: number,
    reputation: TeamReputation,
): RecruitCandidate[] {
    const candidates: RecruitCandidate[] = [];
    for (let i = 0; i < count; i++) {
        const role =
            i % 4 === 0 ? 'handler' : i % 3 === 0 ? 'hybrid' : 'cutter';
        const generated = generatePlayer(role, 18 + Math.floor(Random.next() * 12));
        const preferenceBase =
            reputation.recruitmentAppeal * 0.6 + reputation.spirit * 0.4;
        candidates.push({
            id: `candidate_${Date.now()}_${i}_${Math.floor(Random.next() * 10000)}`,
            name: generated.fullName,
            age: generated.development.age,
            experience: Math.max(0, generated.development.age - 17 - Math.floor(Random.next() * 4)),
            potential: Math.round(generated.development.potential),
            personality: randomPersonality(),
            knownStats: sampleRecruitKnownStats(generated),
            hiddenStats: sampleRecruitHiddenStats(generated),
            teamPreference: Math.max(10, Math.min(100, Math.round(preferenceBase + Random.next() * 24 - 12))),
            salaryExpectation: Math.round(180 + Random.next() * 260),
            otherOfferCount: Math.floor(Random.next() * 4),
            drillsCompleted: [],
        });
    }
    return candidates;
}

export function createNewCareer(
    playerName: string,
    teamName: string,
    options: NewCareerOptions = {},
): CareerData {
    const mode: CareerModeVariant = options.mode === 'college' ? 'college' : 'club';
    const division = Math.max(
        CAREER_CONSTANTS.DIVISION_MIN,
        Math.min(
            CAREER_CONSTANTS.DIVISION_MAX,
            Math.floor(options.division ?? CAREER_CONSTANTS.DIVISION_MAX),
        ),
    );
    const careerSlot = clampCareerSlot(options.slot ?? 0);
    const difficulty = options.difficulty ?? 'normal';
    const homeRegion = options.homeRegion ?? 'Northeast';
    const rosterSize = mode === 'college' ? 18 : 15;
    const roster = generateRoster(rosterSize);
    const prestigeLevel = Math.max(0, Math.floor(options.prestigeLevel || 0));
    if (prestigeLevel > 0) {
        const boost = Math.min(8, prestigeLevel * 2);
        for (const player of roster) {
            player.attributes.throwAccuracy = Math.min(100, player.attributes.throwAccuracy + boost * 0.8);
            player.attributes.awareness = Math.min(100, player.attributes.awareness + boost * 0.7);
            player.attributes.marking = Math.min(100, player.attributes.marking + boost * 0.6);
            player.attributes.stamina = Math.min(100, player.attributes.stamina + boost * 0.65);
            player.development.potential = Math.min(99, player.development.potential + boost);
            player.form = Math.min(20, player.form + boost * 0.35);
        }
    }
    const offenseLineupIds = defaultOffenseLineupIds(roster);
    const defenseLineupIds = defaultDefenseLineupIds(roster);

    const team: TeamData = {
        id: `team_${Date.now()}`,
        name: teamName,
        shortName: teamName.substring(0, 3).toUpperCase(),
        primaryColor: options.primaryColor ?? 0x1a73e8,
        secondaryColor: options.secondaryColor ?? 0xffffff,
        roster,
        startingLineupIds: [...offenseLineupIds],
        offenseLineupIds,
        defenseLineupIds,
        playbookId: 'default',
        stats: {
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            spiritScore: 10,
            tournamentWins: 0,
        },
    };

    const playbook: PlaybookData = {
        id: 'default',
        name: 'Default Playbook',
        formations: [
            {
                id: 'vertical',
                name: 'Vertical Stack',
                positions: [
                    { role: 'handler', x: 0, z: 0 },
                    { role: 'handler', x: 5, z: 0 },
                    { role: 'cutter', x: -5, z: -10 },
                    { role: 'cutter', x: -5, z: -15 },
                    { role: 'cutter', x: -5, z: -20 },
                    { role: 'cutter', x: -5, z: -25 },
                    { role: 'cutter', x: -5, z: -30 },
                ],
            },
            {
                id: 'horizontal',
                name: 'Horizontal Stack',
                positions: [
                    { role: 'handler', x: 0, z: 0 },
                    { role: 'handler', x: 5, z: -5 },
                    { role: 'cutter', x: -10, z: -15 },
                    { role: 'cutter', x: -3, z: -15 },
                    { role: 'cutter', x: 3, z: -15 },
                    { role: 'cutter', x: 10, z: -15 },
                    { role: 'cutter', x: 0, z: -25 },
                ],
            },
        ],
        plays: [],
    };

    const reputation: TeamReputation = {
        overall: 50,
        skill: 50,
        spirit: 75,
        fanSupport: 50,
        recruitmentAppeal: 50,
    };
    const standings = createInitialStandings(team, division);
    const schedule = generateSeasonSchedule(1, {
        standings,
        playerTeamId: team.id,
        baseDifficulty: difficulty,
        division,
        mode,
    });
    const chemistry = defaultChemistry(roster);
    const captainIds = defaultCaptainIds(roster);

    return {
        playerName,
        teamName,
        mode,
        difficulty,
        homeRegion,
        division,
        careerSlot,
        currentDate: new Date(),
        season: 1,
        week: 1,
        seasonPhase: schedule[0]?.phase || 'offseason',
        collegeYear: 1,
        team,
        captainIds,
        chemistry,
        culture: defaultCulture(),
        spiritHistory: [team.stats.spiritScore],
        spiritIncidents: [],
        awards: [],
        milestones: defaultMilestones(),
        prestigeLevel,
        nationalsTitles: 0,
        unlockedGameplay: [
            'forehand_mastery_0',
            'hammer_mastery_0',
            'scoober_mastery_0',
        ],
        scoutingReports: [],
        mentorships: [],
        activeTryout: {
            id: `tryout_${Date.now()}`,
            season: 1,
            week: 1,
            announcementPosted: false,
            candidates: generateTryoutCandidates(
                CAREER_CONSTANTS.TRYOUT_CANDIDATE_MIN +
                    Math.floor(
                        Random.next() *
                            (CAREER_CONSTANTS.TRYOUT_CANDIDATE_MAX -
                                CAREER_CONSTANTS.TRYOUT_CANDIDATE_MIN +
                                1),
                    ),
                reputation,
            ),
            drillsRun: [],
            offersMade: [],
            completed: false,
        },
        playbook,
        activeFormationId: 'vertical',
        activePlayId: null,
        schedule,
        matchHistory: [],
        standings,
        finances: {
            budget: CAREER_CONSTANTS.STARTING_BUDGET,
            playerSalaries: roster.length * CAREER_CONSTANTS.PLAYER_SALARY_BASE,
            tournamentFees: 0,
            travelCosts: 0,
            revenue: 0,
            income: [{ source: 'Starting funds', amount: CAREER_CONSTANTS.STARTING_BUDGET }],
            expenses: [{ source: 'Initial roster salaries', amount: roster.length * CAREER_CONSTANTS.PLAYER_SALARY_BASE }],
        },
        reputation,
    };
}

export function generateSeasonSchedule(
    season: number,
    options: ScheduleGenerationOptions = {},
): SeasonEvent[] {
    const baseDifficulty = options.baseDifficulty ?? 'normal';
    const mode: CareerModeVariant = options.mode === 'college' ? 'college' : 'club';
    const opponents = (options.standings || []).filter(
        (standing) => standing.teamId !== options.playerTeamId,
    );
    const schedule: SeasonEvent[] = [];
    let tournamentIdx = 0;
    const template =
        mode === 'college'
            ? SEASON_TEMPLATE.map((entry, idx) =>
                  idx >= 16
                      ? { ...entry, title: `College ${entry.title}`, tier: entry.tier === 'elite' ? 'national' : entry.tier }
                      : { ...entry },
              )
            : SEASON_TEMPLATE;

    for (let week = 1; week <= CAREER_CONSTANTS.DEFAULT_SEASON_LENGTH; week++) {
        const current = template[(week - 1) % template.length];
        const eventId = `s${season}_w${week}_${current.type}`;

        if (current.type === 'tournament') {
            const standing =
                opponents.length > 0
                    ? opponents[tournamentIdx % opponents.length]
                    : null;
            tournamentIdx++;
            schedule.push({
                id: eventId,
                type: 'tournament',
                title: current.title,
                phase: current.phase,
                tournamentId: `${current.tier || 'local'}_${season}_${week}`,
                tier: current.tier || 'local',
                opponent: standing
                    ? buildOpponentData(standing, baseDifficulty)
                    : fallbackOpponent(week, baseDifficulty),
                date: week,
            });
            continue;
        }

        if (current.type === 'practice') {
            schedule.push({
                id: eventId,
                type: 'practice',
                title: current.title,
                phase: current.phase,
                focus:
                    current.focus ||
                    PRACTICE_FOCUSES[Math.floor(Random.next() * PRACTICE_FOCUSES.length)],
                date: week,
            });
            continue;
        }

        if (current.type === 'tryout') {
            schedule.push({
                id: eventId,
                type: 'tryout',
                title: current.title,
                phase: current.phase,
                stage: current.stage || 'drill',
                date: week,
            });
            continue;
        }

        if (current.type === 'scouting') {
            const target = opponents.length > 0 ? opponents[(week + 1) % opponents.length] : null;
            schedule.push({
                id: eventId,
                type: 'scouting',
                title: current.title,
                phase: current.phase,
                targetTeamId: target?.teamId,
                date: week,
            });
            continue;
        }

        if (current.type === 'bonding') {
            schedule.push({
                id: eventId,
                type: 'bonding',
                title: current.title,
                phase: current.phase,
                effect: current.effect || 'morale',
                date: week,
            });
            continue;
        }

        schedule.push({
            id: eventId,
            type: 'rest',
            title: current.title,
            phase: current.phase,
            date: week,
        });
    }

    return schedule;
}

function phaseForWeek(week: number): SeasonPhase {
    if (week <= 2) return 'offseason';
    if (week <= 4) return 'preseason';
    if (week <= 16) return 'regular';
    return 'postseason';
}

function normalizeSeasonPhase(value: unknown, week: number): SeasonPhase {
    if (
        value === 'offseason' ||
        value === 'preseason' ||
        value === 'regular' ||
        value === 'postseason'
    ) {
        return value;
    }
    return phaseForWeek(week);
}

export function getActiveCareerSlot(): number {
    const save = saveManager.load() || saveManager.createNewSave();
    const slot = typeof save.activeCareerSlot === 'number' ? save.activeCareerSlot : 0;
    return clampCareerSlot(slot);
}

export function setActiveCareerSlot(slot: number): void {
    const save = saveManager.load() || saveManager.createNewSave();
    const clamped = clampCareerSlot(slot);
    save.activeCareerSlot = clamped;
    save.career = (save.careers && save.careers[clamped]) || null;
    saveManager.save(save);
}

export function listCareerSlots(): Array<CareerData | null> {
    const save = saveManager.load();
    const raw = save?.careers || [save?.career || null, null, null];
    const slots = raw.slice(0, 3);
    while (slots.length < 3) slots.push(null);
    return slots.map((career, idx) => hydrateCareerData(career, idx));
}

export function saveCareer(career: CareerData, slot?: number): void {
    const save = saveManager.load() || saveManager.createNewSave();
    const targetSlot = clampCareerSlot(slot ?? career.careerSlot ?? getActiveCareerSlot());
    const normalized = { ...career, careerSlot: targetSlot };

    const careers = Array.isArray(save.careers) ? save.careers.slice(0, 3) : [save.career || null, null, null];
    while (careers.length < 3) careers.push(null);
    careers[targetSlot] = normalized;

    save.careers = careers;
    save.activeCareerSlot = targetSlot;
    save.career = normalized;
    save.quickMatchUnlocked = true;
    saveManager.save(save);
}

function hydrateCareerData(
    career: CareerData | null,
    fallbackSlot: number,
): CareerData | null {
    if (!career) return null;

    const currentDate = career.currentDate instanceof Date
        ? career.currentDate
        : new Date(career.currentDate);

    const roster = (career.team?.roster || []).map((player) =>
        player instanceof PlayerStats ? player : PlayerStats.fromJSON(player),
    );

    const mode: CareerModeVariant = career.mode === 'college' ? 'college' : 'club';

    const team: TeamData = {
        ...career.team,
        roster,
        startingLineupIds: completeLineupIds(
            Array.isArray(career.team?.startingLineupIds)
                ? career.team.startingLineupIds
                : [],
            roster,
        ),
        offenseLineupIds: completeLineupIds(
            Array.isArray(career.team?.offenseLineupIds)
                ? career.team.offenseLineupIds
                : Array.isArray(career.team?.startingLineupIds)
                ? career.team.startingLineupIds
                : defaultOffenseLineupIds(roster),
            roster,
        ),
        defenseLineupIds: completeLineupIds(
            Array.isArray(career.team?.defenseLineupIds)
                ? career.team.defenseLineupIds
                : defaultDefenseLineupIds(roster),
            roster,
        ),
    };

    const division = Math.max(
        CAREER_CONSTANTS.DIVISION_MIN,
        Math.min(CAREER_CONSTANTS.DIVISION_MAX, Math.floor(career.division || 4)),
    );

    const difficulty: CareerDifficulty =
        career.difficulty === 'easy' ||
        career.difficulty === 'hard' ||
        career.difficulty === 'normal'
            ? career.difficulty
            : 'normal';

    const reputationPatch = (career.reputation || {}) as Partial<TeamReputation>;
    const reputation: TeamReputation = {
        overall: 50,
        skill: 50,
        spirit: 75,
        fanSupport: 50,
        recruitmentAppeal: 50,
        ...reputationPatch,
    };

    const standings =
        Array.isArray(career.standings) && career.standings.length > 0
            ? career.standings.map((standing) => ({
                  teamId: standing.teamId,
                  teamName: standing.teamName,
                  wins: standing.wins || 0,
                  losses: standing.losses || 0,
                  pointDiff: standing.pointDiff || 0,
                  spirit: standing.spirit || 7.5,
                  rating: standing.rating || divisionBaseRating(division),
                  primaryColor: standing.primaryColor || 0x1a73e8,
                  secondaryColor: standing.secondaryColor || 0xffffff,
              }))
            : createInitialStandings(team, division);

    const migratedSchedule = generateSeasonSchedule(career.season || 1, {
        standings,
        playerTeamId: team.id,
        baseDifficulty: difficulty,
        division,
        mode,
    }).map((fallbackEvent, idx) => {
        const source = (career.schedule || [])[idx] as any;
        if (!source) return fallbackEvent;
        const phase = normalizeSeasonPhase(source.phase, fallbackEvent.date);

        if (source.type === 'practice') {
            return {
                id: source.id || fallbackEvent.id,
                type: 'practice' as const,
                title: source.title || fallbackEvent.title,
                phase,
                focus:
                    source.focus &&
                    PRACTICE_FOCUSES.includes(source.focus)
                        ? source.focus
                        : fallbackEvent.type === 'practice'
                        ? fallbackEvent.focus
                        : 'offense',
                date: Number.isFinite(source.date) ? source.date : fallbackEvent.date,
            };
        }

        if (source.type === 'rest') {
            return {
                id: source.id || fallbackEvent.id,
                type: 'rest' as const,
                title: source.title || fallbackEvent.title,
                phase,
                date: Number.isFinite(source.date) ? source.date : fallbackEvent.date,
            };
        }

        if (source.type === 'tryout') {
            return {
                id: source.id || fallbackEvent.id,
                type: 'tryout' as const,
                title: source.title || fallbackEvent.title,
                phase,
                stage:
                    source.stage === 'announce' ||
                    source.stage === 'drill' ||
                    source.stage === 'offers'
                        ? source.stage
                        : 'drill',
                date: Number.isFinite(source.date) ? source.date : fallbackEvent.date,
            };
        }

        if (source.type === 'scouting') {
            return {
                id: source.id || fallbackEvent.id,
                type: 'scouting' as const,
                title: source.title || fallbackEvent.title,
                phase,
                targetTeamId:
                    typeof source.targetTeamId === 'string'
                        ? source.targetTeamId
                        : undefined,
                date: Number.isFinite(source.date) ? source.date : fallbackEvent.date,
            };
        }

        if (source.type === 'bonding') {
            return {
                id: source.id || fallbackEvent.id,
                type: 'bonding' as const,
                title: source.title || fallbackEvent.title,
                phase,
                effect:
                    source.effect === 'morale' ||
                    source.effect === 'culture' ||
                    source.effect === 'spirit'
                        ? source.effect
                        : 'morale',
                date: Number.isFinite(source.date) ? source.date : fallbackEvent.date,
            };
        }

        const fallbackTournament =
            fallbackEvent.type === 'tournament'
                ? fallbackEvent
                : generateSeasonSchedule(career.season || 1, {
                      standings,
                      playerTeamId: team.id,
                      baseDifficulty: difficulty,
                      division,
                      mode,
                  }).find((event) => event.type === 'tournament')!;
        return {
            id: source.id || fallbackTournament.id,
            type: 'tournament' as const,
            title: source.title || fallbackTournament.title,
            phase,
            tournamentId: source.tournamentId || fallbackTournament.tournamentId,
            tier: source.tier || fallbackTournament.tier,
            opponent:
                source.opponent &&
                typeof source.opponent.teamId === 'string' &&
                typeof source.opponent.teamName === 'string'
                    ? {
                          teamId: source.opponent.teamId,
                          teamName: source.opponent.teamName,
                          rating: Number(source.opponent.rating) || fallbackTournament.opponent.rating,
                          primaryColor:
                              Number(source.opponent.primaryColor) ||
                              fallbackTournament.opponent.primaryColor,
                          secondaryColor:
                              Number(source.opponent.secondaryColor) ||
                              fallbackTournament.opponent.secondaryColor,
                          difficulty:
                              source.opponent.difficulty === 'easy' ||
                              source.opponent.difficulty === 'hard' ||
                              source.opponent.difficulty === 'normal'
                                  ? source.opponent.difficulty
                                  : fallbackTournament.opponent.difficulty,
                      }
                    : fallbackTournament.opponent,
            date: Number.isFinite(source.date) ? source.date : fallbackTournament.date,
        };
    });

    const chemistry =
        career.chemistry && typeof career.chemistry === 'object'
            ? Object.fromEntries(
                  Object.entries(career.chemistry).map(([key, value]) => [
                      key,
                      Math.max(
                          CAREER_CONSTANTS.CHEMISTRY_MIN,
                          Math.min(
                              CAREER_CONSTANTS.CHEMISTRY_MAX,
                              Number(value) || 0,
                          ),
                      ),
                  ]),
              )
            : defaultChemistry(roster);

    const captainIds =
        Array.isArray(career.captainIds) && career.captainIds.length > 0
            ? career.captainIds
                  .filter((id) => roster.some((player) => player.id === id))
                  .slice(0, CAREER_CONSTANTS.MAX_CAPTAINS)
            : defaultCaptainIds(roster);

    const culture = {
        ...defaultCulture(),
        ...(career.culture || {}),
    };
    const clampedCulture: TeamCulture = {
        competitive: Math.max(CAREER_CONSTANTS.CULTURE_MIN, Math.min(CAREER_CONSTANTS.CULTURE_MAX, Number(culture.competitive) || 50)),
        spirited: Math.max(CAREER_CONSTANTS.CULTURE_MIN, Math.min(CAREER_CONSTANTS.CULTURE_MAX, Number(culture.spirited) || 50)),
        athletic: Math.max(CAREER_CONSTANTS.CULTURE_MIN, Math.min(CAREER_CONSTANTS.CULTURE_MAX, Number(culture.athletic) || 50)),
        cerebral: Math.max(CAREER_CONSTANTS.CULTURE_MIN, Math.min(CAREER_CONSTANTS.CULTURE_MAX, Number(culture.cerebral) || 50)),
        clutch: Math.max(CAREER_CONSTANTS.CULTURE_MIN, Math.min(CAREER_CONSTANTS.CULTURE_MAX, Number(culture.clutch) || 50)),
    };

    const currentEvent = migratedSchedule.find((event) => event.date === (career.week || 1));
    const seasonPhase = currentEvent?.phase || phaseForWeek(career.week || 1);

    const currentMilestones =
        Array.isArray(career.milestones) && career.milestones.length > 0
            ? career.milestones
            : defaultMilestones();
    const milestones = defaultMilestones().map((base) => {
        const existing = currentMilestones.find((item) => item.id === base.id);
        if (!existing) return base;
        return {
            ...base,
            progress: Number(existing.progress) || 0,
            completed: !!existing.completed,
            completedAtSeason:
                Number.isFinite(existing.completedAtSeason)
                    ? Number(existing.completedAtSeason)
                    : undefined,
        };
    });

    const activeTryout =
        career.activeTryout &&
        typeof career.activeTryout === 'object' &&
        Array.isArray(career.activeTryout.candidates)
            ? {
                  id:
                      typeof career.activeTryout.id === 'string'
                          ? career.activeTryout.id
                          : `tryout_${Date.now()}`,
                  season:
                      Number(career.activeTryout.season) || Math.max(1, career.season || 1),
                  week:
                      Number(career.activeTryout.week) || Math.max(1, career.week || 1),
                  announcementPosted: !!career.activeTryout.announcementPosted,
                  candidates: career.activeTryout.candidates.map((candidate: any, idx: number) => ({
                      id:
                          typeof candidate.id === 'string'
                              ? candidate.id
                              : `candidate_${Date.now()}_${idx}`,
                      name: typeof candidate.name === 'string' ? candidate.name : `Prospect ${idx + 1}`,
                      age: Math.max(17, Math.min(35, Number(candidate.age) || 19)),
                      experience: Math.max(0, Math.min(18, Number(candidate.experience) || 0)),
                      potential: Math.max(40, Math.min(99, Number(candidate.potential) || 65)),
                      personality:
                          candidate.personality === 'team_first' ||
                          candidate.personality === 'showboat' ||
                          candidate.personality === 'grinder' ||
                          candidate.personality === 'analyst' ||
                          candidate.personality === 'wildcard'
                              ? candidate.personality
                              : 'team_first',
                      knownStats:
                          candidate.knownStats && typeof candidate.knownStats === 'object'
                              ? candidate.knownStats
                              : {},
                      hiddenStats:
                          candidate.hiddenStats && typeof candidate.hiddenStats === 'object'
                              ? candidate.hiddenStats
                              : {},
                      teamPreference: Math.max(
                          0,
                          Math.min(100, Number(candidate.teamPreference) || 50),
                      ),
                      salaryExpectation: Math.max(
                          120,
                          Number(candidate.salaryExpectation) || 220,
                      ),
                      otherOfferCount: Math.max(
                          0,
                          Math.min(8, Number(candidate.otherOfferCount) || 0),
                      ),
                      drillsCompleted: Array.isArray(candidate.drillsCompleted)
                          ? candidate.drillsCompleted.filter(
                                (drill: unknown) =>
                                    drill === 'sprint' ||
                                    drill === 'throwing' ||
                                    drill === 'cutting' ||
                                    drill === 'scrimmage',
                            )
                          : [],
                  })),
                  drillsRun: Array.isArray(career.activeTryout.drillsRun)
                      ? career.activeTryout.drillsRun.filter(
                            (drill: unknown) =>
                                drill === 'sprint' ||
                                drill === 'throwing' ||
                                drill === 'cutting' ||
                                drill === 'scrimmage',
                        )
                      : [],
                  offersMade: Array.isArray(career.activeTryout.offersMade)
                      ? career.activeTryout.offersMade.filter(
                            (offer: unknown): offer is string =>
                                typeof offer === 'string',
                        )
                      : [],
                  completed: !!career.activeTryout.completed,
              }
            : null;

    return {
        ...career,
        teamName: career.teamName || team.name,
        mode,
        currentDate,
        team,
        difficulty,
        homeRegion:
            CAREER_HOME_REGIONS.includes(career.homeRegion)
                ? career.homeRegion
                : 'Northeast',
        division,
        seasonPhase,
        collegeYear: Math.max(
            1,
            Math.min(
                CAREER_CONSTANTS.COLLEGE_MAX_YEAR,
                Number(career.collegeYear) || 1,
            ),
        ),
        captainIds,
        chemistry,
        culture: clampedCulture,
        spiritHistory: Array.isArray(career.spiritHistory)
            ? career.spiritHistory.map((entry) => Number(entry) || 0).slice(-24)
            : [team.stats.spiritScore],
        spiritIncidents: Array.isArray(career.spiritIncidents)
            ? career.spiritIncidents
                  .filter((incident) => incident && typeof incident.id === 'string')
                  .map((incident) => ({
                      id: incident.id,
                      season: Number(incident.season) || 1,
                      week: Number(incident.week) || 1,
                      severity:
                          incident.severity === 'negative' ? 'negative' : 'positive',
                      description:
                          typeof incident.description === 'string'
                              ? incident.description
                              : '',
                      delta: Number(incident.delta) || 0,
                  }))
            : [],
        awards: Array.isArray(career.awards)
            ? career.awards
                  .filter((award) => award && typeof award.id === 'string')
                  .map((award) => ({
                      id: award.id,
                      season: Number(award.season) || 1,
                      week: Number(award.week) || 1,
                      title: typeof award.title === 'string' ? award.title : 'Award',
                      description:
                          typeof award.description === 'string'
                              ? award.description
                              : '',
                  }))
            : [],
        milestones,
        prestigeLevel: Math.max(0, Number(career.prestigeLevel) || 0),
        nationalsTitles: Math.max(0, Number(career.nationalsTitles) || 0),
        unlockedGameplay: Array.isArray(career.unlockedGameplay)
            ? career.unlockedGameplay.filter(
                  (entry): entry is string => typeof entry === 'string',
              )
            : [],
        scoutingReports: Array.isArray(career.scoutingReports)
            ? career.scoutingReports
                  .filter((report) => report && typeof report.id === 'string')
                  .map((report) => ({
                      id: report.id,
                      season: Number(report.season) || 1,
                      week: Number(report.week) || 1,
                      teamId: typeof report.teamId === 'string' ? report.teamId : 'unknown',
                      teamName:
                          typeof report.teamName === 'string'
                              ? report.teamName
                              : 'Unknown Team',
                      strengths: Array.isArray(report.strengths)
                          ? report.strengths.filter(
                                (item: unknown): item is string =>
                                    typeof item === 'string',
                            )
                          : [],
                      weaknesses: Array.isArray(report.weaknesses)
                          ? report.weaknesses.filter(
                                (item: unknown): item is string =>
                                    typeof item === 'string',
                            )
                          : [],
                      tendencies: Array.isArray(report.tendencies)
                          ? report.tendencies.filter(
                                (item: unknown): item is string =>
                                    typeof item === 'string',
                            )
                          : [],
                      keyPlayers: Array.isArray(report.keyPlayers)
                          ? report.keyPlayers.filter(
                                (item: unknown): item is string =>
                                    typeof item === 'string',
                            )
                          : [],
                      confidence: Math.max(0, Math.min(1, Number(report.confidence) || 0.5)),
                      recommendedFormationId:
                          typeof report.recommendedFormationId === 'string'
                              ? report.recommendedFormationId
                              : undefined,
                      recommendedDefense:
                          report.recommendedDefense === 'zone_331' ||
                          report.recommendedDefense === 'man'
                              ? report.recommendedDefense
                              : undefined,
                      recommendedPracticeFocus:
                          report.recommendedPracticeFocus === 'offense' ||
                          report.recommendedPracticeFocus === 'defense' ||
                          report.recommendedPracticeFocus === 'conditioning' ||
                          report.recommendedPracticeFocus === 'throws'
                              ? report.recommendedPracticeFocus
                              : undefined,
                      gamePlan:
                          typeof report.gamePlan === 'string'
                              ? report.gamePlan
                              : undefined,
                  }))
            : [],
        mentorships: Array.isArray((career as { mentorships?: unknown }).mentorships)
            ? (career as { mentorships: unknown[] }).mentorships
                  .map((pair) => pair as Partial<MentorshipPair>)
                  .filter(
                      (pair) =>
                          typeof pair.mentorId === 'string' &&
                          typeof pair.menteeId === 'string' &&
                          pair.mentorId !== pair.menteeId &&
                          roster.some((player) => player.id === pair.mentorId) &&
                          roster.some((player) => player.id === pair.menteeId),
                  )
                  .map((pair) => ({
                      mentorId: pair.mentorId as string,
                      menteeId: pair.menteeId as string,
                      startedSeason: Math.max(1, Number(pair.startedSeason) || 1),
                      startedWeek: Math.max(1, Number(pair.startedWeek) || 1),
                      sessions: Math.max(0, Number(pair.sessions) || 0),
                  }))
            : [],
        activeTryout,
        careerSlot: clampCareerSlot(
            Number.isFinite(career.careerSlot) ? career.careerSlot : fallbackSlot,
        ),
        activeFormationId:
            career.activeFormationId ||
            career.playbook?.formations?.[0]?.id ||
            'vertical',
        activePlayId: career.activePlayId || null,
        standings,
        schedule: migratedSchedule,
        reputation,
        finances: {
            budget: Number(career.finances?.budget) || CAREER_CONSTANTS.STARTING_BUDGET,
            playerSalaries: Number(career.finances?.playerSalaries) || 0,
            tournamentFees: Number(career.finances?.tournamentFees) || 0,
            travelCosts: Number(career.finances?.travelCosts) || 0,
            revenue: Number(career.finances?.revenue) || 0,
            income: Array.isArray((career.finances as any)?.income)
                ? (career.finances as any).income
                : [],
            expenses: Array.isArray((career.finances as any)?.expenses)
                ? (career.finances as any).expenses
                : [],
        },
    };
}

export function loadCareer(slot?: number): CareerData | null {
    const save = saveManager.load();
    if (!save) return null;

    const targetSlot = clampCareerSlot(
        slot ?? (typeof save.activeCareerSlot === 'number' ? save.activeCareerSlot : 0),
    );
    const careers = Array.isArray(save.careers) ? save.careers : [save.career || null, null, null];
    const raw = careers[targetSlot] || save.career || null;
    const hydrated = hydrateCareerData(raw, targetSlot);
    if (!hydrated) return null;

    if (save.activeCareerSlot !== targetSlot || save.career !== raw) {
        save.activeCareerSlot = targetSlot;
        save.career = hydrated;
        saveManager.save(save);
    }

    return hydrated;
}
