import type { ReplayData, ReplayEvent, ReplayEventType } from './Replay';

/**
 * Callback function for replay events
 */
type EventCallback = (data: unknown) => void;

/**
 * ReplayPlayer handles playback of recorded replays
 */
export class ReplayPlayer {
    private data: ReplayData | null = null;
    private currentTime: number = 0;
    private playbackSpeed: number = 1.0;
    private isPaused: boolean = true;
    private eventIndex: number = 0;
    private callbacks: Map<ReplayEventType, EventCallback[]> = new Map();

    /**
     * Load replay data for playback
     */
    load(data: ReplayData): void {
        this.data = data;
        this.currentTime = 0;
        this.eventIndex = 0;
        this.isPaused = true;
    }

    /**
     * Update playback state and emit events
     * @param dt Delta time in seconds
     */
    update(dt: number): void {
        if (!this.data || this.isPaused) return;

        // Advance time based on playback speed
        this.currentTime += dt * this.playbackSpeed;

        // Emit all events that should have happened by now
        while (
            this.eventIndex < this.data.events.length &&
            this.data.events[this.eventIndex].timestamp <= this.currentTime
        ) {
            const event = this.data.events[this.eventIndex];
            this.emitEvent(event);
            this.eventIndex++;
        }

        // Auto-pause at end
        if (this.eventIndex >= this.data.events.length) {
            this.isPaused = true;
        }
    }

    /**
     * Seek to a specific time in the replay
     * @param time Time in seconds
     */
    seek(time: number): void {
        if (!this.data) return;

        // Clamp time to valid range
        this.currentTime = Math.max(0, Math.min(time, this.data.duration));

        // Find the event index for this time
        // Binary search for efficiency
        let left = 0;
        let right = this.data.events.length;

        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (this.data.events[mid].timestamp <= this.currentTime) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        this.eventIndex = left;

        // Optimization: Find the nearest snapshot BEFORE this time and apply it
        const snapshots = (this.data as any).snapshots;
        if (snapshots && snapshots.length > 0) {
            let bestSnapshot = null;
            for (const snap of snapshots) {
                if (snap.timestamp <= this.currentTime) {
                    bestSnapshot = snap;
                } else {
                    break;
                }
            }
            if (bestSnapshot) {
                this.emitEvent({
                    type: 'state_snapshot',
                    timestamp: bestSnapshot.timestamp,
                    data: bestSnapshot.state
                });
            }
        }
    }

    /**
     * Get playback progress
     */
    getProgress(): { current: number; total: number } {
        return {
            current: this.currentTime,
            total: this.data?.duration ?? 0,
        };
    }

    /**
     * Set playback speed
     * @param speed Playback speed multiplier (0.5x, 1x, 2x, 4x, etc.)
     */
    setSpeed(speed: number): void {
        if (speed <= 0) {
            throw new Error('Playback speed must be positive');
        }
        this.playbackSpeed = speed;
    }

    /**
     * Get current playback speed
     */
    getSpeed(): number {
        return this.playbackSpeed;
    }

    /**
     * Pause playback
     */
    pause(): void {
        this.isPaused = true;
    }

    /**
     * Resume playback
     */
    resume(): void {
        if (!this.data) return;
        this.isPaused = false;
    }

    /**
     * Check if playback is paused
     */
    paused(): boolean {
        return this.isPaused;
    }

    /**
     * Register a callback for a specific event type
     */
    onEvent(type: ReplayEventType, callback: EventCallback): void {
        if (!this.callbacks.has(type)) {
            this.callbacks.set(type, []);
        }
        this.callbacks.get(type)!.push(callback);
    }

    /**
     * Remove all callbacks for a specific event type
     */
    offEvent(type: ReplayEventType): void {
        this.callbacks.delete(type);
    }

    /**
     * Remove all callbacks
     */
    clearCallbacks(): void {
        this.callbacks.clear();
    }

    /**
     * Emit an event to all registered callbacks
     */
    private emitEvent(event: ReplayEvent): void {
        const callbacks = this.callbacks.get(event.type);
        if (callbacks) {
            for (const callback of callbacks) {
                try {
                    callback(event.data);
                } catch (error) {
                    console.error(`Error in replay event callback for ${event.type}:`, error);
                }
            }
        }
    }

    /**
     * Get the loaded replay data
     */
    getData(): ReplayData | null {
        return this.data;
    }

    /**
     * Check if replay is loaded
     */
    isLoaded(): boolean {
        return this.data !== null;
    }

    /**
     * Reset playback to the beginning
     */
    reset(): void {
        this.currentTime = 0;
        this.eventIndex = 0;
        this.isPaused = true;
    }

    /**
     * Check if playback has reached the end
     */
    isAtEnd(): boolean {
        if (!this.data) return false;
        return this.eventIndex >= this.data.events.length;
    }
}
