// Vitest setup file
// Mock browser APIs that happy-dom doesn't fully support

import { vi } from 'vitest';

// Mock performance.now if not available
if (typeof performance === 'undefined') {
    (globalThis as any).performance = { now: () => Date.now() };
}

// Mock requestAnimationFrame
if (typeof requestAnimationFrame === 'undefined') {
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
    (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

// Mock AudioContext for audio tests
class MockAudioContext {
    destination = {};
    createOscillator() {
        return {
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            frequency: {
                value: 0,
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                cancelScheduledValues: vi.fn()
            },
            detune: { value: 0 },
            type: ''
        };
    }
    createGain() {
        return {
            connect: vi.fn(),
            gain: {
                value: 1,
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                cancelScheduledValues: vi.fn()
            }
        };
    }
    createBiquadFilter() {
        return {
            connect: vi.fn(),
            frequency: {
                value: 0,
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                cancelScheduledValues: vi.fn()
            },
            Q: { value: 0 },
            type: ''
        };
    }
    createPanner() { return { connect: vi.fn(), setPosition: vi.fn(), positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 } }; }
    createBufferSource() { return { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, loop: false }; }
    createBuffer() { return { getChannelData: () => new Float32Array(4096) }; }
    resume() { return Promise.resolve(); }
    get currentTime() { return 0; }
    get sampleRate() { return 44100; }
    get state() { return 'running'; }
}
(globalThis as any).AudioContext = MockAudioContext;
(globalThis as any).webkitAudioContext = MockAudioContext;

// Mock localStorage for happy-dom
if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        get length() { return store.size; },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
    };
}
