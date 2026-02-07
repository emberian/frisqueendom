import {
    type DailyChallengeMetric,
    type DailyChallengeState,
    type ProgressionData,
    saveManager,
} from '../data/SaveLoad';

interface ChallengeTemplate {
    id: string;
    title: string;
    description: string;
    metric: DailyChallengeMetric;
    target: number;
    rewardXp: number;
}

export interface MatchProgressionInput {
    teamScore: number;
    opponentScore: number;
    teamBlocks: number;
    teamCompletions: number;
    stallTurnovers: number;
    scoredGoals: number;
}

export interface MatchProgressionResult {
    level: number;
    experience: number;
    xpToNext: number;
    gainedXp: number;
    levelUps: number;
    completedChallenges: string[];
    unlockedCosmetics: string[];
    dailyChallenges: DailyChallengeState[];
}

const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
    {
        id: 'finishers',
        title: 'Two Goal Game',
        description: 'Score at least 2 points in one match.',
        metric: 'team_goals',
        target: 2,
        rewardXp: 45,
    },
    {
        id: 'clean-handler',
        title: 'No Stall Turnovers',
        description: 'Finish a match with zero stall turnovers.',
        metric: 'no_stall_turnovers',
        target: 1,
        rewardXp: 40,
    },
    {
        id: 'swing-machine',
        title: 'Complete 10 Throws',
        description: 'Record 10 completions in a match.',
        metric: 'team_completions',
        target: 10,
        rewardXp: 50,
    },
    {
        id: 'brick-wall',
        title: 'Record 2 Blocks',
        description: 'Get 2 defensive blocks.',
        metric: 'team_blocks',
        target: 2,
        rewardXp: 48,
    },
    {
        id: 'close-it-out',
        title: 'Win One Match',
        description: 'Win your next match.',
        metric: 'win_match',
        target: 1,
        rewardXp: 35,
    },
    {
        id: 'clinical-offense',
        title: 'Score 4 Points',
        description: 'Score 4 or more points in one game.',
        metric: 'team_goals',
        target: 4,
        rewardXp: 60,
    },
];

const COSMETIC_UNLOCK_LEVELS = [
    { level: 2, name: 'Sunburst Disc Trail' },
    { level: 3, name: 'Captain Headband' },
    { level: 4, name: 'Velocity Jersey Accent' },
    { level: 5, name: 'Sky Spike Celebration' },
];

export function xpForNextLevel(level: number): number {
    return Math.floor(120 * Math.pow(1.2, Math.max(0, level - 1)));
}

export function getTodayKey(now: Date = new Date()): string {
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function applyMatchProgression(
    input: MatchProgressionInput,
    now: Date = new Date(),
): MatchProgressionResult {
    const save = saveManager.load() || saveManager.createNewSave();
    const progression = ensureProgression(save.progression, now);

    let gainedXp = getBaseMatchXp(input);
    const completedChallenges: string[] = [];

    progression.dailyChallenges = progression.dailyChallenges.map((challenge) => {
        const value = getMetricValue(challenge.metric, input);
        const previous = challenge.progress;
        const progress = Math.min(challenge.target, Math.max(previous, value));
        const completed = progress >= challenge.target;
        const newlyCompleted = completed && !challenge.completed;
        if (newlyCompleted) {
            gainedXp += challenge.rewardXp;
            completedChallenges.push(challenge.title);
        }
        return {
            ...challenge,
            progress,
            completed,
        };
    });

    progression.experience += gainedXp;

    let levelUps = 0;
    while (progression.experience >= xpForNextLevel(progression.level)) {
        progression.experience -= xpForNextLevel(progression.level);
        progression.level += 1;
        levelUps += 1;
    }

    const unlockedCosmetics: string[] = [];
    for (const unlock of COSMETIC_UNLOCK_LEVELS) {
        if (
            progression.level >= unlock.level &&
            !progression.unlockedCosmetics.includes(unlock.name)
        ) {
            progression.unlockedCosmetics.push(unlock.name);
            unlockedCosmetics.push(unlock.name);
        }
    }

    save.progression = progression;
    save.quickMatchUnlocked = true;
    save.stats = {
        ...save.stats,
        totalGamesPlayed: save.stats.totalGamesPlayed + 1,
        totalPointsScored: save.stats.totalPointsScored + Math.max(0, input.teamScore),
        careerGoals: save.stats.careerGoals + Math.max(0, input.scoredGoals),
        careerBlocks: save.stats.careerBlocks + Math.max(0, input.teamBlocks),
    };
    saveManager.save(save);

    return {
        level: progression.level,
        experience: progression.experience,
        xpToNext: xpForNextLevel(progression.level),
        gainedXp,
        levelUps,
        completedChallenges,
        unlockedCosmetics,
        dailyChallenges: progression.dailyChallenges.map((challenge) => ({ ...challenge })),
    };
}

function getBaseMatchXp(input: MatchProgressionInput): number {
    const winBonus = input.teamScore > input.opponentScore ? 25 : 8;
    const scoreBonus = Math.max(0, input.teamScore) * 9;
    const blockBonus = Math.max(0, input.teamBlocks) * 6;
    const completionBonus = Math.floor(Math.max(0, input.teamCompletions) * 0.6);
    return 30 + winBonus + scoreBonus + blockBonus + completionBonus;
}

function getMetricValue(
    metric: DailyChallengeMetric,
    input: MatchProgressionInput,
): number {
    switch (metric) {
        case 'team_goals':
            return Math.max(0, input.teamScore);
        case 'team_blocks':
            return Math.max(0, input.teamBlocks);
        case 'team_completions':
            return Math.max(0, input.teamCompletions);
        case 'no_stall_turnovers':
            return input.stallTurnovers === 0 ? 1 : 0;
        case 'win_match':
            return input.teamScore > input.opponentScore ? 1 : 0;
    }
}

function ensureProgression(
    progression: ProgressionData | undefined,
    now: Date,
): ProgressionData {
    const safe: ProgressionData = progression
        ? {
              level: Math.max(1, progression.level || 1),
              experience: Math.max(0, progression.experience || 0),
              unlockedCosmetics: Array.isArray(progression.unlockedCosmetics)
                  ? [...progression.unlockedCosmetics]
                  : ['Classic Jersey Accent'],
              dailyChallengeDate: progression.dailyChallengeDate || '',
              dailyChallenges: Array.isArray(progression.dailyChallenges)
                  ? progression.dailyChallenges.map((challenge) => ({ ...challenge }))
                  : [],
          }
        : {
              level: 1,
              experience: 0,
              unlockedCosmetics: ['Classic Jersey Accent'],
              dailyChallengeDate: '',
              dailyChallenges: [],
          };

    const today = getTodayKey(now);
    if (safe.dailyChallengeDate !== today || safe.dailyChallenges.length === 0) {
        safe.dailyChallengeDate = today;
        safe.dailyChallenges = createDailyChallenges(today);
    }

    if (!safe.unlockedCosmetics.includes('Classic Jersey Accent')) {
        safe.unlockedCosmetics.unshift('Classic Jersey Accent');
    }

    return safe;
}

function createDailyChallenges(dayKey: string): DailyChallengeState[] {
    const templates = [...CHALLENGE_TEMPLATES];
    const seed = hashString(dayKey);
    shuffleSeeded(templates, seed);
    return templates.slice(0, 3).map((template) => ({
        ...template,
        progress: 0,
        completed: false,
    }));
}

function hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function shuffleSeeded<T>(list: T[], initialSeed: number): void {
    let seed = initialSeed || 1;
    const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
    };
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
}
