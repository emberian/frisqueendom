/**
 * A simple seeded pseudo-random number generator (LCG).
 * Provides deterministic randomness across different machines if given the same seed.
 */
export class SeededRandom {
    private state: number;

    constructor(seed: number) {
        // Ensure seed is a positive integer
        this.state = Math.abs(seed | 0) || 1;
    }

    /** Returns a random float between 0 and 1. */
    next(): number {
        // LCG constants (standard values)
        this.state = (this.state * 1664525 + 1013904223) % 4294967296;
        return this.state / 4294967296;
    }

    /** Returns a random float between min and max. */
    range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    /** Returns a random integer between min (inclusive) and max (exclusive). */
    int(min: number, max: number): number {
        return Math.floor(this.range(min, max));
    }

    /** Returns true if a random roll is less than the given probability. */
    chance(prob: number): boolean {
        return this.next() < prob;
    }

    /** Randomly picks an item from an array. */
    pick<T>(array: T[]): T {
        return array[this.int(0, array.length)];
    }
}

// Global instance for convenience, though for full determinism 
// we should ideally pass specific instances to systems.
let globalRandom = new SeededRandom(12345);

export const Random = {
    seed: (s: number) => {
        globalRandom = new SeededRandom(s);
    },
    next: () => globalRandom.next(),
    range: (min: number, max: number) => globalRandom.range(min, max),
    int: (min: number, max: number) => globalRandom.int(min, max),
    chance: (prob: number) => globalRandom.chance(prob),
    pick: <T>(array: T[]) => globalRandom.pick(array),
};
