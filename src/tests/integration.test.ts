import { calculateThrowPower } from '../data/GameplayConstants';
import {
    CAREER_CONSTANTS,
} from '../data/CareerConstants';
import {
    createNewCareer,
    generateSeasonSchedule,
    loadCareer,
    saveCareer,
    saveManager,
    getDefaultSettings,
} from '../data/SaveLoad';
import { CareerManager } from '../management/Career';

interface TestResult {
    name: string;
    passed: boolean;
    detail: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail: string): void {
    results.push({ name, passed: condition, detail });
    const icon = condition ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${name}: ${detail}`);
}

function assertRange(
    name: string,
    value: number,
    min: number,
    max: number,
    unit = '',
): void {
    assert(
        name,
        value >= min && value <= max,
        `${value.toFixed(2)}${unit} (expected ${min}-${max}${unit})`,
    );
}

function snapshotStorage(): Record<string, string> {
    const snapshot: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
            const value = localStorage.getItem(key);
            if (value !== null) snapshot[key] = value;
        }
    }
    return snapshot;
}

function restoreStorage(snapshot: Record<string, string>): void {
    localStorage.clear();
    for (const [key, value] of Object.entries(snapshot)) {
        localStorage.setItem(key, value);
    }
}

function testThrowPowerCurve(): void {
    assertRange('Power at 0.0s', calculateThrowPower(0), 0, 0);
    assertRange('Power at 0.3s', calculateThrowPower(0.3), 0.3, 0.3);
    assertRange('Power at 0.8s', calculateThrowPower(0.8), 0.9, 0.9);
    assertRange('Power at 1.0s', calculateThrowPower(1.0), 1.0, 1.0);
    assertRange('Power at 1.5s', calculateThrowPower(1.5), 0.85, 0.85);
    assert(
        'Overcharge penalty applies',
        calculateThrowPower(1.3) < calculateThrowPower(1.0),
        `${calculateThrowPower(1.3).toFixed(2)} < ${calculateThrowPower(1.0).toFixed(2)}`,
    );
}

function testCareerCreation(): void {
    const career = createNewCareer('Test Coach', 'Test Team');
    assert('Career team name set', career.teamName === 'Test Team', career.teamName);
    assert('Initial season is 1', career.season === 1, `season=${career.season}`);
    assert('Initial week is 1', career.week === 1, `week=${career.week}`);
    assert(
        'Roster has 15 players in club mode',
        career.team.roster.length === 15,
        `size=${career.team.roster.length}`,
    );
    assert(
        'Starting budget uses constants',
        career.finances.budget === CAREER_CONSTANTS.STARTING_BUDGET,
        `budget=${career.finances.budget}`,
    );
    assert(
        'Schedule pre-generated',
        career.schedule.length === CAREER_CONSTANTS.DEFAULT_SEASON_LENGTH,
        `events=${career.schedule.length}`,
    );
    assert(
        'Offense lineup initialized',
        career.team.offenseLineupIds.length === 7,
        `oline=${career.team.offenseLineupIds.length}`,
    );
    assert(
        'Defense lineup initialized',
        career.team.defenseLineupIds.length === 7,
        `dline=${career.team.defenseLineupIds.length}`,
    );
}

function testSeasonSchedule(): void {
    const schedule = generateSeasonSchedule(2);
    assert(
        'Schedule length matches default season length',
        schedule.length === CAREER_CONSTANTS.DEFAULT_SEASON_LENGTH,
        `len=${schedule.length}`,
    );
    const weeks = schedule.map((event) => event.date);
    assert(
        'Schedule weeks are contiguous',
        weeks.every((week, idx) => week === idx + 1),
        weeks.join(','),
    );
    const tournaments = schedule.filter((event) => event.type === 'tournament').length;
    assert(
        'Expected tournament-heavy cadence',
        tournaments >= 8,
        `tournaments=${tournaments}`,
    );
}

function testSaveLoadHydration(): void {
    const career = createNewCareer('Persist Coach', 'Persistence');
    saveCareer(career);

    const reloaded = loadCareer();
    assert('Career can be loaded', !!reloaded, reloaded ? 'loaded' : 'null');
    if (!reloaded) return;

    assert(
        'Roster player methods survive load',
        typeof reloaded.team.roster[0]?.train === 'function',
        `train=${typeof reloaded.team.roster[0]?.train}`,
    );
    assert(
        'Current date is a Date object after load',
        reloaded.currentDate instanceof Date,
        Object.prototype.toString.call(reloaded.currentDate),
    );
}

function testCareerManagerTrainingFlow(): void {
    const career = createNewCareer('Flow Coach', 'Flow Team');
    const nextPracticeWeek =
        career.schedule.find((event) => event.type === 'practice')?.date || career.week;
    career.week = nextPracticeWeek;
    saveCareer(career);

    const manager = CareerManager.load();
    assert('CareerManager loads from save', !!manager, manager ? 'loaded' : 'null');
    if (!manager) return;

    const weekBefore = manager.data.week;
    const budgetBefore = manager.data.finances.budget;
    const cost = manager.data.team.roster.length * CAREER_CONSTANTS.TRAINING_COST_PER_PLAYER;

    const outcome = manager.conductTraining('offense');
    assert('Training can run on scheduled practice week', outcome.ok, outcome.reason || 'ok');

    assert(
        'Training advances week by one',
        manager.data.week === weekBefore + 1,
        `${weekBefore} -> ${manager.data.week}`,
    );
    assert(
        'Training deducts expected budget',
        manager.data.finances.budget === budgetBefore - cost,
        `${budgetBefore} -> ${manager.data.finances.budget}`,
    );
}

function testSettingsRoundTrip(): void {
    const defaults = getDefaultSettings();
    saveManager.saveSettings(defaults);
    const loaded = saveManager.getSettings();
    assert(
        'Settings round-trip quality',
        loaded.graphics.quality === defaults.graphics.quality,
        loaded.graphics.quality,
    );
    assert(
        'Settings round-trip audio',
        loaded.audio.masterVolume === defaults.audio.masterVolume,
        `${loaded.audio.masterVolume}`,
    );
}

export async function runAll(): Promise<{ total: number; passed: number; failed: number }> {
    results.length = 0;
    const storageSnapshot = snapshotStorage();

    try {
        localStorage.clear();
        testThrowPowerCurve();
        testCareerCreation();
        testSeasonSchedule();
        testSaveLoadHydration();
        testCareerManagerTrainingFlow();
        testSettingsRoundTrip();
    } finally {
        restoreStorage(storageSnapshot);
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;
    console.log(`Integration tests complete: ${passed}/${total} passed`);
    return { total, passed, failed };
}

if (typeof window !== 'undefined') {
    (window as unknown as { __tests?: Record<string, () => Promise<unknown>> }).__tests = (
        (window as unknown as { __tests?: Record<string, () => Promise<unknown>> }).__tests || {}
    );
    (window as unknown as { __tests: Record<string, () => Promise<unknown>> }).__tests.integration = runAll;
}
