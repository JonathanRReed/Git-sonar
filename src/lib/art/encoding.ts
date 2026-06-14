/**
 * Encoding config — declarative mapping of git signals → visual channels.
 *
 * Each template declares how repo data drives its visuals (Bertin's channels:
 * one signal per channel, no overloading). Keeping this explicit makes posters
 * reproducible and lets the studio expose a few tasteful sliders rather than a
 * wall of controls.
 */

export type SizeSignal = 'uniform' | 'churn' | 'recency' | 'merge';
export type HueSignal = 'lane' | 'author' | 'time' | 'churn';
export type DensitySignal = 'cadence' | 'uniform';

export interface EncodingConfig {
    /** What drives node radius / stroke weight. */
    size: SizeSignal;
    /** What drives categorical/sequential hue. */
    hue: HueSignal;
    /** What drives particle/stroke density (generative templates). */
    density: DensitySignal;
    /** Global scale multiplier for node size (0.5..2). */
    sizeScale: number;
    /** Global stroke/line weight multiplier (0.5..2). */
    weightScale: number;
    /** Generative turbulence amount (0..1) — flow field curl, jitter. */
    turbulence: number;
    /** Overall element density (0..1) — particle count, ring count. */
    densityAmount: number;
    /** Glow/halo intensity for nodes (0..1). */
    glow: number;
}

export const DEFAULT_ENCODING: EncodingConfig = {
    size: 'churn',
    hue: 'author',
    density: 'cadence',
    sizeScale: 1,
    weightScale: 1,
    turbulence: 0.5,
    densityAmount: 0.6,
    glow: 0.5,
};

const SIZE_SIGNALS: SizeSignal[] = ['uniform', 'churn', 'recency', 'merge'];
const HUE_SIGNALS: HueSignal[] = ['lane', 'author', 'time', 'churn'];
const DENSITY_SIGNALS: DensitySignal[] = ['cadence', 'uniform'];

/** Clamp/normalize a partial encoding into a complete, valid config (untrusted-safe). */
export function resolveEncoding(partial?: Partial<EncodingConfig>): EncodingConfig {
    const e = { ...DEFAULT_ENCODING, ...(partial ?? {}) };
    const clamp = (n: number, lo: number, hi: number) =>
        Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : (lo + hi) / 2;
    const oneOf = <T,>(v: unknown, allowed: readonly T[], fb: T): T => (allowed.includes(v as T) ? (v as T) : fb);
    return {
        size: oneOf(e.size, SIZE_SIGNALS, DEFAULT_ENCODING.size),
        hue: oneOf(e.hue, HUE_SIGNALS, DEFAULT_ENCODING.hue),
        density: oneOf(e.density, DENSITY_SIGNALS, DEFAULT_ENCODING.density),
        sizeScale: clamp(e.sizeScale, 0.4, 2.5),
        weightScale: clamp(e.weightScale, 0.4, 2.5),
        turbulence: clamp(e.turbulence, 0, 1),
        densityAmount: clamp(e.densityAmount, 0.05, 1),
        glow: clamp(e.glow, 0, 1),
    };
}
