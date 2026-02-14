// Hall of Fame — career records tracking and player induction

const HOF_STORAGE_KEY = 'frisqueendom_hall_of_fame';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HallOfFameEntry {
    playerId: string;
    playerName: string;
    inductionSeason: number;
    careerStats: HallOfFameCareerStats;
    championships: number;
    mvpAwards: number;
    specialAchievements: string[];
    teamHistory: { teamName: string; seasons: number }[];
}

export interface HallOfFameCareerStats {
    games: number;
    goals: number;
    assists: number;
    blocks: number;
    completionPct: number;
    spiritAvg: number;
}

export interface CareerRecord {
    value: number;
    playerName: string;
    season: number;
    opponent?: string;
}

export interface RecordBook {
    // Single-game records
    singleGameGoals: CareerRecord;
    singleGameAssists: CareerRecord;
    singleGameBlocks: CareerRecord;
    singleGameCompletionPct: CareerRecord;

    // Single-season records
    seasonGoals: CareerRecord;
    seasonAssists: CareerRecord;
    seasonWins: CareerRecord;
    seasonSpiritAvg: CareerRecord;

    // Career records
    careerGoals: CareerRecord;
    careerAssists: CareerRecord;
    careerBlocks: CareerRecord;
    careerChampionships: CareerRecord;
    careerGamesPlayed: CareerRecord;
    longestWinStreak: CareerRecord;
}

const EMPTY_RECORD: CareerRecord = { value: 0, playerName: '--', season: 0 };

function defaultRecordBook(): RecordBook {
    return {
        singleGameGoals: { ...EMPTY_RECORD },
        singleGameAssists: { ...EMPTY_RECORD },
        singleGameBlocks: { ...EMPTY_RECORD },
        singleGameCompletionPct: { ...EMPTY_RECORD },
        seasonGoals: { ...EMPTY_RECORD },
        seasonAssists: { ...EMPTY_RECORD },
        seasonWins: { ...EMPTY_RECORD },
        seasonSpiritAvg: { ...EMPTY_RECORD },
        careerGoals: { ...EMPTY_RECORD },
        careerAssists: { ...EMPTY_RECORD },
        careerBlocks: { ...EMPTY_RECORD },
        careerChampionships: { ...EMPTY_RECORD },
        careerGamesPlayed: { ...EMPTY_RECORD },
        longestWinStreak: { ...EMPTY_RECORD },
    };
}

// ---------------------------------------------------------------------------
// Induction criteria
// ---------------------------------------------------------------------------

export interface InductionInput {
    playerName: string;
    playerId: string;
    careerStats: HallOfFameCareerStats;
    championships: number;
    mvpAwards: number;
    teamHistory: { teamName: string; seasons: number }[];
    currentSeason: number;
}

export function computeInductionScore(input: InductionInput): number {
    return (
        input.careerStats.goals * 1.0 +
        input.careerStats.assists * 0.8 +
        input.careerStats.blocks * 0.5 +
        input.championships * 50 +
        input.mvpAwards * 30
    );
}

export function meetsInductionCriteria(input: InductionInput): boolean {
    if (input.careerStats.goals >= 200) return true;
    if (input.championships >= 3) return true;
    if (input.careerStats.assists >= 150) return true;
    if (input.mvpAwards >= 2) return true;
    if (computeInductionScore(input) >= 300) return true;
    return false;
}

// ---------------------------------------------------------------------------
// HallOfFame class
// ---------------------------------------------------------------------------

export class HallOfFame {
    entries: HallOfFameEntry[] = [];
    records: RecordBook = defaultRecordBook();

    constructor() {
        this.load();
    }

    // -- Induction ----------------------------------------------------------

    checkInduction(input: InductionInput): boolean {
        // Don't re-induct
        if (this.entries.some((e) => e.playerId === input.playerId)) return false;
        return meetsInductionCriteria(input);
    }

    inductPlayer(input: InductionInput): HallOfFameEntry {
        const specialAchievements: string[] = [];
        if (input.careerStats.goals >= 200) specialAchievements.push('200+ Career Goals');
        if (input.careerStats.goals >= 500) specialAchievements.push('500+ Career Goals');
        if (input.careerStats.assists >= 150) specialAchievements.push('150+ Career Assists');
        if (input.championships >= 3) specialAchievements.push(`${input.championships}x Champion`);
        if (input.mvpAwards >= 2) specialAchievements.push(`${input.mvpAwards}x MVP`);
        if (input.careerStats.completionPct >= 90) specialAchievements.push('90%+ Career Completion');
        if (input.careerStats.spiritAvg >= 4.5) specialAchievements.push('Spirit Exemplar');

        const entry: HallOfFameEntry = {
            playerId: input.playerId,
            playerName: input.playerName,
            inductionSeason: input.currentSeason,
            careerStats: { ...input.careerStats },
            championships: input.championships,
            mvpAwards: input.mvpAwards,
            specialAchievements,
            teamHistory: input.teamHistory.map((t) => ({ ...t })),
        };

        this.entries.push(entry);
        this.save();
        return entry;
    }

    // -- Record tracking ----------------------------------------------------

    /** Update a single-game record if the new value is higher */
    checkSingleGameRecord(
        key: 'singleGameGoals' | 'singleGameAssists' | 'singleGameBlocks' | 'singleGameCompletionPct',
        value: number,
        playerName: string,
        season: number,
        opponent?: string,
    ): boolean {
        if (value > this.records[key].value) {
            this.records[key] = { value, playerName, season, opponent };
            this.save();
            return true;
        }
        return false;
    }

    /** Update a season record */
    checkSeasonRecord(
        key: 'seasonGoals' | 'seasonAssists' | 'seasonWins' | 'seasonSpiritAvg',
        value: number,
        playerName: string,
        season: number,
    ): boolean {
        if (value > this.records[key].value) {
            this.records[key] = { value, playerName, season };
            this.save();
            return true;
        }
        return false;
    }

    /** Update a career record */
    checkCareerRecord(
        key: 'careerGoals' | 'careerAssists' | 'careerBlocks' | 'careerChampionships' | 'careerGamesPlayed' | 'longestWinStreak',
        value: number,
        playerName: string,
        season: number,
    ): boolean {
        if (value > this.records[key].value) {
            this.records[key] = { value, playerName, season };
            this.save();
            return true;
        }
        return false;
    }

    // -- Queries ------------------------------------------------------------

    getEntries(): HallOfFameEntry[] {
        return [...this.entries].sort((a, b) => a.inductionSeason - b.inductionSeason);
    }

    getRecords(): RecordBook {
        return this.records;
    }

    getEntryCount(): number {
        return this.entries.length;
    }

    // -- Persistence --------------------------------------------------------

    serialize(): { entries: HallOfFameEntry[]; records: RecordBook } {
        return {
            entries: this.entries.map((e) => ({ ...e })),
            records: { ...this.records },
        };
    }

    deserialize(data: { entries?: HallOfFameEntry[]; records?: RecordBook }): void {
        if (data.entries) this.entries = data.entries;
        if (data.records) {
            this.records = { ...defaultRecordBook(), ...data.records };
        }
    }

    private save(): void {
        try {
            localStorage.setItem(HOF_STORAGE_KEY, JSON.stringify(this.serialize()));
        } catch {
            // localStorage full or unavailable
        }
    }

    private load(): void {
        try {
            const raw = localStorage.getItem(HOF_STORAGE_KEY);
            if (raw) {
                this.deserialize(JSON.parse(raw));
            }
        } catch {
            // corrupted data, start fresh
        }
    }
}
