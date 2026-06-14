/**
 * Perceptual palette engine.
 *
 * Replaces the three hex-only helpers in utils/color.ts (which crashed on
 * shorthand/8-digit hex) with a culori-backed OKLCH engine. Every poster palette
 * is *derived from one of the five curated themes* so output stays on-brand
 * rather than random-rainbow. Author/lane colors are spaced evenly around the
 * theme's hue wheel in OKLCH for harmonious, distinguishable categories.
 */

import {
    converter,
    formatHex,
    formatRgb,
    interpolate,
    clampChroma,
    wcagContrast,
    type Oklch,
} from 'culori';
import type { Theme, ThemeColors } from '@lib/git/types';

const toOklch = converter('oklch');

export type PaletteMood = 'theme' | 'duotone' | 'mono' | 'vivid';

export interface Palette {
    id: string;
    name: string;
    variant: 'dark' | 'light';
    /** Page background. */
    bg: string;
    /** Secondary surface / panel. */
    bgAlt: string;
    /** Primary text/ink. */
    fg: string;
    /** Muted text. */
    fgMuted: string;
    /** Hero accent. */
    accent: string;
    /** Secondary accent. */
    accent2: string;
    /** Categorical colors for lanes / authors. */
    categorical: string[];
    /** Even ramp of n colors between accent and accent2 in OKLCH. */
    ramp: (stops: number) => string[];
    /** Sequential color at t in [0,1] along the accent ramp. */
    sequential: (t: number) => string;
    /** Diverging color at t in [-1,1] (e.g. deletions↔additions). */
    diverging: (t: number) => string;
    /** Categorical color for author/lane index out of total. */
    categoryColor: (index: number, total: number) => string;
}

function safeOklch(hex: string): Oklch {
    return (toOklch(hex) as Oklch) ?? { mode: 'oklch', l: 0.5, c: 0.1, h: 0 };
}

function fmt(c: Oklch): string {
    return formatHex(clampChroma(c, 'oklch')) ?? '#000000';
}

/** Rotate hue and tweak lightness/chroma of an OKLCH color. */
function shift(base: Oklch, dh: number, dl = 0, dc = 0): Oklch {
    return {
        mode: 'oklch',
        l: clamp01(base.l + dl),
        c: Math.max(0, base.c + dc),
        h: ((base.h ?? 0) + dh + 360) % 360,
    };
}

function clamp01(n: number): number {
    return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Build a palette from theme colors. `mood` re-tints the derived ramp:
 * - theme:   use the theme's accent roles as-is (default, most on-brand)
 * - duotone: two analogous hues + one accent (classic poster look)
 * - mono:    single hue, lightness ramp (minimalist)
 * - vivid:   boosted chroma for high-energy generative pieces
 */
export function buildPalette(theme: Theme, mood: PaletteMood = 'theme'): Palette {
    const c: ThemeColors = theme.colors;
    const variant = theme.variant;

    const roleHexes = [c.foam, c.iris, c.gold, c.love, c.rose, c.pine];
    const accentBase = safeOklch(c.foam);
    const accent2Base = safeOklch(c.gold);

    let accent = c.foam;
    let accent2 = c.gold;
    let categorical = roleHexes.slice();

    if (mood === 'duotone') {
        accent = fmt(accentBase);
        accent2 = fmt(shift(accentBase, 200, variant === 'dark' ? 0.05 : -0.05));
        categorical = [accent, accent2, c.gold, c.love];
    } else if (mood === 'mono') {
        accent = fmt(accentBase);
        accent2 = fmt(shift(accentBase, 0, variant === 'dark' ? 0.28 : -0.28, -0.04));
        categorical = [accent, fmt(shift(accentBase, 0, 0.12)), fmt(shift(accentBase, 0, -0.12))];
    } else if (mood === 'vivid') {
        accent = fmt(shift(accentBase, 0, 0, 0.06));
        accent2 = fmt(shift(accent2Base, 0, 0, 0.06));
        categorical = roleHexes.map((h) => fmt(shift(safeOklch(h), 0, 0, 0.05)));
    }

    const rampInterp = interpolate([accent, accent2], 'oklch');
    const ramp = (stops: number): string[] => {
        if (stops <= 1) return [accent];
        const out: string[] = [];
        for (let i = 0; i < stops; i++) {
            out.push(formatHex(rampInterp(i / (stops - 1))) ?? accent);
        }
        return out;
    };

    const sequential = (t: number): string =>
        formatHex(rampInterp(clamp01(t))) ?? accent;

    // Diverging: deletions (love/red) ← neutral → additions (pine/green).
    const negC = safeOklch(c.love);
    const posC = safeOklch(c.pine);
    const midC = safeOklch(variant === 'dark' ? c.subtle : c.muted);
    const divNeg = interpolate([formatHex(negC) ?? c.love, formatHex(midC) ?? c.muted], 'oklch');
    const divPos = interpolate([formatHex(midC) ?? c.muted, formatHex(posC) ?? c.pine], 'oklch');
    const diverging = (t: number): string => {
        const tt = Math.max(-1, Math.min(1, t));
        return tt < 0
            ? formatHex(divNeg(tt + 1)) ?? c.love
            : formatHex(divPos(tt)) ?? c.pine;
    };

    // Categorical: reuse curated roles first, then space remaining evenly in hue.
    const categoryColor = (index: number, total: number): string => {
        if (total <= categorical.length && index < categorical.length) {
            return categorical[index];
        }
        const baseL = accentBase.l;
        const baseC = Math.max(0.09, accentBase.c);
        const h0 = accentBase.h ?? 0;
        const hue = (h0 + (index * 360) / Math.max(1, total)) % 360;
        return fmt({ mode: 'oklch', l: baseL, c: baseC, h: hue });
    };

    return {
        id: `${theme.id}-${mood}`,
        name: `${theme.name}${mood === 'theme' ? '' : ` · ${mood}`}`,
        variant,
        bg: c.base,
        bgAlt: c.surface,
        fg: c.text,
        fgMuted: c.muted,
        accent,
        accent2,
        categorical,
        ramp,
        sequential,
        diverging,
        categoryColor,
    };
}

/** Apply an alpha to any color string, returning an `rgba(...)` value. */
export function withAlpha(color: string, alpha: number): string {
    const rgba = formatRgb({ ...(converter('rgb')(color) ?? { mode: 'rgb', r: 0, g: 0, b: 0 }), alpha });
    return rgba ?? color;
}

/** Lighten/darken a color by an OKLCH lightness delta in [-1,1]. */
export function adjustLightness(color: string, delta: number): string {
    const o = safeOklch(color);
    return fmt({ ...o, l: clamp01(o.l + delta) });
}

/** Pick black or white ink for maximum contrast on a background. */
export function readableInk(bg: string): string {
    const onWhite = wcagContrast(bg, '#ffffff');
    const onBlack = wcagContrast(bg, '#000000');
    return onWhite >= onBlack ? '#ffffff' : '#000000';
}

/**
 * Nudge a color toward the CMYK-printable gamut by capping chroma. Browsers are
 * sRGB-only so this is an approximation that tames neon foam/iris/love accents.
 */
export function printSafe(color: string, maxChroma = 0.16): string {
    const o = safeOklch(color);
    return fmt({ ...o, c: Math.min(o.c, maxChroma) });
}
