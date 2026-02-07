import type { ThrowParams, MatchPhase, TeamSide } from '../data/Types';

/**
 * Types of events that can be recorded in a replay
 */
export type ReplayEventType =
    | 'player_input'
    | 'match_phase_change'
    | 'disc_throw'
    | 'disc_catch'
    | 'disc_turnover'
    | 'disc_score'
    | 'match_start'
    | 'match_end';

/**
 * Base event interface with timestamp
 */
export interface ReplayEvent {
    timestamp: number; // seconds since replay start
    type: ReplayEventType;
    data: unknown;
}

/**
 * Player input event data
 */
export interface PlayerInputEventData {
    playerId: string;
    team: TeamSide;
    movement: { x: number; z: number };
    sprint: boolean;
    throwParams?: ThrowParams;
}

/**
 * Match phase change event data
 */
export interface MatchPhaseChangeEventData {
    fromPhase: MatchPhase;
    toPhase: MatchPhase;
    score: [number, number];
}

/**
 * Disc throw event data
 */
export interface DiscThrowEventData {
    throwerId: string;
    team: TeamSide;
    throwParams: ThrowParams;
}

/**
 * Disc catch event data
 */
export interface DiscCatchEventData {
    catcherId: string;
    team: TeamSide;
    position: { x: number; y: number; z: number };
}

/**
 * Disc turnover event data
 */
export interface DiscTurnoverEventData {
    reason: string;
    position: { x: number; y: number; z: number };
}

/**
 * Disc score event data
 */
export interface DiscScoreEventData {
    scorerId: string;
    team: TeamSide;
    score: [number, number];
}

/**
 * Match settings for replay
 */
export interface MatchSettings {
    gameTo: number;
    homeTeam: TeamSide;
    awayTeam: TeamSide;
}

/**
 * Complete replay data structure
 */
export interface ReplayData {
    version: string; // replay format version
    matchSeed: number; // random seed for deterministic AI
    events: ReplayEvent[];
    teamNames: { home: string; away: string };
    matchSettings: MatchSettings;
    recordedAt: string; // ISO timestamp
    duration: number; // total replay duration in seconds
}

/**
 * Replay metadata for listing
 */
export interface ReplayMetadata {
    key: string;
    date: string;
    teams: string;
    score: string;
    duration: number;
}

/**
 * ReplayRecorder captures game events for later playback
 */
export class ReplayRecorder {
    private events: ReplayEvent[] = [];
    private startTime: number = 0;
    private isRecording: boolean = false;
    private matchSeed: number = 0;
    private teamNames: { home: string; away: string } = { home: 'Home', away: 'Away' };
    private matchSettings: MatchSettings = {
        gameTo: 11,
        homeTeam: 'home',
        awayTeam: 'away',
    };

    /**
     * Start recording a new replay
     */
    start(seed: number, teamNames: { home: string; away: string }, settings: MatchSettings): void {
        this.events = [];
        this.startTime = performance.now();
        this.isRecording = true;
        this.matchSeed = seed;
        this.teamNames = { ...teamNames };
        this.matchSettings = { ...settings };

        this.recordEvent('match_start', {
            seed,
            teamNames,
            settings,
        });
    }

    /**
     * Stop recording
     */
    stop(): void {
        if (this.isRecording) {
            this.recordEvent('match_end', {
                finalEventCount: this.events.length,
            });
            this.isRecording = false;
        }
    }

    /**
     * Check if currently recording
     */
    recording(): boolean {
        return this.isRecording;
    }

    /**
     * Record a generic event
     */
    recordEvent(type: ReplayEventType, data: unknown): void {
        if (!this.isRecording) return;

        const timestamp = (performance.now() - this.startTime) / 1000;
        this.events.push({
            timestamp,
            type,
            data,
        });
    }

    /**
     * Record player input
     */
    recordPlayerInput(
        playerId: string,
        team: TeamSide,
        movement: { x: number; z: number },
        sprint: boolean,
        throwParams?: ThrowParams,
    ): void {
        this.recordEvent('player_input', {
            playerId,
            team,
            movement,
            sprint,
            throwParams,
        } as PlayerInputEventData);
    }

