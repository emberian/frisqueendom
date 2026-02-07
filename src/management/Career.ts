import type { PlayerAttributes, PlayerStats } from '../data/PlayerStats';
import { generatePlayer } from '../data/PlayerStats';
import { CAREER_CONSTANTS } from '../data/CareerConstants';
import type {
    CareerAward,
    CareerData,
    CareerMilestone,
    MentorshipPair,
    CareerOpponentData,
    MatchPlayerStats,
    MatchResult,
    RecruitCandidate,
    ScoutingReport,
    SeasonEvent,
    TournamentData,
    TournamentMatch,
    TryoutDrill,
    TryoutState,
} from '../data/SaveLoad';
import {
    createNewCareer,
    generateSeasonSchedule,
    loadCareer,
    saveCareer,
    saveManager,
} from '../data/SaveLoad';
import { Random } from '../data/SeededRandom';

export type CareerState =
    | 'hub'
    | 'roster'
    | 'playbook'
    | 'schedule'
    | 'match_setup'
    | 'tournament'
    | 'training';

export interface CareerActionResult<T = void> {
    ok: boolean;
    reason?: string;
    data?: T;
}

export interface SimIntervention {
    type: 'timeout' | 'substitution';
    atPoint?: number;
    playerOutId?: string;
    playerInId?: string;
}

export interface SimPointSummary {
    point: number;
    scoringSide: 'player' | 'opponent';
    playerScore: number;
    opponentScore: number;
    note?: string;
}

export interface CareerSimSummary {
    eventTitle: string;
    points: SimPointSummary[];
    playerScore: number;
    opponentScore: number;
    spiritReport: {
        player: number;
        opponent: number;
    };
    injuries: string[];
    highlights: string[];
}

const ATTRIBUTE_KEYS: Array<keyof PlayerAttributes> = [
    'speed',
    'acceleration',
    'stamina',
    'jumping',
    'height',
    'throwPower',
    'throwAccuracy',
    'forehand',
    'backhand',
    'huck',
    'breakThrows',
    'catching',
    'layout',
    'marking',
    'awareness',
    'spirit',
    'clutch',
    'consistency',
];

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
    return clamp(value, 0, 1);
}

function chemistryKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function phaseFromWeek(week: number): SeasonEvent['phase'] {
    if (week <= 2) return 'offseason';
    if (week <= 4) return 'preseason';
    if (week <= 16) return 'regular';
    return 'postseason';
}

function practiceFocusToCultureKey(
    focus: 'offense' | 'defense' | 'conditioning' | 'throws',
):
    | 'competitive'
    | 'spirited'
    | 'athletic'
    | 'cerebral'
    | 'clutch' {
    if (focus === 'conditioning') return 'athletic';
    if (focus === 'defense') return 'competitive';
    if (focus === 'throws') return 'cerebral';
    return 'clutch';
}

export class CareerManager {
    data: CareerData;
    currentState: CareerState = 'hub';
    private eventCallbacks: Map<string, Set<() => void>> = new Map();
    
    constructor(data?: CareerData) {
        this.data = data || createNewCareer('Coach', 'Lightning');
        this.ensureDataIntegrity();
    }
    
    static load(slot?: number): CareerManager | null {
        const data = loadCareer(slot);
        if (!data) return null;
        return new CareerManager(data);
    }
    
    save(): void {
        saveCareer(this.data, this.data.careerSlot);
    }
    
    navigateTo(state: CareerState): void {
        this.currentState = state;
        this.emit('stateChange');
    }

    getCurrentEvent(): SeasonEvent | null {
        return this.data.schedule.find((event) => event.date === this.data.week) || null;
    }

    getUpcomingEvents(count = 5): SeasonEvent[] {
        return this.data.schedule
            .filter((event) => event.date > this.data.week)
            .slice(0, count);
    }

    getCurrentRank(): number {
        const idx = this.data.standings.findIndex(
            (standing) => standing.teamId === this.data.team.id,
        );
        return idx >= 0 ? idx + 1 : this.data.standings.length;
    }

    getCurrentEventGateReason(event: SeasonEvent | null = this.getCurrentEvent()): string | null {
        if (!event) return 'No scheduled event this week.';
        if (event.type !== 'tournament') return null;
        if (this.isTournamentUnlocked(event)) return null;

        if (event.tier === 'elite') {
            return `Nationals qualification not met (current rank ${this.getCurrentRank()}, need top ${CAREER_CONSTANTS.DIVISION1_NATIONALS_CUTOFF}).`;
        }
        if (event.tier === 'national') {
            return 'National-tier event locked until Division 2.';
        }
        if (event.tier === 'regional') {
            return 'Regional-tier event locked until Division 3.';
        }
        return 'Tournament is unavailable this week.';
    }

    canPlayScheduledMatch(): boolean {
        const event = this.getCurrentEvent();
        return event?.type === 'tournament' && this.getCurrentEventGateReason(event) === null;
    }

    getCurrentOpponent(): CareerOpponentData | null {
        const event = this.getCurrentEvent();
        if (event?.type !== 'tournament') return null;
        if (!this.isTournamentUnlocked(event)) return null;
        return event.opponent;
    }

    getCurrentOpponentDifficulty(): 'easy' | 'normal' | 'hard' {
        const base = this.getCurrentOpponent()?.difficulty || 'normal';
        if (this.data.prestigeLevel <= 0) return base;
        if (base === 'easy') return 'normal';
        return 'hard';
    }

    getCurrentScoutingPlan(): {
        bonus: number;
        report: ScoutingReport | null;
        recommendedDefense: 'man' | 'zone_331' | null;
    } {
        const opponent = this.getCurrentOpponent();
        if (!opponent) {
            return { bonus: 0, report: null, recommendedDefense: null };
        }
        const advantage = this.getScoutingAdvantageForTeam(opponent.teamId);
        return {
            bonus: advantage.bonus,
            report: advantage.report,
            recommendedDefense: advantage.report?.recommendedDefense || null,
        };
    }
    
    private completeLineupIds(playerIds: string[]): string[] {
        const unique = new Set<string>();
        const valid = playerIds
            .filter((id) => {
                if (unique.has(id)) return false;
                const exists = this.data.team.roster.some((player) => player.id === id);
                if (exists) unique.add(id);
                return exists;
            })
            .slice(0, CAREER_CONSTANTS.LINEUP_SIZE);

        if (valid.length < CAREER_CONSTANTS.LINEUP_SIZE) {
            for (const player of this.data.team.roster) {
                if (valid.length >= CAREER_CONSTANTS.LINEUP_SIZE) break;
                if (!unique.has(player.id)) {
                    valid.push(player.id);
                    unique.add(player.id);
                }
            }
        }
        return valid;
    }

    private resolveLineupFromIds(playerIds: string[]): PlayerStats[] {
        const fromIds = playerIds
            .map((id) => this.data.team.roster.find((player) => player.id === id))
            .filter((player): player is PlayerStats => !!player);
        if (fromIds.length >= CAREER_CONSTANTS.LINEUP_SIZE) {
            return fromIds.slice(0, CAREER_CONSTANTS.LINEUP_SIZE);
        }

        const handlers = this.data.team.roster
            .filter((player) => player.role === 'handler')
            .slice(0, 2);
        const cutters = this.data.team.roster
            .filter((player) => player.role === 'cutter')
            .slice(0, 4);
        const hybrid = this.data.team.roster
            .filter((player) => player.role === 'hybrid')
            .slice(0, 1);

        const fallback = [...handlers, ...cutters, ...hybrid].slice(
            0,
            CAREER_CONSTANTS.LINEUP_SIZE,
        );
        if (fallback.length < CAREER_CONSTANTS.LINEUP_SIZE) {
            for (const player of this.data.team.roster) {
                if (fallback.length >= CAREER_CONSTANTS.LINEUP_SIZE) break;
                if (!fallback.some((entry) => entry.id === player.id)) {
                    fallback.push(player);
                }
            }
        }
        return fallback;
    }

    getOffenseLineup(): PlayerStats[] {
        const lineup = this.resolveLineupFromIds(this.data.team.offenseLineupIds || []);
        this.data.team.offenseLineupIds = this.completeLineupIds(
            lineup.map((player) => player.id),
        );
        return lineup;
    }

    getDefenseLineup(): PlayerStats[] {
        const lineup = this.resolveLineupFromIds(this.data.team.defenseLineupIds || []);
        this.data.team.defenseLineupIds = this.completeLineupIds(
            lineup.map((player) => player.id),
        );
        return lineup;
    }

    getLineupForPoint(isReceiving: boolean): PlayerStats[] {
        return isReceiving ? this.getOffenseLineup() : this.getDefenseLineup();
    }

    getStartingLineup(): PlayerStats[] {
        return this.getOffenseLineup();
    }

    setStartingLineup(playerIds: string[]): void {
        const valid = this.completeLineupIds(playerIds);
        this.data.team.startingLineupIds = [...valid];
        this.data.team.offenseLineupIds = [...valid];
        this.save();
    }

    setLineups(
        offenseIds: string[],
        defenseIds: string[],
    ): CareerActionResult {
        const offense = this.completeLineupIds(offenseIds);
        const defense = this.completeLineupIds(defenseIds);
        if (offense.length < CAREER_CONSTANTS.LINEUP_SIZE) {
            return { ok: false, reason: 'Offense line must include 7 players.' };
        }
        if (defense.length < CAREER_CONSTANTS.LINEUP_SIZE) {
            return { ok: false, reason: 'Defense line must include 7 players.' };
        }

        this.data.team.offenseLineupIds = offense;
        this.data.team.defenseLineupIds = defense;
        this.data.team.startingLineupIds = [...offense];
        this.save();
        return { ok: true };
    }
    
    setPlayerRole(playerId: string, role: 'handler' | 'cutter' | 'hybrid'): void {
        const player = this.data.team.roster.find((candidate) => candidate.id === playerId);
        if (!player) return;
        player.role = role;
        this.save();
    }

    setCaptain(playerId: string, enabled: boolean): CareerActionResult {
        const playerExists = this.data.team.roster.some((player) => player.id === playerId);
        if (!playerExists) return { ok: false, reason: 'Player not found.' };

        const captainSet = new Set(this.data.captainIds);
        if (enabled) {
            captainSet.add(playerId);
            if (captainSet.size > CAREER_CONSTANTS.MAX_CAPTAINS) {
                return {
                    ok: false,
                    reason: `Only ${CAREER_CONSTANTS.MAX_CAPTAINS} captains can be active.`,
                };
            }
        } else {
            captainSet.delete(playerId);
            if (captainSet.size < CAREER_CONSTANTS.MIN_CAPTAINS) {
                return {
                    ok: false,
                    reason: `At least ${CAREER_CONSTANTS.MIN_CAPTAINS} captain is required.`,
                };
            }
        }

        this.data.captainIds = [...captainSet];
        this.recalculateTeamSpirit();
        this.save();
        return { ok: true };
    }

