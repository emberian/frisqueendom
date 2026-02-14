// Challenge Mode: structured skill scenarios with medal progression

export interface Challenge {
    id: string;
    name: string;
    category: 'throwing' | 'catching' | 'game' | 'team';
    description: string;
    setup: ChallengeSetup;
    objectives: ChallengeObjective[];
    medals: { bronze: number; silver: number; gold: number; diamond: number };
    reward: { xp: number; cosmeticId?: string; achievementId?: string };
}

export interface ChallengeSetup {
    fieldPosition?: { x: number; z: number };
    wind?: { speed: number; direction: number };
    opponents?: number;
    timeLimit?: number;
    specialRules?: string[];
}

export interface ChallengeObjective {
    type: 'score' | 'complete_throws' | 'blocks' | 'no_turnovers' | 'distance' | 'accuracy' | 'time';
    target: number;
    description: string;
}

export interface ChallengeResult {
    score: number;
    medal: 'none' | 'bronze' | 'silver' | 'gold' | 'diamond';
    objectivesCompleted: boolean[];
    xpEarned: number;
}

// ---------------------------------------------------------------------------
// Challenge catalog
// ---------------------------------------------------------------------------

export const CHALLENGE_CATALOG: Challenge[] = [
    // -----------------------------------------------------------------------
    // THROWING CHALLENGES
    // -----------------------------------------------------------------------
    {
        id: 'throw_thread_needle',
        name: 'Thread the Needle',
        category: 'throwing',
        description: 'Complete break-mark throws in a row with a defender marking you.',
        setup: {
            fieldPosition: { x: 0, z: 20 },
            opponents: 1,
            specialRules: ['break_mark_only'],
        },
        objectives: [
            { type: 'complete_throws', target: 10, description: 'Complete 10 break-mark throws in a row' },
        ],
        medals: { bronze: 5, silver: 8, gold: 10, diamond: 15 },
        reward: { xp: 250, achievementId: 'ach_break_artist' },
    },
    {
        id: 'throw_huck_hero',
        name: 'Huck Hero',
        category: 'throwing',
        description: 'Throw a completed huck of 60m+ in heavy wind.',
        setup: {
            fieldPosition: { x: 0, z: 0 },
            wind: { speed: 12, direction: 180 },
            specialRules: ['receiver_downfield'],
        },
        objectives: [
            { type: 'distance', target: 60, description: 'Complete a huck of 60m or more' },
        ],
        medals: { bronze: 40, silver: 55, gold: 60, diamond: 75 },
        reward: { xp: 300, cosmeticId: 'trail_huck_rainbow' },
    },
    {
        id: 'throw_every_angle',
        name: 'Every Angle',
        category: 'throwing',
        description: 'Score using backhand, forehand, hammer, and scoober in one session.',
        setup: {
            fieldPosition: { x: 0, z: 30 },
            timeLimit: 180,
            specialRules: ['track_throw_types'],
        },
        objectives: [
            { type: 'score', target: 4, description: 'Score with all 4 throw types (BH, FH, hammer, scoober)' },
        ],
        medals: { bronze: 180, silver: 120, gold: 60, diamond: 30 },
        reward: { xp: 350, achievementId: 'ach_versatile_thrower' },
    },
    {
        id: 'throw_wind_whisperer',
        name: 'Wind Whisperer',
        category: 'throwing',
        description: 'Score 5 goals in 30 mph hurricane wind.',
        setup: {
            fieldPosition: { x: 0, z: 10 },
            wind: { speed: 13.4, direction: 270 },
            specialRules: ['hurricane_wind'],
        },
        objectives: [
            { type: 'score', target: 5, description: 'Score 5 goals in hurricane conditions' },
        ],
        medals: { bronze: 2, silver: 3, gold: 5, diamond: 7 },
        reward: { xp: 400, cosmeticId: 'trail_wind_swirl' },
    },
    {
        id: 'throw_accuracy_master',
        name: 'Accuracy Master',
        category: 'throwing',
        description: 'Hit 10 targets at various distances (10m, 20m, 30m, 40m).',
        setup: {
            fieldPosition: { x: 0, z: 0 },
            specialRules: ['target_mode'],
        },
        objectives: [
            { type: 'accuracy', target: 10, description: 'Hit 10 out of 10 targets' },
        ],
        medals: { bronze: 5, silver: 7, gold: 9, diamond: 10 },
        reward: { xp: 300, achievementId: 'ach_accuracy_master' },
    },
    {
        id: 'throw_hammer_time',
        name: 'Hammer Time',
        category: 'throwing',
        description: 'Score 3 goals exclusively using hammer throws.',
        setup: {
            fieldPosition: { x: 0, z: 25 },
            opponents: 1,
            timeLimit: 120,
            specialRules: ['hammer_only'],
        },
        objectives: [
            { type: 'score', target: 3, description: 'Score 3 goals with hammers only' },
        ],
        medals: { bronze: 1, silver: 2, gold: 3, diamond: 5 },
        reward: { xp: 250 },
    },

    // -----------------------------------------------------------------------
    // CATCHING CHALLENGES
    // -----------------------------------------------------------------------
    {
        id: 'catch_highlight_reel',
        name: 'The Highlight Reel',
        category: 'catching',
        description: 'Make layout catches on discs thrown just out of reach.',
        setup: {
            fieldPosition: { x: 0, z: -20 },
            specialRules: ['layout_throws'],
        },
        objectives: [
            { type: 'accuracy', target: 5, description: 'Make 5 layout catches' },
        ],
        medals: { bronze: 2, silver: 3, gold: 5, diamond: 7 },
        reward: { xp: 300, achievementId: 'ach_layout_legend' },
    },
    {
        id: 'catch_sky_king',
        name: 'Sky King',
        category: 'catching',
        description: 'Win contested sky battles against defenders.',
        setup: {
            fieldPosition: { x: 0, z: -30 },
            opponents: 1,
            specialRules: ['high_throws', 'contested'],
        },
        objectives: [
            { type: 'accuracy', target: 3, description: 'Win 3 contested sky battles' },
        ],
        medals: { bronze: 1, silver: 2, gold: 3, diamond: 5 },
        reward: { xp: 300, cosmeticId: 'cel_sky_crown' },
    },
    {
        id: 'catch_perfect_hands',
        name: 'Perfect Hands',
        category: 'catching',
        description: 'Catch throws in a row with zero drops.',
        setup: {
            fieldPosition: { x: 0, z: -10 },
            specialRules: ['varied_throws'],
        },
        objectives: [
            { type: 'complete_throws', target: 20, description: 'Catch 20 throws in a row with zero drops' },
        ],
        medals: { bronze: 10, silver: 15, gold: 20, diamond: 30 },
        reward: { xp: 250 },
    },
    {
        id: 'catch_traffic',
        name: 'Catch in Traffic',
        category: 'catching',
        description: 'Catch contested discs with multiple defenders nearby.',
        setup: {
            fieldPosition: { x: 0, z: -15 },
            opponents: 3,
            specialRules: ['zone_defense'],
        },
        objectives: [
            { type: 'accuracy', target: 5, description: 'Make 5 catches with 2+ defenders within 3m' },
        ],
        medals: { bronze: 2, silver: 3, gold: 5, diamond: 8 },
        reward: { xp: 350 },
    },

    // -----------------------------------------------------------------------
    // GAME CHALLENGES
    // -----------------------------------------------------------------------
    {
        id: 'game_comeback',
        name: 'Comeback',
        category: 'game',
        description: 'Win after starting down 0-5.',
        setup: {
            specialRules: ['start_down_5'],
        },
        objectives: [
            { type: 'score', target: 1, description: 'Win the game after trailing 0-5' },
        ],
        medals: { bronze: 0, silver: 1, gold: 3, diamond: 5 },
        reward: { xp: 500, achievementId: 'ach_comeback_king' },
    },
    {
        id: 'game_shutout',
        name: 'Shutout',
        category: 'game',
        description: 'Win 15-0 against weak opponents.',
        setup: {
            opponents: 7,
            specialRules: ['weak_opponents'],
        },
        objectives: [
            { type: 'score', target: 15, description: 'Score 15 goals while allowing 0' },
        ],
        medals: { bronze: 10, silver: 13, gold: 15, diamond: 15 },
        reward: { xp: 400, achievementId: 'ach_shutout' },
    },
    {
        id: 'game_universe',
        name: 'Universe Point',
        category: 'game',
        description: 'Win a game from 14-14 on universe point.',
        setup: {
            specialRules: ['start_tied_14'],
        },
        objectives: [
            { type: 'score', target: 1, description: 'Win on universe point' },
        ],
        medals: { bronze: 0, silver: 0, gold: 1, diamond: 1 },
        reward: { xp: 400, achievementId: 'ach_universe_clutch' },
    },
    {
        id: 'game_gauntlet',
        name: 'The Gauntlet',
        category: 'game',
        description: 'Win 5 games in a row on Legend difficulty.',
        setup: {
            specialRules: ['legend_difficulty', 'streak_mode'],
        },
        objectives: [
            { type: 'score', target: 5, description: 'Win 5 consecutive games on Legend' },
        ],
        medals: { bronze: 2, silver: 3, gold: 4, diamond: 5 },
        reward: { xp: 750, cosmeticId: 'accent_diamond_disc', achievementId: 'ach_gauntlet' },
    },
    {
        id: 'game_blowout',
        name: 'Total Domination',
        category: 'game',
        description: 'Win by 10+ points against a normal-difficulty opponent.',
        setup: {
            specialRules: ['normal_difficulty'],
        },
        objectives: [
            { type: 'score', target: 1, description: 'Win by a margin of 10 or more points' },
        ],
        medals: { bronze: 5, silver: 8, gold: 10, diamond: 13 },
        reward: { xp: 350 },
    },

    // -----------------------------------------------------------------------
    // TEAM CHALLENGES
    // -----------------------------------------------------------------------
    {
        id: 'team_zero_turnovers',
        name: 'Zero Turnovers',
        category: 'team',
        description: 'Complete a full point with no turnovers.',
        setup: {
            specialRules: ['track_turnovers'],
        },
        objectives: [
            { type: 'no_turnovers', target: 1, description: 'Score a point with zero turnovers' },
            { type: 'complete_throws', target: 1, description: 'Complete at least 5 throws on the scoring possession' },
        ],
        medals: { bronze: 3, silver: 5, gold: 8, diamond: 12 },
        reward: { xp: 300, achievementId: 'ach_clean_possession' },
    },
    {
        id: 'team_fast_break',
        name: 'Fast Break',
        category: 'team',
        description: 'Score within 10 seconds of a turnover.',
        setup: {
            specialRules: ['track_turnover_time'],
        },
        objectives: [
            { type: 'time', target: 10, description: 'Score within 10 seconds of a turnover' },
        ],
        medals: { bronze: 15, silver: 10, gold: 7, diamond: 4 },
        reward: { xp: 300, achievementId: 'ach_fast_break' },
    },
    {
        id: 'team_the_wall',
        name: 'The Wall',
        category: 'team',
        description: 'Get 10 team blocks in one game.',
        setup: {
            specialRules: ['track_blocks'],
        },
        objectives: [
            { type: 'blocks', target: 10, description: 'Record 10 team blocks in a single game' },
        ],
        medals: { bronze: 4, silver: 7, gold: 10, diamond: 15 },
        reward: { xp: 400, achievementId: 'ach_brick_wall' },
    },
    {
        id: 'team_flow_state',
        name: 'Flow State',
        category: 'team',
        description: 'Complete 30 consecutive passes as a team in a single game.',
        setup: {
            specialRules: ['track_consecutive_completions'],
        },
        objectives: [
            { type: 'complete_throws', target: 30, description: 'Complete 30 consecutive team passes' },
        ],
        medals: { bronze: 10, silver: 20, gold: 30, diamond: 50 },
        reward: { xp: 350 },
    },
    {
        id: 'team_spirit_award',
        name: 'Spirit Champions',
        category: 'team',
        description: 'Win a game with a perfect spirit score (10/10).',
        setup: {
            specialRules: ['track_spirit'],
        },
        objectives: [
            { type: 'score', target: 1, description: 'Win a game' },
        ],
        medals: { bronze: 7, silver: 8, gold: 9, diamond: 10 },
        reward: { xp: 300, achievementId: 'ach_spirit_champion' },
    },
];

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

