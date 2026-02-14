import {
    type ProgressionData,
    type DailyChallengeState,
    type DailyChallengeMetric,
    type GlobalStats,
    type SaveData,
} from './SaveLoad';
import { Random } from './SeededRandom';

export interface ChallengeDefinition {
    id: string;
    description: string;
    xpReward: number;
    target: number;
    metric: DailyChallengeMetric;
}

export interface Unlockable {
    id: string;
    type: 'cosmetic' | 'celebration' | 'trail';
    name: string;
    levelRequired: number;
    description: string;
    assetKey: string;
}

export const XP_PER_LEVEL = 1000;

export const DAILY_CHALLENGE_POOL: ChallengeDefinition[] = [
    {
        id: 'daily_score_3',
        description: 'Score 3 Goals',
        xpReward: 150,
        target: 3,
        metric: 'team_goals',
    },
    {
        id: 'daily_block_2',
        description: 'Get 2 Blocks',
        xpReward: 150,
        target: 2,
        metric: 'team_blocks',
    },
    {
        id: 'daily_win_1',
        description: 'Win 1 Match',
        xpReward: 200,
        target: 1,
        metric: 'win_match',
    },
    {
        id: 'daily_complete_20',
        description: 'Complete 20 Passes',
        xpReward: 100,
        target: 20,
        metric: 'team_completions',
    },
    {
        id: 'daily_no_stalls',
        description: 'Finish a match with no stall turnovers',
        xpReward: 300,
        target: 1,
        metric: 'no_stall_turnovers',
    },
];

export const UNLOCKABLES: Unlockable[] = [
    {
        id: 'trail_green',
        type: 'trail',
        name: 'Neon Green Trail',
        levelRequired: 1,
        description: 'A vibrant green trail.',
        assetKey: '#39d67d',
    },
    {
        id: 'trail_neon_blue',
        type: 'trail',
        name: 'Neon Blue Trail',
        levelRequired: 2,
        description: 'A glowing blue trail for your throws.',
        assetKey: '#00ffff',
    },
    {
        id: 'cel_spike',
        type: 'celebration',
        name: 'Spike Celebration',
        levelRequired: 3,
        description: 'Spike the disc after scoring!',
        assetKey: 'spike',
    },
    {
        id: 'accent_gold',
        type: 'cosmetic',
        name: 'Gold Halo',
        levelRequired: 5,
        description: 'A shiny gold halo for your players.',
        assetKey: '#ffd700',
    },
    {
        id: 'trail_fire',
        type: 'trail',
        name: 'Fire Trail',
        levelRequired: 7,
        description: 'Leaves a burning trail behind the disc.',
        assetKey: '#ff4500',
    },
    {
        id: 'cel_backflip',
        type: 'celebration',
        name: 'Backflip',
        levelRequired: 10,
        description: 'Show off with a backflip.',
        assetKey: 'backflip',
    },
];

