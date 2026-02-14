import type { TeamSide, MatchPhase, MatchConfig, DiscLifecycle } from '../data/Types';
import type { TimeOfDay, WeatherCondition, Venue } from '../data/WeatherTypes';
import type { AIDifficulty, AIPersonality } from '../ai/TeamAI';

// ── Game Mode ──

export type GameMode =
    | 'menu'
    | 'practice'
    | 'quick_match'
    | 'career_match'
    | 'spectator_match'
    | 'highlights_reel';

// ── Multiplayer Mode ──

export type MultiplayerMode =
    | 'single'
    | 'local_split'
    | 'lan_remote'
    | 'lan_spectator';

// ── Match State ──

export interface MatchState {
    phase: MatchPhase;
    score: [number, number];
    offenseTeam: TeamSide;
    stallCount: number;
    gameToScore: number;
    pointNumber: number;
}

// ── Environment State ──

export interface EnvironmentState {
    timeOfDay: TimeOfDay;
    weather: WeatherCondition;
    venue: Venue;
    windSpeed: number;
    windDirection: number;
}

// ── Team Configuration ──

export interface TeamConfig {
    name: string;
    primaryColor: number;
    secondaryColor: number;
    side: TeamSide;
    difficulty: AIDifficulty;
    personality: AIPersonality;
    isPlayerControlled: boolean;
}

// ── Central Game State ──

export class GameState {
    // Mode
    mode: GameMode = 'menu';
    isPaused = false;
    isSpectator = false;
    timeScale = 1;

    // Multiplayer
    multiplayerMode: MultiplayerMode = 'single';

    // Match
    match: MatchState = {
        phase: 'pre_pull',
        score: [0, 0],
        offenseTeam: 'away',
        stallCount: 0,
        gameToScore: 15,
        pointNumber: 1,
    };

    // Disc
    disc: {
        state: DiscLifecycle;
        holderId: string | null;
    } = {
        state: 'held',
        holderId: null,
    };

    // Environment
    environment: EnvironmentState = {
        timeOfDay: 'midday',
        weather: 'clear',
        venue: 'park',
        windSpeed: 3.0,
        windDirection: 1.57,
    };

    // Teams
    homeTeam: TeamConfig = {
        name: 'Home',
        primaryColor: 0x1e90ff,
        secondaryColor: 0xffffff,
        side: 'home',
        difficulty: 'normal',
        personality: 'balanced',
        isPlayerControlled: true,
    };
    awayTeam: TeamConfig = {
        name: 'Away',
        primaryColor: 0xff4500,
        secondaryColor: 0xffffff,
        side: 'away',
        difficulty: 'normal',
        personality: 'balanced',
        isPlayerControlled: false,
    };

    // Match config (set once at start)
    matchConfig: MatchConfig | null = null;

    // Career
    isCareerMatch = false;

    // Timing
    matchElapsedSeconds = 0;

    // ── Subscriptions ──

    private subscribers = new Map<string, Set<() => void>>();

    subscribe(path: string, callback: () => void): () => void {
        let set = this.subscribers.get(path);
        if (!set) {
            set = new Set();
            this.subscribers.set(path, set);
        }
        set.add(callback);
        return () => { set!.delete(callback); };
    }

    notify(path: string): void {
        const set = this.subscribers.get(path);
        if (set) {
            for (const cb of set) cb();
        }
    }

    // ── Convenience Mutators ──

    setScore(home: number, away: number): void {
        this.match.score = [home, away];
        this.notify('match.score');
    }

    setPhase(phase: MatchPhase): void {
        this.match.phase = phase;
        this.notify('match.phase');
    }

    setMode(mode: GameMode): void {
        this.mode = mode;
        this.notify('mode');
    }

    setPaused(paused: boolean): void {
        this.isPaused = paused;
        this.notify('isPaused');
    }

    // ── Reset ──

    reset(): void {
        this.mode = 'menu';
        this.isPaused = false;
        this.isSpectator = false;
        this.timeScale = 1;
        this.match = {
            phase: 'pre_pull',
            score: [0, 0],
            offenseTeam: 'away',
            stallCount: 0,
            gameToScore: 15,
            pointNumber: 1,
        };
        this.disc = { state: 'held', holderId: null };
        this.matchElapsedSeconds = 0;
        this.isCareerMatch = false;
        this.matchConfig = null;
    }
}
