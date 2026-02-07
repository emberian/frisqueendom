import type { PlayerStats } from '../data/PlayerStats';
import { generatePlayer, generateRoster } from '../data/PlayerStats';
import { CAREER_CONSTANTS } from '../data/CareerConstants';
import type { 
    CareerData, 
    TeamData, 
    PlaybookData, 
    MatchResult, 
    SeasonEvent,
    TournamentData,
    TournamentMatch,
} from '../data/SaveLoad';
import { saveCareer, loadCareer, createNewCareer, generateSeasonSchedule } from '../data/SaveLoad';

export type CareerState = 'hub' | 'roster' | 'playbook' | 'schedule' | 'match_setup' | 'tournament' | 'training';

export class CareerManager {
    data: CareerData;
    currentState: CareerState = 'hub';
    private eventCallbacks: Map<string, Set<() => void>> = new Map();
    
    constructor(data?: CareerData) {
        if (data) {
            this.data = data;
        } else {
            // Create new career with defaults
            this.data = createNewCareer('Coach', 'Lightning');
        }
    }
    
    static load(): CareerManager | null {
        const data = loadCareer();
        if (data) {
            return new CareerManager(data);
        }
        return null;
    }
    
    save(): void {
        saveCareer(this.data);
    }
    
    // Navigation
    navigateTo(state: CareerState): void {
        this.currentState = state;
        this.emit('stateChange');
    }
    
    // Roster management
    getStartingLineup(): PlayerStats[] {
        // Return first 7 players sorted by role
        const handlers = this.data.team.roster
            .filter(p => p.role === 'handler')
            .slice(0, 2);
        const cutters = this.data.team.roster
            .filter(p => p.role === 'cutter')
            .slice(0, 4);
        const hybrid = this.data.team.roster
            .filter(p => p.role === 'hybrid')
            .slice(0, 1);
        
        return [...handlers, ...cutters, ...hybrid].slice(0, 7);
    }
    
    setPlayerRole(playerId: string, role: 'handler' | 'cutter' | 'hybrid'): void {
        const player = this.data.team.roster.find(p => p.id === playerId);
        if (player) {
            player.role = role;
            this.save();
        }
    }
    
    // Training
    conductTraining(focus: 'offense' | 'defense' | 'conditioning' | 'throws'): void {
        const xpGain = CAREER_CONSTANTS.XP_BASE_GAIN + Math.random() * CAREER_CONSTANTS.XP_VARIANCE;
        
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
        }
        
        // Training costs money
        this.data.finances.budget -= this.data.team.roster.length * CAREER_CONSTANTS.TRAINING_COST_PER_PLAYER;
        
