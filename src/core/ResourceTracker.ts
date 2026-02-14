import type * as THREE from 'three';

type Disposable =
    | THREE.BufferGeometry
    | THREE.Material
    | THREE.Texture
    | THREE.WebGLRenderer
    | { dispose(): void };

interface EventRegistration {
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
}

/**
 * Tracks disposable resources and event listeners created during a game session.
 * Call disposeAll() on cleanup to prevent leaks.
 */
export class ResourceTracker {
    private disposables: Disposable[] = [];
    private events: EventRegistration[] = [];
    private timers: number[] = [];
    private animFrames: number[] = [];

    track<T extends Disposable>(resource: T): T {
        this.disposables.push(resource);
        return resource;
    }

    addEventListener(
        target: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void {
        target.addEventListener(type, listener, options);
        this.events.push({ target, type, listener, options });
    }

    setTimeout(callback: () => void, ms: number): number {
        const id = window.setTimeout(callback, ms);
        this.timers.push(id);
        return id;
    }

    setInterval(callback: () => void, ms: number): number {
        const id = window.setInterval(callback, ms);
        this.timers.push(id);
        return id;
    }

    trackAnimationFrame(id: number): void {
        this.animFrames.push(id);
    }

    disposeAll(): void {
        // Cancel animation frames
        for (const id of this.animFrames) {
            cancelAnimationFrame(id);
        }
        this.animFrames.length = 0;

        // Clear timers
        for (const id of this.timers) {
            clearTimeout(id);
            clearInterval(id);
        }
        this.timers.length = 0;

        // Remove event listeners
        for (const reg of this.events) {
            reg.target.removeEventListener(reg.type, reg.listener, reg.options);
        }
        this.events.length = 0;

        // Dispose resources
        for (const resource of this.disposables) {
            try {
                resource.dispose();
            } catch {
                // Already disposed or invalid — ignore
            }
        }
        this.disposables.length = 0;
    }
}