export function getLevel(xp: number): number {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function getXpProgress(xp: number): number {
    return xp % XP_PER_LEVEL;
}

export function generateDailyChallenges(): DailyChallengeState[] {
    // Pick 3 random challenges
    const shuffled = [...DAILY_CHALLENGE_POOL].sort(() => Random.next() - 0.5);
    const selected = shuffled.slice(0, 3);
    
    return selected.map(def => ({
        id: def.id,
        title: 'Daily Challenge',
        description: def.description,
        metric: def.metric,
        target: def.target,
        progress: 0,
        rewardXp: def.xpReward,
        completed: false,
    }));
}

export function checkUnlocks(currentLevel: number, currentUnlocks: string[]): Unlockable[] {
    return UNLOCKABLES.filter(
        item => item.levelRequired <= currentLevel && !currentUnlocks.includes(item.id)
    );
}

// ---------------------------------------------------------------------------
// Achievement System
// ---------------------------------------------------------------------------

export interface Achievement {
    id: string;
    name: string;
    description: string;
    category: 'throwing' | 'catching' | 'game' | 'career' | 'hidden';
    requirement: { stat: string; target: number };
    reward: { xp: number; cosmeticId?: string };
}

export const ACHIEVEMENT_CATALOG: Achievement[] = [
    // -- Throwing --
    {
        id: 'ach_first_blood',
        name: 'First Blood',
        description: 'Score your first goal.',
        category: 'throwing',
        requirement: { stat: 'careerGoals', target: 1 },
        reward: { xp: 50 },
    },
    {
        id: 'ach_sniper',
        name: 'Sniper',
        description: '90%+ completion rate in a game (min 10 throws).',
        category: 'throwing',
        requirement: { stat: 'sniper_game', target: 1 },
        reward: { xp: 200 },
    },
    {
        id: 'ach_century_goals',
        name: 'Century',
        description: 'Score 100 career goals.',
        category: 'throwing',
        requirement: { stat: 'careerGoals', target: 100 },
        reward: { xp: 500, cosmeticId: 'accent_century' },
    },
    {
        id: 'ach_huck_master',
        name: 'Huck Master',
        description: 'Complete 50 hucks over 40m.',
        category: 'throwing',
        requirement: { stat: 'hucks_over_40m', target: 50 },
        reward: { xp: 400, cosmeticId: 'trail_huck_rainbow' },
    },
    {
        id: 'ach_assist_king',
        name: 'Assist King',
        description: 'Record 100 career assists.',
        category: 'throwing',
        requirement: { stat: 'careerAssists', target: 100 },
        reward: { xp: 400 },
    },
    {
        id: 'ach_thousand_completions',
        name: 'Thousand Threads',
        description: 'Complete 1,000 career passes.',
        category: 'throwing',
        requirement: { stat: 'careerCompletions', target: 1000 },
        reward: { xp: 500 },
    },
    {
        id: 'ach_break_artist',
        name: 'Break Artist',
        description: 'Complete 25 break-mark throws.',
        category: 'throwing',
        requirement: { stat: 'break_mark_completions', target: 25 },
        reward: { xp: 300 },
    },
    {
        id: 'ach_versatile_thrower',
        name: 'Versatile Thrower',
        description: 'Score with backhand, forehand, hammer, and scoober.',
        category: 'throwing',
        requirement: { stat: 'throw_types_scored', target: 4 },
        reward: { xp: 250 },
    },
    {
        id: 'ach_long_bomb',
        name: 'Long Bomb',
        description: 'Complete a throw of 60m or more.',
        category: 'throwing',
        requirement: { stat: 'bestHuckDistance', target: 60 },
        reward: { xp: 200 },
    },
    {
        id: 'ach_five_hundred_goals',
        name: 'Goal Machine',
        description: 'Score 500 career goals.',
        category: 'throwing',
        requirement: { stat: 'careerGoals', target: 500 },
        reward: { xp: 750, cosmeticId: 'accent_golden_arm' },
    },

    // -- Catching --
    {
        id: 'ach_layout_legend',
        name: 'Layout Legend',
        description: 'Make 50 layout catches.',
        category: 'catching',
        requirement: { stat: 'layoutCatches', target: 50 },
        reward: { xp: 400, cosmeticId: 'cel_layout_dust' },
    },
    {
        id: 'ach_sky_dominator',
        name: 'Sky Dominator',
        description: 'Win 30 contested sky battles.',
        category: 'catching',
        requirement: { stat: 'skyWins', target: 30 },
        reward: { xp: 350 },
    },
    {
        id: 'ach_sure_hands',
        name: 'Sure Hands',
        description: 'Catch 100 throws without a drop.',
        category: 'catching',
        requirement: { stat: 'consecutive_catches', target: 100 },
        reward: { xp: 300 },
    },
    {
        id: 'ach_first_layout',
        name: 'Full Extension',
        description: 'Make your first layout catch.',
        category: 'catching',
        requirement: { stat: 'layoutCatches', target: 1 },
        reward: { xp: 100 },
    },
    {
        id: 'ach_first_sky',
        name: 'Sky High',
        description: 'Win your first contested sky battle.',
        category: 'catching',
        requirement: { stat: 'skyWins', target: 1 },
        reward: { xp: 100 },
    },

    // -- Game --
    {
        id: 'ach_perfect_game',
        name: 'Perfect Game',
        description: 'Win a game without a single turnover.',
        category: 'game',
        requirement: { stat: 'perfect_games', target: 1 },
        reward: { xp: 500, cosmeticId: 'trail_golden_glow' },
    },
    {
        id: 'ach_upset',
        name: 'Upset',
        description: 'Beat a team ranked 10+ spots above you.',
        category: 'game',
        requirement: { stat: 'upsets', target: 1 },
        reward: { xp: 300 },
    },
    {
        id: 'ach_comeback_king',
        name: 'Comeback King',
        description: 'Win after being down 5+ points.',
        category: 'game',
        requirement: { stat: 'comebacks', target: 1 },
        reward: { xp: 400 },
    },
    {
        id: 'ach_shutout',
        name: 'Shutout Artist',
        description: 'Win a game 15-0.',
        category: 'game',
        requirement: { stat: 'shutouts', target: 1 },
        reward: { xp: 400 },
    },
    {
        id: 'ach_universe_clutch',
        name: 'Universe Clutch',
        description: 'Win on universe point.',
        category: 'game',
        requirement: { stat: 'universe_wins', target: 1 },
        reward: { xp: 350 },
    },
    {
        id: 'ach_ten_wins',
        name: 'Getting Started',
        description: 'Win 10 games.',
        category: 'game',
        requirement: { stat: 'totalWins', target: 10 },
        reward: { xp: 150 },
    },
    {
        id: 'ach_fifty_wins',
        name: 'Veteran',
        description: 'Win 50 games.',
        category: 'game',
        requirement: { stat: 'totalWins', target: 50 },
        reward: { xp: 400 },
    },
    {
        id: 'ach_hundred_wins',
        name: 'Champion',
        description: 'Win 100 games.',
        category: 'game',
        requirement: { stat: 'totalWins', target: 100 },
        reward: { xp: 600, cosmeticId: 'accent_champion_ring' },
    },

    // -- Career --
    {
        id: 'ach_iron_person',
        name: 'Iron Person',
        description: 'Play every point in a tournament.',
        category: 'career',
        requirement: { stat: 'iron_person_tournaments', target: 1 },
        reward: { xp: 350 },
    },
    {
        id: 'ach_the_wall',
        name: 'The Wall',
        description: 'Record 100 career blocks.',
        category: 'career',
        requirement: { stat: 'careerBlocks', target: 100 },
        reward: { xp: 500, cosmeticId: 'accent_brick_wall' },
    },
    {
        id: 'ach_dynasty',
        name: 'Dynasty',
        description: 'Win nationals 3 times.',
        category: 'career',
        requirement: { stat: 'nationals_titles', target: 3 },
        reward: { xp: 1000, cosmeticId: 'accent_dynasty_crown' },
    },
    {
        id: 'ach_spirit_champion',
        name: 'Spirit Champion',
        description: 'Achieve a perfect spirit score in a tournament.',
        category: 'career',
        requirement: { stat: 'perfect_spirit_tournaments', target: 1 },
        reward: { xp: 300 },
    },
    {
        id: 'ach_first_season',
        name: 'Rookie Season',
        description: 'Complete your first season.',
        category: 'career',
        requirement: { stat: 'seasons_completed', target: 1 },
        reward: { xp: 200 },
    },
    {
        id: 'ach_marathon',
        name: 'Marathon',
        description: 'Play 500 career points.',
        category: 'career',
        requirement: { stat: 'totalPointsPlayed', target: 500 },
        reward: { xp: 400 },
    },
    {
        id: 'ach_distance_runner',
        name: 'Distance Runner',
        description: 'Throw a cumulative 10,000 meters.',
        category: 'career',
        requirement: { stat: 'totalThrowDistanceMeters', target: 10000 },
        reward: { xp: 350 },
    },

    // -- Hidden --
    {
        id: 'ach_callahan',
        name: 'Callahan',
        description: 'Score a Callahan goal (intercept in the end zone).',
        category: 'hidden',
        requirement: { stat: 'callahan_goals', target: 1 },
        reward: { xp: 500, cosmeticId: 'cel_callahan_flash' },
    },
    {
        id: 'ach_greatest',
        name: 'The Greatest',
        description: 'Throw a "greatest" (jump from in-bounds, throw while airborne out-of-bounds).',
        category: 'hidden',
        requirement: { stat: 'greatest_throws', target: 1 },
        reward: { xp: 500, cosmeticId: 'trail_greatest_spark' },
    },
    {
        id: 'ach_gauntlet',
        name: 'Gauntlet Survivor',
        description: 'Win 5 games in a row on Legend difficulty.',
        category: 'hidden',
        requirement: { stat: 'gauntlet_completions', target: 1 },
        reward: { xp: 750, cosmeticId: 'accent_diamond_disc' },
    },
    {
        id: 'ach_night_owl',
        name: 'Night Owl',
        description: 'Play a game after midnight local time.',
        category: 'hidden',
        requirement: { stat: 'midnight_games', target: 1 },
        reward: { xp: 100 },
    },
];

/**
 * Check which achievements have been newly earned given the player's current
 * stats and the list of already-earned achievement IDs.
 *
 * Returns only the *newly* earned achievements (not yet in `earnedIds`).
 */
export function checkAchievements(
    stats: Record<string, number>,
    earnedIds: string[],
): Achievement[] {
    const earned = new Set(earnedIds);
    return ACHIEVEMENT_CATALOG.filter((ach) => {
        if (earned.has(ach.id)) return false;
        const value = stats[ach.requirement.stat] ?? 0;
        return value >= ach.requirement.target;
    });
}

// ---------------------------------------------------------------------------
// Lifetime Stats
// ---------------------------------------------------------------------------

export interface LifetimeStats {
    gamesPlayed: number;
    goals: number;
    assists: number;
    blocks: number;
    turnovers: number;
    completionPct: number;
    layoutCatches: number;
    skyWins: number;
    longestThrow: number;
    totalDistanceThrown: number;
    pointsPlayed: number;
    winRate: number;
    spiritAverage: number;
}

/**
 * Derive aggregate lifetime stats from a full save's progression and global
 * stats data.  Accepts the top-level `SaveData` so it can pull from both
 * `stats` (GlobalStats) and `progression`.
 */
export function computeLifetimeStats(data: SaveData): LifetimeStats {
    const s: GlobalStats = data.stats;

    const gamesPlayed = s.totalGamesPlayed;
    const totalGamesDecided = s.totalWins + s.totalLosses;

    return {
        gamesPlayed,
        goals: s.careerGoals,
        assists: s.careerAssists,
        blocks: s.careerBlocks,
        turnovers: s.careerTurnovers,
        completionPct:
            s.careerAttempts > 0
                ? Math.round((s.careerCompletions / s.careerAttempts) * 1000) / 10
                : 0,
        layoutCatches: s.layoutCatches,
        skyWins: s.skyWins,
        longestThrow: s.bestHuckDistance,
        totalDistanceThrown: s.totalThrowDistanceMeters,
        pointsPlayed: s.totalPointsPlayed,
        winRate:
            totalGamesDecided > 0
                ? Math.round((s.totalWins / totalGamesDecided) * 1000) / 10
                : 0,
        spiritAverage:
            gamesPlayed > 0
                ? Math.round((s.totalSpiritScore / gamesPlayed) * 100) / 100
                : 0,
    };
}
