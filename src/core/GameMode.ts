import type * as THREE from 'three';
import type { GameState } from './GameState';
import type { EventBus } from './EventBus';
import type { ResourceTracker } from './ResourceTracker';

/**
 * Configuration passed to a GameMode on initialization.
 */
export interface ModeContext {
    state: GameState;
    events: EventBus;
    resources: ResourceTracker;
    renderer: THREE.WebGLRenderer;
    canvas: HTMLCanvasElement;
}

/**
 * Interface that every game mode implements.
 * Modes own their scene, systems, and game loop body.
 */
export interface IGameMode {
    /** Set up scene, systems, and UI. Called once. */
    init(ctx: ModeContext, config?: Record<string, unknown>): Promise<void>;

    /** Per-frame update (physics, AI, input). dt is in seconds. */
    update(dt: number): void;

    /** Per-frame render. dt is raw frame delta. */
    render(dt: number): void;

    /** Pause the mode (freeze physics, show pause UI). */
    pause(): void;

    /** Resume from pause. */
    resume(): void;

    /** Tear down everything: dispose resources, remove DOM, etc. */
    cleanup(): void;
}