    getMentorshipPairs(): MentorshipPair[] {
        return [...this.data.mentorships];
    }

    assignMentorship(mentorId: string, menteeId: string): CareerActionResult {
        if (mentorId === menteeId) {
            return { ok: false, reason: 'Mentor and mentee must be different players.' };
        }
        const mentor = this.data.team.roster.find((player) => player.id === mentorId);
        const mentee = this.data.team.roster.find((player) => player.id === menteeId);
        if (!mentor || !mentee) {
            return { ok: false, reason: 'Mentor and mentee must both be on the roster.' };
        }
        if (
            mentor.development.age <
                mentee.development.age + CAREER_CONSTANTS.MENTOR_MIN_AGE_GAP &&
            mentor.career.gamesPlayed < 8
        ) {
            return {
                ok: false,
                reason: `Mentor must be at least ${CAREER_CONSTANTS.MENTOR_MIN_AGE_GAP} years older or have strong game experience.`,
            };
        }

        const existingForMentee = this.data.mentorships.find(
            (pair) => pair.menteeId === menteeId,
        );
        if (existingForMentee) {
            return { ok: false, reason: 'This mentee already has a mentor assigned.' };
        }
        if (this.data.mentorships.length >= CAREER_CONSTANTS.MAX_MENTORSHIPS) {
            return {
                ok: false,
                reason: `Only ${CAREER_CONSTANTS.MAX_MENTORSHIPS} mentorships can be active.`,
            };
        }

        this.data.mentorships.push({
            mentorId,
            menteeId,
            startedSeason: this.data.season,
            startedWeek: this.data.week,
            sessions: 0,
        });
        const chemistry = this.getChemistry(mentorId, menteeId);
        this.setChemistry(mentorId, menteeId, chemistry + 0.15);
        this.save();
        return { ok: true };
    }

    removeMentorship(menteeId: string): CareerActionResult {
        const before = this.data.mentorships.length;
        this.data.mentorships = this.data.mentorships.filter(
            (pair) => pair.menteeId !== menteeId,
        );
        if (this.data.mentorships.length === before) {
            return { ok: false, reason: 'No mentorship found for that mentee.' };
        }
        this.save();
        return { ok: true };
    }

    getChemistry(playerAId: string, playerBId: string): number {
        if (playerAId === playerBId) return CAREER_CONSTANTS.CHEMISTRY_MAX;
        return this.data.chemistry[chemistryKey(playerAId, playerBId)] || 0;
    }

    private setChemistry(playerAId: string, playerBId: string, nextValue: number): void {
        if (playerAId === playerBId) return;
        this.data.chemistry[chemistryKey(playerAId, playerBId)] = clamp(
            nextValue,
            CAREER_CONSTANTS.CHEMISTRY_MIN,
            CAREER_CONSTANTS.CHEMISTRY_MAX,
        );
    }

    private bumpChemistryForLineup(playerIds: string[], amount: number): void {
        for (let i = 0; i < playerIds.length; i++) {
            for (let j = i + 1; j < playerIds.length; j++) {
                const current = this.getChemistry(playerIds[i], playerIds[j]);
                this.setChemistry(playerIds[i], playerIds[j], current + amount);
            }
        }
    }

    private getLineupChemistryBonus(lineup: PlayerStats[]): number {
        if (lineup.length < 2) return 0;
        let total = 0;
        let pairs = 0;
        for (let i = 0; i < lineup.length; i++) {
            for (let j = i + 1; j < lineup.length; j++) {
                total += this.getChemistry(lineup[i].id, lineup[j].id);
                pairs++;
            }
        }
        return pairs > 0 ? total / pairs : 0;
    }

    private getCaptainSpiritAverage(): number {
        const captains = this.data.team.roster.filter((player) =>
            this.data.captainIds.includes(player.id),
        );
        if (captains.length === 0) return 75;
        const total = captains.reduce(
            (sum, player) => sum + player.attributes.spirit,
            0,
        );
        return total / captains.length;
    }

    private recalculateTeamSpirit(): void {
        const captainSpirit = this.getCaptainSpiritAverage();
        const baseSpirit = this.data.team.roster.reduce(
            (sum, player) => sum + player.attributes.spirit,
            0,
        ) / Math.max(1, this.data.team.roster.length);
        const withCaptainBonus = baseSpirit * 0.6 + captainSpirit * 0.4 * 1.2;
        this.data.team.stats.spiritScore = clamp(withCaptainBonus / 10, 0, 10);
    }

    postTryoutAnnouncement(): CareerActionResult {
        const event = this.getCurrentEvent();
        if (event?.type !== 'tryout' || event.stage !== 'announce') {
            return { ok: false, reason: 'Tryout announcement is only available on announce weeks.' };
        }
        if (this.data.finances.budget < CAREER_CONSTANTS.TRYOUT_ANNOUNCEMENT_COST) {
            return { ok: false, reason: 'Insufficient budget for tryout announcement.' };
        }

        if (!this.data.activeTryout || this.data.activeTryout.completed) {
            this.data.activeTryout = this.createTryoutState();
        }
        this.data.activeTryout.announcementPosted = true;
        this.data.finances.budget -= CAREER_CONSTANTS.TRYOUT_ANNOUNCEMENT_COST;
        this.logIncident('positive', 'Tryout announcement attracted prospects.', 0.35);
        this.data.culture.spirited = clamp(this.data.culture.spirited + 1, 0, 100);
        this.advanceWeek();
        this.save();
        return { ok: true };
    }

    runTryoutDrill(drill: TryoutDrill): CareerActionResult<{ reveals: number }> {
        const event = this.getCurrentEvent();
        if (event?.type !== 'tryout' || (event.stage !== 'drill' && event.stage !== 'offers')) {
            return { ok: false, reason: 'Tryout drills are only available during tryout weeks.' };
        }
        if (!this.data.activeTryout || !this.data.activeTryout.announcementPosted) {
            return { ok: false, reason: 'Post a tryout announcement first.' };
        }
        if (this.data.activeTryout.drillsRun.includes(drill)) {
            return { ok: false, reason: 'This drill has already been run this cycle.' };
        }

        let reveals = 0;
        for (const candidate of this.data.activeTryout.candidates) {
            reveals += this.revealCandidate(candidate, drill);
            candidate.drillsCompleted.push(drill);
        }
        this.data.activeTryout.drillsRun.push(drill);
        this.data.culture.cerebral = clamp(this.data.culture.cerebral + 1.2, 0, 100);
        this.save();
        return { ok: true, data: { reveals } };
    }

    offerTryoutSpot(candidateId: string): CareerActionResult<{ accepted: boolean; name: string }> {
        const event = this.getCurrentEvent();
        if (event?.type !== 'tryout' || (event.stage !== 'drill' && event.stage !== 'offers')) {
            return { ok: false, reason: 'Offers can only be made during tryout weeks.' };
        }
        if (!this.data.activeTryout) {
            return { ok: false, reason: 'No active tryout cycle.' };
        }
        if (this.data.team.roster.length >= 27) {
            return { ok: false, reason: 'Roster is full (27 players).' };
        }

        const candidate = this.data.activeTryout.candidates.find((entry) => entry.id === candidateId);
        if (!candidate) {
            return { ok: false, reason: 'Candidate not found.' };
        }
        if (this.data.activeTryout.offersMade.includes(candidateId)) {
            return { ok: false, reason: 'Offer already made to this candidate.' };
        }

        this.data.activeTryout.offersMade.push(candidateId);
        const acceptanceChance = clamp01(
            0.35 +
                candidate.teamPreference / 220 +
                this.data.reputation.recruitmentAppeal / 280 -
                candidate.otherOfferCount * 0.06 -
                CAREER_CONSTANTS.RECRUIT_DECLINE_BASE_CHANCE * 0.4,
        );
        const accepted = Random.next() < acceptanceChance;
        if (!accepted) {
            this.logIncident(
                'negative',
                `${candidate.name} declined the offer.`,
                -0.2,
            );
            this.save();
            return { ok: true, data: { accepted: false, name: candidate.name } };
        }

        const recruit = this.candidateToPlayer(candidate);
        recruit.morale = clamp(65 + candidate.teamPreference * 0.3, 0, 100);
        this.data.team.roster.push(recruit);
        this.data.finances.playerSalaries += Math.round(candidate.salaryExpectation);
        this.syncChemistryForNewPlayer(recruit.id);
        this.logIncident('positive', `${candidate.name} joined the roster.`, 0.5);
        this.save();
        return { ok: true, data: { accepted: true, name: candidate.name } };
    }

    finishTryoutCycle(): CareerActionResult {
        if (!this.data.activeTryout) return { ok: false, reason: 'No active tryout cycle.' };
        this.data.activeTryout.completed = true;
        this.data.activeTryout = null;
        this.advanceWeek();
        this.save();
        return { ok: true };
    }

    planPracticeFocus(
        week: number,
        focus: 'offense' | 'defense' | 'conditioning' | 'throws',
    ): CareerActionResult {
        const targetWeek = Math.floor(week);
        if (targetWeek < this.data.week) {
            return { ok: false, reason: 'Cannot change practice plans for past weeks.' };
        }
        const event = this.data.schedule.find((entry) => entry.date === targetWeek);
        if (!event || event.type !== 'practice') {
            return { ok: false, reason: 'Selected week is not a practice event.' };
        }
        event.focus = focus;
        this.data.culture.cerebral = clamp(this.data.culture.cerebral + 0.2, 0, 100);
        this.save();
        return { ok: true };
    }

    planScoutingTarget(week: number, teamId: string): CareerActionResult {
        const targetWeek = Math.floor(week);
        if (targetWeek < this.data.week) {
            return { ok: false, reason: 'Cannot edit scouting plans for past weeks.' };
        }
        const event = this.data.schedule.find((entry) => entry.date === targetWeek);
        if (!event || event.type !== 'scouting') {
            return { ok: false, reason: 'Selected week is not a scouting event.' };
        }
        if (!this.data.standings.some((standing) => standing.teamId === teamId)) {
            return { ok: false, reason: 'Scouting target team not found in standings.' };
        }
        if (teamId === this.data.team.id) {
            return { ok: false, reason: 'Cannot scout your own team.' };
        }
        event.targetTeamId = teamId;
        this.save();
        return { ok: true };
    }

