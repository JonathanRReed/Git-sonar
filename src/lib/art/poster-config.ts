/**
 * Poster config — the single structured object describing a poster, plus
 * compact URL-hash encoding (deflate → base64url via the already-bundled
 * fflate) so any poster is a privacy-friendly, no-server, shareable permalink.
 */

import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { THEMES, type ThemeId } from '@lib/themes';
import type { LayoutMode } from './layout';
import type { PaletteMood } from './palette';
import { type EncodingConfig, resolveEncoding } from './encoding';
import { POSTER_SIZES, type Orientation, type PosterSizeId } from './sizes';

export interface PosterConfig {
    /** Schema version for forward-compat. */
    v: 1;
    template: string;
    themeId: ThemeId;
    paletteMood: PaletteMood;
    layout: LayoutMode;
    encoding: EncodingConfig;
    size: PosterSizeId;
    orientation: Orientation;
    dpi: 1 | 2 | 4;
    /** User-rerollable seed string. */
    seed: string;
    title: string;
    subtitle: string;
    showWatermark: boolean;
    showSignature: boolean;
    printSafe: boolean;
}

export const DEFAULT_POSTER_CONFIG: PosterConfig = {
    v: 1,
    template: 'movie-one-sheet',
    themeId: 'night',
    paletteMood: 'theme',
    layout: 'vertical',
    encoding: resolveEncoding(),
    size: 'native',
    orientation: 'portrait',
    dpi: 2,
    seed: 'sonar',
    title: '',
    subtitle: '',
    showWatermark: true,
    showSignature: true,
    printSafe: false,
};

const LAYOUTS: LayoutMode[] = ['vertical', 'horizontal', 'radial'];
const MOODS: PaletteMood[] = ['theme', 'duotone', 'mono', 'vivid'];
const ORIENTATIONS: Orientation[] = ['portrait', 'landscape'];

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
}

function str(value: unknown, fallback: string, max = 200): string {
    return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

/**
 * Build a complete, *valid* config from any partial/untrusted input. Every enum
 * field is clamped to a known value so a stale, hand-edited, or future `#p=`
 * permalink can never crash the renderer/studio — it just falls back sanely.
 */
export function makePosterConfig(
    partial: Partial<Omit<PosterConfig, 'encoding'>> & { encoding?: Partial<EncodingConfig> } = {}
): PosterConfig {
    const d = DEFAULT_POSTER_CONFIG;
    return {
        v: 1,
        template: str(partial.template, d.template, 64),
        themeId: oneOf(partial.themeId, Object.keys(THEMES) as ThemeId[], d.themeId),
        paletteMood: oneOf(partial.paletteMood, MOODS, d.paletteMood),
        layout: oneOf(partial.layout, LAYOUTS, d.layout),
        encoding: resolveEncoding(partial.encoding),
        size: oneOf(partial.size, Object.keys(POSTER_SIZES) as PosterSizeId[], d.size),
        orientation: oneOf(partial.orientation, ORIENTATIONS, d.orientation),
        dpi: oneOf(partial.dpi, [1, 2, 4] as const, d.dpi),
        seed: str(partial.seed, d.seed, 64),
        title: str(partial.title, d.title),
        subtitle: str(partial.subtitle, d.subtitle),
        showWatermark: bool(partial.showWatermark, d.showWatermark),
        showSignature: bool(partial.showSignature, d.showSignature),
        printSafe: bool(partial.printSafe, d.printSafe),
    };
}

function base64urlEncode(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bytes).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** Encode a poster config to a compact, URL-safe string. */
export function encodePosterConfig(cfg: PosterConfig): string {
    const json = JSON.stringify(cfg);
    const compressed = deflateSync(strToU8(json), { level: 9 });
    return base64urlEncode(compressed);
}

/** Decode a poster config string; returns null on any malformed input. */
export function decodePosterConfig(str: string): PosterConfig | null {
    try {
        const bytes = base64urlDecode(str);
        const json = strFromU8(inflateSync(bytes));
        const parsed = JSON.parse(json) as Partial<PosterConfig>;
        if (!parsed || typeof parsed !== 'object') return null;
        return makePosterConfig(parsed);
    } catch {
        return null;
    }
}
