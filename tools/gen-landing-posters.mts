/**
 * Build-time generator for the landing-page poster thumbnails.
 *
 * Renders each landing poster to an SVG, then RASTERIZES it to a small WebP via
 * resvg (with the real fonts) + sharp. This (a) keeps index.html tiny — the page
 * references /posters/<id>.webp with lazy <img> instead of inlining megabytes of
 * SVG, and (b) bakes the correct typography in (an <img>-loaded SVG can't use the
 * page's fonts, so a raster with embedded fonts is the only way to get real type
 * on the thumbnails). Google TTFs are fetched once into the SERVED public/fonts/
 * dir, so the same files also back the runtime SVG/PDF export embedding
 * (fonts.ts `embeddedFontFaceCss`). Font set is shared via FONT_FILES.
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { renderLandingPosters } from '../src/lib/demo-data/landing-posters';
import { FONT_FILES } from '../src/lib/art/font-files.ts';

// Served so the runtime exporter can fetch the same TTFs for @font-face embedding.
const FONT_DIR = 'public/fonts';
const OUT_DIR = 'public/posters';

// A non-browser UA makes Google Fonts serve TTF (which resvg reads natively).
const TTF_UA = 'Mozilla/4.0';

async function ensureFonts(): Promise<void> {
    mkdirSync(FONT_DIR, { recursive: true });
    for (const { spec, file } of FONT_FILES) {
        const out = `${FONT_DIR}/${file}.ttf`;
        if (existsSync(out)) continue;
        try {
            const cssRes = await fetch(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`, { headers: { 'User-Agent': TTF_UA } });
            const css = await cssRes.text();
            const m = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
            if (!m) { console.warn(`  ! no TTF url for ${spec}`); continue; }
            const fontRes = await fetch(m[1]);
            const buf = Buffer.from(await fontRes.arrayBuffer());
            writeFileSync(out, buf);
            console.log(`  fetched ${file}.ttf (${(buf.length / 1024).toFixed(0)} KB)`);
        } catch (err) {
            console.warn(`  ! failed to fetch ${spec}:`, (err as Error).message);
        }
    }
    // Fail loudly rather than silently shipping exports that fall back to system
    // fonts: the runtime SVG/PDF embedder serves these exact files from /fonts/.
    const missing = FONT_FILES.filter(({ file }) => !existsSync(`${FONT_DIR}/${file}.ttf`));
    if (missing.length) {
        throw new Error(
            `Could not fetch ${missing.length} poster font(s): ${missing.map((m) => m.file).join(', ')}. ` +
            `Exports embed these fonts — aborting the build instead of shipping broken typography.`
        );
    }
}

// Site typefaces, used only to draw the social card (kept out of the served
// /fonts/ dir, which is reserved for the fonts posters embed).
const OG_FONT_DIR = 'node_modules/.cache/og-fonts';
const OG_FONTS = [
    { spec: 'Bricolage+Grotesque:opsz,wdth,wght@96,75,800', file: 'BricolageGrotesque-Condensed-800' },
    { spec: 'Newsreader:opsz,wght@16,400', file: 'Newsreader-400' },
];

/** Family name inside the static instance Google serves for the spec above. */
const OG_DISPLAY = 'Bricolage Grotesque 96pt Condensed ExtraBold, Bricolage Grotesque 96pt Condensed, Bricolage Grotesque';

