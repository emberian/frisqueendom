import type { GameState } from './GameState';
import type { EventBus } from './EventBus';
import type { ResourceTracker } from './ResourceTracker';
import type { IGameMode, ModeContext } from './GameMode';
import type * as THREE from 'three';

/**
 * Owns the requestAnimationFrame loop and manages game mode lifecycle.
 *
 * Usage:
 *   const runtime = new GameRuntime(gameState, eventBus, resources);
 *   await runtime.start(myMode, renderer, canvas, config);
 *   // ... later ...
 *   runtime.stop();
 */
export class GameRuntime {
    private state: GameState;
    private events: EventBus;
    private resources: ResourceTracker;

    private currentMode: IGameMode | null = null;
    private rAFId: number | null = null;
    private lastTime = 0;
    private running = false;

    constructor(state: GameState, events: EventBus, resources: ResourceTracker) {
        this.state = state;
        this.events = events;
        this.resources = resources;
    }

    /**
     * Initialize and start a game mode.
     * Stops any previously running mode first.
     */
    async start(
        mode: IGameMode,
        renderer: THREE.WebGLRenderer,
        canvas: HTMLCanvasElement,
        config?: Record<string, unknown>,
    ): Promise<void> {
        // Stop any previous mode
        if (this.running) {
            this.stop();
        }

        this.currentMode = mode;
        this.running = true;
        this.lastTime = 0;

        const ctx: ModeContext = {
            state: this.state,
            events: this.events,
            resources: this.resources,
            renderer,
            canvas,
        };

        await mode.init(ctx, config);

        // Start the rAF loop
        this.rAFId = requestAnimationFrame((now) => this.loop(now));
    }

    /**
     * Cancel the rAF loop and clean up the current mode.
     */
    stop(): void {
        this.running = false;

        if (this.rAFId !== null) {
            cancelAnimationFrame(this.rAFId);
            this.rAFId = null;
        }

        if (this.currentMode) {
            this.currentMode.cleanup();
            this.currentMode = null;
        }
    }

    /**
     * Pause the current mode.
     */
    pause(): void {
        if (this.currentMode && this.running) {
            this.state.setPaused(true);
            this.currentMode.pause();
        }
    }

    /**
     * Resume the current mode from a paused state.
     */
    resume(): void {
        if (this.currentMode && this.running) {
            this.state.setPaused(false);
            this.currentMode.resume();
        }
    }

    /**
     * Whether the runtime is currently running a mode.
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * Get the currently active mode, if any.
     */
    getMode(): IGameMode | null {
        return this.currentMode;
    }

    // ── Private ──

    private loop(now: number): void {
        if (!this.running || !this.currentMode) return;

        // Schedule next frame first to maintain the loop
        this.rAFId = requestAnimationFrame((t) => this.loop(t));

        // Calculate dt, capping at 50ms to avoid spiral of death
        if (this.lastTime === 0) {
            this.lastTime = now;
            return; // Skip first frame (no valid dt)
        }

        const rawDt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        // Apply timeScale from GameState
        const dt = rawDt * this.state.timeScale;

        // Skip updates when paused (but let mode decide about rendering)
        if (!this.state.isPaused) {
            this.currentMode.update(dt);
        }

        this.currentMode.render(dt);
    }
}
