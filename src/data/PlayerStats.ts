// Player statistics and skills system

import { CAREER_CONSTANTS } from './CareerConstants';
import { STAT_MODIFIERS } from './GameplayConstants';

export interface PlayerAttributes {
    // Physical
    speed: number;        // 1-100, affects sprint speed
    acceleration: number; // 1-100, affects how quickly they reach speed
    stamina: number;      // 1-100, affects stamina pool and drain rate
    jumping: number;      // 1-100, affects layout reach
    height: number;       // 1-100, affects catch radius (tall players)
    
    // Throwing
    throwPower: number;   // 1-100, affects max throw speed
    throwAccuracy: number; // 1-100, affects throw precision
    forehand: number;     // 1-100, forehand skill
    backhand: number;     // 1-100, backhand skill
    huck: number;         // 1-100, long throw accuracy
    breakThrows: number;  // 1-100, ability to throw around mark
    
    // Catching/Defense
    catching: number;     // 1-100, catch reliability
    layout: number;       // 1-100, willingness and skill at layouts
    marking: number;      // 1-100, defensive marking skill
    awareness: number;    // 1-100, field awareness, positioning
    
    // Mental
    spirit: number;       // 1-100, sportsmanship (affects foul calls)
    clutch: number;       // 1-100, performance under pressure
    consistency: number;  // 1-100, variance in performance
}

export interface PlayerTraits {
    riskTaker: boolean;      // Goes for difficult throws/catches
    teamPlayer: boolean;     // Prioritizes safe options
    emotional: boolean;      // Affected by momentum
    leader: boolean;         // Boosts team morale
    defensiveSpecialist: boolean; // Excels on defense
}

export interface PlayerAppearance {
    jerseyNumber: number;
    skinTone: number;        // 0x000000 - 0xffffff
    hairStyle: 'bald' | 'short' | 'long' | 'ponytail' | 'bun';
    hairColor: number;
    accessories: ('sweatband' | 'wristbands' | 'glasses' | 'hat')[];
}

export interface PlayerCareerStats {
    gamesPlayed: number;
    gamesStarted: number;
    goals: number;
    assists: number;
    blocks: number;
    throwaways: number;
    drops: number;
    completions: number;
    attempts: number;
    pulls: number;
    pullOB: number;
}

export interface PlayerDevelopment {
    experience: number;      // XP toward next level
    level: number;           // Current level (1-20)
    potential: number;       // 1-100, max achievable stats
    age: number;             // 18-40
    peakAge: number;         // When they'll be at their best
    declineRate: number;     // How fast they decline after peak
}

export class PlayerStats {
    attributes: PlayerAttributes;
    traits: PlayerTraits;
    appearance: PlayerAppearance;
    career: PlayerCareerStats;
    development: PlayerDevelopment;
    
    // Current match state (not persisted)
    currentStamina: number;
    fatigue: number;         // 0-100, accumulated fatigue
    form: number;            // -20 to +20, temporary performance modifier
    morale: number;          // 0-100, happiness with team/role
    
    constructor(
        public id: string,
        public firstName: string,
        public lastName: string,
        public role: 'handler' | 'cutter' | 'hybrid',
        attributes?: Partial<PlayerAttributes>,
        traits?: Partial<PlayerTraits>,
        appearance?: Partial<PlayerAppearance>,
    ) {
        this.attributes = {
            speed: 50, acceleration: 50, stamina: 50, jumping: 50, height: 50,
            throwPower: 50, throwAccuracy: 50, forehand: 50, backhand: 50,
            huck: 50, breakThrows: 50, catching: 50, layout: 50, marking: 50,
            awareness: 50, spirit: 75, clutch: 50, consistency: 50,
            ...attributes,
        };
        this.traits = {
            riskTaker: false, teamPlayer: false, emotional: false,
            leader: false, defensiveSpecialist: false,
            ...traits,
        };
        this.appearance = {
            jerseyNumber: Math.floor(Math.random() * 99) + 1,
            skinTone: 0xcc9977,
            hairStyle: 'short',
            hairColor: 0x332211,
            accessories: [],
            ...appearance,
        };
        this.career = {
            gamesPlayed: 0, gamesStarted: 0, goals: 0, assists: 0,
            blocks: 0, throwaways: 0, drops: 0, completions: 0,
            attempts: 0, pulls: 0, pullOB: 0,
        };
        this.development = {
            experience: 0, 
            level: 1, 
            potential: CAREER_CONSTANTS.DEFAULT_POTENTIAL,
            age: CAREER_CONSTANTS.DEFAULT_STARTING_AGE, 
            peakAge: CAREER_CONSTANTS.DEFAULT_PEAK_AGE, 
            declineRate: CAREER_CONSTANTS.DEFAULT_DECLINE_RATE,
        };
        this.currentStamina = this.attributes.stamina;
        this.fatigue = 0;
        this.form = 0;
        this.morale = 75;
    }
    
    // Get effective stat with all modifiers
    getEffectiveStat(stat: keyof PlayerAttributes): number {
        let base = this.attributes[stat];
        
        // Form modifier (-20% to +20%)
        base *= (1 + this.form / 100);
        
        // Fatigue modifier
        const fatiguePenalty = Math.min(this.fatigue, 50) * (STAT_MODIFIERS.FATIGUE_PENALTY_MAX / 50);
        base *= (1 - fatiguePenalty);
        
        // Morale modifier
        if (this.morale > STAT_MODIFIERS.MORALE_BOOST_START) {
            base *= (1 + (this.morale - STAT_MODIFIERS.MORALE_BOOST_START) / STAT_MODIFIERS.MORALE_BOOST_DIVISOR);
        }
        
        return Math.max(1, Math.min(100, base));
    }
    
