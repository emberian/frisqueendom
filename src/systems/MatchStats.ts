import type { TeamSide } from '../data/Types';
import type {
    MatchEventItem,
    PerformerLine,
} from '../ui/PostMatchOverlay';
import type { HalftimeSummary } from '../ui/HalftimeOverlay';
import type { MatchPlayerStats, MatchResult } from '../data/SaveLoad';
// ── Stat Interfaces ──

export interface TeamLiveStats {
    turnovers: number;
    completions: number;
    attempts: number;
    longThrowMeters: number;
}

export interface PlayerLiveStatLine {
    playerId: string;
    team: TeamSide;
    goals: number;
    assists: number;
    blocks: number;
    throwaways: number;
    drops: number;
    completions: number;
    attempts: number;
    playingTime: number;
}

// ── Internal performer record ──

interface PerformerRecord {
    playerId: string;
    name: string;
    teamName: string;
    goals: number;
    blocks: number;
}

// ── Momentum event ──

interface MomentumEvent {
    team: TeamSide;
    weight: number;
    timestamp: number;
}

// ── Helpers ──

function completionPct(stats: TeamLiveStats): number {
    if (stats.attempts <= 0) return 0;
    return (stats.completions / stats.attempts) * 100;
}

function formatClockLabel(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const mm = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
}

export function estimateThrowDistanceMeters(speed: number, directionY: number): number {
    const loftBoost = Math.max(-3, Math.min(9, directionY * 7));
    return Math.max(3, speed * 0.9 + loftBoost);
}

// ── MatchStats System ──

/**
 * Centralized stat tracking for a single match.
 *
 * Extracted from main.ts's startGame() closure. Collects per-team and
 * per-player stats, momentum events, match event log, and provides
 * builders for the halftime summary, post-match performers, progression
 * data, and career match results.
 *
 * Does NOT subscribe to EventBus itself — callers push data in via the
 * public methods so that the existing main.ts code can integrate
 * incrementally.
 */
export class MatchStats {
    // Per-team aggregate stats
    readonly teamStats: Record<TeamSide, TeamLiveStats> = {
        home: { turnovers: 0, completions: 0, attempts: 0, longThrowMeters: 0 },
        away: { turnovers: 0, completions: 0, attempts: 0, longThrowMeters: 0 },
    };

    // Stall turnovers specifically tracked for progression
    readonly stallTurnoversByTeam: Record<TeamSide, number> = {
        home: 0,
        away: 0,
    };

    // Per-player stat lines
    private readonly playerStatsMap = new Map<string, PlayerLiveStatLine>();

    // "Top performer" records keyed by playerId
    private readonly performanceMap = new Map<string, PerformerRecord>();

    // Momentum timeline
    private readonly momentumEvents: MomentumEvent[] = [];

    // Last thrower per team (for attributing completions/turnovers)
    readonly lastThrowerByTeam: Partial<Record<TeamSide, string>> = {};

    // Last completed pass per team (for assist attribution)
    readonly lastCompletedPassByTeam: Partial<
        Record<TeamSide, { throwerId: string; receiverId: string }>
    > = {};

    // Whether the most recent turnover for a team was a drop
    readonly dropTurnoverTeam: Partial<Record<TeamSide, boolean>> = {};

    // Chronological match event log
    readonly matchEvents: MatchEventItem[] = [];

    // Start timestamp
    private readonly matchStartTime: number;

    constructor(matchStartTime?: number) {
        this.matchStartTime = matchStartTime ?? performance.now();
    }

    // ── Player stat line access ──

    getPlayerLine(team: TeamSide, playerId: string): PlayerLiveStatLine {
        const existing = this.playerStatsMap.get(playerId);
        if (existing) return existing;

        const line: PlayerLiveStatLine = {
            playerId,
            team,
            goals: 0,
            assists: 0,
            blocks: 0,
            throwaways: 0,
            drops: 0,
            completions: 0,
            attempts: 0,
            playingTime: 0,
        };
        this.playerStatsMap.set(playerId, line);
        return line;
    }

    // ── Recording helpers ──

    registerThrowAttempt(
        team: TeamSide,
        throwerId: string,
        estimatedDistance: number,
    ): void {
        this.teamStats[team].attempts += 1;
        this.teamStats[team].longThrowMeters = Math.max(
            this.teamStats[team].longThrowMeters,
            estimatedDistance,
        );
        this.getPlayerLine(team, throwerId).attempts += 1;
        this.lastThrowerByTeam[team] = throwerId;
        this.dropTurnoverTeam[team] = false;
    }

    registerMomentum(team: TeamSide, weight: number): void {
        this.momentumEvents.push({
            team,
            weight,
            timestamp: performance.now() - this.matchStartTime,
        });
        if (this.momentumEvents.length > 120) {
            this.momentumEvents.shift();
        }
    }

    addGoal(
        playerId: string,
        playerName: string,
        teamName: string,
        team: TeamSide,
    ): void {
        const perf = this.performanceMap.get(playerId) ?? {
            playerId,
            name: playerName,
            teamName,
            goals: 0,
            blocks: 0,
        };
        perf.goals += 1;
        this.performanceMap.set(playerId, perf);

        this.getPlayerLine(team, playerId).goals += 1;

        const lastPass = this.lastCompletedPassByTeam[team];
        if (lastPass && lastPass.receiverId === playerId) {
            this.getPlayerLine(team, lastPass.throwerId).assists += 1;
        }
    }

