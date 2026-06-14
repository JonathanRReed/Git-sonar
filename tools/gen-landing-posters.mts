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
    const hero = pngById.get('pulsar') ?? pngById.get('flow-field');
    const heroDataUri = hero ? `data:image/png;base64,${hero.toString('base64')}` : '';
    const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c100e"/><stop offset="55%" stop-color="#10120f"/><stop offset="100%" stop-color="#0a0b0a"/>
    </linearGradient>
    <radialGradient id="glow" cx="14%" cy="20%" r="60%"><stop offset="0%" stop-color="#2f6f63" stop-opacity="0.5"/><stop offset="100%" stop-color="#2f6f63" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <clipPath id="pc"><rect x="760" y="40" width="360" height="550" rx="14"/></clipPath>
  ${heroDataUri ? `<image href="${heroDataUri}" x="700" y="-40" width="540" height="720" preserveAspectRatio="xMidYMid slice" clip-path="url(#pc)"/>` : ''}
  <rect x="760" y="40" width="360" height="550" rx="14" fill="none" stroke="#f4f0e8" stroke-opacity="0.16"/>
  <text x="80" y="250" font-family="Unbounded" font-weight="700" font-size="78" fill="#f4f0e8">Your Git history,</text>
  <text x="80" y="338" font-family="Unbounded" font-weight="700" font-size="78" fill="#f4f0e8">as art.</text>
  <text x="84" y="180" font-family="JetBrains Mono" font-weight="500" font-size="24" letter-spacing="3" fill="#8fd3c7">TURN ANY REPO INTO ART</text>
  <text x="84" y="430" font-family="JetBrains Mono" font-weight="500" font-size="25" fill="#b9b6ac">Movie posters, album covers &amp; generative prints</text>
  <text x="84" y="468" font-family="JetBrains Mono" font-weight="500" font-size="25" fill="#b9b6ac">from any commit history — in your browser.</text>
  <text x="84" y="560" font-family="Unbounded" font-weight="700" font-size="30" fill="#f2b36d">gitsonar.jonathanrreed.com</text>
</svg>`;
    const ogPng = new Resvg(og, { font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Inter' } }).render().asPng();
    const ogOpt = await sharp(Buffer.from(ogPng)).png({ compressionLevel: 9, palette: true }).toBuffer();
    writeFileSync('public/og-image.png', ogOpt);
    console.log(`og-image.png written (${(ogOpt.length / 1024).toFixed(0)} KB)`);
}

main();
