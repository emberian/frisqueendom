/**
 * TutorialConditionBridge — connects EventBus game events to TutorialSystem
 * conditions, encapsulating all the wiring that previously lived inline in main.ts.
 *
 * Usage:
 *   const bridge = new TutorialConditionBridge(tutorial, eventBus);
 *   // Per-frame call:
 *   bridge.update(dt, { ... });
 *   // On cleanup:
 *   bridge.destroy();
 */
import type { EventBus } from '../core/EventBus';
import type { TutorialSystem } from './Tutorial';
import type { ThrowType } from '../gameplay/Throw';

export interface TutorialFrameState {
    movementDir: { x: number; z: number };
    isSprinting: boolean;
    isCharging: boolean;
    holdingDisc: boolean;
    stamina: number;
    maxStamina: number;
    hyzerAccum: number;
    throwType: ThrowType | null;
    isPreviewVisible: boolean;
    scored: boolean;
}

export class TutorialConditionBridge {
    private unsubs: (() => void)[] = [];
    private throwTypesUsed = new Set<string>();
    private throwCount = 0;
    private hasSeenTurnover = false;
    private hasCalledFoul = false;
    private staminaWasFull = true;
    private prevHyzer = 0;
    private hyzerAdjusted = false;
    private anhyzerAdjusted = false;
    private threwAfterCatch = false;
    private justCaught = false;
    private catchCount = 0;

    constructor(
        private tutorial: TutorialSystem,
        eventBus: EventBus,
    ) {
        // Disc events
        this.unsubs.push(
            eventBus.on('disc_throw', (payload) => {
                this.tutorial.checkCondition('disc_thrown');
                this.throwCount++;
                this.throwTypesUsed.add(this.lastThrowType ?? 'backhand');

                if (this.throwTypesUsed.has('forehand')) {
                    this.tutorial.checkCondition('forehand_thrown');
                }
                if (this.throwTypesUsed.has('hammer')) {
                    this.tutorial.checkCondition('hammer_thrown');
                }
                if (this.throwTypesUsed.has('scoober')) {
                    this.tutorial.checkCondition('scoober_thrown');
                }
                if (this.throwTypesUsed.has('backhand') && this.throwTypesUsed.has('forehand')) {
                    this.tutorial.checkCondition('both_throws_used');
                }
                if (this.throwCount >= 5) {
                    this.tutorial.checkCondition('multiple_throws_practiced');
                }

                // Give-and-go: threw right after catching
                if (this.justCaught) {
                    this.threwAfterCatch = true;
                }
                this.justCaught = false;
            }),
        );

        this.unsubs.push(
            eventBus.on('disc_catch', () => {
                this.tutorial.checkCondition('disc_caught');
                this.catchCount++;
                this.justCaught = true;

                // If we previously threw (give-and-go: catch after throwing)
                if (this.threwAfterCatch) {
                    this.tutorial.checkCondition('give_and_go_performed');
                    this.threwAfterCatch = false;
                }
            }),
        );

        this.unsubs.push(
            eventBus.on('disc_block', () => {
                this.tutorial.checkCondition('legal_defense_performed');
            }),
        );

        // Turnovers
        this.unsubs.push(
            eventBus.on('turnover', (payload) => {
                this.hasSeenTurnover = true;
                this.tutorial.checkCondition('turnover_witnessed');

                if (payload.reason === 'stall') {
                    this.tutorial.checkCondition('stall_count_heard');
                }
            }),
        );

        // Scoring
        this.unsubs.push(
            eventBus.on('score', () => {
                this.tutorial.checkCondition('point_scored');
            }),
        );

        // Fouls
        this.unsubs.push(
            eventBus.on('foul_called', () => {
                this.hasCalledFoul = true;
                this.tutorial.checkCondition('foul_called');
            }),
        );

        // Spirit
        this.unsubs.push(
            eventBus.on('spirit_update', () => {
                this.tutorial.checkCondition('spirit_acknowledged');
            }),
        );

        // Phase changes — entering live play means stall count is audible
        this.unsubs.push(
            eventBus.on('phase_change', (payload) => {
                if (payload.to === 'live_play') {
                    this.tutorial.checkCondition('stall_count_heard');
                }
            }),
        );
    }