    getLatestScoutingReportForTeam(teamId: string): ScoutingReport | null {
        return (
            this.data.scoutingReports.find((report) => report.teamId === teamId) || null
        );
    }

    getScoutingAdvantageForTeam(teamId: string): {
        bonus: number;
        report: ScoutingReport | null;
        notes: string[];
    } {
        const report = this.getLatestScoutingReportForTeam(teamId);
        if (!report) return { bonus: 0, report: null, notes: [] };

        const ageWeeks =
            Math.max(0, this.data.season - report.season) * CAREER_CONSTANTS.WEEKS_PER_SEASON +
            Math.max(0, this.data.week - report.week);
        const freshness = clamp(1 - ageWeeks / 18, 0.35, 1);
        const confidence = clamp(report.confidence || 0.5, 0.2, 1);
        let bonus = 1.2 * freshness * confidence;
        const notes: string[] = [];

        if (
            report.recommendedFormationId &&
            this.data.activeFormationId === report.recommendedFormationId
        ) {
            bonus += 0.95 * confidence;
            notes.push('Formation aligns with scouting recommendation');
        }
        const currentEvent = this.getCurrentEvent();
        if (
            report.recommendedPracticeFocus &&
            currentEvent?.type === 'practice' &&
            currentEvent.focus === report.recommendedPracticeFocus
        ) {
            bonus += 0.45 * confidence;
            notes.push('Current practice focus follows scouting plan');
        }
        if ((report.gamePlan || '').length > 0) {
            notes.push(report.gamePlan as string);
        }

        return {
            bonus: clamp(bonus, 0, 4),
            report,
            notes,
        };
    }

    applyLatestScoutingPlan(reportId?: string): CareerActionResult<{
        teamName: string;
        formationId: string;
        focus?: 'offense' | 'defense' | 'conditioning' | 'throws';
    }> {
        const report =
            (reportId
                ? this.data.scoutingReports.find((entry) => entry.id === reportId)
                : this.data.scoutingReports[0]) || null;
        if (!report) {
            return { ok: false, reason: 'No scouting report available to apply.' };
        }

        const formationId =
            (report.recommendedFormationId &&
            this.data.playbook.formations.some(
                (formation) => formation.id === report.recommendedFormationId,
            )
                ? report.recommendedFormationId
                : this.data.playbook.formations.find(
                      (formation) =>
                          /horizontal/i.test(formation.name) ||
                          /horizontal/i.test(formation.id),
                  )?.id || this.data.playbook.formations[0]?.id) || '';
        if (!formationId) {
            return { ok: false, reason: 'No playable formation available.' };
        }

        this.data.activeFormationId = formationId;
        const playsForFormation = this.data.playbook.plays.filter(
            (play) => play.formationId === formationId,
        );
        if (playsForFormation.length > 0) {
            this.data.activePlayId =
                playsForFormation.find((play) =>
                    /counter|reset|swing|under|deep|iso/i.test(play.name),
                )?.id || playsForFormation[0].id;
        } else {
            this.data.activePlayId = null;
        }

        let appliedFocus: 'offense' | 'defense' | 'conditioning' | 'throws' | undefined;
        if (report.recommendedPracticeFocus) {
            const nextPractice = this.data.schedule.find(
                (event) => event.date >= this.data.week && event.type === 'practice',
            );
            if (nextPractice && nextPractice.type === 'practice') {
                nextPractice.focus = report.recommendedPracticeFocus;
                appliedFocus = report.recommendedPracticeFocus;
            }
        }

        this.data.culture.cerebral = clamp(this.data.culture.cerebral + 1.1, 0, 100);
        this.logIncident(
            'positive',
            `Applied scouting game plan for ${report.teamName}.`,
            0.28,
        );
        this.save();
        return {
            ok: true,
            data: {
                teamName: report.teamName,
                formationId,
                focus: appliedFocus,
            },
        };
    }

    scoutOpponent(teamId?: string): CareerActionResult<ScoutingReport> {
        const event = this.getCurrentEvent();
        if (event?.type !== 'scouting') {
            return { ok: false, reason: 'Scouting is only available on scouting weeks.' };
        }
        if (this.data.finances.budget < CAREER_CONSTANTS.SCOUTING_REPORT_COST) {
            return { ok: false, reason: 'Insufficient budget for scouting report.' };
        }

        const targetTeam =
            this.data.standings.find((standing) => standing.teamId === (teamId || event.targetTeamId)) ||
            this.data.standings.find((standing) => standing.teamId !== this.data.team.id);
        if (!targetTeam) return { ok: false, reason: 'No scouting target available.' };

        const report = this.generateScoutingReport(targetTeam.teamId);
        this.data.scoutingReports.unshift(report);
        this.data.scoutingReports = this.data.scoutingReports.slice(0, 16);
        this.data.finances.budget -= CAREER_CONSTANTS.SCOUTING_REPORT_COST;
        this.data.culture.cerebral = clamp(this.data.culture.cerebral + 2, 0, 100);
        this.advanceWeek();
        this.save();
        return { ok: true, data: report };
    }

    runBondingEvent(): CareerActionResult {
        const event = this.getCurrentEvent();
        if (event?.type !== 'bonding') {
            return { ok: false, reason: 'Bonding is only available on bonding weeks.' };
        }

        const effect = event.effect || 'morale';
        for (const player of this.data.team.roster) {
            const moraleBoost = effect === 'morale' ? 4.5 : effect === 'culture' ? 3.2 : 2.8;
            player.morale = clamp(player.morale + moraleBoost + Random.next() * 2, 0, 100);
            player.fatigue = Math.max(0, player.fatigue - (effect === 'morale' ? 8 : 6));
        }

        const offenseIds = this.getOffenseLineup().map((player) => player.id);
        const defenseIds = this.getDefenseLineup().map((player) => player.id);
        this.bumpChemistryForLineup(offenseIds, 0.22);
        this.bumpChemistryForLineup(defenseIds, 0.22);
        this.data.culture.spirited = clamp(
            this.data.culture.spirited + (effect === 'spirit' ? 3 : 1.8),
            0,
            100,
        );
        if (effect === 'culture') {
            this.data.culture.competitive = clamp(this.data.culture.competitive + 1.6, 0, 100);
            this.data.culture.cerebral = clamp(this.data.culture.cerebral + 1.6, 0, 100);
            const fundraiserIncome = Math.round(
                CAREER_CONSTANTS.FUNDRAISER_BASE_INCOME *
                    (0.75 + this.data.reputation.fanSupport / 120),
            );
            this.data.finances.revenue += fundraiserIncome;
            this.data.finances.budget += fundraiserIncome;
            this.logIncident(
                'positive',
                `Fundraising and bonding raised chemistry (+$${fundraiserIncome.toLocaleString()}).`,
                0.5,
            );
        } else if (effect === 'spirit') {
            this.data.team.stats.spiritScore = clamp(
                this.data.team.stats.spiritScore + 0.35,
                0,
                10,
            );
            this.logIncident('positive', 'Spirit-focused bonding improved team spirit.', 0.4);
        } else {
            this.logIncident('positive', 'Team bonding raised morale and chemistry.', 0.45);
        }
        this.advanceWeek();
        this.save();
        return { ok: true };
    }

    runCurrentEventAuto(interventions: SimIntervention[] = []): CareerActionResult<unknown> {
        const event = this.getCurrentEvent();
        if (!event) return { ok: false, reason: 'No current event to resolve.' };

        if (event.type === 'tournament') {
            const gateReason = this.getCurrentEventGateReason(event);
            if (gateReason) {
                this.logIncident(
                    'negative',
                    `Skipped ${event.title}: ${gateReason}`,
                    -0.3,
                );
                this.simulateOtherStandingsForWeek([event.opponent.teamId]);
                this.advanceWeek();
                this.save();
                return { ok: true };
            }
            return this.simulateScheduledMatch(interventions);
        }
        if (event.type === 'practice') {
            const outcome = this.conductTraining(event.focus);
            return outcome.ok ? { ok: true } : outcome;
        }
        if (event.type === 'rest') {
            const outcome = this.takeRestWeek();
            return outcome.ok ? { ok: true } : outcome;
        }
        if (event.type === 'tryout') {
            if (event.stage === 'announce') return this.postTryoutAnnouncement();
            if (event.stage === 'drill') {
                const drillOutcome = this.runTryoutDrill('scrimmage');
                if (!drillOutcome.ok) return drillOutcome;
                const cycle = this.data.activeTryout;
                if (cycle && cycle.candidates.length > 0) {
                    this.offerTryoutSpot(cycle.candidates[0].id);
                }
                return this.finishTryoutCycle();
            }
            const cycle = this.data.activeTryout;
            if (cycle && cycle.candidates.length > 0) {
                this.offerTryoutSpot(cycle.candidates[0].id);
            }
            return this.finishTryoutCycle();
        }
        if (event.type === 'scouting') {
            return this.scoutOpponent(event.targetTeamId);
        }
        if (event.type === 'bonding') {
            return this.runBondingEvent();
        }
        return { ok: false, reason: 'Unsupported event type.' };
    }

    private applyMentoringDevelopment(
        focus: 'offense' | 'defense' | 'conditioning' | 'throws',
        intensity: number,
    ): number {
        let sessions = 0;
        for (const pair of this.data.mentorships) {
            const mentor = this.data.team.roster.find(
                (player) => player.id === pair.mentorId,
            );
            const mentee = this.data.team.roster.find(
                (player) => player.id === pair.menteeId,
            );
            if (!mentor || !mentee) continue;

            const chemistry = this.getChemistry(pair.mentorId, pair.menteeId);
            const chemistryFactor = clamp(0.75 + chemistry * 0.08, 0.35, 1.4);
            const ageFactor = mentee.development.age <= 23 ? 1.25 : 0.9;
            const mentorFactor =
                mentor.career.gamesPlayed >= 16
                    ? 1.15
                    : 0.85 + mentor.career.gamesPlayed / 80;
            const mentoringIntensity =
                CAREER_CONSTANTS.MENTORING_BASE_INTENSITY *
                chemistryFactor *
                ageFactor *
                mentorFactor *
                clamp(intensity / 80, 0.75, 1.4);

            if (focus === 'offense') {
                mentee.train('awareness', mentoringIntensity * 0.4);
                mentee.train('catching', mentoringIntensity * 0.35);
                mentee.train('throwAccuracy', mentoringIntensity * 0.25);
            } else if (focus === 'defense') {
                mentee.train('marking', mentoringIntensity * 0.42);
                mentee.train('speed', mentoringIntensity * 0.28);
                mentee.train('jumping', mentoringIntensity * 0.2);
                mentee.train('awareness', mentoringIntensity * 0.18);
            } else if (focus === 'conditioning') {
                mentee.train('stamina', mentoringIntensity * 0.55);
                mentee.train('speed', mentoringIntensity * 0.22);
                mentee.train('consistency', mentoringIntensity * 0.2);
            } else {
                mentee.train('throwPower', mentoringIntensity * 0.26);
                mentee.train('throwAccuracy', mentoringIntensity * 0.35);
                mentee.train('forehand', mentoringIntensity * 0.22);
                mentee.train('backhand', mentoringIntensity * 0.22);
            }

            mentor.morale = clamp(mentor.morale + 0.6, 0, 100);
            mentee.morale = clamp(mentee.morale + 1.2, 0, 100);
            this.setChemistry(pair.mentorId, pair.menteeId, chemistry + 0.08);
            pair.sessions += 1;
            sessions++;
        }
        return sessions;
    }

