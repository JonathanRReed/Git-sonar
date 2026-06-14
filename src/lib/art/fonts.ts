/**
 * Curated poster font set, bucketed by mood, plus export-safe loading.
 *
 * Typography is what separates "a poster" from "a screenshot of a graph". Each
 * template pins a title + supporting face. Fonts are loaded from Google Fonts /
 * Fontshare for the live preview; before ANY raster/PDF export we must await
 * `document.fonts.ready` (the #1 cause of exports falling back to system fonts).
 *
 * For STANDALONE outputs (SVG/PDF opened on another machine) the page's faces
 * aren't available, so `embeddedFontFaceCss()` fetches the self-hosted TTFs
 * (served from /fonts/, see font-files.ts) and inlines them as base64
 * @font-face; `fontTtfBytes()` returns the same bytes for jsPDF registration.
 */

import { fontFilesForKeys, type FontFileSpec } from './font-files';

export type FontMood = 'cinematic' | 'prestige' | 'modern' | 'expressive' | 'mono';

export interface FontDef {
    /** Canonical family name as used in CSS `font-family`. */
    family: string;
    /** Full fallback stack. */
    stack: string;
    weights: number[];
    mood: FontMood;
    /** Stylesheet href to load the face (CDN for now). */
    href?: string;
}

const G = (spec: string) => `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;

export const FONTS: Record<string, FontDef> = {
    // Cinematic / condensed display
    Anton: { family: 'Anton', stack: `'Anton', 'Oswald', Impact, sans-serif`, weights: [400], mood: 'cinematic', href: G('Anton') },
    Oswald: { family: 'Oswald', stack: `'Oswald', 'Barlow Condensed', sans-serif`, weights: [400, 500, 600, 700], mood: 'cinematic', href: G('Oswald:wght@400;500;600;700') },
    BebasNeue: { family: 'Bebas Neue', stack: `'Bebas Neue', 'Oswald', sans-serif`, weights: [400], mood: 'cinematic', href: G('Bebas+Neue') },
    ArchivoBlack: { family: 'Archivo Black', stack: `'Archivo Black', 'Arial Black', sans-serif`, weights: [400], mood: 'cinematic', href: G('Archivo+Black') },
    BarlowCondensed: { family: 'Barlow Condensed', stack: `'Barlow Condensed', 'Oswald', sans-serif`, weights: [400, 500, 600, 700], mood: 'cinematic', href: G('Barlow+Condensed:wght@400;500;600;700') },

    // Prestige / editorial serif
    PlayfairDisplay: { family: 'Playfair Display', stack: `'Playfair Display', Georgia, serif`, weights: [400, 700, 800, 900], mood: 'prestige', href: G('Playfair+Display:wght@400;700;800;900') },
    Fraunces: { family: 'Fraunces', stack: `'Fraunces', Georgia, serif`, weights: [400, 600, 700, 900], mood: 'prestige', href: G('Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900') },
    Cormorant: { family: 'Cormorant Garamond', stack: `'Cormorant Garamond', Garamond, serif`, weights: [400, 500, 600, 700], mood: 'prestige', href: G('Cormorant+Garamond:wght@400;500;600;700') },

    // Modern / minimal sans
    Inter: { family: 'Inter', stack: `'Inter', system-ui, sans-serif`, weights: [400, 500, 600, 700, 800, 900], mood: 'modern', href: G('Inter:wght@400;500;600;700;800;900') },
    SpaceGrotesk: { family: 'Space Grotesk', stack: `'Space Grotesk', 'Inter', sans-serif`, weights: [400, 500, 600, 700], mood: 'modern', href: G('Space+Grotesk:wght@400;500;600;700') },
    DMSans: { family: 'DM Sans', stack: `'DM Sans', 'Inter', sans-serif`, weights: [400, 500, 700], mood: 'modern', href: G('DM+Sans:wght@400;500;700') },

    // Expressive / display
    Unbounded: { family: 'Unbounded', stack: `'Unbounded', 'Space Grotesk', sans-serif`, weights: [400, 600, 700, 800], mood: 'expressive', href: G('Unbounded:wght@400;600;700;800') },
    Syne: { family: 'Syne', stack: `'Syne', 'Space Grotesk', sans-serif`, weights: [400, 600, 700, 800], mood: 'expressive', href: G('Syne:wght@400;600;700;800') },

    // Mono (tracklists, billing blocks, captions)
    JetBrainsMono: { family: 'JetBrains Mono', stack: `'JetBrains Mono', 'SFMono-Regular', monospace`, weights: [400, 500, 600], mood: 'mono', href: G('JetBrains+Mono:wght@400;500;600') },
    SpaceMono: { family: 'Space Mono', stack: `'Space Mono', 'JetBrains Mono', monospace`, weights: [400, 700], mood: 'mono', href: G('Space+Mono:wght@400;700') },
};

export const FONT_BUCKETS: Record<FontMood, string[]> = {
    cinematic: ['Anton', 'Oswald', 'BebasNeue', 'ArchivoBlack', 'BarlowCondensed'],
    prestige: ['PlayfairDisplay', 'Fraunces', 'Cormorant'],
    modern: ['Inter', 'SpaceGrotesk', 'DMSans'],
    expressive: ['Unbounded', 'Syne'],
    mono: ['JetBrainsMono', 'SpaceMono'],
};

/** Resolve a font key to its CSS stack (falls back to a system sans). */
export function fontStack(key: string): string {
    return FONTS[key]?.stack ?? `system-ui, sans-serif`;
}

const loaded = new Set<string>();

/** Inject the stylesheet links for the given font keys (idempotent). */
export function loadFonts(keys: string[]): void {
    if (typeof document === 'undefined') return;
    for (const key of keys) {
        const def = FONTS[key];
        if (!def?.href || loaded.has(def.href)) continue;
        loaded.add(def.href);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = def.href;
        document.head.appendChild(link);
    }
}

/**
 * Ensure the given font families are actually rendered before exporting. Loads
 * any missing stylesheets, then resolves once the browser reports the faces
 * ready. Without this, canvas/SVG rasterization silently uses fallback fonts.
 */
export async function ensureFontsReady(keys: string[]): Promise<void> {
    if (typeof document === 'undefined') return;
    loadFonts(keys);
    const fontsApi = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fontsApi) return;
    // Explicitly request each weight so `ready` waits on them.
    const requests: Promise<unknown>[] = [];
    for (const key of keys) {
        const def = FONTS[key];
        if (!def) continue;
        for (const w of def.weights) {
            try {
                requests.push(fontsApi.load(`${w} 16px '${def.family}'`));
            } catch {
                /* ignore individual face failures */
            }
        }
    }
    await Promise.allSettled(requests);
    try {
        await fontsApi.ready;
    } catch {
        /* ignore */
    }
}

// ---- standalone-export font embedding -------------------------------------
// Cache the served TTF bytes (and derived base64) per file so repeated exports
// in a session don't re-fetch. Empty string / null = a fetch that failed (so we
// fall back to system fonts gracefully, the same as before embedding existed).

const ttfBytesCache = new Map<string, Uint8Array | null>();
const faceCssCache = new Map<string, string>();

function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    const chunk = 0x8000; // avoid String.fromCharCode argument-count limits
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}

async function loadTtf(spec: FontFileSpec): Promise<Uint8Array | null> {
    const cached = ttfBytesCache.get(spec.file);
    if (cached !== undefined) return cached;
    if (typeof fetch === 'undefined') {
        ttfBytesCache.set(spec.file, null);
        return null;
    }
    try {
        const res = await fetch(`/fonts/${spec.file}.ttf`);
        if (!res.ok) {
            ttfBytesCache.set(spec.file, null);
            return null;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        ttfBytesCache.set(spec.file, bytes);
        return bytes;
    } catch {
        ttfBytesCache.set(spec.file, null);
        return null;
    }
}

/**
 * Build `@font-face` CSS (base64 TTF data-URIs) for the given template font
 * keys, for inlining into an exported SVG so it renders with the real type on
 * any machine. Returns '' if the fonts can't be fetched (graceful fallback to
 * the family's system stack, the pre-embedding behaviour).
 */
export async function embeddedFontFaceCss(keys: string[]): Promise<string> {
    const specs = fontFilesForKeys(keys);
    const faces = await Promise.all(
        specs.map(async (spec) => {
            const cached = faceCssCache.get(spec.file);
            if (cached !== undefined) return cached;
            const bytes = await loadTtf(spec);
            if (!bytes) {
                faceCssCache.set(spec.file, '');
                return '';
            }
            const css =
                `@font-face{font-family:'${spec.family}';font-style:normal;font-weight:${spec.weight};` +
                `font-display:swap;src:url(data:font/ttf;base64,${bytesToBase64(bytes)}) format('truetype');}`;
            faceCssCache.set(spec.file, css);
            return css;
        })
    );
    return faces.join('');
}

/** Raw TTF bytes for the given font keys (for jsPDF `addFont` registration). */
export async function fontTtfBytes(
    keys: string[]
): Promise<{ family: string; weight: number; base64: string }[]> {
    const specs = fontFilesForKeys(keys);
    const out = await Promise.all(
        specs.map(async (spec) => {
            const bytes = await loadTtf(spec);
            return bytes ? { family: spec.family, weight: spec.weight, base64: bytesToBase64(bytes) } : null;
        })
    );
    return out.filter((x): x is { family: string; weight: number; base64: string } => x !== null);
}
