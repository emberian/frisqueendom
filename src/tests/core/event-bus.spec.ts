import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../core/EventBus';

describe('EventBus', () => {
    let bus: EventBus;

    beforeEach(() => {
        bus = new EventBus();
    });

    it('calls listener on emit', () => {
        const fn = vi.fn();
        bus.on('score', fn);
        bus.emit('score', { team: 'home', scorerId: 'p1', scorerName: 'Alice' });
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith({ team: 'home', scorerId: 'p1', scorerName: 'Alice' });
    });

    it('supports multiple listeners for the same event', () => {
        const fn1 = vi.fn();
        const fn2 = vi.fn();
        bus.on('turnover', fn1);
        bus.on('turnover', fn2);
        bus.emit('turnover', { reason: 'stall', team: 'away', position: { x: 0, z: 50 } });
        expect(fn1).toHaveBeenCalledOnce();
        expect(fn2).toHaveBeenCalledOnce();
    });

    it('does not call listeners for other events', () => {
        const fn = vi.fn();
        bus.on('score', fn);
        bus.emit('turnover', { reason: 'incomplete', team: 'home', position: { x: 5, z: 30 } });
        expect(fn).not.toHaveBeenCalled();
    });

    it('unsubscribes via returned function', () => {
        const fn = vi.fn();
        const unsub = bus.on('score', fn);
        bus.emit('score', { team: 'home', scorerId: 'p1', scorerName: 'A' });
        expect(fn).toHaveBeenCalledOnce();
        unsub();
        bus.emit('score', { team: 'away', scorerId: 'p2', scorerName: 'B' });
        expect(fn).toHaveBeenCalledOnce(); // not called again
    });

    it('unsubscribes via off()', () => {
        const fn = vi.fn();
        bus.on('phase_change', fn);
        bus.off('phase_change', fn);
        bus.emit('phase_change', { from: 'pre_pull', to: 'pulling' });
        expect(fn).not.toHaveBeenCalled();
    });

    it('once() fires exactly once', () => {
        const fn = vi.fn();
        bus.once('match_end', fn);
        bus.emit('match_end', { winner: 'home', score: [15, 12] });
        bus.emit('match_end', { winner: 'away', score: [10, 15] });
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith({ winner: 'home', score: [15, 12] });
    });

    it('clear() removes all listeners', () => {
        const fn1 = vi.fn();
        const fn2 = vi.fn();
        bus.on('score', fn1);
        bus.once('turnover', fn2);
        bus.clear();
        bus.emit('score', { team: 'home', scorerId: '', scorerName: '' });
        bus.emit('turnover', { reason: 'stall', team: 'home', position: { x: 0, z: 0 } });
        expect(fn1).not.toHaveBeenCalled();
        expect(fn2).not.toHaveBeenCalled();
    });

    it('listenerCount returns correct count', () => {
        expect(bus.listenerCount('score')).toBe(0);
        const unsub = bus.on('score', () => {});
        bus.once('score', () => {});
        expect(bus.listenerCount('score')).toBe(2);
        unsub();
        expect(bus.listenerCount('score')).toBe(1);
    });

    it('handles emit with no listeners gracefully', () => {
        expect(() => {
            bus.emit('score', { team: 'home', scorerId: '', scorerName: '' });
        }).not.toThrow();
    });
});
