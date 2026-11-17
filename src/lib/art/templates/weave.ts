/**
 * Weave: the repo as cloth. Each weft row is one span of time, taller when it
 * was busy and dyed in the colour of whoever led it; the warp shows through in
 * a twill whose pattern the roll decides. Fringe at both ends, because the
 * history is not finished.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneStroke, SceneText } from '../scene';
import { fontStack } from '../fonts';
import { adjustLightness, withAlpha } from '../palette';
import { authorColorer, plural, rect, text, timeBuckets, titleOf } from './kit';

const TITLE_FONT = 'Syne';
const MONO_FONT = 'JetBrainsMono';

type Draft = (row: number, col: number) => boolean;

/** Weaving drafts: true where the weft passes over the warp. */
const DRAFTS: Draft[] = [
    (r, c) => (r + c) % 4 < 2, // 2/2 twill
    (r, c) => (r + (c % 8 < 4 ? c : 7 - (c % 8))) % 4 < 2, // herringbone
    (r, c) => ((r >> 1) + (c >> 1)) % 2 === 0, // basket
    (r, c) => (r * 2 + c) % 5 < 3, // satin-ish float
];

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, rng } = ctx;
    const margin = Math.round(width * 0.075);
    const strokes: SceneStroke[] = [];
    const texts: SceneText[] = [];
    const colorOf = authorColorer(ctx);

    const buckets = timeBuckets(ctx, 64, 7);
    const total = Math.max(1, buckets.reduce((a, b) => a + b.count, 0));
    const draft = DRAFTS[Math.floor(rng() * DRAFTS.length)];
    const cols = 22 + Math.floor(rng() * 4) * 4;

    const x0 = margin;
    const clothW = width - margin * 2;
    const top = height * 0.085;
    const bottom = height * 0.8;
    const clothH = bottom - top;
    const cw = clothW / cols;
    const gap = Math.max(0.6, cw * 0.1);
    const minH = clothH * 0.006;
    const flex = clothH - minH * buckets.length;
    const warp = adjustLightness(palette.bg, palette.variant === 'dark' ? 0.16 : -0.16);
    const fringe = height * 0.028;

    // Warp threads run the full height and out past both selvedges.
    for (let c = 0; c < cols; c++) {
        strokes.push(rect(`warp-${c}`, x0 + c * cw + cw * 0.3, top - fringe, cw * 0.4, clothH + fringe * 2, warp, 0.9));
    }

    let y = top;
    buckets.forEach((b, r) => {
        const h = minH + (b.count / total) * flex;
        const dye = b.count === 0 ? withAlpha(palette.fg, 0.14) : colorOf(b.lead);
        // Merge runs of "over" cells into one float so a row is a few rects, not dozens.
        let c = 0;
        while (c < cols) {
            if (!draft(r, c)) {
                c++;
                continue;
            }
            let end = c;
            while (end + 1 < cols && draft(r, end + 1)) end++;
            strokes.push(rect(`weft-${r}-${c}`, x0 + c * cw + gap / 2, y + gap / 2, (end - c + 1) * cw - gap, Math.max(0.5, h - gap), dye));
            c = end + 1;
        }
        y += h;
    });

    const title = titleOf(ctx);
    const titleSize = Math.min(width * 0.095, ((width - margin * 2) / Math.max(5, title.length)) * 1.65);
    const baseY = height - margin - width * 0.045;
    texts.push(text(title, margin, baseY, { font: fontStack(TITLE_FONT), size: titleSize, weight: 700, color: palette.fg }));
    const lead = signals.rankedAuthors[0];
    const caption = options.subtitle
        || `Woven by ${plural(signals.authorCount, 'author')} over ${plural(buckets.length, 'row')}${lead ? `. Most thread: ${lead.name}` : ''}.`;
    texts.push(text(caption.toUpperCase(), margin, baseY + width * 0.036, {
        font: fontStack(MONO_FONT), size: width * 0.0152, weight: 500, color: palette.fgMuted, spacing: width * 0.0022,
    }));
    if (options.showWatermark) {
        texts.push(text('GITSONAR.COM', width - margin, baseY + width * 0.036, {
            font: fontStack(MONO_FONT), size: width * 0.013, weight: 600, color: withAlpha(palette.fg, 0.5), align: 'end', spacing: width * 0.004,
        }));
    }

    return {
        width,
        height,
        background: palette.variant === 'dark' ? { kind: 'solid', color: palette.bg, grain: 0.04 } : { kind: 'solid', color: palette.bg },
        strokes,
        edges: [],
        nodes: [],
        texts,
        fontsUsed: [TITLE_FONT, MONO_FONT],
    };
}

export const weaveTemplate: PosterTemplate = {
    id: 'weave',
    name: 'Weave',
    group: 'generative',
    description: 'Cloth woven from the history: a row per week, dyed by whoever led it.',
    defaultAspect: 18 / 24,
    fonts: [TITLE_FONT, MONO_FONT],
    build,
};
