// Practice mode drills for FrisQueendom

import * as THREE from 'three';

export type DrillType =
    | 'throwing_accuracy'
    | 'huck_distance'
    | 'catch_training'
    | 'sprint_endurance'
    | 'pull_practice';

export interface DrillConfig {
    name: string;
    description: string;
    duration: number; // seconds, 0 for unlimited
    targetScore: number;
}

export interface DrillResult {
    score: number;
    bestScore: number;
    stars: number; // 1-3 based on performance
}

export interface DrillState {
    type: DrillType;
    config: DrillConfig;
    startTime: number;
    endTime: number;
    score: number;
    attempts: number;
    targets: DrillTarget[];
    checkpoints: THREE.Vector3[];
    bestDistance: number;
    isActive: boolean;
}

export interface DrillTarget {
    id: string;
    position: THREE.Vector3;
    radius: number;
    hit: boolean;
}

// Drill configurations
const DRILL_CONFIGS: Record<DrillType, DrillConfig> = {
    throwing_accuracy: {
        name: 'Throwing Accuracy',
        description: 'Hit targets at various distances. Score points for each target hit.',
        duration: 60,
        targetScore: 10,
    },
    huck_distance: {
        name: 'Huck Distance',
        description: 'Throw as far as possible. Best of 3 attempts.',
        duration: 0,
        targetScore: 60, // meters
    },
    catch_training: {
        name: 'Catch Training',
        description: 'Catch discs thrown at you from various angles.',
        duration: 60,
        targetScore: 15,
    },
    sprint_endurance: {
        name: 'Sprint Endurance',
        description: 'Run through checkpoints as fast as possible.',
        duration: 0,
        targetScore: 30, // seconds
    },
    pull_practice: {
        name: 'Pull Practice',
        description: 'Pull the disc as close to the endzone line as possible.',
        duration: 0,
        targetScore: 5, // meters from endzone
    },
};

// Best scores storage key
const BEST_SCORES_KEY = 'frisqueendom_drill_best_scores';

export class PracticeManager {
    private currentDrill: DrillState | null = null;
    private bestScores: Map<DrillType, number> = new Map();

    constructor() {
        this.loadBestScores();
    }

    // Get drill configuration
    getDrillConfig(type: DrillType): DrillConfig {
        return DRILL_CONFIGS[type];
    }

    // Get all drill configs
    getAllDrillConfigs(): Array<{ type: DrillType; config: DrillConfig }> {
        return Object.entries(DRILL_CONFIGS).map(([type, config]) => ({
            type: type as DrillType,
            config,
        }));
    }

    // Start a drill
    startDrill(type: DrillType): DrillState {
        const config = DRILL_CONFIGS[type];
        const now = performance.now();

        const state: DrillState = {
            type,
            config,
            startTime: now,
            endTime: config.duration > 0 ? now + config.duration * 1000 : 0,
            score: 0,
            attempts: 0,
            targets: [],
            checkpoints: [],
            bestDistance: 0,
            isActive: true,
        };

        // Generate targets/checkpoints based on drill type
        switch (type) {
            case 'throwing_accuracy':
                state.targets = this.generateAccuracyTargets();
                break;
            case 'sprint_endurance':
                state.checkpoints = this.generateSprintCheckpoints();
                break;
            case 'catch_training':
                // Targets will be dynamically spawned during the drill
                break;
            case 'huck_distance':
            case 'pull_practice':
                // No pre-generated targets
                break;
        }

        this.currentDrill = state;
        return state;
    }

    // Update drill state
    updateDrill(dt: number): void {
        if (!this.currentDrill || !this.currentDrill.isActive) return;

        const now = performance.now();

        // Check if timed drill has ended
        if (this.currentDrill.endTime > 0 && now >= this.currentDrill.endTime) {
            this.currentDrill.isActive = false;
        }
    }

    // Record a successful target hit
    recordTargetHit(targetId: string): boolean {
        if (!this.currentDrill) return false;

        const target = this.currentDrill.targets.find(t => t.id === targetId);
        if (!target || target.hit) return false;

        target.hit = true;
        this.currentDrill.score++;
        return true;
    }

    // Record a throw distance (for huck distance drill)
    recordThrowDistance(distance: number): void {
        if (!this.currentDrill) return;

        this.currentDrill.attempts++;
        if (distance > this.currentDrill.bestDistance) {
            this.currentDrill.bestDistance = distance;
            this.currentDrill.score = distance;
        }
    }

    // Record a catch attempt
    recordCatchAttempt(success: boolean): void {
        if (!this.currentDrill) return;

        this.currentDrill.attempts++;
        if (success) {
            this.currentDrill.score++;
        }
    }

