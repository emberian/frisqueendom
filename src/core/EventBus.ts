import type * as THREE from 'three';
import type { TeamSide, MatchPhase, ThrowParams } from '../data/Types';

// ── Event Payload Definitions ──

export interface GameEvents {
    // Match flow
    score: { team: TeamSide; scorerId: string; scorerName: string; assisterId?: string };
    turnover: { reason: string; team: TeamSide; position: { x: number; z: number } };
    phase_change: { from: MatchPhase; to: MatchPhase };
    match_end: { winner: TeamSide; score: [number, number] };
    halftime: { score: [number, number] };
    point_reset: { receivingTeam: TeamSide };

    // Disc events
    disc_throw: { throwerId: string; team: TeamSide; params: ThrowParams; estimatedDistance: number };
    disc_catch: { catcherId: string; team: TeamSide; position: { x: number; y: number; z: number } };
    disc_block: { blockerId: string; blockerName: string; team: TeamSide };
    disc_stall: { team: TeamSide };
    disc_out_of_bounds: { lastTeam: TeamSide };
    disc_drop: { dropperId: string; team: TeamSide };

    // Player events
    foul_called: { callerId: string; team: TeamSide; contested: boolean };
    player_substitution: { inId: string; outId: string; team: TeamSide };

    // Spirit events
    spirit_update: { team: TeamSide; delta: number; reason: string };

    // Navigation (replacing window.dispatchEvent CustomEvents)
    navigate: { path: string; params?: Record<string, string> };
    start_quick_match: { config: Record<string, unknown> };
    start_career_match: {};
    start_practice: {};
    start_tutorial: {};
    start_practice_drill: { drillType: string };
    refresh_lobby: {};
    join_lobby_room: { room: string };

    // System
    pause: {};
    resume: {};
    resize: { width: number; height: number };
    audio_started: {};
}

// ── Type Helpers ──

export type GameEventName = keyof GameEvents;
type Listener<T> = (payload: T) => void;

// ── EventBus ──

export class EventBus {
    private listeners = new Map<string, Set<Listener<any>>>();
    private onceListeners = new Map<string, Set<Listener<any>>>();

    on<K extends GameEventName>(event: K, listener: Listener<GameEvents[K]>): () => void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(listener);

        // Return unsubscribe function
        return () => { set!.delete(listener); };
    }

    once<K extends GameEventName>(event: K, listener: Listener<GameEvents[K]>): () => void {
        let set = this.onceListeners.get(event);
        if (!set) {
            set = new Set();
            this.onceListeners.set(event, set);
        }
        set.add(listener);

        return () => { set!.delete(listener); };
    }

    off<K extends GameEventName>(event: K, listener: Listener<GameEvents[K]>): void {
        this.listeners.get(event)?.delete(listener);
        this.onceListeners.get(event)?.delete(listener);
    }

    emit<K extends GameEventName>(event: K, payload: GameEvents[K]): void {
        const persistent = this.listeners.get(event);
        if (persistent) {
            for (const fn of persistent) fn(payload);
        }

        const once = this.onceListeners.get(event);
        if (once) {
            for (const fn of once) fn(payload);
            once.clear();
        }
    }

    clear(): void {
        this.listeners.clear();
        this.onceListeners.clear();
    }

    listenerCount<K extends GameEventName>(event: K): number {
        return (this.listeners.get(event)?.size ?? 0) + (this.onceListeners.get(event)?.size ?? 0);
    }
}