    /**
     * Record match phase change
     */
    recordPhaseChange(fromPhase: MatchPhase, toPhase: MatchPhase, score: [number, number]): void {
        this.recordEvent('match_phase_change', {
            fromPhase,
            toPhase,
            score,
        } as MatchPhaseChangeEventData);
    }

    /**
     * Record disc throw
     */
    recordThrow(throwerId: string, team: TeamSide, throwParams: ThrowParams): void {
        this.recordEvent('disc_throw', {
            throwerId,
            team,
            throwParams,
        } as DiscThrowEventData);
    }

    /**
     * Record disc catch
     */
    recordCatch(catcherId: string, team: TeamSide, position: { x: number; y: number; z: number }): void {
        this.recordEvent('disc_catch', {
            catcherId,
            team,
            position,
        } as DiscCatchEventData);
    }

    /**
     * Record disc turnover
     */
    recordTurnover(reason: string, position: { x: number; y: number; z: number }): void {
        this.recordEvent('disc_turnover', {
            reason,
            position,
        } as DiscTurnoverEventData);
    }

    /**
     * Record score
     */
    recordScore(scorerId: string, team: TeamSide, score: [number, number]): void {
        this.recordEvent('disc_score', {
            scorerId,
            team,
            score,
        } as DiscScoreEventData);
    }

    /**
     * Get current replay data
     */
    getData(): ReplayData {
        const duration = this.events.length > 0
            ? this.events[this.events.length - 1].timestamp
            : 0;

        return {
            version: '1.0.0',
            matchSeed: this.matchSeed,
            events: [...this.events],
            teamNames: { ...this.teamNames },
            matchSettings: { ...this.matchSettings },
            recordedAt: new Date().toISOString(),
            duration,
        };
    }
}

const REPLAY_STORAGE_PREFIX = 'frisqueendom_replay_';
let replayCounter = 0;

/**
 * Save replay data to localStorage
 * @returns localStorage key for the saved replay
 */
export function saveReplay(data: ReplayData): string {
    const timestamp = Date.now();
    const key = `${REPLAY_STORAGE_PREFIX}${timestamp}_${replayCounter++}`;
    try {
        const serialized = JSON.stringify(data);
        localStorage.setItem(key, serialized);
        return key;
    } catch (error) {
        console.error('Failed to save replay:', error);
        throw new Error('Failed to save replay to localStorage');
    }
}

/**
 * Load replay data from localStorage
 */
export function loadReplay(key: string): ReplayData | null {
    try {
        const serialized = localStorage.getItem(key);
        if (!serialized) return null;
        return JSON.parse(serialized) as ReplayData;
    } catch (error) {
        console.error('Failed to load replay:', error);
        return null;
    }
}

/**
 * List all saved replays with metadata
 */
export function listReplays(): ReplayMetadata[] {
    const replays: ReplayMetadata[] = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(REPLAY_STORAGE_PREFIX)) continue;

        try {
            const data = loadReplay(key);
            if (!data) continue;

            // Extract score from final score event or match_end
            let finalScore = [0, 0];
            for (let j = data.events.length - 1; j >= 0; j--) {
                const event = data.events[j];
                if (event.type === 'disc_score') {
                    const scoreData = event.data as DiscScoreEventData;
                    finalScore = scoreData.score;
                    break;
                } else if (event.type === 'match_phase_change') {
                    const phaseData = event.data as MatchPhaseChangeEventData;
                    finalScore = phaseData.score;
                    break;
                }
            }

            replays.push({
                key,
                date: data.recordedAt,
                teams: `${data.teamNames.home} vs ${data.teamNames.away}`,
                score: `${finalScore[0]}-${finalScore[1]}`,
                duration: data.duration,
            });
        } catch (error) {
            console.error(`Failed to parse replay ${key}:`, error);
        }
    }

    // Sort by date, newest first
    replays.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return replays;
}

/**
 * Delete a replay from localStorage
 */
export function deleteReplay(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error('Failed to delete replay:', error);
        throw new Error('Failed to delete replay from localStorage');
    }
}