async function ensureOgFonts(): Promise<string[]> {
    mkdirSync(OG_FONT_DIR, { recursive: true });
    const files: string[] = [];
    for (const { spec, file } of OG_FONTS) {
        const out = `${OG_FONT_DIR}/${file}.ttf`;
        if (!existsSync(out)) {
            try {
                const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`, { headers: { 'User-Agent': TTF_UA } })).text();
                const m = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
                if (!m) { console.warn(`  ! no TTF url for ${spec}`); continue; }
                writeFileSync(out, Buffer.from(await (await fetch(m[1])).arrayBuffer()));
            } catch (err) {
                // The card still renders with a fallback face; it is not worth failing the build.
                console.warn(`  ! could not fetch ${spec}:`, (err as Error).message);
                continue;
            }
        }
        files.push(out);
    }
    return files;
}

async function main() {
    await ensureFonts();
    const fontFiles = existsSync(FONT_DIR)
        ? readdirSync(FONT_DIR).filter((f) => f.endsWith('.ttf')).map((f) => `${FONT_DIR}/${f}`)
        : [];
    mkdirSync(OUT_DIR, { recursive: true });

    let total = 0;
    const pngById = new Map<string, Buffer>();
    for (const p of renderLandingPosters()) {
        const resvg = new Resvg(p.svg, {
            font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Inter' },
            fitTo: { mode: 'width', value: 1000 },
        });
        const png = Buffer.from(resvg.render().asPng());
        pngById.set(p.id, png);
        const webp = await sharp(png).webp({ quality: 82, effort: 5 }).toBuffer();
        const out = `${OUT_DIR}/${p.id}.webp`;
        writeFileSync(out, webp);
        total += webp.length;
        console.log(`  ${out}  (${(webp.length / 1024).toFixed(0)} KB)`);
    }
    console.log(`landing posters rasterized — ${(total / 1024).toFixed(0)} KB total`);

    // Social OG card (1200x630 PNG) — real platforms reject SVG OG images.
    // It is the landing hero in miniature: the gallery wall, the headline as
    // wall text, and two framed pieces.
    const ogFonts = await ensureOgFonts();
    const dataUri = (id: string) => {
        const png = pngById.get(id);
        return png ? `data:image/png;base64,${png.toString('base64')}` : '';
    };
    const flow = dataUri('growth-rings');
    const pulsar = dataUri('pulsar');
    const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d0d4cf"/><stop offset="30%" stop-color="#dfe2de"/><stop offset="100%" stop-color="#d6d9d5"/>
    </linearGradient>
    <radialGradient id="spot" cx="50%" cy="42%" r="50%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <linearGradient id="oak" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c79c69"/><stop offset="55%" stop-color="#a97c4b"/><stop offset="100%" stop-color="#bd9160"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4a4844"/><stop offset="100%" stop-color="#7a776f"/></linearGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#141618" flood-opacity="0.3"/></filter>
  </defs>
  <rect width="1200" height="630" fill="url(#wall)"/>
  <ellipse cx="770" cy="270" rx="230" ry="300" fill="url(#spot)"/>
  <ellipse cx="1040" cy="290" rx="220" ry="290" fill="url(#spot)"/>
  <rect y="572" width="1200" height="10" fill="#eceeeb"/>
  <rect y="582" width="1200" height="48" fill="url(#floor)"/>

  <text font-family="${OG_DISPLAY}" font-weight="800" font-size="104" letter-spacing="-2" fill="#16181a">
    <tspan x="64" y="190">Every repo</tspan><tspan x="64" y="286">deserves a</tspan><tspan x="64" y="382">retrospective.</tspan>
  </text>
  <text x="66" y="452" font-family="Newsreader" font-size="31" fill="#16181a">Turn a commit history into a poster</text>
  <text x="66" y="492" font-family="Newsreader" font-size="31" fill="#16181a">you can print and frame.</text>
  <text x="66" y="545" font-family="${OG_DISPLAY}" font-weight="800" font-size="24" fill="#16181a">gitsonar.jonathanrreed.com</text>

  <g filter="url(#drop)">
    <rect x="648" y="96" width="246" height="317" fill="#1a1b1c"/>
    <rect x="655" y="103" width="232" height="303" fill="#fbfbf8"/>
    ${flow ? `<image href="${flow}" x="673" y="121" width="196" height="261" preserveAspectRatio="xMidYMid slice"/>` : ''}
  </g>
  <g filter="url(#drop)">
    <rect x="930" y="138" width="216" height="266" fill="url(#oak)"/>
    ${pulsar ? `<image href="${pulsar}" x="938" y="146" width="200" height="250" preserveAspectRatio="xMidYMid slice"/>` : ''}
  </g>
  <g>
    <rect x="648" y="440" width="170" height="64" fill="#fbfbf8"/>
    <text x="660" y="465" font-family="${OG_DISPLAY}" font-weight="800" font-size="17" fill="#16181a">Project Atlas</text>
    <text x="660" y="488" font-family="Newsreader" font-size="16" fill="#16181a">147 commits on paper</text>
    <circle cx="818" cy="440" r="8" fill="#d92b25"/>
  </g>
</svg>`;
    const ogPng = new Resvg(og, { font: { fontFiles: [...fontFiles, ...ogFonts], loadSystemFonts: true, defaultFontFamily: 'Inter' } }).render().asPng();
    const ogOpt = await sharp(Buffer.from(ogPng)).png({ compressionLevel: 9, palette: true }).toBuffer();
    writeFileSync('public/og-image.png', ogOpt);
    console.log(`og-image.png written (${(ogOpt.length / 1024).toFixed(0)} KB)`);
}

main();