    conductTraining(
        focus: 'offense' | 'defense' | 'conditioning' | 'throws',
    ): CareerActionResult {
        const currentEvent = this.getCurrentEvent();
        if (currentEvent?.type !== 'practice') {
            return { ok: false, reason: 'Training is only available during a scheduled practice week.' };
        }

        const totalCost =
            this.data.team.roster.length *
            CAREER_CONSTANTS.TRAINING_COST_PER_PLAYER;
        if (this.data.finances.budget < totalCost) {
            return { ok: false, reason: 'Insufficient budget for this training block.' };
        }

        const xpGain =
            CAREER_CONSTANTS.XP_BASE_GAIN +
            Random.next() * CAREER_CONSTANTS.XP_VARIANCE;
        
        for (const player of this.data.team.roster) {
            switch (focus) {
                case 'offense':
                    player.train('throwAccuracy', xpGain * 0.5);
                    player.train('awareness', xpGain * 0.3);
                    break;
                case 'defense':
                    player.train('marking', xpGain * 0.5);
                    player.train('speed', xpGain * 0.3);
                    break;
                case 'conditioning':
                    player.train('stamina', xpGain * 0.6);
                    player.train('speed', xpGain * 0.2);
                    break;
                case 'throws':
                    player.train('throwPower', xpGain * 0.3);
                    player.train('throwAccuracy', xpGain * 0.4);
                    player.train('forehand', xpGain * 0.3);
                    player.train('backhand', xpGain * 0.3);
                    break;
            }
            player.morale = clamp(player.morale + 1, 0, 100);
        }
        const mentoringSessions = this.applyMentoringDevelopment(focus, xpGain);
        
        this.data.finances.budget -= totalCost;
        this.data.culture[practiceFocusToCultureKey(focus)] = clamp(
            this.data.culture[practiceFocusToCultureKey(focus)] + 1.4,
            0,
            100,
        );
        if (mentoringSessions > 0) {
            this.data.culture.cerebral = clamp(this.data.culture.cerebral + 0.8, 0, 100);
            this.logIncident(
                'positive',
                `${mentoringSessions} mentorship session${mentoringSessions === 1 ? '' : 's'} accelerated player development.`,
                0.2,
            );
        }
        this.bumpChemistryForLineup(this.getOffenseLineup().map((player) => player.id), 0.1);
        this.bumpChemistryForLineup(this.getDefenseLineup().map((player) => player.id), 0.08);
        this.simulateOtherStandingsForWeek([]);
        this.advanceWeek();
        this.save();
        return { ok: true };
    }
    
    takeRestWeek(): CareerActionResult {
        const currentEvent = this.getCurrentEvent();
        if (currentEvent?.type !== 'rest') {
            return { ok: false, reason: 'Rest is only available during a scheduled rest week.' };
        }

        for (const player of this.data.team.roster) {
            player.fatigue = Math.max(0, player.fatigue - 30);
            player.morale = clamp(player.morale + 5, 0, 100);
        }
        
        this.logIncident('positive', 'Rest week recovered team energy.', 0.25);
        this.simulateOtherStandingsForWeek([]);
        this.advanceWeek();
        this.save();
        return { ok: true };
    }
    
    processMatchResult(result: MatchResult): CareerActionResult {
        const currentEvent = this.getCurrentEvent();
        if (currentEvent?.type !== 'tournament') {
            return { ok: false, reason: 'You can only play career matches on tournament weeks.' };
        }
        if (!this.isTournamentUnlocked(currentEvent)) {
            return { ok: false, reason: this.getCurrentEventGateReason(currentEvent) || 'Tournament locked.' };
        }

        this.data.matchHistory.push(result);
        
        const isWin = result.playerScore > result.opponentScore;
        if (isWin) {
            this.data.team.stats.wins++;
            this.data.team.stats.tournamentWins++;
        } else {
            this.data.team.stats.losses++;
        }

        const pointDiff = result.playerScore - result.opponentScore;
        this.data.team.stats.pointsFor += result.playerScore;
        this.data.team.stats.pointsAgainst += result.opponentScore;
        this.data.team.stats.spiritScore =
            (this.data.team.stats.spiritScore * (this.data.matchHistory.length - 1) +
                result.playerSpirit) /
            this.data.matchHistory.length;
        this.data.spiritHistory.push(this.data.team.stats.spiritScore);
        this.data.spiritHistory = this.data.spiritHistory.slice(-24);
        
        for (const stat of result.stats) {
            const player = this.data.team.roster.find((candidate) => candidate.id === stat.playerId);
            if (!player) continue;
            player.career.goals += stat.goals;
            player.career.assists += stat.assists;
            player.career.blocks += stat.blocks;
            player.career.throwaways += stat.throwaways;
            player.career.drops += stat.drops;
            player.career.completions += stat.completions;
            player.career.attempts += stat.attempts;
            player.career.gamesPlayed++;
            player.career.gamesStarted++;
            player.morale = clamp(player.morale + (isWin ? 2 : -1), 0, 100);
        }

        this.applyMatchMorale(isWin, pointDiff, result.playerSpirit);
        this.bumpChemistryForLineup(
            this.getOffenseLineup().map((player) => player.id),
            isWin ? 0.12 : -0.06,
        );
        this.bumpChemistryForLineup(
            this.getDefenseLineup().map((player) => player.id),
            isWin ? 0.1 : -0.05,
        );

        this.updateStandingsForPlayedMatch(
            currentEvent.opponent.teamId,
            isWin,
            pointDiff,
            result.playerSpirit,
        );

        const generatedTournament = this.generateTournament(currentEvent.tier);
        this.simulateTournamentBracket(generatedTournament, currentEvent.opponent.teamId);
        
        this.updateReputation();
        const scoutingPrep = this.getScoutingAdvantageForTeam(currentEvent.opponent.teamId);
        if (scoutingPrep.report) {
            const delta = isWin ? 0.6 + scoutingPrep.bonus * 0.22 : 0.2;
            this.data.culture.cerebral = clamp(this.data.culture.cerebral + delta, 0, 100);
            if (isWin && scoutingPrep.bonus > 0.4) {
                this.logIncident(
                    'positive',
                    `Scouting prep translated into results against ${currentEvent.opponent.teamName}.`,
                    0.24,
                );
            }
        }
        this.updateMilestonesFromMatch(result, currentEvent, isWin);
        this.updateGlobalStats(result, isWin);

        const attendanceMultiplier = 1 + currentEvent.opponent.rating / 200;
        const attendance = Math.round(
            (100 + this.data.reputation.fanSupport * 10) * attendanceMultiplier,
        );
        this.data.finances.revenue += attendance * 5;
        this.data.finances.budget += attendance * 5;
        
        this.simulateOtherStandingsForWeek([currentEvent.opponent.teamId]);
        this.advanceWeek();
        this.save();
        return { ok: true };
    }

