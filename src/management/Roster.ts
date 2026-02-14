import type { PlayerStats } from '../data/PlayerStats';
import type { CareerData } from '../data/SaveLoad';
import { CAREER_CONSTANTS } from '../data/CareerConstants';

export interface LineupSlot {
    position: number;
    playerId: string;
    role: 'handler' | 'cutter' | 'hybrid';
}

function chemistryKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export class RosterManager {
    data: CareerData;
    currentLineup: LineupSlot[] = [];

    constructor(data: CareerData) {
        this.data = data;
        this.loadLineup();
    }

    private loadLineup(): void {
        const roster = this.data.team.roster;
        const ids = Array.isArray(this.data.team.offenseLineupIds)
            ? this.data.team.offenseLineupIds
            : Array.isArray(this.data.team.startingLineupIds)
            ? this.data.team.startingLineupIds
            : [];
        const explicit = ids
            .map((id) => roster.find((p) => p.id === id))
            .filter((p): p is PlayerStats => !!p)
            .slice(0, 7);
        const selected =
            explicit.length >= 7 ? explicit : roster.slice(0, 7);

        this.currentLineup = selected.map((player, i) => ({
            position: i,
            playerId: player.id,
            role: player.role,
        }));
    }

    getRoster(): PlayerStats[] {
        return this.data.team.roster;
    }

    getLineup(): PlayerStats[] {
        return this.currentLineup
            .map(slot => this.data.team.roster.find(p => p.id === slot.playerId))
            .filter((p): p is PlayerStats => p !== undefined);
    }

    setLineup(lineup: LineupSlot[]): void {
        // Validate all players exist
        const validLineup = lineup.filter(slot =>
            this.data.team.roster.some(p => p.id === slot.playerId)
        );
        this.currentLineup = validLineup.slice(0, 7);
        this.data.team.startingLineupIds = this.currentLineup.map((slot) => slot.playerId);
    }

    swapLineupPositions(posA: number, posB: number): void {
        const slotA = this.currentLineup.find(s => s.position === posA);
        const slotB = this.currentLineup.find(s => s.position === posB);

        if (slotA && slotB) {
            const temp = slotA.playerId;
            slotA.playerId = slotB.playerId;
            slotB.playerId = temp;
        }
    }

    substitutePlayer(benchPlayerId: string, lineupPosition: number): boolean {
        const slot = this.currentLineup.find(s => s.position === lineupPosition);
        if (!slot) return false;

        // Check if bench player exists and isn't already in lineup
        const benchPlayer = this.data.team.roster.find(p => p.id === benchPlayerId);
        if (!benchPlayer) return false;
        if (this.currentLineup.some(s => s.playerId === benchPlayerId)) return false;

        slot.playerId = benchPlayerId;
        slot.role = benchPlayer.role;
        this.data.team.startingLineupIds = this.currentLineup.map((s) => s.playerId);
        return true;
    }

    sortRoster(by: 'overall' | 'role' | 'stamina' | 'morale'): PlayerStats[] {
        const roster = [...this.data.team.roster];

        switch (by) {
            case 'overall':
                return roster.sort((a, b) => b.overallRating - a.overallRating);
            case 'role':
                const roleOrder = { handler: 0, hybrid: 1, cutter: 2 };
                return roster.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
            case 'stamina':
                return roster.sort((a, b) => b.attributes.stamina - a.attributes.stamina);
            case 'morale':
                return roster.sort((a, b) => b.morale - a.morale);
            default:
                return roster;
        }
    }

    getPlayerStatsSummary(playerId: string): {
        gamesPlayed: number;
        goals: number;
        assists: number;
        blocks: number;
        completionPct: number;
        plusMinus: number;
    } | null {
        const player = this.data.team.roster.find(p => p.id === playerId);
        if (!player) return null;

        const completions = player.career.completions;
        const attempts = player.career.attempts;

        return {
            gamesPlayed: player.career.gamesPlayed,
            goals: player.career.goals,
            assists: player.career.assists,
            blocks: player.career.blocks,
            completionPct: attempts > 0 ? Math.round((completions / attempts) * 100) : 0,
            plusMinus: (player.career.goals + player.career.assists + player.career.blocks)
                - (player.career.throwaways + player.career.drops),
        };
    }

    getTeamNeeds(): { role: 'handler' | 'cutter' | 'hybrid'; need: 'high' | 'medium' | 'low' }[] {
        const roleCounts = {
            handler: this.data.team.roster.filter(p => p.role === 'handler').length,
            cutter: this.data.team.roster.filter(p => p.role === 'cutter').length,
            hybrid: this.data.team.roster.filter(p => p.role === 'hybrid').length,
        };

        return [
            { role: 'handler', need: roleCounts.handler < 4 ? 'high' : roleCounts.handler < 6 ? 'medium' : 'low' },
            { role: 'cutter', need: roleCounts.cutter < 8 ? 'high' : roleCounts.cutter < 12 ? 'medium' : 'low' },
            { role: 'hybrid', need: roleCounts.hybrid < 2 ? 'high' : roleCounts.hybrid < 4 ? 'medium' : 'low' },
        ];
    }

    getInjuredPlayers(): PlayerStats[] {
        // For now, fatigue acts as injury risk
        return this.data.team.roster.filter(p => p.fatigue > 80);
    }

    getLowMoralePlayers(): PlayerStats[] {
        return this.data.team.roster.filter(p => p.morale < 40);
    }

    // --- Chemistry System ---

    /**
     * Get the pairwise chemistry between two players.
     * Chemistry ranges from CHEMISTRY_MIN (-5) to CHEMISTRY_MAX (+5).
     * Returns 0 if no chemistry record exists.
     * Returns CHEMISTRY_MAX for a player compared to themselves.
     */
    getChemistry(playerA: string, playerB: string): number {
        if (playerA === playerB) return CAREER_CONSTANTS.CHEMISTRY_MAX;
        const key = chemistryKey(playerA, playerB);
        return this.data.chemistry[key] || 0;
    }

    /**
     * Update the pairwise chemistry between two players by a delta.
     * Clamps result to [CHEMISTRY_MIN, CHEMISTRY_MAX] range.
     *
     * Chemistry changes from:
     * - Shared practice time: +0.1 per practice session together
     * - Successful plays together (goal + assist): +0.3 per play
     * - Complementary positions (handler + cutter): +0.2 initial bonus
     * - Same role competing for same spot: -0.1 per week
     * - Personality conflicts (very different spirit values): -0.1 per week
     *
     * Chemistry effects on gameplay (main.ts will use):
     * - +3 or higher: +10% catch rate when throwing to that player
     * - -3 or lower: -10% catch rate
     */
    updateChemistry(playerA: string, playerB: string, delta: number): void {
        if (playerA === playerB) return;
        const key = chemistryKey(playerA, playerB);
        const current = this.data.chemistry[key] || 0;
        this.data.chemistry[key] = Math.max(
            CAREER_CONSTANTS.CHEMISTRY_MIN,
            Math.min(CAREER_CONSTANTS.CHEMISTRY_MAX, current + delta),
        );
    }

    /**
     * Compute the average chemistry across all roster player pairs.
     * Returns 0 if there are fewer than 2 players on the roster.
     */
    getTeamChemistryAverage(): number {
        const roster = this.data.team.roster;
        if (roster.length < 2) return 0;
        let total = 0;
        let pairs = 0;
        for (let i = 0; i < roster.length; i++) {
            for (let j = i + 1; j < roster.length; j++) {
                total += this.getChemistry(roster[i].id, roster[j].id);
                pairs++;
            }
        }
        return pairs > 0 ? total / pairs : 0;
    }

    /**
     * Apply weekly chemistry adjustments based on role competition
     * and spirit-based personality conflicts.
     * Called once per week during advanceWeek.
     */
    applyWeeklyChemistryAdjustments(): void {
        const roster = this.data.team.roster;
        for (let i = 0; i < roster.length; i++) {
            for (let j = i + 1; j < roster.length; j++) {
                const a = roster[i];
                const b = roster[j];

                // Same role competing for same spot: -0.1 per week
                if (a.role === b.role) {
                    this.updateChemistry(a.id, b.id, CAREER_CONSTANTS.CHEMISTRY_SAME_ROLE_WEEKLY);
                }

                // Personality conflicts (very different spirit values): -0.1 per week
                const spiritGap = Math.abs(a.attributes.spirit - b.attributes.spirit);
                if (spiritGap >= CAREER_CONSTANTS.CHEMISTRY_SPIRIT_CONFLICT_THRESHOLD) {
                    this.updateChemistry(a.id, b.id, CAREER_CONSTANTS.CHEMISTRY_SPIRIT_CONFLICT_WEEKLY);
                }
            }
        }
    }

    /**
     * Apply chemistry bonus when two players share a practice session.
     * +0.1 per practice session together.
     */
    applyPracticeChemistry(playerIds: string[]): void {
        for (let i = 0; i < playerIds.length; i++) {
            for (let j = i + 1; j < playerIds.length; j++) {
                this.updateChemistry(
                    playerIds[i],
                    playerIds[j],
                    CAREER_CONSTANTS.CHEMISTRY_PRACTICE_DELTA,
                );
            }
        }
    }

    /**
     * Apply chemistry bonus when a goal-assist connection occurs.
     * +0.3 per successful play together.
     */
    applyGoalAssistChemistry(scorerId: string, assisterId: string): void {
        this.updateChemistry(scorerId, assisterId, CAREER_CONSTANTS.CHEMISTRY_GOAL_ASSIST_DELTA);
    }

    /**
     * Apply initial complementary position bonus when a new player joins.
     * Handler + cutter pairs get +0.2 bonus.
     */
    applyComplementaryBonus(newPlayerId: string): void {
        const newPlayer = this.data.team.roster.find(p => p.id === newPlayerId);
        if (!newPlayer) return;
        for (const teammate of this.data.team.roster) {
            if (teammate.id === newPlayerId) continue;
            const isComplementary =
                (newPlayer.role === 'handler' && teammate.role === 'cutter') ||
                (newPlayer.role === 'cutter' && teammate.role === 'handler');
            if (isComplementary) {
                this.updateChemistry(newPlayerId, teammate.id, CAREER_CONSTANTS.CHEMISTRY_COMPLEMENTARY_BONUS);
            }
        }
    }

    // Training recommendations
    getTrainingRecommendations(): { focus: 'offense' | 'defense' | 'conditioning' | 'throws'; reason: string }[] {
        const recommendations: { focus: 'offense' | 'defense' | 'conditioning' | 'throws'; reason: string }[] = [];

        const roster = this.data.team.roster;

        // Check throwing stats
        const avgThrowAccuracy = roster.reduce((sum, p) => sum + p.attributes.throwAccuracy, 0) / roster.length;
        if (avgThrowAccuracy < 60) {
            recommendations.push({ focus: 'throws', reason: 'Team throw accuracy below average' });
        }

        // Check conditioning
        const avgStamina = roster.reduce((sum, p) => sum + p.attributes.stamina, 0) / roster.length;
        if (avgStamina < 60) {
            recommendations.push({ focus: 'conditioning', reason: 'Team stamina needs improvement' });
        }

        // Check defense
        const avgMarking = roster.reduce((sum, p) => sum + p.attributes.marking, 0) / roster.length;
        if (avgMarking < 55) {
            recommendations.push({ focus: 'defense', reason: 'Defensive skills need work' });
        }

        // Check offense
        const avgAwareness = roster.reduce((sum, p) => sum + p.attributes.awareness, 0) / roster.length;
        if (avgAwareness < 55) {
            recommendations.push({ focus: 'offense', reason: 'Field awareness could be better' });
        }

        return recommendations;
    }

    // Player development tracking
    getTopProspects(count: number = 3): PlayerStats[] {
        return [...this.data.team.roster]
            .sort((a, b) => b.development.potential - a.development.potential)
            .slice(0, count);
    }

    getVeteranLeaders(count: number = 3): PlayerStats[] {
        return [...this.data.team.roster]
            .filter(p => p.development.age > 25 && p.career.gamesPlayed > 20)
            .sort((a, b) => b.career.gamesPlayed - a.career.gamesPlayed)
            .slice(0, count);
    }
}
