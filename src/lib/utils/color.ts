/**
 * Color utilities.
 *
 * These were originally three hex-only helpers that broke on shorthand (`#fff`)
 * and 8-digit hex and produced washed-out results. They now delegate to culori
 * (via the art palette engine) for correctness while preserving the original
 * call signatures used across the export generators and canvas renderer.
 */

import { converter, formatRgb } from 'culori';
import { withAlpha, adjustLightness } from '@lib/art/palette';

const toRgb = converter('rgb');

/**
 * Lighten a color. `percent` is the legacy 0–255-ish amount; we map it onto an
 * OKLCH lightness delta so the result stays perceptually even (no more clipping
 * straight to white). Negative values darken.
 */
export function lightenColor(color: string, percent: number): string {
    return adjustLightness(color, percent / 255);
}

/** Convert any CSS color to an `rgba(...)` string with the given alpha. */
export function hexToRgba(color: string, alpha: number): string {
    return withAlpha(color, alpha);
}

/** True when a color reads as "light" (high perceived brightness). */
export function isLightColor(color: string): boolean {
    const c = toRgb(color);
    if (!c) return false;
    const { r, g, b } = c;
    const brightness = (r * 255 * 299 + g * 255 * 587 + b * 255 * 114) / 1000;
    return brightness > 128;
}

/** Convert any CSS color to a plain `rgb(...)` string. */
export function toRgbString(color: string): string {
    return formatRgb(toRgb(color) ?? { mode: 'rgb', r: 0, g: 0, b: 0 }) ?? color;
}
