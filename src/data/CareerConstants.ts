// Career mode constants - centralized configuration

export const CAREER_CONSTANTS = {
    // Finances
    STARTING_BUDGET: 50000,
    PLAYER_SALARY_BASE: 500,
    RECRUITING_COST: 5000,
    RECRUIT_SALARY: 200,
    TRAINING_COST_PER_PLAYER: 50,
    TRYOUT_ANNOUNCEMENT_COST: 2500,
    SCOUTING_REPORT_COST: 1200,
    FUNDRAISER_BASE_INCOME: 3500,
    
    // Season
    WEEKS_PER_SEASON: 20,
    DEFAULT_SEASON_LENGTH: 20,
    OFFSEASON_WEEKS: 4,
    REGULAR_AND_POSTSEASON_WEEKS: 16,
    DIVISION_MIN: 1,
    DIVISION_MAX: 4,
    DIVISION4_TEAM_COUNT: 8,
    DIVISION1_TO_3_TEAM_COUNT: 16,
    PROMOTION_RANK_CUTOFF: 2,
    DIVISION3_PROMOTION_CUTOFF: 4,
    DIVISION2_PROMOTION_CUTOFF: 4,
    DIVISION1_NATIONALS_CUTOFF: 8,
    
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
    OPPONENT_RATING_BASE: 52,
    DIVISION_RATING_STEP: 8,
    ELO_K_FACTOR: 18,
    
    // Tournament
    MIN_TEAM_COUNT_LOCAL: 8,
    MIN_TEAM_COUNT_REGIONAL: 12,
    MIN_TEAM_COUNT_NATIONAL: 16,
    MIN_TEAM_COUNT_ELITE: 20,

    // Team systems
    LINEUP_SIZE: 7,
    MAX_CAPTAINS: 3,
    MIN_CAPTAINS: 1,
    CHEMISTRY_MIN: -5,
    CHEMISTRY_MAX: 5,
    CULTURE_MIN: 0,
    CULTURE_MAX: 100,
    MORALE_MIN: 0,
    MORALE_MAX: 100,

    // Recruiting and scouting
    TRYOUT_CANDIDATE_MIN: 8,
    TRYOUT_CANDIDATE_MAX: 16,
    RECRUIT_DECLINE_BASE_CHANCE: 0.2,

    // Mentoring
    MAX_MENTORSHIPS: 6,
    MENTOR_MIN_AGE_GAP: 3,
    MENTORING_BASE_INTENSITY: 28,

    // College mode
    COLLEGE_MAX_YEAR: 4,
    COLLEGE_GRADUATION_AGE: 23,
    COLLEGE_FRESHMEN_INTAKE_MIN: 3,
    COLLEGE_FRESHMEN_INTAKE_MAX: 6,
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