    addBlock(
        playerId: string,
        playerName: string,
        teamName: string,
        team: TeamSide,
    ): void {
        const perf = this.performanceMap.get(playerId) ?? {
            playerId,
            name: playerName,
            teamName,
            goals: 0,
            blocks: 0,
        };
        perf.blocks += 1;
        this.performanceMap.set(playerId, perf);

        this.getPlayerLine(team, playerId).blocks += 1;
    }

    recordEvent(
        type: MatchEventItem['type'],
        text: string,
        playerId?: string,
    ): void {
        this.matchEvents.push({
            timeLabel: formatClockLabel(
                (performance.now() - this.matchStartTime) / 1000,
            ),
            type,
            text,
            playerId,
        });
    }

    // ── Summary builders ──

    buildHalftimeSummary(
        homeTeamName: string,
        awayTeamName: string,
    ): HalftimeSummary {
        let homeMomentum = 0;
        let awayMomentum = 0;
        for (const event of this.momentumEvents.slice(-12)) {
            if (event.team === 'home') {
                homeMomentum += event.weight;
            } else {
                awayMomentum += event.weight;
            }
        }
        const momentumDelta = homeMomentum - awayMomentum;
        const momentumValue = Math.max(-1, Math.min(1, momentumDelta / 6));
        const momentumLabel =
            Math.abs(momentumValue) < 0.18
                ? 'Momentum is even heading into the second half.'
                : momentumValue > 0
                ? `${homeTeamName} are pushing the pace.`
                : `${awayTeamName} are carrying the momentum.`;

        return {
            home: {
                teamName: homeTeamName,
                turnovers: this.teamStats.home.turnovers,
                completionPct: completionPct(this.teamStats.home),
                longThrowMeters: this.teamStats.home.longThrowMeters,
            },
            away: {
                teamName: awayTeamName,
                turnovers: this.teamStats.away.turnovers,
                completionPct: completionPct(this.teamStats.away),
                longThrowMeters: this.teamStats.away.longThrowMeters,
            },
            momentumLabel,
            momentumValue,
        };
    }

    buildPerformerLines(): PerformerLine[] {
        return Array.from(this.performanceMap.values())
            .map((perf) => ({
                playerId: perf.playerId,
                name: perf.name,
                teamName: perf.teamName,
                goals: perf.goals,
                blocks: perf.blocks,
                impact: perf.goals * 3 + perf.blocks * 2,
            }))
            .sort((a, b) => b.impact - a.impact || b.goals - a.goals);
    }

    /**
     * Build career-specific MatchResult from the accumulated stat data.
     *
     * Returns null if not applicable (e.g. not a career match).
     */
    buildCareerMatchResult(opts: {
        careerLineupUsage: Set<string>;
        rosterById: Map<string, { id: string }>;
        score: [number, number];
        awayTeamName: string;
        playerSpirit: number;
        opponentSpirit: number;
        opponentTeamId?: string;
        opponentRating: number;
    }): MatchResult {
        const trackedIds = new Set<string>(opts.careerLineupUsage);
        for (const line of this.playerStatsMap.values()) {
            if (line.team === 'home') trackedIds.add(line.playerId);
        }

        const statLines: MatchPlayerStats[] = [...trackedIds]
            .map((playerId) => opts.rosterById.get(playerId))
            .filter(
                (player): player is NonNullable<typeof player> => !!player,
            )
            .map((player) => {
                const line = this.playerStatsMap.get(player.id);
                const goals = line?.goals ?? 0;
                const assists = line?.assists ?? 0;
                const blocks = line?.blocks ?? 0;
                const throwaways = line?.throwaways ?? 0;
                const drops = line?.drops ?? 0;
                const completions = line?.completions ?? 0;
                const attempts = line?.attempts ?? 0;
                return {
                    playerId: player.id,
                    goals,
                    assists,
                    blocks,
                    throwaways,
                    drops,
                    completions,
                    attempts,
                    plusMinus:
                        goals + assists + blocks - throwaways - drops,
                    playingTime: line?.playingTime ?? 0,
                };
            })
            .sort((a, b) => b.playingTime - a.playingTime);

        const highlights = this.matchEvents
            .map((event) => {
                if (!event.playerId) return null;
                if (event.type === 'goal') {
                    return {
                        type: 'goal' as const,
                        playerId: event.playerId,
                        timestamp: 0,
                        description: event.text,
                    };
                }
                if (event.type === 'block') {
                    return {
                        type: 'block' as const,
                        playerId: event.playerId,
                        timestamp: 0,
                        description: event.text,
                    };
                }
                return null;
            })
            .filter(
                (item): item is NonNullable<typeof item> => item !== null,
            );

        return {
            id: `career_match_${Date.now()}`,
            date: Date.now(),
            opponentName: opts.awayTeamName,
            opponentTeamId: opts.opponentTeamId,
            opponentRating: opts.opponentRating,
            playerScore: opts.score[0],
            opponentScore: opts.score[1],
            playerSpirit: opts.playerSpirit,
            opponentSpirit: opts.opponentSpirit,
            stats: statLines,
            highlights,
        };
    }

    /**
     * Get the full player stats map. Useful for external iteration
     * (e.g. career mode playing time tracking).
     */
    getPlayerStatsMap(): ReadonlyMap<string, PlayerLiveStatLine> {
        return this.playerStatsMap;
    }
}