    simulateScheduledMatch(interventions: SimIntervention[] = []): CareerActionResult<CareerSimSummary> {
        const currentEvent = this.getCurrentEvent();
        if (currentEvent?.type !== 'tournament') {
            return { ok: false, reason: 'Current event is not a tournament.' };
        }
        if (!this.isTournamentUnlocked(currentEvent)) {
            return { ok: false, reason: this.getCurrentEventGateReason(currentEvent) || 'Tournament locked.' };
        }

        const offenseLineup = [...this.getOffenseLineup()];
        const defenseLineup = [...this.getDefenseLineup()];
        if (
            offenseLineup.length < CAREER_CONSTANTS.LINEUP_SIZE ||
            defenseLineup.length < CAREER_CONSTANTS.LINEUP_SIZE
        ) {
            return { ok: false, reason: 'O-line and D-line must each include 7 players.' };
        }

        const computeLineSkill = (lineup: PlayerStats[]) =>
            lineup.reduce((sum, player) => sum + player.overallRating, 0) / lineup.length +
            this.getLineupChemistryBonus(lineup) * 2 +
            this.getCaptainSpiritAverage() * 0.08 +
            this.data.culture.clutch * 0.04 +
            this.data.prestigeLevel * 1.5;
        const offenseSkill = computeLineSkill(offenseLineup) + this.data.culture.cerebral * 0.02;
        const defenseSkill = computeLineSkill(defenseLineup) + this.data.culture.competitive * 0.025;
        const opponentSkill = currentEvent.opponent.rating;
        const scoutingAdvantage = this.getScoutingAdvantageForTeam(
            currentEvent.opponent.teamId,
        );
        const scoutingBonus = scoutingAdvantage.bonus;
        const offenseSkillAdjusted = offenseSkill + scoutingBonus * 0.85;
        const defenseSkillAdjusted = defenseSkill + scoutingBonus * 1.05;

        let playerScore = 0;
        let opponentScore = 0;
        let point = 0;
        const target = 15;
        const points: SimPointSummary[] = [];
        const highlights: string[] = [];
        if (scoutingAdvantage.report && scoutingBonus > 0.15) {
            highlights.push(
                `Scouting prep on ${scoutingAdvantage.report.teamName} gave a +${scoutingBonus.toFixed(
                    1,
                )} edge.`,
            );
        }
        const interventionsByPoint = new Map<number, SimIntervention[]>();
        for (const intervention of interventions) {
            const atPoint = Math.max(1, intervention.atPoint || 1);
            const list = interventionsByPoint.get(atPoint) || [];
            list.push(intervention);
            interventionsByPoint.set(atPoint, list);
        }

        const simStats = new Map<string, MatchPlayerStats>();
        for (const player of [...offenseLineup, ...defenseLineup]) {
            if (simStats.has(player.id)) continue;
            simStats.set(player.id, {
                playerId: player.id,
                goals: 0,
                assists: 0,
                blocks: 0,
                throwaways: 0,
                drops: 0,
                completions: 0,
                attempts: 0,
                plusMinus: 0,
                playingTime: 0,
            });
        }

        let playerMomentum = 0;
        // Match begins with the player's team pulling, so D-line starts.
        let playerReceiving = false;
        while (playerScore < target && opponentScore < target && point < 38) {
            point++;
            const activeLineup = playerReceiving ? offenseLineup : defenseLineup;
            const pointSkill = playerReceiving ? offenseSkillAdjusted : defenseSkillAdjusted;
            const pointInterventions = interventionsByPoint.get(point) || [];
            let interventionBonus = 0;
            for (const intervention of pointInterventions) {
                if (intervention.type === 'timeout') {
                    interventionBonus += 0.06;
                    highlights.push(`Timeout called before point ${point}.`);
                } else if (
                    intervention.type === 'substitution' &&
                    intervention.playerOutId &&
                    intervention.playerInId
                ) {
                    interventionBonus += 0.03;
                    this.substituteLineupPlayer(
                        activeLineup,
                        intervention.playerOutId,
                        intervention.playerInId,
                    );
                    highlights.push(`Substitution at point ${point}.`);
                }
            }

            const chance = clamp01(
                0.5 +
                    (pointSkill - opponentSkill) / 95 +
                    playerMomentum +
                    interventionBonus,
            );
            const playerPoint = Random.next() < chance;
            if (playerPoint) {
                playerScore++;
                playerMomentum = clamp(playerMomentum + 0.02, -0.12, 0.12);
                const scorer = this.pickRandomLineupPlayer(activeLineup);
                const assister = this.pickRandomLineupPlayer(
                    activeLineup.filter((entry) => entry.id !== scorer.id),
                );
                const scorerLine = simStats.get(scorer.id);
                const assisterLine = simStats.get(assister.id);
                if (scorerLine) scorerLine.goals += 1;
                if (assisterLine) assisterLine.assists += 1;
                if (Random.next() < 0.22) {
                    const blockPlayer = this.pickRandomLineupPlayer(activeLineup);
                    const blockLine = simStats.get(blockPlayer.id);
                    if (blockLine) blockLine.blocks += 1;
                }
                highlights.push(`${scorer.fullName} finished point ${point}.`);
            } else {
                opponentScore++;
                playerMomentum = clamp(playerMomentum - 0.025, -0.12, 0.12);
                if (Random.next() < 0.25) {
                    const thrower = this.pickRandomLineupPlayer(activeLineup);
                    const throwerLine = simStats.get(thrower.id);
                    if (throwerLine) throwerLine.throwaways += 1;
                }
            }

            for (const player of activeLineup) {
                const line = simStats.get(player.id);
                if (!line) continue;
                line.attempts += 1 + Math.floor(Random.next() * 2);
                line.completions += Math.max(0, line.attempts - Math.floor(Random.next() * 2));
                line.playingTime += 70 + Math.floor(Random.next() * 30);
            }
            playerReceiving = !playerPoint;

            points.push({
                point,
                scoringSide: playerPoint ? 'player' : 'opponent',
                playerScore,
                opponentScore,
            });
        }

        const injuries: string[] = [];
        for (const player of [...offenseLineup, ...defenseLineup]) {
            if (Random.next() < 0.03) {
                player.fatigue = clamp(player.fatigue + 22, 0, 100);
                injuries.push(`${player.fullName} picked up a minor knock.`);
            }
        }

        const playerSpirit = clamp(
            this.data.team.stats.spiritScore + (Random.next() * 1.2 - 0.4),
            4,
            10,
        );
        const opponentSpirit = clamp(6.5 + Random.next() * 2.5, 4, 10);

        const stats = [...simStats.values()].map((line) => ({
            ...line,
            plusMinus:
                line.goals + line.assists + line.blocks - line.throwaways - line.drops,
        }));
        const result: MatchResult = {
            id: `career_sim_${Date.now()}`,
            date: Date.now(),
            opponentTeamId: currentEvent.opponent.teamId,
            opponentName: currentEvent.opponent.teamName,
            opponentRating: currentEvent.opponent.rating,
            playerScore,
            opponentScore,
            playerSpirit,
            opponentSpirit,
            stats,
            highlights: highlights.slice(0, 8).map((text, idx) => ({
                type: idx % 2 === 0 ? 'goal' : 'block',
                playerId:
                    (idx % 2 === 0 ? offenseLineup : defenseLineup)[
                        idx % CAREER_CONSTANTS.LINEUP_SIZE
                    ].id,
                timestamp: idx * 90,
                description: text,
            })),
        };
        const processed = this.processMatchResult(result);
        if (!processed.ok) {
            return { ok: false, reason: processed.reason };
        }

        return {
            ok: true,
            data: {
                eventTitle: currentEvent.title,
                points,
                playerScore,
                opponentScore,
                spiritReport: {
                    player: playerSpirit,
                    opponent: opponentSpirit,
                },
                injuries,
                highlights: highlights.slice(0, 8),
            },
        };
    }
    
