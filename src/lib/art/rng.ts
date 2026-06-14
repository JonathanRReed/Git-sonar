/**
 * Deterministic randomness for generative posters.
 *
 * Every generative template is seeded so a given (repo, seed) always produces
 * the identical artwork — essential for shareable permalinks and re-exporting at
 * higher resolution. Uses splitmix32-seeded mulberry32 (fast, tiny, no deps) and
 * a seeded simplex-noise field.
 */

import { createNoise2D, createNoise3D } from 'simplex-noise';

/** Hash an arbitrary string into a 32-bit unsigned integer (xfnv1a). */
export function hashStringToSeed(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** A deterministic 0..1 random function. */
export type RNG = () => number;

/** mulberry32 PRNG — returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): RNG {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Build an RNG from a string seed (repo SHA + user seed, etc). */
export function makeRng(seedSource: string | number): RNG {
    const seed = typeof seedSource === 'number' ? seedSource >>> 0 : hashStringToSeed(seedSource);
    return mulberry32(seed);
}

/** Convenience helpers over an RNG. */
export function rangeOf(rng: RNG, min: number, max: number): number {
    return min + (max - min) * rng();
}

export function pick<T>(rng: RNG, arr: readonly T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

export function gaussian(rng: RNG, mean = 0, stdev = 1): number {
    // Box–Muller
    const u = 1 - rng();
    const v = rng();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * stdev;
}

/**
 * Seeded 2D/3D simplex noise. simplex-noise expects a `() => number` source,
 * so we feed it a mulberry32 instance derived from the seed.
 */
export function makeNoise2D(seedSource: string | number) {
    const seed = typeof seedSource === 'number' ? seedSource >>> 0 : hashStringToSeed(seedSource);
    return createNoise2D(mulberry32(seed));
}

export function makeNoise3D(seedSource: string | number) {
    const seed = typeof seedSource === 'number' ? seedSource >>> 0 : hashStringToSeed(seedSource);
    return createNoise3D(mulberry32(seed));
}
