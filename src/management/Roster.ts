import type { PlayerStats } from '../data/PlayerStats';
import type { CareerData } from '../data/SaveLoad';

export interface LineupSlot {
    position: number;
    playerId: string;
    role: 'handler' | 'cutter' | 'hybrid';
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
        const ids = Array.isArray(this.data.team.startingLineupIds)
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
