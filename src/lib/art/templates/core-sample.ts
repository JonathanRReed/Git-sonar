/**
 * Core sample: the repo as a drilled column of strata. Oldest work is deepest.
 * Each layer is one span of time; its thickness is that span's commits and its
 * colour is whoever led it. A depth scale runs down the side and the thickest
 * layer is called out.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneStroke, SceneText, Vec2 } from '../scene';
import { fontStack } from '../fonts';
import { adjustLightness, withAlpha } from '../palette';
import { authorColorer, line, monthYear, plural, poly, rect, text, timeBuckets, titleOf } from './kit';
import { CREDIT } from '../../brand';

const TITLE_FONT = 'Oswald';
const MONO_FONT = 'JetBrainsMono';

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, rng, noise2D } = ctx;
    const margin = Math.round(width * 0.075);
    const strokes: SceneStroke[] = [];
    const texts: SceneText[] = [];
    const colorOf = authorColorer(ctx);

    // Newest first, because the surface is at the top.
    const buckets = timeBuckets(ctx, 40, 30).reverse();
    const total = Math.max(1, buckets.reduce((a, b) => a + b.count, 0));
    const peak = Math.max(1, ...buckets.map((b) => b.count));

    const colX = width * 0.3;
    const colW = width * 0.44;
    const top = height * 0.2;
    const bottom = height * 0.86;
    const colH = bottom - top;
    const minH = colH * 0.008;
    const flex = colH - minH * buckets.length;
    const phase = rng() * 50;
    const tilt = (rng() - 0.5) * colH * 0.05;

    // A layer boundary: gently folded, tilted, and unique to its depth.
    const boundary = (y: number, k: number): Vec2[] => {
        const pts: Vec2[] = [];
        const steps = 22;
        for (let s = 0; s <= steps; s++) {
            const u = s / steps;
            const wave = noise2D(u * 2.2 + phase, k * 0.31 + phase) * colH * 0.012;
            pts.push({ x: colX + u * colW, y: y + wave + (u - 0.5) * tilt });
        }
        return pts;
    };

    let y = top;
    let upper = boundary(y, 0);
    let labelEvery = Math.max(1, Math.round(buckets.length / 9));
    if (buckets.length <= 10) labelEvery = 1;
    let peakMid = top;

    buckets.forEach((b, i) => {
        const h = minH + (b.count / total) * flex;
        const lower = boundary(y + h, i + 1);
        const fill = b.count === 0 ? adjustLightness(palette.bg, palette.variant === 'dark' ? 0.06 : -0.06) : colorOf(b.lead);
        strokes.push(poly(`layer-${i}`, [...upper, ...[...lower].reverse()], fill));
        // Sediment lines inside thick layers.
        const seams = Math.min(5, Math.floor(h / (colH * 0.014)));
        for (let s = 1; s <= seams; s++) {
            const yy = y + (h * s) / (seams + 1);
            strokes.push(line(`seam-${i}-${s}`, boundary(yy, i + s * 0.21), withAlpha(palette.bg, 0.5), Math.max(0.5, width * 0.0009), 0.55));
        }
        if (b.count === peak) peakMid = y + h / 2;
        if (i % labelEvery === 0) {
            strokes.push(line(`tick-${i}`, [{ x: colX - width * 0.03, y }, { x: colX - width * 0.008, y }], palette.fgMuted, Math.max(0.6, width * 0.001)));
            texts.push(text(monthYear(b.endMs - 1), colX - width * 0.04, y + width * 0.0045, {
                font: fontStack(MONO_FONT), size: width * 0.014, weight: 500, color: palette.fgMuted, align: 'end', spacing: width * 0.001,
            }));
        }
        upper = lower;
        y += h;
    });

    // Casing: the tube the core was pulled in.
    const edge = Math.max(1, width * 0.0016);
    strokes.push(rect('case-l', colX - edge, top - colH * 0.012, edge, colH * 1.024, withAlpha(palette.fg, 0.7)));
    strokes.push(rect('case-r', colX + colW, top - colH * 0.012, edge, colH * 1.024, withAlpha(palette.fg, 0.7)));

    // Call-outs on the right: the surface, the thickest layer, bedrock.
    const noteX = colX + colW + width * 0.03;
    const note = (yy: number, head: string, body: string) => {
        strokes.push(line(`lead-${Math.round(yy)}`, [{ x: colX + colW + width * 0.006, y: yy }, { x: noteX - width * 0.006, y: yy }], palette.fgMuted, Math.max(0.6, width * 0.001)));
        texts.push(text(head, noteX, yy - width * 0.004, { font: fontStack(MONO_FONT), size: width * 0.014, weight: 600, color: palette.fg, spacing: width * 0.001 }));
        texts.push(text(body, noteX, yy + width * 0.014, { font: fontStack(MONO_FONT), size: width * 0.013, weight: 400, color: palette.fgMuted }));
    };
    note(top + colH * 0.004, 'SURFACE', monthYear(signals.lastCommitMs));
    if (buckets.length > 2 && Math.abs(peakMid - top) > colH * 0.07 && Math.abs(bottom - peakMid) > colH * 0.07) {
        note(peakMid, 'THICKEST', plural(peak, 'commit'));
    }
    note(bottom - colH * 0.004, 'BEDROCK', monthYear(signals.firstCommitMs));

    // Title block.
    const title = titleOf(ctx).toUpperCase();
    const titleSize = Math.min(width * 0.1, ((width - margin * 2) / Math.max(5, title.length)) * 2.1);
    texts.push(text(title, margin, margin + titleSize * 0.82, { font: fontStack(TITLE_FONT), size: titleSize, weight: 600, color: palette.fg, spacing: titleSize * 0.02 }));
    texts.push(text((options.subtitle || `Core sample, ${plural(buckets.length, 'layer')} deep`).toUpperCase(), margin, margin + titleSize * 0.82 + width * 0.034, {
        font: fontStack(MONO_FONT), size: width * 0.0152, weight: 500, color: palette.fgMuted, spacing: width * 0.0022,
    }));

    // Legend: who the colours are.
    const legendY = height - margin;
    let lx = margin;
    signals.rankedAuthors.slice(0, 5).forEach((a, i) => {
        const chip = width * 0.016;
        strokes.push(rect(`chip-${i}`, lx, legendY - chip * 0.92, chip, chip, colorOf(a.name)));
        const label = a.name.toUpperCase();
        texts.push(text(label, lx + chip * 1.45, legendY, { font: fontStack(MONO_FONT), size: width * 0.013, weight: 500, color: palette.fgMuted, spacing: width * 0.0008 }));
        lx += chip * 1.45 + label.length * width * 0.0083 + width * 0.028;
    });
    if (options.showWatermark) {
        // Above the title, so a long repo name cannot run into it.
        texts.push(text(CREDIT, width - margin, margin * 0.62, {
            font: fontStack(MONO_FONT), size: width * 0.013, weight: 600, color: withAlpha(palette.fg, 0.5), align: 'end', spacing: width * 0.004,
        }));
    }

    return {
        width,
        height,
        background: palette.variant === 'dark' ? { kind: 'solid', color: palette.bg, grain: 0.05 } : { kind: 'solid', color: palette.bg },
        strokes,
        edges: [],
        nodes: [],
        texts,
        fontsUsed: [TITLE_FONT, MONO_FONT],
    };
}

export const coreSampleTemplate: PosterTemplate = {
    id: 'core-sample',
    name: 'Core Sample',
    group: 'data',
    description: 'A drilled column of strata: one layer per month, coloured by who led it.',
    defaultAspect: 24 / 36,
    fonts: [TITLE_FONT, MONO_FONT],
    build,
};
