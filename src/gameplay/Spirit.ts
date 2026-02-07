import { FOUL_CONSTANTS, SPIRIT_DEFAULTS } from '../data/GameplayConstants';
import type { Player } from '../entities/Player';
import type { Disc } from '../entities/Disc';
import type { Match } from './Match';
import { Random } from '../data/SeededRandom';

export type FoulType = 'travel' | 'strip' | 'pick' | 'contact' | 'fast_count' | 'timeout';
export type CallResolution = 'accepted' | 'contested' | 'retracted';

export interface FoulCall {
    id: string;
    type: FoulType;
    caller: Player;
    offender: Player;
    timestamp: number;
    description: string;
    resolution: CallResolution | null;
    affectedScore: boolean;
}

export interface SpiritScore {
    rulesKnowledge: number;     // 0-2
    foulsAndBodyContact: number; // 0-2
    fairMindedness: number;     // 0-2
    positiveAttitude: number;   // 0-2
    communication: number;      // 0-2
    total: number;              // 0-10
}

export class SpiritSystem {
    fouls: FoulCall[] = [];
    private playerTeamSpirit: SpiritScore = {
        rulesKnowledge: SPIRIT_DEFAULTS.RULES_KNOWLEDGE,
        foulsAndBodyContact: SPIRIT_DEFAULTS.FOULS_BODY_CONTACT,
        fairMindedness: SPIRIT_DEFAULTS.FAIR_MINDEDNESS,
        positiveAttitude: SPIRIT_DEFAULTS.POSITIVE_ATTITUDE,
        communication: SPIRIT_DEFAULTS.COMMUNICATION,
        total: SPIRIT_DEFAULTS.MAX_CATEGORY_SCORE * 5,
    };
    private aiTeamSpirit: SpiritScore = {
        rulesKnowledge: SPIRIT_DEFAULTS.RULES_KNOWLEDGE,
        foulsAndBodyContact: SPIRIT_DEFAULTS.FOULS_BODY_CONTACT,
        fairMindedness: SPIRIT_DEFAULTS.FAIR_MINDEDNESS,
        positiveAttitude: SPIRIT_DEFAULTS.POSITIVE_ATTITUDE,
        communication: SPIRIT_DEFAULTS.COMMUNICATION,
        total: SPIRIT_DEFAULTS.MAX_CATEGORY_SCORE * 5,
    };
    
    // Player reputation tracking
    private playerFoulHistory: Map<string, number> = new Map(); // playerId -> foul count
    private contestedCalls = 0;
    private acceptedCalls = 0;
    
    // Spirit degradation for aggressive play
    private aggressivePlays = 0;
    private fairPlays = 0;
    
    private updateTimer = 0;
    private readonly UPDATE_INTERVAL = 0.1; // Check fouls every 100ms instead of every frame

    update(dt: number, match: Match, players: Player[], disc: Disc): void {
        this.updateTimer += dt;
        if (this.updateTimer >= this.UPDATE_INTERVAL) {
            this.updateTimer = 0;
            // Check for potential foul situations
            this.checkForFouls(match, players, disc);
            // Update spirit scores based on game events
            this.updateSpiritScores();
        }
    }

    private checkForFouls(match: Match, players: Player[], disc: Disc): void {
        const thresholdSq = FOUL_CONSTANTS.CONTACT_DISTANCE_THRESHOLD * FOUL_CONSTANTS.CONTACT_DISTANCE_THRESHOLD;
        
        // Check for contact between players - O(N^2) but only runs at 10Hz
        for (let i = 0; i < players.length; i++) {
            const p1 = players[i];
            const p1Pos = p1.movement.position;
            
            for (let j = i + 1; j < players.length; j++) {
                const p2 = players[j];
                
                const distSq = p1Pos.distanceToSquared(p2.movement.position);
                if (distSq < thresholdSq) {
                    // Potential contact foul
                    if (this.shouldCallFoul(p1)) {
                        this.callFoul('contact', p1, p2, 'Contact while cutting');
                    }
                }
            }
        }
        
        // Check for strip (disc contact while in possession)
        if (disc.state === 'held' && disc.holder) {
            const holderPos = disc.holder.movement.position;
            for (const player of players) {
                if (player === disc.holder) continue;
                if (player.team === disc.holder.team) continue;
                
                const distSq = player.movement.position.distanceToSquared(holderPos);
                if (distSq < 0.36 && this.shouldCallFoul(disc.holder)) { // 0.6 * 0.6 = 0.36
                    this.callFoul('strip', disc.holder, player, 'Disc contacted while catching');
                }
            }
        }
    }

    private shouldCallFoul(player: Player): boolean {
        // AI players call fouls based on their spirit stat
        if (!player.isControlled && player.stats) {
            const spirit = player.stats.attributes.spirit;
            const callChance = FOUL_CONSTANTS.BASE_FOUL_CALL_CHANCE + 
                (spirit / 100) * FOUL_CONSTANTS.SPIRIT_FOUL_MODIFIER;
            return Random.next() < callChance;
        }
        return false; // Player-controlled fouls are called via input
    }

    callFoul(
        type: FoulType,
        caller: Player,
        offender: Player,
        description: string,
    ): FoulCall | null {
        // Check for duplicate recent calls
        const recentCall = this.fouls.find(f => 
            f.type === type && 
            f.caller === caller && 
            f.offender === offender &&
            performance.now() - f.timestamp < FOUL_CONSTANTS.FOUL_COOLDOWN_MS
        );
        if (recentCall) return null;

        const foul: FoulCall = {
            id: `foul_${Date.now()}_${Random.next().toString(36).substr(2, 9)}`,
            type,
            caller,
            offender,
            timestamp: performance.now(),
            description,
            resolution: null,
            affectedScore: false,
        };

        this.fouls.push(foul);
        
        // Track foul history
        const currentFouls = this.playerFoulHistory.get(offender.id) || 0;
        this.playerFoulHistory.set(offender.id, currentFouls + 1);
        
        // Auto-resolve AI fouls
        if (!caller.isControlled || !offender.isControlled) {
            this.autoResolveFoul(foul);
        }

        return foul;
    }

