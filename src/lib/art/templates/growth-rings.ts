/**
 * Growth rings: the repo as a tree cross-section. One ring per week (or a wider
 * span for long histories); the gap to the next ring and the weight of the line
 * both grow with that span's commits, so busy seasons read as thick wood. The
 * busiest ring is drawn in the accent colour and year boundaries are labelled.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneStroke, SceneText, Vec2 } from '../scene';
import { fontStack } from '../fonts';
import { withAlpha } from '../palette';
import { line, plural, text, timeBuckets, titleOf } from './kit';
import { CREDIT } from '../../brand';

const TITLE_FONT = 'PlayfairDisplay';
const MONO_FONT = 'JetBrainsMono';

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, rng, noise2D } = ctx;
    const margin = Math.round(width * 0.075);
    const strokes: SceneStroke[] = [];
    const texts: SceneText[] = [];

    const buckets = timeBuckets(ctx, 96, 7);
    const total = Math.max(1, buckets.reduce((a, b) => a + b.count, 0));
    const peak = Math.max(1, ...buckets.map((b) => b.count));
    const busiest = buckets.findIndex((b) => b.count === peak);

    // The heart sits off-centre, as it does in real timber; the roll moves it.
    const maxR = Math.min(width * 0.44, height * 0.33);
    const cx = width / 2 + (rng() - 0.5) * maxR * 0.3;
    const cy = height * 0.43 + (rng() - 0.5) * maxR * 0.2;
    const squash = 0.9 + rng() * 0.16;
    const lean = rng() * Math.PI;
    const phase = rng() * 40;

    // Every ring gets a base gap so quiet weeks still leave a line.
    const base = total / Math.max(1, buckets.length) * 0.55;
    const span = total + base * buckets.length;
    let grown = 0;
    let lastYear = new Date(buckets[0]?.startMs ?? 0).getUTCFullYear();

    buckets.forEach((b, i) => {
        grown += b.count + base;
        const r = Math.max(2, (grown / span) * maxR);
        const pts: Vec2[] = [];
        const steps = 120;
        for (let k = 0; k < steps; k++) {
            const a = (k / steps) * Math.PI * 2;
            // Low-frequency wobble that drifts slowly from ring to ring, so
            // neighbours stay roughly parallel like real growth.
            const wob = 1 + 0.045 * noise2D(Math.cos(a) * 1.3 + phase, Math.sin(a) * 1.3 + i * 0.045);
            const rx = r * wob;
            const ry = r * wob * squash;
            const x = Math.cos(a) * rx;
            const y = Math.sin(a) * ry;
            pts.push({
                x: cx + x * Math.cos(lean) - y * Math.sin(lean),
                y: cy + x * Math.sin(lean) + y * Math.cos(lean),
            });
        }
        pts.push(pts[0]);
        const heat = b.count / peak;
        const isPeak = i === busiest && peak > 1;
        strokes.push(
            line(
                `ring-${i}`,
                pts,
                isPeak ? palette.accent : palette.fg,
                Math.max(0.6, width * (0.0007 + 0.0034 * heat)) * (isPeak ? 1.5 : 1),
                b.count === 0 ? 0.22 : 0.42 + 0.58 * heat
            )
        );

        const year = new Date(b.startMs).getUTCFullYear();
        if (year !== lastYear) {
            lastYear = year;
            texts.push(text(`${year}`, cx + r * 1.02 + width * 0.008, cy + width * 0.006, {
                font: fontStack(MONO_FONT), size: width * 0.014, weight: 500, color: palette.fgMuted,
            }));
        }
    });

    // Pith: the first commit.
    strokes.push({
        id: 'pith',
        points: Array.from({ length: 13 }, (_, k) => ({
            x: cx + Math.cos((k / 12) * Math.PI * 2) * width * 0.006,
            y: cy + Math.sin((k / 12) * Math.PI * 2) * width * 0.006,
        })),
        color: palette.accent2, width: 0, opacity: 1, closed: true, fill: palette.accent2,
    });

    const title = titleOf(ctx);
    const titleSize = Math.min(width * 0.085, (width - margin * 2) / Math.max(6, title.length) * 1.7);
    const baseY = height - margin - width * 0.06;
    texts.push(text(title, margin, baseY, { font: fontStack(TITLE_FONT), size: titleSize, weight: 400, color: palette.fg }));
    const perRing = buckets.length > 1 ? Math.round((buckets[0].endMs - buckets[0].startMs) / 86_400_000) : 7;
    const caption = options.subtitle
        || `${plural(buckets.length, 'ring')}, ${perRing === 7 ? 'one per week' : `one per ${perRing} days`}. ${plural(signals.commitCount, 'commit')} by ${plural(signals.authorCount, 'author')}.`;
    texts.push(text(caption.toUpperCase(), margin, baseY + width * 0.038, {
        font: fontStack(MONO_FONT), size: width * 0.0152, weight: 500, color: palette.fgMuted, spacing: width * 0.0022,
    }));
    if (options.showSignature && options.dateLabel) {
        texts.push(text(`CUT ${options.dateLabel.toUpperCase()}`, width - margin, baseY + width * 0.038, {
            font: fontStack(MONO_FONT), size: width * 0.0152, weight: 500, color: palette.fgMuted, align: 'end', spacing: width * 0.0022,
        }));
    }
    if (options.showWatermark) {
        texts.push(text(CREDIT, width - margin, margin, {
            font: fontStack(MONO_FONT), size: width * 0.013, weight: 600, color: withAlpha(palette.fg, 0.5), align: 'end', spacing: width * 0.004,
        }));
    }

    return {
        width,
        height,
        background: palette.variant === 'dark' ? { kind: 'solid', color: palette.bg, vignette: 0.18, grain: 0.05 } : { kind: 'solid', color: palette.bg },
        strokes,
        edges: [],
        nodes: [],
        texts,
        fontsUsed: [TITLE_FONT, MONO_FONT],
    };
}

export const growthRingsTemplate: PosterTemplate = {
    id: 'growth-rings',
    name: 'Growth rings',
    group: 'generative',
    description: 'Tree rings for your repo: one ring per week, thicker when more commits landed.',
    defaultAspect: 18 / 24,
    fonts: [TITLE_FONT, MONO_FONT],
    build,
};
