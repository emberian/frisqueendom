import {
    type ProgressionData,
    type DailyChallengeState,
    type DailyChallengeMetric,
} from './SaveLoad';

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
        name: 'Gold Jersey Trim',
        levelRequired: 5,
        description: 'Shiny gold trim for your team.',
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
    const shuffled = [...DAILY_CHALLENGE_POOL].sort(() => Math.random() - 0.5);
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