        this.advanceWeek();
        this.save();
    }
    
    // Rest week
    takeRestWeek(): void {
        // Players recover fatigue
        for (const player of this.data.team.roster) {
            player.fatigue = Math.max(0, player.fatigue - 30);
            player.morale = Math.min(100, player.morale + 5);
        }
        
        this.advanceWeek();
        this.save();
    }
    
    // Schedule
    getCurrentEvent(): SeasonEvent | null {
        const event = this.data.schedule.find(e => e.date === this.data.week);
        return event || null;
    }
    
    getUpcomingEvents(count: number = 5): SeasonEvent[] {
        return this.data.schedule
            .filter(e => e.date > this.data.week)
            .slice(0, count);
    }
    
    // Match result processing
    processMatchResult(result: MatchResult): void {
        this.data.matchHistory.push(result);
        
        // Update team stats
        const isWin = result.playerScore > result.opponentScore;
        if (isWin) {
            this.data.team.stats.wins++;
        } else {
            this.data.team.stats.losses++;
        }
        this.data.team.stats.pointsFor += result.playerScore;
        this.data.team.stats.pointsAgainst += result.opponentScore;
        this.data.team.stats.spiritScore = 
            (this.data.team.stats.spiritScore * (this.data.matchHistory.length - 1) + result.playerSpirit) 
            / this.data.matchHistory.length;
        
        // Update player career stats
        for (const stat of result.stats) {
            const player = this.data.team.roster.find(p => p.id === stat.playerId);
            if (player) {
                player.career.goals += stat.goals;
                player.career.assists += stat.assists;
                player.career.blocks += stat.blocks;
                player.career.throwaways += stat.throwaways;
                player.career.drops += stat.drops;
                player.career.completions += stat.completions;
                player.career.attempts += stat.attempts;
                player.career.gamesPlayed++;
            }
        }
        
        // Update reputation
        this.updateReputation();
        
        // Income from matches
        const attendance = 100 + this.data.reputation.fanSupport * 10;
        this.data.finances.revenue += attendance * 5;
        this.data.finances.budget += attendance * 5;
        
        this.advanceWeek();
        this.save();
    }
    
    // Tournament
    generateTournament(tier: 'local' | 'regional' | 'national' | 'elite'): TournamentData {
        const teamCount = tier === 'local' 
            ? CAREER_CONSTANTS.MIN_TEAM_COUNT_LOCAL 
            : tier === 'regional' 
            ? CAREER_CONSTANTS.MIN_TEAM_COUNT_REGIONAL 
            : tier === 'national' 
            ? CAREER_CONSTANTS.MIN_TEAM_COUNT_NATIONAL 
            : CAREER_CONSTANTS.MIN_TEAM_COUNT_ELITE;
        const teamNames = ['Thunder', 'Storm', 'Fire', 'Ice', 'Wind', 'Wave', 'Stone', 'Flame',
            'Shadow', 'Light', 'Force', 'Pulse', 'Rush', 'Flow', 'Strike', 'Surge'];
        
        const tournament: TournamentData = {
            id: `${tier}_${this.data.season}_${this.data.week}`,
            name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Championships`,
            tier,
            teams: [this.data.team.id],
            schedule: [],
            completed: false,
        };
        
        // Add other teams
        for (let i = 0; i < teamCount - 1; i++) {
            tournament.teams.push(`team_${teamNames[i]}_${Date.now()}_${i}`);
        }
        
        // Generate bracket (simplified single elimination)
        const rounds = Math.ceil(Math.log2(teamCount));
        let matchesInRound = teamCount / 2;
        
        for (let round = 1; round <= rounds; round++) {
            for (let i = 0; i < matchesInRound; i++) {
                tournament.schedule.push({
                    round,
                    teamA: '', // Will be filled as tournament progresses
                    teamB: '',
                    completed: false,
                });
            }
            matchesInRound /= 2;
        }
        
        // Set first round matchups
        for (let i = 0; i < tournament.schedule.length; i++) {
            if (tournament.schedule[i].round === 1) {
                tournament.schedule[i].teamA = tournament.teams[i * 2];
                tournament.schedule[i].teamB = tournament.teams[i * 2 + 1];
            }
        }
        
        return tournament;
    }
    
    simulateTournamentMatch(match: TournamentMatch): { scoreA: number; scoreB: number } {
        const isPlayerMatch = match.teamA === this.data.team.id || match.teamB === this.data.team.id;
        
        if (isPlayerMatch) {
            return { scoreA: 0, scoreB: 0 };
        }
        
        // AI vs AI match - simplified simulation
        const ratingA = Math.random() * CAREER_CONSTANTS.AI_RATING_RANGE + CAREER_CONSTANTS.AI_RATING_MIN;
        const ratingB = Math.random() * CAREER_CONSTANTS.AI_RATING_RANGE + CAREER_CONSTANTS.AI_RATING_MIN;
        const totalRating = ratingA + ratingB;
        
        const baseScore = CAREER_CONSTANTS.BASE_SCORE_MIN + Math.random() * CAREER_CONSTANTS.BASE_SCORE_RANGE;
        const scoreA = Math.round(baseScore * (ratingA / totalRating) * 2);
        const scoreB = Math.round(baseScore * (ratingB / totalRating) * 2);
        
        return { scoreA, scoreB };
    }
    
    // Recruiting
    recruitPlayer(): PlayerStats | null {
        if (this.data.finances.budget < CAREER_CONSTANTS.RECRUITING_COST) return null;
        
        // Generate new player
        const newPlayer = generatePlayer();
        newPlayer.development.age = 18 + Math.floor(Math.random() * 4);
        newPlayer.development.potential = 60 + Math.random() * 30;
        
        this.data.team.roster.push(newPlayer);
        this.data.finances.budget -= CAREER_CONSTANTS.RECRUITING_COST;
        this.data.finances.playerSalaries += CAREER_CONSTANTS.RECRUIT_SALARY;
        
        this.save();
        return newPlayer;
    }
    
    releasePlayer(playerId: string): boolean {
        const index = this.data.team.roster.findIndex(p => p.id === playerId);
        if (index === -1) return false;
        
        const player = this.data.team.roster[index];
        this.data.team.roster.splice(index, 1);
        this.data.finances.playerSalaries = Math.max(0, 
            this.data.finances.playerSalaries - CAREER_CONSTANTS.RECRUIT_SALARY);
        
        this.save();
        return true;
    }
    
    // Advance time
    private advanceWeek(): void {
        this.data.week++;
        
        // Age players once per season
        if (this.data.week > CAREER_CONSTANTS.WEEKS_PER_SEASON) {
            this.advanceSeason();
        }
        
        this.emit('weekAdvanced');
    }
    
    private advanceSeason(): void {
        this.data.season++;
        this.data.week = 1;
        
        // Age all players
        for (const player of this.data.team.roster) {
            player.ageYear();
        }
        
        // Generate new schedule
        this.data.schedule = generateSeasonSchedule(this.data.season);
        
        // Reset standings
        this.data.standings = [];
        
        this.emit('seasonAdvanced');
    }
    
    private updateReputation(): void {
        const winRate = this.data.team.stats.wins / Math.max(1, this.data.matchHistory.length);
        
        this.data.reputation.skill = Math.round(30 + winRate * 70);
        this.data.reputation.spirit = Math.round(this.data.team.stats.spiritScore * 10);
        this.data.reputation.fanSupport = Math.round(
            (this.data.reputation.skill + this.data.reputation.spirit) / 2
        );
        this.data.reputation.recruitmentAppeal = Math.round(
            (this.data.reputation.skill + this.data.finances.budget / 1000) / 2
        );
        this.data.reputation.overall = Math.round(
            (this.data.reputation.skill + this.data.reputation.spirit + 
             this.data.reputation.fanSupport + this.data.reputation.recruitmentAppeal) / 4
        );
    }
    
    // Event system
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
        this.eventCallbacks.get(event)?.forEach(cb => cb());
    }
}
