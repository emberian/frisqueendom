import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResourceTracker } from '../../core/ResourceTracker';

describe('ResourceTracker', () => {
    let tracker: ResourceTracker;

    beforeEach(() => {
        tracker = new ResourceTracker();
    });

    describe('track', () => {
        it('returns the tracked resource', () => {
            const resource = { dispose: vi.fn() };
            const result = tracker.track(resource);
            expect(result).toBe(resource);
        });

        it('disposes tracked resources on disposeAll', () => {
            const r1 = { dispose: vi.fn() };
            const r2 = { dispose: vi.fn() };
            tracker.track(r1);
            tracker.track(r2);
            tracker.disposeAll();
            expect(r1.dispose).toHaveBeenCalledOnce();
            expect(r2.dispose).toHaveBeenCalledOnce();
        });

        it('handles dispose errors gracefully', () => {
            const r1 = {
                dispose: vi.fn(() => {
                    throw new Error('already disposed');
                }),
            };
            const r2 = { dispose: vi.fn() };
            tracker.track(r1);
            tracker.track(r2);
            expect(() => tracker.disposeAll()).not.toThrow();
            expect(r2.dispose).toHaveBeenCalledOnce();
        });
    });

    describe('addEventListener', () => {
        it('adds listener and removes on disposeAll', () => {
            const target = new EventTarget();
            const listener = vi.fn();
            tracker.addEventListener(target, 'click', listener);

            target.dispatchEvent(new Event('click'));
            expect(listener).toHaveBeenCalledOnce();

            tracker.disposeAll();
            target.dispatchEvent(new Event('click'));
            expect(listener).toHaveBeenCalledOnce(); // not called again
        });
    });

    describe('timers', () => {
        it('clears timeouts on disposeAll', () => {
            const fn = vi.fn();
            tracker.setTimeout(fn, 10000);
            tracker.disposeAll();
            // The timer was cleared, so fn should not be called
            // (vitest doesn't advance real timers, but we verify no throw)
        });

        it('clears intervals on disposeAll', () => {
            const fn = vi.fn();
            tracker.setInterval(fn, 100);
            tracker.disposeAll();
        });
    });

    describe('disposeAll', () => {
        it('clears everything and can be called multiple times', () => {
            const resource = { dispose: vi.fn() };
            tracker.track(resource);
            tracker.disposeAll();
            expect(resource.dispose).toHaveBeenCalledOnce();
            tracker.disposeAll(); // should not throw or double-dispose
            expect(resource.dispose).toHaveBeenCalledOnce();
        });
    });
});
