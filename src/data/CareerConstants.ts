// Career mode constants - centralized configuration

export const CAREER_CONSTANTS = {
    // Finances
    STARTING_BUDGET: 50000,
    PLAYER_SALARY_BASE: 500,
    RECRUITING_COST: 5000,
    RECRUIT_SALARY: 200,
    TRAINING_COST_PER_PLAYER: 50,
    
    // Season
    WEEKS_PER_SEASON: 52,
    DEFAULT_SEASON_LENGTH: 12, // Spring series weeks
    
    // Training
    XP_BASE_GAIN: 50,
    XP_VARIANCE: 50,
    
    // Player Development
    DEFAULT_STARTING_AGE: 22,
    DEFAULT_PEAK_AGE: 27,
    DEFAULT_DECLINE_RATE: 2,
    DEFAULT_POTENTIAL: 70,
    LEVEL_UP_STAMINA_BONUS: 2,
    LEVEL_UP_CONSISTENCY_BONUS: 1,
    XP_CURVE_BASE: 100,
    XP_CURVE_GROWTH: 1.2,
    
    // Spirit
    DEFAULT_SPIRIT_SCORE: 10,
    
    // Match Simulation
    AI_RATING_MIN: 40,
    AI_RATING_RANGE: 40,
    BASE_SCORE_MIN: 10,
    BASE_SCORE_RANGE: 5,
    
    // Tournament
    MIN_TEAM_COUNT_LOCAL: 8,
    MIN_TEAM_COUNT_REGIONAL: 12,
    MIN_TEAM_COUNT_NATIONAL: 16,
    MIN_TEAM_COUNT_ELITE: 20,
} as const;

// Validation helper
export function validateCareerConstants(): string[] {
    const issues: string[] = [];
    
    if (CAREER_CONSTANTS.STARTING_BUDGET < CAREER_CONSTANTS.RECRUITING_COST) {
        issues.push('Starting budget should be >= recruiting cost');
    }
    
    if (CAREER_CONSTANTS.WEEKS_PER_SEASON < CAREER_CONSTANTS.DEFAULT_SEASON_LENGTH) {
        issues.push('Weeks per season must be >= default season length');
    }
    
    return issues;
}