function determineMedal(
    score: number,
    medals: Challenge['medals'],
    invertScore: boolean,
): ChallengeResult['medal'] {
    // For time-based challenges where lower is better, the medal thresholds are
    // inverted: diamond < gold < silver < bronze.
    if (invertScore) {
        if (score <= medals.diamond) return 'diamond';
        if (score <= medals.gold) return 'gold';
        if (score <= medals.silver) return 'silver';
        if (score <= medals.bronze) return 'bronze';
        return 'none';
    }
    if (score >= medals.diamond) return 'diamond';
    if (score >= medals.gold) return 'gold';
    if (score >= medals.silver) return 'silver';
    if (score >= medals.bronze) return 'bronze';
    return 'none';
}

const MEDAL_XP_MULTIPLIER: Record<ChallengeResult['medal'], number> = {
    none: 0,
    bronze: 0.5,
    silver: 0.75,
    gold: 1.0,
    diamond: 1.5,
};

/**
 * Returns true when smaller scores are better for a given challenge, based
 * on the objective types it contains and the medal threshold ordering.
 */
function isLowerBetter(challenge: Challenge): boolean {
    // If all objectives are time-based, lower is definitely better.
    const allTime = challenge.objectives.every((obj) => obj.type === 'time');
    if (allTime) return true;

    // Also detect inverted medal thresholds (diamond < bronze).
    return challenge.medals.diamond < challenge.medals.bronze;
}