    generateTournament(
        tier: 'local' | 'regional' | 'national' | 'elite',
    ): TournamentData {
        const teamCount =
            tier === 'local'
                ? CAREER_CONSTANTS.MIN_TEAM_COUNT_LOCAL
                : tier === 'regional'
                ? CAREER_CONSTANTS.MIN_TEAM_COUNT_REGIONAL
                : tier === 'national'
                ? CAREER_CONSTANTS.MIN_TEAM_COUNT_NATIONAL
                : CAREER_CONSTANTS.MIN_TEAM_COUNT_ELITE;

        const tournamentTeams = this.data.standings
            .slice(0, Math.max(teamCount, this.data.standings.length))
            .map((standing) => standing.teamId);
        if (!tournamentTeams.includes(this.data.team.id)) {
            tournamentTeams.push(this.data.team.id);
        }
        while (tournamentTeams.length < teamCount) {
            tournamentTeams.push(
                `wildcard_${this.data.season}_${this.data.week}_${tournamentTeams.length}`,
            );
        }

        const tournament: TournamentData = {
            id: `${tier}_${this.data.season}_${this.data.week}`,
            name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Championships`,
            tier,
            teams: tournamentTeams.slice(0, teamCount),
            schedule: [],
            completed: false,
        };
        
        const rounds = Math.ceil(Math.log2(Math.max(2, tournament.teams.length)));
        let matchesInRound = Math.max(1, Math.floor(tournament.teams.length / 2));
        
        for (let round = 1; round <= rounds; round++) {
            for (let i = 0; i < matchesInRound; i++) {
                tournament.schedule.push({
                    round,
                    teamA: '',
                    teamB: '',
                    completed: false,
                });
            }
            matchesInRound = Math.max(1, Math.floor(matchesInRound / 2));
        }
        
        for (let i = 0; i < tournament.schedule.length; i++) {
            if (tournament.schedule[i].round !== 1) continue;
            const teamA = tournament.teams[i * 2];
            const teamB = tournament.teams[i * 2 + 1];
            if (!teamA || !teamB) continue;
            tournament.schedule[i].teamA = teamA;
            tournament.schedule[i].teamB = teamB;
        }
        
        return tournament;
    }
    
    simulateTournamentMatch(match: TournamentMatch): {
        scoreA: number;
        scoreB: number;
    } {
        const isPlayerMatch =
            match.teamA === this.data.team.id || match.teamB === this.data.team.id;
        if (isPlayerMatch) {
            return { scoreA: 0, scoreB: 0 };
        }

        const standingA = this.data.standings.find((standing) => standing.teamId === match.teamA);
        const standingB = this.data.standings.find((standing) => standing.teamId === match.teamB);
        const ratingA = standingA?.rating ?? (CAREER_CONSTANTS.AI_RATING_MIN + Random.next() * CAREER_CONSTANTS.AI_RATING_RANGE);
        const ratingB = standingB?.rating ?? (CAREER_CONSTANTS.AI_RATING_MIN + Random.next() * CAREER_CONSTANTS.AI_RATING_RANGE);
        const totalRating = Math.max(1, ratingA + ratingB);
        
        const baseScore =
            CAREER_CONSTANTS.BASE_SCORE_MIN +
            Random.next() * CAREER_CONSTANTS.BASE_SCORE_RANGE;
        const scoreA = Math.round(baseScore * (ratingA / totalRating) * 2);
        const scoreB = Math.round(baseScore * (ratingB / totalRating) * 2);
        
        return { scoreA, scoreB };
    }
    
    recruitPlayer(): PlayerStats | null {
        if (this.data.finances.budget < CAREER_CONSTANTS.RECRUITING_COST) return null;
        
        const newPlayer = generatePlayer();
        newPlayer.development.age = 18 + Math.floor(Random.next() * 4);
        newPlayer.development.potential = 60 + Random.next() * 30;
        
        this.data.team.roster.push(newPlayer);
        this.data.finances.budget -= CAREER_CONSTANTS.RECRUITING_COST;
        this.data.finances.playerSalaries += CAREER_CONSTANTS.RECRUIT_SALARY;
        this.syncChemistryForNewPlayer(newPlayer.id);
        
        this.save();
        return newPlayer;
    }
    
    releasePlayer(playerId: string): boolean {
        const index = this.data.team.roster.findIndex((candidate) => candidate.id === playerId);
        if (index === -1) return false;
        
        this.data.team.roster.splice(index, 1);
        this.data.finances.playerSalaries = Math.max(
            0,
            this.data.finances.playerSalaries - CAREER_CONSTANTS.RECRUIT_SALARY,
        );
        this.data.team.startingLineupIds = this.data.team.startingLineupIds
            .filter((id) => id !== playerId)
            .slice(0, CAREER_CONSTANTS.LINEUP_SIZE);
        this.data.team.offenseLineupIds = (this.data.team.offenseLineupIds || [])
            .filter((id) => id !== playerId)
            .slice(0, CAREER_CONSTANTS.LINEUP_SIZE);
        this.data.team.defenseLineupIds = (this.data.team.defenseLineupIds || [])
            .filter((id) => id !== playerId)
            .slice(0, CAREER_CONSTANTS.LINEUP_SIZE);
        this.data.captainIds = this.data.captainIds.filter((id) => id !== playerId);
        this.data.mentorships = this.data.mentorships.filter(
            (pair) => pair.mentorId !== playerId && pair.menteeId !== playerId,
        );
        this.getOffenseLineup();
        this.getDefenseLineup();
        
        this.save();
        return true;
    }
    
    on(event: string, callback: () => void): void {
        if (!this.eventCallbacks.has(event)) {
            this.eventCallbacks.set(event, new Set());
        }
        this.eventCallbacks.get(event)!.add(callback);
    }
    
    off(event: string, callback: () => void): void {
        this.eventCallbacks.get(event)?.delete(callback);
    }
    
    private emit(event: string): void {
        this.eventCallbacks.get(event)?.forEach((callback) => callback());
    }

    private ensureDataIntegrity(): void {
        if (!Array.isArray(this.data.schedule) || this.data.schedule.length === 0) {
            this.data.schedule = generateSeasonSchedule(this.data.season, {
                standings: this.data.standings,
                playerTeamId: this.data.team.id,
                baseDifficulty: this.data.difficulty,
                division: this.data.division,
                mode: this.data.mode,
            });
        }
        if (!Array.isArray(this.data.standings) || this.data.standings.length === 0) {
            this.data.standings = [];
        }
        if (!this.data.standings.some((standing) => standing.teamId === this.data.team.id)) {
            this.data.standings.unshift({
                teamId: this.data.team.id,
                teamName: this.data.team.name,
                wins: this.data.team.stats.wins,
                losses: this.data.team.stats.losses,
                pointDiff:
                    this.data.team.stats.pointsFor - this.data.team.stats.pointsAgainst,
                spirit: this.data.team.stats.spiritScore,
                rating: 60,
                primaryColor: this.data.team.primaryColor,
                secondaryColor: this.data.team.secondaryColor,
            });
        }

        if (
            !this.data.activeFormationId ||
            !this.data.playbook.formations.some(
                (formation) => formation.id === this.data.activeFormationId,
            )
        ) {
            this.data.activeFormationId =
                this.data.playbook.formations[0]?.id || 'vertical';
        }
        if (
            this.data.activePlayId &&
            !this.data.playbook.plays.some((play) => play.id === this.data.activePlayId)
        ) {
            this.data.activePlayId = null;
        }

        this.data.team.startingLineupIds = this.completeLineupIds(
            this.data.team.startingLineupIds || [],
        );
        this.data.team.offenseLineupIds = this.completeLineupIds(
            this.data.team.offenseLineupIds || this.data.team.startingLineupIds || [],
        );
        this.data.team.defenseLineupIds = this.completeLineupIds(
            this.data.team.defenseLineupIds || this.data.team.startingLineupIds || [],
        );
        this.data.team.startingLineupIds = [...this.data.team.offenseLineupIds];

        if (!Array.isArray(this.data.captainIds) || this.data.captainIds.length === 0) {
            this.data.captainIds = this.data.team.roster
                .slice(0, CAREER_CONSTANTS.MIN_CAPTAINS)
                .map((player) => player.id);
        }
        this.data.captainIds = this.data.captainIds
            .filter((id) => this.data.team.roster.some((player) => player.id === id))
            .slice(0, CAREER_CONSTANTS.MAX_CAPTAINS);
        if (this.data.captainIds.length < CAREER_CONSTANTS.MIN_CAPTAINS) {
            this.data.captainIds = this.data.team.roster
                .slice(0, CAREER_CONSTANTS.MIN_CAPTAINS)
                .map((player) => player.id);
        }

        this.data.chemistry = this.data.chemistry || {};
        for (let i = 0; i < this.data.team.roster.length; i++) {
            for (let j = i + 1; j < this.data.team.roster.length; j++) {
                const a = this.data.team.roster[i].id;
                const b = this.data.team.roster[j].id;
                const key = chemistryKey(a, b);
                if (!Number.isFinite(this.data.chemistry[key])) {
                    this.data.chemistry[key] = Random.next() * 2 - 1;
                }
            }
        }

        this.data.culture = {
            competitive: clamp(this.data.culture?.competitive ?? 50, 0, 100),
            spirited: clamp(this.data.culture?.spirited ?? 50, 0, 100),
            athletic: clamp(this.data.culture?.athletic ?? 50, 0, 100),
            cerebral: clamp(this.data.culture?.cerebral ?? 50, 0, 100),
            clutch: clamp(this.data.culture?.clutch ?? 50, 0, 100),
        };
        this.data.spiritHistory = Array.isArray(this.data.spiritHistory)
            ? this.data.spiritHistory
            : [this.data.team.stats.spiritScore];
        this.data.awards = Array.isArray(this.data.awards) ? this.data.awards : [];
        this.data.spiritIncidents = Array.isArray(this.data.spiritIncidents)
            ? this.data.spiritIncidents
            : [];
        this.data.milestones = Array.isArray(this.data.milestones)
            ? this.data.milestones
            : [];
        this.data.unlockedGameplay = Array.isArray(this.data.unlockedGameplay)
            ? this.data.unlockedGameplay
            : [];
        this.data.scoutingReports = Array.isArray(this.data.scoutingReports)
            ? this.data.scoutingReports
            : [];
        this.data.mentorships = Array.isArray(this.data.mentorships)
            ? this.data.mentorships
                  .map((pair) => ({
                      mentorId: pair.mentorId,
                      menteeId: pair.menteeId,
                      startedSeason: Math.max(1, Number(pair.startedSeason) || this.data.season),
                      startedWeek: Math.max(1, Number(pair.startedWeek) || this.data.week),
                      sessions: Math.max(0, Number(pair.sessions) || 0),
                  }))
                  .filter(
                      (pair) =>
                          pair &&
                          typeof pair.mentorId === 'string' &&
                          typeof pair.menteeId === 'string' &&
                          pair.mentorId !== pair.menteeId &&
                          this.data.team.roster.some((player) => player.id === pair.mentorId) &&
                          this.data.team.roster.some((player) => player.id === pair.menteeId),
                  )
                  .slice(0, CAREER_CONSTANTS.MAX_MENTORSHIPS)
            : [];
        const seenMentees = new Set<string>();
        this.data.mentorships = this.data.mentorships.filter((pair) => {
            if (seenMentees.has(pair.menteeId)) return false;
            seenMentees.add(pair.menteeId);
            return true;
        });
        this.data.seasonPhase = this.getCurrentEvent()?.phase || phaseFromWeek(this.data.week);
        this.sortStandings();
        this.recalculateTeamSpirit();
    }

    private createTryoutState(): TryoutState {
        const count =
            CAREER_CONSTANTS.TRYOUT_CANDIDATE_MIN +
            Math.floor(
                Random.next() *
                    (CAREER_CONSTANTS.TRYOUT_CANDIDATE_MAX -
                        CAREER_CONSTANTS.TRYOUT_CANDIDATE_MIN +
                        1),
            );
        const candidates: RecruitCandidate[] = [];
        for (let i = 0; i < count; i++) {
            candidates.push(this.buildRecruitCandidate(i));
        }
        return {
            id: `tryout_${Date.now()}`,
            season: this.data.season,
            week: this.data.week,
            announcementPosted: false,
            candidates,
            drillsRun: [],
            offersMade: [],
            completed: false,
        };
    }

    private buildRecruitCandidate(idx: number): RecruitCandidate {
        const role =
            idx % 4 === 0 ? 'handler' : idx % 3 === 0 ? 'hybrid' : 'cutter';
        const generated = generatePlayer(role, 18 + Math.floor(Random.next() * 12));
        return {
            id: `candidate_${Date.now()}_${idx}_${Math.floor(Random.next() * 10000)}`,
            name: generated.fullName,
            age: generated.development.age,
            experience: Math.max(
                0,
                generated.development.age - 17 - Math.floor(Random.next() * 5),
            ),
            potential: Math.round(generated.development.potential),
            personality: Random.next() < 0.2
                ? 'team_first'
                : Random.next() < 0.45
                ? 'showboat'
                : Random.next() < 0.7
                ? 'grinder'
                : Random.next() < 0.9
                ? 'analyst'
                : 'wildcard',
            knownStats: {
                spirit: Math.round(generated.attributes.spirit),
                stamina: Math.round(generated.attributes.stamina),
            },
            hiddenStats: {
                speed: Math.round(generated.attributes.speed),
                acceleration: Math.round(generated.attributes.acceleration),
                throwPower: Math.round(generated.attributes.throwPower),
                throwAccuracy: Math.round(generated.attributes.throwAccuracy),
                awareness: Math.round(generated.attributes.awareness),
                catching: Math.round(generated.attributes.catching),
            },
            teamPreference: clamp(
                this.data.reputation.recruitmentAppeal +
                    this.data.reputation.spirit * 0.3 +
                    (Random.next() * 24 - 12),
                15,
                100,
            ),
            salaryExpectation: Math.round(180 + Random.next() * 260),
            otherOfferCount: Math.floor(Random.next() * 4),
            drillsCompleted: [],
        };
    }

    private revealCandidate(candidate: RecruitCandidate, drill: TryoutDrill): number {
        const revealByDrill: Record<TryoutDrill, Array<keyof PlayerAttributes>> = {
            sprint: ['speed', 'acceleration', 'stamina'],
            throwing: ['throwPower', 'throwAccuracy', 'forehand', 'backhand'],
            cutting: ['speed', 'jumping', 'catching', 'layout'],
            scrimmage: ['awareness', 'marking', 'clutch', 'consistency'],
        };
        let reveals = 0;
        for (const key of revealByDrill[drill]) {
            const hidden = candidate.hiddenStats[key];
            if (typeof hidden === 'number' && typeof candidate.knownStats[key] !== 'number') {
                candidate.knownStats[key] = hidden;
                reveals++;
            }
        }
        return reveals;
    }

    private candidateToPlayer(candidate: RecruitCandidate): PlayerStats {
        const throwingValue =
            Number(candidate.hiddenStats.throwAccuracy || 0) +
            Number(candidate.hiddenStats.forehand || 0) +
            Number(candidate.hiddenStats.backhand || 0);
        const cuttingValue =
            Number(candidate.hiddenStats.speed || 0) +
            Number(candidate.hiddenStats.catching || 0) +
            Number(candidate.hiddenStats.jumping || 0);
        const role: 'handler' | 'cutter' | 'hybrid' =
            throwingValue > cuttingValue + 20
                ? 'handler'
                : cuttingValue > throwingValue + 20
                ? 'cutter'
                : 'hybrid';
        const player = generatePlayer(role, candidate.age);
        for (const key of ATTRIBUTE_KEYS) {
            const known = candidate.knownStats[key];
            const hidden = candidate.hiddenStats[key];
            if (typeof known === 'number') {
                player.attributes[key] = known;
            } else if (typeof hidden === 'number') {
                player.attributes[key] = hidden;
            }
        }
        player.development.potential = clamp(candidate.potential, 40, 99);
        return player;
    }

    private syncChemistryForNewPlayer(newPlayerId: string): void {
        for (const teammate of this.data.team.roster) {
            if (teammate.id === newPlayerId) continue;
            this.setChemistry(
                teammate.id,
                newPlayerId,
                Random.next() * 2 - 0.5,
            );
        }
    }

    private generateScoutingReport(teamId: string): ScoutingReport {
        const standing = this.data.standings.find((entry) => entry.teamId === teamId);
        const fallbackOpponent = this.getCurrentOpponent();
        const teamName = standing?.teamName || fallbackOpponent?.teamName || 'Unknown Rival';
        const rating = standing?.rating || fallbackOpponent?.rating || 60;
        const spirit = standing?.spirit || 7;
        const confidence = clamp(
            0.45 + this.data.culture.cerebral / 250 + Random.next() * 0.18,
            0.2,
            0.98,
        );
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        if (rating >= 66) strengths.push('High-tempo offense with efficient continuation cuts');
        if (rating <= 54) weaknesses.push('Shallow reset structure under heavy marks');
        if (spirit >= 8) strengths.push('Disciplined spirit and low foul volatility');
        if (spirit < 6.5) weaknesses.push('Momentum swings after contested calls');
        if (strengths.length === 0) strengths.push('Balanced roster with solid fundamentals');
        if (weaknesses.length === 0) weaknesses.push('Limited depth in late-game rotations');
        const tendencies = [
            Random.next() < 0.5 ? 'Likes early deep looks from centered handlers' : 'Prefers patient horizontal swings',
            Random.next() < 0.5 ? 'Force-forehand person defense' : 'Mixes zone transition after pull',
            Random.next() < 0.5 ? 'Conservative timeout usage' : 'Aggressive timeout usage near red zone',
        ];
        const recommendedFormationId =
            tendencies[0].includes('patient')
                ? this.data.playbook.formations.find(
                      (formation) =>
                          /horizontal/i.test(formation.name) ||
                          /horizontal/i.test(formation.id),
                  )?.id
                : this.data.playbook.formations.find(
                      (formation) =>
                          /vertical/i.test(formation.name) ||
                          /vertical/i.test(formation.id),
                  )?.id || this.data.playbook.formations[0]?.id;
        const recommendedDefense: 'man' | 'zone_331' =
            tendencies[0].includes('deep') || rating >= 66 ? 'zone_331' : 'man';
        const recommendedPracticeFocus: 'offense' | 'defense' | 'conditioning' | 'throws' =
            rating >= 66 || tendencies[0].includes('deep')
                ? 'defense'
                : weaknesses.some((entry) => /reset|depth|rotation/i.test(entry))
                ? 'offense'
                : tendencies[1].includes('zone')
                ? 'throws'
                : 'conditioning';
        const gamePlan = `Run ${recommendedFormationId || 'best available'} looks, pressure their ${
            tendencies[0].includes('deep') ? 'deep lanes' : 'reset windows'
        }, and lean ${recommendedPracticeFocus} reps this week.`;
        return {
            id: `scout_${Date.now()}_${Math.floor(Random.next() * 1000)}`,
            season: this.data.season,
            week: this.data.week,
            teamId,
            teamName,
            strengths,
            weaknesses,
            tendencies,
            keyPlayers: [`${teamName} Handler Core`, `${teamName} Deep Threat`],
            confidence,
            recommendedFormationId,
            recommendedDefense,
            recommendedPracticeFocus,
            gamePlan,
        };
    }

    private applyMatchMorale(
        isWin: boolean,
        pointDiff: number,
        playerSpirit: number,
    ): void {
        let moraleDelta = isWin ? 7 : -6;
        if (Math.abs(pointDiff) <= 2) moraleDelta += 2;
        if (!isWin && pointDiff <= -6) moraleDelta -= 4;
        if (playerSpirit >= 8.5) moraleDelta += 2;
        if (playerSpirit < 6) moraleDelta -= 2;

        for (const player of this.data.team.roster) {
            player.morale = clamp(player.morale + moraleDelta + Random.next() * 1.4 - 0.7, 0, 100);
        }
        if (moraleDelta >= 0) {
            this.logIncident('positive', 'Team morale rose after a solid result.', moraleDelta / 10);
        } else {
            this.logIncident('negative', 'Team morale dipped after a rough result.', moraleDelta / 10);
        }
    }

    private updateStandingsForPlayedMatch(
        opponentTeamId: string,
        playerWon: boolean,
        playerPointDiff: number,
        playerSpirit: number,
    ): void {
        const playerStanding = this.getPlayerStanding();
        if (!playerStanding) return;
        const opponentStanding = this.data.standings.find(
            (standing) => standing.teamId === opponentTeamId,
        );

        if (playerWon) {
            playerStanding.wins++;
            if (opponentStanding) opponentStanding.losses++;
        } else {
            playerStanding.losses++;
            if (opponentStanding) opponentStanding.wins++;
        }

        playerStanding.pointDiff += playerPointDiff;
        playerStanding.spirit =
            playerStanding.spirit * 0.8 + Math.max(0, Math.min(10, playerSpirit)) * 0.2;
        if (opponentStanding) {
            opponentStanding.pointDiff -= playerPointDiff;
        }

        const opponentRating = opponentStanding?.rating ?? 60;
        const expectedPlayer = 1 / (1 + Math.pow(10, (opponentRating - playerStanding.rating) / 40));
        const actualPlayer = playerWon ? 1 : 0;
        const marginFactor = clamp(1 + Math.abs(playerPointDiff) / 14, 0.8, 1.45);
        const delta = Math.round(
            CAREER_CONSTANTS.ELO_K_FACTOR * (actualPlayer - expectedPlayer) * marginFactor,
        );
        playerStanding.rating = clamp(playerStanding.rating + delta, 35, 99);
        if (opponentStanding) {
            opponentStanding.rating = clamp(opponentStanding.rating - delta, 35, 99);
        }

        this.sortStandings();
    }

    private simulateTournamentBracket(
        tournament: TournamentData,
        playedOpponentId: string,
    ): void {
        const excluded = new Set<string>([this.data.team.id, playedOpponentId]);
        for (const match of tournament.schedule) {
            if (!match.teamA || !match.teamB) continue;
            if (excluded.has(match.teamA) || excluded.has(match.teamB)) continue;
            const { scoreA, scoreB } = this.simulateTournamentMatch(match);
            if (scoreA === scoreB) continue;
            match.scoreA = scoreA;
            match.scoreB = scoreB;
            match.completed = true;

            const standingA = this.data.standings.find(
                (standing) => standing.teamId === match.teamA,
            );
            const standingB = this.data.standings.find(
                (standing) => standing.teamId === match.teamB,
            );
            if (!standingA || !standingB) continue;

            if (scoreA > scoreB) {
                standingA.wins++;
                standingB.losses++;
            } else {
                standingA.losses++;
                standingB.wins++;
            }
            const diff = scoreA - scoreB;
            standingA.pointDiff += diff;
            standingB.pointDiff -= diff;
        }
        this.sortStandings();
    }

    private simulateOtherStandingsForWeek(excludedTeamIds: string[]): void {
        const excluded = new Set<string>([this.data.team.id, ...excludedTeamIds]);
        const aiTeams = this.data.standings.filter(
            (standing) => !excluded.has(standing.teamId),
        );
        if (aiTeams.length < 2) return;

        const offset = this.data.week % aiTeams.length;
        for (let i = 0; i + 1 < aiTeams.length; i += 2) {
            const teamA = aiTeams[(i + offset) % aiTeams.length];
            const teamB = aiTeams[(i + 1 + offset) % aiTeams.length];
            const ratingA = teamA.rating + Random.next() * 6;
            const ratingB = teamB.rating + Random.next() * 6;
            const baseScore = CAREER_CONSTANTS.BASE_SCORE_MIN + Random.next() * 4;
            const scoreA = Math.round((baseScore * ratingA) / Math.max(1, ratingA + ratingB) * 2);
            const scoreB = Math.round((baseScore * ratingB) / Math.max(1, ratingA + ratingB) * 2);
            if (scoreA === scoreB) continue;

            if (scoreA > scoreB) {
                teamA.wins++;
                teamB.losses++;
            } else {
                teamA.losses++;
                teamB.wins++;
            }
            const diff = scoreA - scoreB;
            teamA.pointDiff += diff;
            teamB.pointDiff -= diff;
        }
        this.sortStandings();
    }

    private getPlayerStanding() {
        return this.data.standings.find(
            (standing) => standing.teamId === this.data.team.id,
        );
    }

    private sortStandings(): void {
        this.data.standings.sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
            return b.rating - a.rating;
        });
    }
    
    private advanceWeek(): void {
        this.data.week++;
        this.data.currentDate = new Date(
            this.data.currentDate.getTime() + 7 * 24 * 60 * 60 * 1000,
        );

        if (this.data.week > CAREER_CONSTANTS.WEEKS_PER_SEASON) {
            this.advanceSeason();
        } else {
            this.data.seasonPhase =
                this.getCurrentEvent()?.phase || phaseFromWeek(this.data.week);
        }
        
        this.emit('weekAdvanced');
    }
    
    private advanceSeason(): void {
        const playerIndex = this.data.standings.findIndex(
            (standing) => standing.teamId === this.data.team.id,
        );
        const rank = playerIndex + 1;

        if (this.data.division === 4 && rank <= CAREER_CONSTANTS.PROMOTION_RANK_CUTOFF) {
            this.data.division = 3;
        } else if (
            this.data.division === 3 &&
            rank <= CAREER_CONSTANTS.DIVISION3_PROMOTION_CUTOFF
        ) {
            this.data.division = 2;
        } else if (
            this.data.division === 2 &&
            rank <= CAREER_CONSTANTS.DIVISION2_PROMOTION_CUTOFF
        ) {
            this.data.division = 1;
        }
        if (this.data.division <= 3) {
            this.unlockGameplay('zone_defense');
        }
        if (this.data.division <= 2) {
            this.unlockGameplay('custom_playbook');
        }
        if (this.data.division === 1) {
            this.unlockGameplay('night_games');
        }

        if (this.data.team.stats.losses === 0 && this.data.team.stats.wins > 0) {
            this.setMilestoneProgress('undefeated', 1, true);
        }

        this.data.season++;
        this.data.week = 1;
        this.data.seasonPhase = 'offseason';
        
        for (const player of this.data.team.roster) {
            player.ageYear();
        }
        if (this.data.mode === 'college') {
            this.advanceCollegeYear();
        }

        this.data.team.stats.wins = 0;
        this.data.team.stats.losses = 0;
        this.data.team.stats.pointsFor = 0;
        this.data.team.stats.pointsAgainst = 0;
        this.data.team.stats.tournamentWins = 0;

        const playerStanding = this.getPlayerStanding();
        const previousRating = playerStanding?.rating || 60;
        this.data.standings = this.data.standings.map((standing) => {
            if (standing.teamId === this.data.team.id) {
                return {
                    ...standing,
                    wins: 0,
                    losses: 0,
                    pointDiff: 0,
                    spirit: this.data.team.stats.spiritScore,
                    rating: Math.round(previousRating),
                };
            }
            const baseline = Math.max(
                CAREER_CONSTANTS.AI_RATING_MIN,
                standing.rating + (Random.next() - 0.5) * 6,
            );
            return {
                ...standing,
                wins: 0,
                losses: 0,
                pointDiff: 0,
                spirit: 7 + Random.next() * 2.5,
                rating: Math.round(baseline),
            };
        });
        
        this.data.schedule = generateSeasonSchedule(this.data.season, {
            standings: this.data.standings,
            playerTeamId: this.data.team.id,
            baseDifficulty: this.data.difficulty,
            division: this.data.division,
            mode: this.data.mode,
        });
        this.data.activeTryout = null;
        
        this.sortStandings();
        this.emit('seasonAdvanced');
    }

    private advanceCollegeYear(): void {
        const previousYear = this.data.collegeYear;
        this.data.collegeYear = clamp(
            this.data.collegeYear + 1,
            1,
            CAREER_CONSTANTS.COLLEGE_MAX_YEAR,
        );
        if (previousYear === CAREER_CONSTANTS.COLLEGE_MAX_YEAR) {
            this.data.collegeYear = 1;
        }
        this.data.team.roster = this.data.team.roster.filter(
            (player) => player.development.age < CAREER_CONSTANTS.COLLEGE_GRADUATION_AGE,
        );
        const intake =
            CAREER_CONSTANTS.COLLEGE_FRESHMEN_INTAKE_MIN +
            Math.floor(
                Random.next() *
                    (CAREER_CONSTANTS.COLLEGE_FRESHMEN_INTAKE_MAX -
                        CAREER_CONSTANTS.COLLEGE_FRESHMEN_INTAKE_MIN +
                        1),
            );
        for (let i = 0; i < intake; i++) {
            this.data.team.roster.push(generatePlayer(undefined, 18));
        }
        this.data.team.offenseLineupIds = this.completeLineupIds(
            this.data.team.roster.slice(0, CAREER_CONSTANTS.LINEUP_SIZE).map((player) => player.id),
        );
        this.data.team.defenseLineupIds = this.completeLineupIds(
            [...this.data.team.roster]
                .sort(
                    (a, b) =>
                        b.attributes.marking + b.attributes.speed - (a.attributes.marking + a.attributes.speed),
                )
                .slice(0, CAREER_CONSTANTS.LINEUP_SIZE)
                .map((player) => player.id),
        );
        this.data.team.startingLineupIds = [...this.data.team.offenseLineupIds];
        this.data.mentorships = this.data.mentorships.filter(
            (pair) =>
                this.data.team.roster.some((player) => player.id === pair.mentorId) &&
                this.data.team.roster.some((player) => player.id === pair.menteeId),
        );
    }
    
    private updateReputation(): void {
        const winRate =
            this.data.team.stats.wins /
            Math.max(1, this.data.team.stats.wins + this.data.team.stats.losses);
        
        this.data.reputation.skill = Math.round(30 + winRate * 70);
        this.data.reputation.spirit = Math.round(this.data.team.stats.spiritScore * 10);
        this.data.reputation.fanSupport = Math.round(
            (this.data.reputation.skill +
                this.data.reputation.spirit +
                this.data.culture.competitive * 0.2) /
                2.2,
        );
        this.data.reputation.recruitmentAppeal = Math.round(
            (this.data.reputation.skill +
                this.data.reputation.spirit +
                this.data.culture.spirited * 0.4 +
                Math.max(10, this.data.finances.budget / 1200)) /
                3.4,
        );
        this.data.reputation.overall = Math.round(
            (this.data.reputation.skill +
                this.data.reputation.spirit +
                this.data.reputation.fanSupport +
                this.data.reputation.recruitmentAppeal) /
                4,
        );
    }

    private unlockGameplay(unlockId: string): void {
        if (this.data.unlockedGameplay.includes(unlockId)) return;
        this.data.unlockedGameplay.push(unlockId);
    }

    private updateMilestonesFromMatch(
        result: MatchResult,
        event: SeasonEvent,
        isWin: boolean,
    ): void {
        this.setMilestoneProgress('first_win', this.data.team.stats.wins, true);
        this.setMilestoneProgress(
            'division_climber',
            this.data.division <= 2 ? 1 : 0,
            true,
        );

        const totalBlocks = this.data.team.roster.reduce(
            (sum, player) => sum + player.career.blocks,
            0,
        );
        const totalGoals = this.data.team.roster.reduce(
            (sum, player) => sum + player.career.goals,
            0,
        );
        this.setMilestoneProgress('hundred_ds', totalBlocks, true);
        this.setMilestoneProgress('thousand_goals', totalGoals, true);

        const ironPlayer = result.stats.some((line) => line.playingTime >= 820);
        if (ironPlayer) this.setMilestoneProgress('iron_person', 1, false);

        const spiritAwardEarned = result.playerSpirit >= 9.2;
        if (spiritAwardEarned) {
            this.setMilestoneProgress('spirit_award', 1, false);
            this.award({
                id: `award_spirit_${Date.now()}`,
                season: this.data.season,
                week: this.data.week,
                title: 'Spirit Award',
                description: 'Recognized for elite spirit at tournament play.',
            });
        }

        if (
            isWin &&
            event.type === 'tournament' &&
            event.tier === 'elite' &&
            event.title.toLowerCase().includes('final')
        ) {
            this.setMilestoneProgress('tournament_champ', 1, false);
            this.data.nationalsTitles += 1;
            this.data.prestigeLevel = Math.max(this.data.prestigeLevel, this.data.nationalsTitles);
            this.setMilestoneProgress('dynasty', this.data.nationalsTitles, true);
            this.award({
                id: `award_nationals_${Date.now()}`,
                season: this.data.season,
                week: this.data.week,
                title: 'Nationals Champion',
                description: `Won ${event.title}.`,
            });
        }
    }

    private setMilestoneProgress(
        milestoneId: string,
        progressValue: number,
        overwrite: boolean,
    ): void {
        const milestone = this.data.milestones.find((entry) => entry.id === milestoneId);
        if (!milestone) return;
        milestone.progress = overwrite
            ? progressValue
            : Math.max(milestone.progress, progressValue);
        if (!milestone.completed && milestone.progress >= milestone.target) {
            milestone.completed = true;
            milestone.completedAtSeason = this.data.season;
            saveManager.unlockAchievement(`milestone_${milestone.id}`);
        }
    }

    private updateGlobalStats(result: MatchResult, isWin: boolean): void {
        const goals = result.stats.reduce((sum, stat) => sum + stat.goals, 0);
        const assists = result.stats.reduce((sum, stat) => sum + stat.assists, 0);
        const blocks = result.stats.reduce((sum, stat) => sum + stat.blocks, 0);
        const throwaways = result.stats.reduce((sum, stat) => sum + stat.throwaways, 0);
        const completions = result.stats.reduce((sum, stat) => sum + stat.completions, 0);
        const attempts = result.stats.reduce((sum, stat) => sum + stat.attempts, 0);

        const current = saveManager.getStats();
        saveManager.updateStats({
            totalGamesPlayed: current.totalGamesPlayed + 1,
            totalPointsScored: current.totalPointsScored + result.playerScore,
            careerGoals: current.careerGoals + goals,
            careerAssists: current.careerAssists + assists,
            careerBlocks: current.careerBlocks + blocks,
            careerTurnovers: current.careerTurnovers + throwaways,
            careerCompletions: current.careerCompletions + completions,
            careerAttempts: current.careerAttempts + attempts,
            totalPointsPlayed:
                current.totalPointsPlayed + result.playerScore + result.opponentScore,
            totalWins: current.totalWins + (isWin ? 1 : 0),
            totalLosses: current.totalLosses + (isWin ? 0 : 1),
            totalSpiritScore: current.totalSpiritScore + result.playerSpirit,
        });
    }

    private award(award: CareerAward): void {
        this.data.awards.unshift(award);
        this.data.awards = this.data.awards.slice(0, 32);
    }

    private logIncident(
        severity: 'positive' | 'negative',
        description: string,
        delta: number,
    ): void {
        this.data.spiritIncidents.unshift({
            id: `incident_${Date.now()}_${Math.floor(Random.next() * 1000)}`,
            season: this.data.season,
            week: this.data.week,
            severity,
            description,
            delta,
        });
        this.data.spiritIncidents = this.data.spiritIncidents.slice(0, 64);
    }

    private substituteLineupPlayer(
        lineup: PlayerStats[],
        playerOutId: string,
        playerInId: string,
    ): void {
        const outIdx = lineup.findIndex((player) => player.id === playerOutId);
        if (outIdx === -1) return;
        const replacement = this.data.team.roster.find((player) => player.id === playerInId);
        if (!replacement) return;
        lineup[outIdx] = replacement;
    }

    private pickRandomLineupPlayer(lineup: PlayerStats[]): PlayerStats {
        const idx = Math.floor(Random.next() * lineup.length);
        return lineup[Math.max(0, Math.min(lineup.length - 1, idx))];
    }

    private isTournamentUnlocked(event: Extract<SeasonEvent, { type: 'tournament' }>): boolean {
        if (this.data.mode === 'college') return true;
        if (event.tier === 'regional') return this.data.division <= 3;
        if (event.tier === 'national') return this.data.division <= 2;
        if (event.tier === 'elite') {
            return (
                this.data.division === 1 &&
                this.getCurrentRank() <= CAREER_CONSTANTS.DIVISION1_NATIONALS_CUTOFF
            );
        }
        return true;
    }
}