    // Apply training to improve stats
    train(stat: keyof PlayerAttributes, intensity: number): void {
        const potentialCap = this.development.potential;
        const current = this.attributes[stat];
        
        if (current >= potentialCap) return;
        
        const gain = intensity * (1 - current / potentialCap) * 0.1;
        this.attributes[stat] = Math.min(potentialCap, current + gain);
        
        this.development.experience += intensity;
        this.checkLevelUp();
    }
    
    private checkLevelUp(): void {
        const xpNeeded = this.getXpForLevel(this.development.level + 1);
        if (this.development.experience >= xpNeeded) {
            this.development.level++;
            this.development.experience -= xpNeeded;
            // Level up bonuses
            this.attributes.stamina += CAREER_CONSTANTS.LEVEL_UP_STAMINA_BONUS;
            this.attributes.consistency += CAREER_CONSTANTS.LEVEL_UP_CONSISTENCY_BONUS;
        }
    }
    
    private getXpForLevel(level: number): number {
        return Math.floor(CAREER_CONSTANTS.XP_CURVE_BASE * Math.pow(CAREER_CONSTANTS.XP_CURVE_GROWTH, level - 1));
    }
    
    // Age the player one year
    ageYear(): void {
        this.development.age++;
        const age = this.development.age;
        const peak = this.development.peakAge;
        
        if (age < peak) {
            // Still developing
            this.development.potential += Math.random() * 2;
        } else if (age > peak + 3) {
            // Declining
            const decline = this.development.declineRate * (age - peak - 3) * 0.5;
            for (const stat of ['speed', 'jumping', 'stamina'] as const) {
                this.attributes[stat] = Math.max(20, this.attributes[stat] - decline);
            }
        }
    }
    
    // Reset for new match
    resetForMatch(): void {
        this.currentStamina = this.attributes.stamina;
        this.form += (Math.random() - 0.5) * 10; // Random form fluctuation
        this.form = Math.max(-20, Math.min(20, this.form));
    }
    
    // Serialization
    toJSON(): object {
        return {
            id: this.id,
            firstName: this.firstName,
            lastName: this.lastName,
            role: this.role,
            attributes: this.attributes,
            traits: this.traits,
            appearance: this.appearance,
            career: this.career,
            development: this.development,
        };
    }
    
    static fromJSON(data: any): PlayerStats {
        const p = new PlayerStats(
            data.id, data.firstName, data.lastName, data.role,
            data.attributes, data.traits, data.appearance
        );
        p.career = data.career;
        p.development = data.development;
        return p;
    }
    
    get fullName(): string {
        return `${this.firstName} ${this.lastName}`;
    }
    
    get overallRating(): number {
        const weights: Record<string, number> = {
            speed: 1, acceleration: 0.8, stamina: 1, jumping: 0.6, height: 0.4,
            throwPower: 0.8, throwAccuracy: 1, forehand: 0.8, backhand: 0.8,
            huck: 0.5, breakThrows: 0.6, catching: 1, layout: 0.5,
            marking: 0.7, awareness: 0.8, spirit: 0.3, clutch: 0.5, consistency: 0.7,
        };
        
        let total = 0;
        let weightSum = 0;
        for (const [stat, weight] of Object.entries(weights)) {
            total += this.attributes[stat as keyof PlayerAttributes] * weight;
            weightSum += weight;
        }
        return Math.round(total / weightSum);
    }
}

// Generate a random player
export function generatePlayer(role?: 'handler' | 'cutter' | 'hybrid', age?: number): PlayerStats {
    const firstNames = ['Alex', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Quinn', 'Avery', 'Taylor', 'Sam', 'Jamie',
        'Chris', 'Pat', 'Drew', 'Cameron', 'Reese', 'Skyler', 'Dakota', 'Parker', 'Hayden', 'Sage'];
    const lastNames = ['Chen', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez',
        'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson'];
    
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const playerRole = role || (Math.random() > 0.6 ? 'handler' : Math.random() > 0.5 ? 'cutter' : 'hybrid');
    
    const id = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const player = new PlayerStats(id, firstName, lastName, playerRole);
    
    // Randomize attributes based on role
    if (playerRole === 'handler') {
        player.attributes.throwPower = 50 + Math.random() * 30;
        player.attributes.throwAccuracy = 55 + Math.random() * 30;
        player.attributes.forehand = 50 + Math.random() * 35;
        player.attributes.backhand = 50 + Math.random() * 35;
        player.attributes.breakThrows = 45 + Math.random() * 35;
        player.attributes.awareness = 50 + Math.random() * 30;
    } else if (playerRole === 'cutter') {
        player.attributes.speed = 55 + Math.random() * 30;
        player.attributes.acceleration = 55 + Math.random() * 30;
        player.attributes.jumping = 50 + Math.random() * 30;
        player.attributes.catching = 50 + Math.random() * 35;
        player.attributes.layout = 40 + Math.random() * 40;
    }
    
    // Set age if provided
    if (age !== undefined) {
        player.development.age = age;
        player.development.peakAge = 25 + Math.floor(Math.random() * 5);
    }
    
    // Random potential (some players have higher ceilings)
    player.development.potential = 60 + Math.random() * 35;
    
    return player;
}

// Generate a full roster of players
export function generateRoster(size: number = 20): PlayerStats[] {
    const roster: PlayerStats[] = [];
    const handlers = Math.floor(size * 0.3);
    const cutters = Math.floor(size * 0.5);
    
    for (let i = 0; i < handlers; i++) {
        roster.push(generatePlayer('handler'));
    }
    for (let i = 0; i < cutters; i++) {
        roster.push(generatePlayer('cutter'));
    }
    for (let i = roster.length; i < size; i++) {
        roster.push(generatePlayer('hybrid'));
    }
    
    return roster;
}