    private lastThrowType: string | null = null;

    /**
     * Call once per frame from the game loop, passing current frame state for
     * conditions that need continuous polling (movement, stamina, hyzer, etc.).
     */
    update(dt: number, state: TutorialFrameState): void {
        if (!this.tutorial.isActive()) return;

        // Movement
        const moving = Math.abs(state.movementDir.x) > 0.1 || Math.abs(state.movementDir.z) > 0.1;
        if (moving) {
            this.tutorial.checkCondition('player_moved');
        }

        // Sprint
        if (state.isSprinting && moving) {
            this.tutorial.checkCondition('player_sprinted');
        }

        // Stamina drained
        if (this.staminaWasFull && state.stamina < state.maxStamina * 0.5) {
            this.tutorial.checkCondition('stamina_drained');
            this.staminaWasFull = false;
        }
        if (state.stamina >= state.maxStamina * 0.95) {
            this.staminaWasFull = true;
        }

        // Charging (throw wind-up)
        if (state.isCharging) {
            this.tutorial.checkCondition('throw_charged');
        }

        // Disc pickup
        if (state.holdingDisc) {
            this.tutorial.checkCondition('disc_picked_up');
        }

        // Hyzer / anhyzer adjustment
        if (state.throwType) {
            this.lastThrowType = state.throwType;
        }
        if (state.isCharging) {
            const delta = state.hyzerAccum - this.prevHyzer;
            if (delta > 0.02 && !this.hyzerAdjusted) {
                this.hyzerAdjusted = true;
                this.tutorial.checkCondition('hyzer_adjusted');
            }
            if (delta < -0.02 && !this.anhyzerAdjusted) {
                this.anhyzerAdjusted = true;
                this.tutorial.checkCondition('anhyzer_adjusted');
            }
            this.prevHyzer = state.hyzerAccum;
        }

        // Trajectory preview visible
        if (state.isPreviewVisible) {
            this.tutorial.checkCondition('trajectory_previewed');
        }

        // Wind observation: just seeing the wind indicator while charging counts
        if (state.isCharging) {
            this.tutorial.checkCondition('wind_observed');
        }

        // These conditions are auto-completed by observing gameplay long enough:
        // The tutorial already has skip buttons, but we can trigger them after
        // enough throws in various conditions.
        if (this.throwCount >= 3) {
            this.tutorial.checkCondition('disc_reading_practiced');
        }

        // Scoring triggers final condition
        if (state.scored) {
            this.tutorial.checkCondition('point_scored');
            this.tutorial.checkCondition('tutorial_completed');
        }
    }

    /**
     * Notify the bridge about specific gameplay events that don't go through
     * EventBus (e.g., AI formation state, player-specific checks).
     */
    notifyCondition(condition: string): void {
        this.tutorial.checkCondition(condition);
    }

    /**
     * For conditions that require observing AI behavior:
     * Call from the game loop when certain team states are detected.
     */
    notifyFormation(formation: 'vertical' | 'horizontal' | 'zone' | 'man'): void {
        switch (formation) {
            case 'vertical':
                this.tutorial.checkCondition('vertical_stack_formed');
                break;
            case 'horizontal':
                this.tutorial.checkCondition('horizontal_stack_formed');
                break;
            case 'zone':
                this.tutorial.checkCondition('zone_defense_played');
                break;
            case 'man':
                this.tutorial.checkCondition('man_defense_played');
                break;
        }
    }

    /**
     * For wind-related throw conditions.
     * Call when a throw completes in specific wind conditions.
     */
    notifyWindThrow(windRelation: 'headwind' | 'tailwind' | 'crosswind'): void {
        switch (windRelation) {
            case 'headwind':
                this.tutorial.checkCondition('wind_throw_mastered');
                break;
            case 'tailwind':
                this.tutorial.checkCondition('downwind_throw_mastered');
                break;
            case 'crosswind':
                this.tutorial.checkCondition('crosswind_mastered');
                break;
        }
    }

    destroy(): void {
        for (const unsub of this.unsubs) {
            unsub();
        }
        this.unsubs = [];
    }
}
