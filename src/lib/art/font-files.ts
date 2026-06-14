/**
 * The served poster font files — the SINGLE source of truth for both the
 * build-time rasterizer (resvg, in tools/gen-landing-posters.mts) and the
 * runtime export embedder (fonts.ts `embeddedFontFaceCss`). Each spec is fetched
 * once at build into `public/fonts/<file>.ttf` and served, so an exported SVG
 * can inline the real face as a base64 @font-face and render correctly on any
 * machine.
 *
 * `family` MUST equal `FONTS[key].family` so an embedded @font-face matches the
 * `font-family` the templates emit into the SVG. This is the proven weight set
 * the landing rasters already use (resvg does the same nearest-weight matching
 * the browser does, so what looks right on the thumbnails looks right embedded).
 *
 * This module is intentionally dependency-free so the bun build script can
 * import it directly without Astro/Vite resolution.
 */

export interface FontFileSpec {
    /** FONTS registry key (template `fonts` arrays reference these). */
    key: string;
    /** CSS family name — must equal FONTS[key].family. */
    family: string;
    weight: number;
    /** Google css2 `family=` spec used to fetch the TTF at build. */
    spec: string;
    /** Served basename: /fonts/<file>.ttf */
    file: string;
}

// Weights are the EXACT ones the templates emit (audited from every text() call),
// so an embedded face matches the weight the live preview rendered — preserving
// the vector == raster == preview invariant. BarlowCondensed carries 400 + 600
// because billing/name rows pass a computed (non-literal) weight.
export const FONT_FILES: FontFileSpec[] = [
    { key: 'Anton', family: 'Anton', weight: 400, spec: 'Anton', file: 'Anton-400' },
    { key: 'BarlowCondensed', family: 'Barlow Condensed', weight: 400, spec: 'Barlow+Condensed:wght@400', file: 'BarlowCondensed-400' },
    { key: 'BarlowCondensed', family: 'Barlow Condensed', weight: 600, spec: 'Barlow+Condensed:wght@600', file: 'BarlowCondensed-600' },
    { key: 'Cormorant', family: 'Cormorant Garamond', weight: 600, spec: 'Cormorant+Garamond:wght@600', file: 'Cormorant-600' },
    { key: 'Inter', family: 'Inter', weight: 400, spec: 'Inter:wght@400', file: 'Inter-400' },
    { key: 'JetBrainsMono', family: 'JetBrains Mono', weight: 400, spec: 'JetBrains+Mono:wght@400', file: 'JetBrainsMono-400' },
    { key: 'JetBrainsMono', family: 'JetBrains Mono', weight: 500, spec: 'JetBrains+Mono:wght@500', file: 'JetBrainsMono-500' },
    { key: 'JetBrainsMono', family: 'JetBrains Mono', weight: 600, spec: 'JetBrains+Mono:wght@600', file: 'JetBrainsMono-600' },
    { key: 'Oswald', family: 'Oswald', weight: 500, spec: 'Oswald:wght@500', file: 'Oswald-500' },
    { key: 'Oswald', family: 'Oswald', weight: 600, spec: 'Oswald:wght@600', file: 'Oswald-600' },
    { key: 'PlayfairDisplay', family: 'Playfair Display', weight: 400, spec: 'Playfair+Display:wght@400', file: 'PlayfairDisplay-400' },
    { key: 'SpaceGrotesk', family: 'Space Grotesk', weight: 600, spec: 'Space+Grotesk:wght@600', file: 'SpaceGrotesk-600' },
    { key: 'SpaceGrotesk', family: 'Space Grotesk', weight: 700, spec: 'Space+Grotesk:wght@700', file: 'SpaceGrotesk-700' },
    { key: 'Syne', family: 'Syne', weight: 600, spec: 'Syne:wght@600', file: 'Syne-600' },
    { key: 'Syne', family: 'Syne', weight: 700, spec: 'Syne:wght@700', file: 'Syne-700' },
    { key: 'Unbounded', family: 'Unbounded', weight: 700, spec: 'Unbounded:wght@700', file: 'Unbounded-700' },
];

/** The font files needed to render the given template font keys. */
export function fontFilesForKeys(keys: string[]): FontFileSpec[] {
    const set = new Set(keys);
    return FONT_FILES.filter((f) => set.has(f.key));
}
