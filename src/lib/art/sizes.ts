/**
 * Poster sizes + orientation resolution.
 *
 * Print sizes are defined PORTRAIT-native (w <= h). The old exporter stored
 * Poster18x24 as {24,18} and Poster24x36 as {36,24} — landscape under portrait
 * names. Here a size is portrait by default and the orientation flag swaps it,
 * so "18×24" means 18 wide × 24 tall as expected.
 */

export type Orientation = 'portrait' | 'landscape';

export type PosterSizeId =
    | 'native'
    | 'square'
    | 'A4'
    | 'A3'
    | 'A2'
    | 'A1'
    | '12x18'
    | '18x24'
    | '24x36'
    | 'social-square'
    | 'social-story'
    | 'social-wide'
    | 'og';

export interface SizeSpec {
    id: PosterSizeId;
    name: string;
    /** Print sizes carry physical inches (portrait). */
    inches?: { w: number; h: number };
    /** Screen/social sizes carry fixed pixels (portrait/native orientation). */
    px?: { w: number; h: number };
    group: 'native' | 'print' | 'social';
}

export const POSTER_SIZES: Record<PosterSizeId, SizeSpec> = {
    native: { id: 'native', name: 'Native', group: 'native' },
    square: { id: 'square', name: 'Square', inches: { w: 24, h: 24 }, group: 'print' },
    A4: { id: 'A4', name: 'A4', inches: { w: 8.27, h: 11.69 }, group: 'print' },
    A3: { id: 'A3', name: 'A3', inches: { w: 11.69, h: 16.54 }, group: 'print' },
    A2: { id: 'A2', name: 'A2', inches: { w: 16.54, h: 23.39 }, group: 'print' },
    A1: { id: 'A1', name: 'A1', inches: { w: 23.39, h: 33.11 }, group: 'print' },
    '12x18': { id: '12x18', name: '12×18 in', inches: { w: 12, h: 18 }, group: 'print' },
    '18x24': { id: '18x24', name: '18×24 in', inches: { w: 18, h: 24 }, group: 'print' },
    '24x36': { id: '24x36', name: '24×36 in', inches: { w: 24, h: 36 }, group: 'print' },
    'social-square': { id: 'social-square', name: 'Social 1:1', px: { w: 2048, h: 2048 }, group: 'social' },
    'social-story': { id: 'social-story', name: 'Story 9:16', px: { w: 1080, h: 1920 }, group: 'social' },
    'social-wide': { id: 'social-wide', name: 'Wide 16:9', px: { w: 1920, h: 1080 }, group: 'social' },
    og: { id: 'og', name: 'OG 1200×630', px: { w: 1200, h: 630 }, group: 'social' },
};

export interface ResolvedSize {
    /** Pixel canvas size for rendering. */
    wPx: number;
    hPx: number;
    /** Physical size attributes for the SVG (print only). */
    widthAttr?: string;
    heightAttr?: string;
    /** Physical inches incl. orientation (print only), for PDF page sizing. */
    inches?: { w: number; h: number };
    /** Total area in px (for canvas max-area checks). */
    area: number;
}

const A1_LIMIT = { chrome: 268_435_456, firefox: 472_907_776, safari: 16_777_216 };

/** Resolve a size into pixel dimensions for the given orientation + DPI. */
export function resolvePosterSize(
    sizeId: PosterSizeId,
    orientation: Orientation,
    dpi: 1 | 2 | 4,
    nativeAspect: number,
    nativeBaseWidth = 1600
): ResolvedSize {
    const spec = POSTER_SIZES[sizeId];

    if (spec.group === 'native' || (!spec.inches && !spec.px)) {
        // Use the template's aspect at a comfortable base resolution.
        const w = nativeBaseWidth;
        const h = Math.round(w / nativeAspect);
        const wPx = orientation === 'portrait' ? Math.min(w, h) : Math.max(w, h);
        const hPx = orientation === 'portrait' ? Math.max(w, h) : Math.min(w, h);
        return { wPx: wPx * dpi, hPx: hPx * dpi, area: wPx * hPx * dpi * dpi };
    }

    if (spec.px) {
        // Social sizes are authored at their exact orientation; don't swap.
        const wPx = spec.px.w * dpi;
        const hPx = spec.px.h * dpi;
        return { wPx, hPx, area: wPx * hPx };
    }

    // Print: inches authored portrait; swap for landscape.
    const inW = orientation === 'portrait' ? spec.inches!.w : spec.inches!.h;
    const inH = orientation === 'portrait' ? spec.inches!.h : spec.inches!.w;
    const renderDpi = 150; // on-screen/raster working DPI; PDF uses inches directly
    const wPx = Math.round(inW * renderDpi * dpi);
    const hPx = Math.round(inH * renderDpi * dpi);
    return {
        wPx,
        hPx,
        widthAttr: `${inW}in`,
        heightAttr: `${inH}in`,
        inches: { w: inW, h: inH },
        area: wPx * hPx,
    };
}

/** Aspect ratio (w/h) for a resolved size, used to lay out templates. */
export function sizeAspect(sizeId: PosterSizeId, orientation: Orientation, nativeAspect: number): number {
    const spec = POSTER_SIZES[sizeId];
    if (spec.px) return spec.px.w / spec.px.h;
    if (spec.inches) {
        const w = orientation === 'portrait' ? spec.inches.w : spec.inches.h;
        const h = orientation === 'portrait' ? spec.inches.h : spec.inches.w;
        return w / h;
    }
    return nativeAspect;
}

/**
 * Probe whether a raster area is safe to render in one canvas. The conservative
 * (Safari/iOS) cap is ~16.7M px; above it we must tile or route to vector.
 */
export function exceedsCanvasArea(area: number, conservative = true): boolean {
    return area > (conservative ? A1_LIMIT.safari : A1_LIMIT.chrome);
}

/**
 * The single-canvas pixel cap for the current browser. Safari/iOS (WebKit, but
 * not Chrome which also reports "AppleWebKit") have the tight ~16.7M-px limit;
 * Chrome/Firefox are far higher, so we don't needlessly downscale their PNGs.
 */
export function canvasAreaCap(): number {
    if (typeof navigator === 'undefined') return A1_LIMIT.safari;
    const ua = navigator.userAgent;
    const isWebKit = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
    if (isWebKit) return A1_LIMIT.safari;
    if (/Firefox/.test(ua)) return A1_LIMIT.firefox;
    return A1_LIMIT.chrome;
}