    // Record checkpoint completion (for sprint endurance)
    recordCheckpointReached(checkpointIndex: number): void {
        if (!this.currentDrill) return;

        // Track progress through checkpoints
        this.currentDrill.attempts = Math.max(this.currentDrill.attempts, checkpointIndex + 1);

        // If all checkpoints reached, record time
        if (checkpointIndex === this.currentDrill.checkpoints.length - 1) {
            const elapsed = (performance.now() - this.currentDrill.startTime) / 1000;
            this.currentDrill.score = elapsed;
            this.currentDrill.isActive = false;
        }
    }

    // Record pull distance (for pull practice)
    recordPullDistance(distanceFromEndzone: number): void {
        if (!this.currentDrill) return;

        this.currentDrill.attempts++;

        // For pull practice, lower is better
        if (this.currentDrill.score === 0 || distanceFromEndzone < this.currentDrill.score) {
            this.currentDrill.score = distanceFromEndzone;
        }
    }

    // End current drill and return result
    endDrill(): DrillResult | null {
        if (!this.currentDrill) return null;

        const drill = this.currentDrill;
        const score = drill.score;
        const bestScore = this.bestScores.get(drill.type) || 0;

        // Calculate stars based on performance relative to target
        let stars = 1;
        let newBestScore = bestScore;

        switch (drill.type) {
            case 'throwing_accuracy':
            case 'catch_training':
                // Higher is better
                if (score > bestScore) {
                    newBestScore = score;
                }
                if (score >= drill.config.targetScore * 1.2) {
                    stars = 3;
                } else if (score >= drill.config.targetScore) {
                    stars = 2;
                }
                break;

            case 'huck_distance':
                // Higher is better
                if (score > bestScore) {
                    newBestScore = score;
                }
                if (score >= drill.config.targetScore * 1.3) {
                    stars = 3;
                } else if (score >= drill.config.targetScore) {
                    stars = 2;
                }
                break;

            case 'sprint_endurance':
            case 'pull_practice':
                // Lower is better
                if (bestScore === 0 || score < bestScore) {
                    newBestScore = score;
                }
                if (score <= drill.config.targetScore * 0.7) {
                    stars = 3;
                } else if (score <= drill.config.targetScore) {
                    stars = 2;
                }
                break;
        }

        // Update best score if improved
        if (newBestScore !== bestScore) {
            this.bestScores.set(drill.type, newBestScore);
            this.saveBestScores();
        }

        this.currentDrill = null;

        return {
            score,
            bestScore: newBestScore,
            stars,
        };
    }

    // Get current drill state
    getCurrentDrill(): DrillState | null {
        return this.currentDrill;
    }

    // Get best score for a drill type
    getBestScore(type: DrillType): number {
        return this.bestScores.get(type) || 0;
    }

    // Private helper methods
    private generateAccuracyTargets(): DrillTarget[] {
        const targets: DrillTarget[] = [];
        const distances = [15, 20, 25, 30, 35, 40];
        const angles = [-30, -15, 0, 15, 30];

        let id = 0;
        for (const distance of distances) {
            for (const angle of angles) {
                const radAngle = (angle * Math.PI) / 180;
                const x = Math.sin(radAngle) * distance;
                const z = Math.cos(radAngle) * distance;

                targets.push({
                    id: `target_${id++}`,
                    position: new THREE.Vector3(x, 1, z),
                    radius: 1.5,
                    hit: false,
                });
            }
        }

        return targets;
    }

    private generateSprintCheckpoints(): THREE.Vector3[] {
        const checkpoints: THREE.Vector3[] = [];

        // Generate a zig-zag pattern across the field
        const pattern = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(10, 0, 20),
            new THREE.Vector3(-10, 0, 40),
            new THREE.Vector3(10, 0, 60),
            new THREE.Vector3(0, 0, 80),
            new THREE.Vector3(-10, 0, 60),
            new THREE.Vector3(10, 0, 40),
            new THREE.Vector3(-10, 0, 20),
            new THREE.Vector3(0, 0, 0),
        ];

        return pattern;
    }

    // Save/Load best scores
    private saveBestScores(): void {
        try {
            const data: Record<string, number> = {};
            this.bestScores.forEach((score, type) => {
                data[type] = score;
            });
            localStorage.setItem(BEST_SCORES_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save drill best scores:', e);
        }
    }

    private loadBestScores(): void {
        try {
            const data = localStorage.getItem(BEST_SCORES_KEY);
            if (data) {
                const parsed = JSON.parse(data) as Record<string, number>;
                Object.entries(parsed).forEach(([type, score]) => {
                    this.bestScores.set(type as DrillType, score);
                });
            }
        } catch (e) {
            console.error('Failed to load drill best scores:', e);
        }
    }
}

// Export a singleton instance
export const practiceManager = new PracticeManager();
