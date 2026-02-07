// Save/Load system using localStorage

import { PlayerStats, generateRoster } from './PlayerStats';
import { CAREER_CONSTANTS } from './CareerConstants';

const SAVE_KEY = 'frisqueendom_save_v1';
const SETTINGS_KEY = 'frisqueendom_settings_v1';
const REPLAY_KEY_PREFIX = 'frisqueendom_replay_';

export interface TeamData {
    id: string;
    name: string;
    shortName: string;
    primaryColor: number;
    secondaryColor: number;
    roster: PlayerStats[];
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

export interface CareerData {
    playerName: string;
    teamName: string;
    currentDate: Date;
    season: number;
    week: number;
    team: TeamData;
    playbook: PlaybookData;
    schedule: SeasonEvent[];
    matchHistory: MatchResult[];
    standings: LeagueStanding[];
    finances: TeamFinances;
    reputation: TeamReputation;
}

export type SeasonEvent = 
    | { type: 'tournament'; tournamentId: string; date: number }
    | { type: 'practice'; focus: 'offense' | 'defense' | 'conditioning' | 'throws'; date: number }
    | { type: 'rest'; date: number };

export interface LeagueStanding {
    teamId: string;
    teamName: string;
    wins: number;
    losses: number;
    pointDiff: number;
    spirit: number;
}

export interface TeamFinances {
    budget: number;
    playerSalaries: number;
    tournamentFees: number;
    travelCosts: number;
    revenue: number;
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
        reducedMotion: boolean;
    };
}

export interface SaveData {
    version: number;
    lastSaved: number;
    career: CareerData | null;
    quickMatchUnlocked: boolean;
    tutorialCompleted: boolean;
    achievements: string[];
    stats: GlobalStats;
}

export interface GlobalStats {
    totalGamesPlayed: number;
    totalPointsScored: number;
    careerGoals: number;
    careerAssists: number;
    careerBlocks: number;
    bestHuckDistance: number;
    fastestScore: number;
    longestGame: number;
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
            reducedMotion: false,
        },
    };
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
            this.cache = this.migrateSave(parsed);
            return this.cache;
        } catch (e) {
            console.error('Failed to load save:', e);
            return null;
        }
    }
    
    // Save data
    save(data: Partial<SaveData>): void {
        const existing = this.load() || this.createNewSave();
        const merged = { ...existing, ...data, lastSaved: Date.now() };
        
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
        return {
            version: 1,
            lastSaved: Date.now(),
            career: null,
            quickMatchUnlocked: false,
            tutorialCompleted: false,
            achievements: [],
            stats: {
                totalGamesPlayed: 0,
                totalPointsScored: 0,
                careerGoals: 0,
                careerAssists: 0,
                careerBlocks: 0,
                bestHuckDistance: 0,
                fastestScore: 0,
                longestGame: 0,
            },
        };
    }
    
    // Delete save
    deleteSave(): void {
        localStorage.removeItem(SAVE_KEY);
        this.cache = null;
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
            const data = JSON.parse(atob(saveString));
            if (this.validateSave(data)) {
                localStorage.setItem(SAVE_KEY, JSON.stringify(data));
                this.cache = data;
                return true;
            }
            return false;
        } catch (e) {
            console.error('Failed to import save:', e);
            return false;
        }
    }
    
    // Validate save data structure
    private validateSave(data: any): boolean {
        return data && 
               typeof data.version === 'number' &&
               typeof data.lastSaved === 'number' &&
               Array.isArray(data.achievements);
    }
    
    // Migrate old save versions
    private migrateSave(data: any): SaveData {
        // Version 1 is current
        if (!data.version) {
            data.version = 1;
        }
        return data;
    }
    
    // Settings management
    loadSettings(): GameSettings {
        const data = localStorage.getItem(SETTINGS_KEY);
        if (!data) return getDefaultSettings();
        
        try {
            return { ...getDefaultSettings(), ...JSON.parse(data) };
        } catch (e) {
            return getDefaultSettings();
        }
    }
    
    saveSettings(settings: Partial<GameSettings>): void {
        this.settings = { ...this.settings, ...settings };
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
}

// Helper functions
export const saveManager = SaveManager.getInstance();

// Career-specific helpers
export function createNewCareer(playerName: string, teamName: string): CareerData {
    const roster = generateRoster(20);
    
    const team: TeamData = {
        id: `team_${Date.now()}`,
        name: teamName,
        shortName: teamName.substring(0, 3).toUpperCase(),
        primaryColor: 0x1a73e8,
        secondaryColor: 0xffffff,
        roster,
        playbookId: 'default',
        stats: {
            wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
            spiritScore: 10, tournamentWins: 0,
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
    
    // Generate season schedule
    const schedule = generateSeasonSchedule(1);
    
    return {
        playerName,
        teamName,
        currentDate: new Date(2024, 2, 1), // March 1st, 2024
        season: 1,
        week: 1,
        team,
        playbook,
        schedule,
        matchHistory: [],
        standings: [],
        finances: {
            budget: CAREER_CONSTANTS.STARTING_BUDGET,
            playerSalaries: roster.length * CAREER_CONSTANTS.PLAYER_SALARY_BASE,
            tournamentFees: 0,
            travelCosts: 0,
            revenue: 0,
        },
        reputation: {
            overall: 50,
            skill: 50,
            spirit: 75,
            fanSupport: 50,
            recruitmentAppeal: 50,
        },
    };
}

export function generateSeasonSchedule(season: number): SeasonEvent[] {
    const schedule: SeasonEvent[] = [];
    let week = 1;
    
    // Spring series
    for (let i = 0; i < CAREER_CONSTANTS.DEFAULT_SEASON_LENGTH; i++) {
        if (i % 3 === 0) {
            // Tournament every 3 weeks
            schedule.push({
                type: 'tournament',
                tournamentId: `spring_${season}_${i}`,
                date: week,
            });
        } else if (i % 2 === 0) {
            // Practice
            const focuses: ('offense' | 'defense' | 'conditioning' | 'throws')[] = 
                ['offense', 'defense', 'conditioning', 'throws'];
            schedule.push({
                type: 'practice',
                focus: focuses[Math.floor(Math.random() * focuses.length)],
                date: week,
            });
        } else {
            // Rest
            schedule.push({ type: 'rest', date: week });
        }
        week++;
    }
    
    return schedule;
}

export function saveCareer(career: CareerData): void {
    const save = saveManager.load() || saveManager.createNewSave();
    save.career = career;
    save.quickMatchUnlocked = true;
    saveManager.save(save);
}

function hydrateCareerData(career: CareerData | null): CareerData | null {
    if (!career) return null;

    const currentDate = career.currentDate instanceof Date
        ? career.currentDate
        : new Date(career.currentDate);

    const roster = (career.team?.roster || []).map((player) =>
        player instanceof PlayerStats ? player : PlayerStats.fromJSON(player),
    );

    return {
        ...career,
        currentDate,
        team: {
            ...career.team,
            roster,
        },
    };
}

export function loadCareer(): CareerData | null {
    const save = saveManager.load();
    return hydrateCareerData(save?.career || null);
}
