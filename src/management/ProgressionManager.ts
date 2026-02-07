import { saveManager, type ProgressionData, type DailyChallengeState } from '../data/SaveLoad';
import { 
    generateDailyChallenges, 
    getLevel, 
    checkUnlocks, 
    type Unlockable,
    XP_PER_LEVEL
} from '../data/Progression';

export interface MatchProgressionResult {
    xpGained: number;
    levelUp: boolean;
    newLevel: number;
    newUnlocks: Unlockable[];
    completedChallenges: DailyChallengeState[];
}

export class ProgressionManager {
    static checkDailyReset(): void {
        const data = saveManager.getProgression();
        const today = new Date().toDateString();
        let changed = false;
        
        if (data.dailyChallengeDate !== today) {
            data.dailyChallengeDate = today;
            data.dailyChallenges = generateDailyChallenges();
            changed = true;
        }

        // Proactively check for level-based unlocks (e.g. for level 1 items)
        const currentLevel = getLevel(data.experience);
        if (data.level !== currentLevel) {
            data.level = currentLevel;
            changed = true;
        }

        const newUnlocks = checkUnlocks(currentLevel, data.unlockedCosmetics);
        if (newUnlocks.length > 0) {
            for (const u of newUnlocks) {
                data.unlockedCosmetics.push(u.id);
            }
            changed = true;
        }
        
        if (changed) {
            saveManager.saveProgression(data);
        }
    }

    static processMatch(stats: {
        win: boolean;
        goals: number;
        blocks: number;
        completions: number;
        stallTurnovers: number;
    }): MatchProgressionResult {
        const data = saveManager.getProgression();
        const startLevel = getLevel(data.experience);
        let xpGained = 0;
        const completedChallenges: DailyChallengeState[] = [];
        
        // Base Match XP
        xpGained += 100; // Participation
        if (stats.win) xpGained += 150;
        xpGained += stats.goals * 10;
        xpGained += stats.blocks * 15;
        
        // Process Challenges
        for (const challenge of data.dailyChallenges) {
            if (challenge.completed) continue;
            
            let progress = 0;
            switch (challenge.metric) {
                case 'team_goals':
                    progress = stats.goals;
                    break;
                case 'team_blocks':
                    progress = stats.blocks;
                    break;
                case 'team_completions':
                    progress = stats.completions;
                    break;
                case 'win_match':
                    progress = stats.win ? 1 : 0;
                    break;
                case 'no_stall_turnovers':
                    progress = stats.stallTurnovers === 0 ? 1 : 0;
                    break;
            }
            
            // For boolean/single-match challenges, we just add the progress
            // For cumulative (if we had them), we'd add to existing
            challenge.progress += progress;
            
            if (challenge.progress >= challenge.target) {
                challenge.completed = true;
                challenge.progress = challenge.target; // Cap it
                xpGained += challenge.rewardXp;
                completedChallenges.push(challenge);
            }
        }
        
        data.experience += xpGained;
        const newLevel = getLevel(data.experience);
        data.level = newLevel;
        const levelUp = newLevel > startLevel;
        
        // Check for Unlocks
        const newUnlocks = checkUnlocks(newLevel, data.unlockedCosmetics);
        for (const unlock of newUnlocks) {
            data.unlockedCosmetics.push(unlock.id);
        }
        
        saveManager.saveProgression(data);
        
        return {
            xpGained,
            levelUp,
            newLevel,
            newUnlocks,
            completedChallenges
        };
    }
}