/**
 * Evaluate a completed challenge attempt and produce a result.
 *
 * `stats` is a free-form record of numbers the gameplay layer populates.
 * It should include the key `"score"` representing the primary metric.
 * For multi-objective challenges it can also carry per-objective keys such
 * as `"consecutive_completions"`, `"blocks"`, `"layout_catches"`, etc.
 */
export function evaluateChallenge(
    challengeId: string,
    stats: Record<string, number>,
): ChallengeResult {
    const challenge = CHALLENGE_CATALOG.find((c) => c.id === challengeId);
    if (!challenge) {
        return { score: 0, medal: 'none', objectivesCompleted: [], xpEarned: 0 };
    }

    const score = stats['score'] ?? 0;
    const invert = isLowerBetter(challenge);
    const medal = determineMedal(score, challenge.medals, invert);

    const objectivesCompleted = challenge.objectives.map((obj) => {
        const value = stats[obj.type] ?? stats['score'] ?? 0;
        if (obj.type === 'time') {
            // For time objectives, meeting the target means finishing within the limit.
            return value > 0 && value <= obj.target;
        }
        return value >= obj.target;
    });

    const xpEarned = Math.round(challenge.reward.xp * MEDAL_XP_MULTIPLIER[medal]);

    return { score, medal, objectivesCompleted, xpEarned };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getChallengesByCategory(category: string): Challenge[] {
    return CHALLENGE_CATALOG.filter((c) => c.category === category);
}

export function getCompletedChallenges(completedIds: string[]): Challenge[] {
    const idSet = new Set(completedIds);
    return CHALLENGE_CATALOG.filter((c) => idSet.has(c.id));
}