    private autoResolveFoul(foul: FoulCall): void {
        // AI decision making for foul resolution
        const callerSpirit = foul.caller.stats?.attributes.spirit || 50;
        const offenderSpirit = foul.offender.stats?.attributes.spirit || 50;
        
        // Higher spirit players more likely to accept calls
        const acceptChance = (offenderSpirit / 100) * 0.8;
        const contestChance = 0.1 + (100 - offenderSpirit) / 100 * 0.3;
        
        const roll = Random.next();
        if (roll < acceptChance) {
            this.resolveFoul(foul, 'accepted');
        } else if (roll < acceptChance + contestChance) {
            this.resolveFoul(foul, 'contested');
        } else {
            this.resolveFoul(foul, 'retracted');
        }
    }

    resolveFoul(foul: FoulCall, resolution: CallResolution): void {
        foul.resolution = resolution;
        
        switch (resolution) {
            case 'accepted':
                this.acceptedCalls++;
                // Play stops, disc goes back if relevant
                break;
            case 'contested':
                this.contestedCalls++;
                // Disc goes back to thrower
                break;
            case 'retracted':
                // Play continues
                break;
        }
    }

    // Player input for calling fouls
    playerCallFoul(caller: Player, nearestOpponent: Player | null): FoulCall | null {
        if (!nearestOpponent) return null;
        
        // Determine foul type based on context
        let type: FoulType = 'contact';
        
        // Could be extended to detect specific situations
        return this.callFoul(type, caller, nearestOpponent, 'Contact foul called by player');
    }

    playerContestFoul(foul: FoulCall): void {
        this.resolveFoul(foul, 'contested');
    }

    playerAcceptFoul(foul: FoulCall): void {
        this.resolveFoul(foul, 'accepted');
    }

    // Spirit scoring
    private updateSpiritScores(): void {
        // Calculate player team spirit
        const totalCalls = this.fouls.length;
        const contestedRatio = totalCalls > 0 ? this.contestedCalls / totalCalls : 0;
        
        // Too many contested calls reduces fair-mindedness
        if (contestedRatio > 0.3) {
            this.playerTeamSpirit.fairMindedness = Math.max(0, 2 - contestedRatio * 2);
        }
        
        // Aggressive play reduces body contact score
        if (this.aggressivePlays > this.fairPlays * 2) {
            this.playerTeamSpirit.foulsAndBodyContact = Math.max(0, 2 - (this.aggressivePlays / 10));
        }
        
        // Recalculate totals
        this.playerTeamSpirit.total = 
            this.playerTeamSpirit.rulesKnowledge +
            this.playerTeamSpirit.foulsAndBodyContact +
            this.playerTeamSpirit.fairMindedness +
            this.playerTeamSpirit.positiveAttitude +
            this.playerTeamSpirit.communication;
        
        this.aiTeamSpirit.total = 
            this.aiTeamSpirit.rulesKnowledge +
            this.aiTeamSpirit.foulsAndBodyContact +
            this.aiTeamSpirit.fairMindedness +
            this.aiTeamSpirit.positiveAttitude +
            this.aiTeamSpirit.communication;
    }

    getPlayerTeamSpirit(): SpiritScore {
        return { ...this.playerTeamSpirit };
    }

    getAITeamSpirit(): SpiritScore {
        return { ...this.aiTeamSpirit };
    }

    // Record aggressive/fair play
    recordAggressivePlay(): void {
        this.aggressivePlays++;
    }

    recordFairPlay(): void {
        this.fairPlays++;
    }

    // Get player's foul count
    getFoulCount(playerId: string): number {
        return this.playerFoulHistory.get(playerId) || 0;
    }

    // Get recent fouls for UI display
    getRecentFouls(count: number = 5): FoulCall[] {
        return this.fouls
            .filter(f => f.resolution === null)
            .slice(-count);
    }

    // Check if game has spirit issues
    hasSpiritIssues(): boolean {
        return this.playerTeamSpirit.total < 6 || this.aiTeamSpirit.total < 6;
    }

    // End of game summary
    getEndOfGameSummary(): {
        totalFouls: number;
        contestedRatio: number;
        playerSpirit: SpiritScore;
        aiSpirit: SpiritScore;
    } {
        const totalFouls = this.fouls.length;
        const contestedRatio = totalFouls > 0 ? this.contestedCalls / totalFouls : 0;
        
        return {
            totalFouls,
            contestedRatio,
            playerSpirit: this.getPlayerTeamSpirit(),
            aiSpirit: this.getAITeamSpirit(),
        };
    }

    // Reset for new game
    reset(): void {
        this.fouls = [];
        this.playerFoulHistory.clear();
        this.contestedCalls = 0;
        this.acceptedCalls = 0;
        this.aggressivePlays = 0;
        this.fairPlays = 0;
        
        this.playerTeamSpirit = {
            rulesKnowledge: 2,
            foulsAndBodyContact: 2,
            fairMindedness: 2,
            positiveAttitude: 2,
            communication: 2,
            total: 10,
        };
        
        this.aiTeamSpirit = {
            rulesKnowledge: 2,
            foulsAndBodyContact: 2,
            fairMindedness: 2,
            positiveAttitude: 2,
            communication: 2,
            total: 10,
        };
    }
}
