/**
 * Flow Field (Fidenza-style).
 *
 * A noise-driven vector field traced by many curved particle paths. Each commit
 * seeds a particle at a position derived from (t, lane); it walks the field for
 * tens of steps, turning by the local noise angle, and is recorded as a smooth
 * SceneStroke. Stroke weight reads churn, hue reads author, opacity stays low so
 * the MANY overlapping ribbons build richness. Tiny / single-author / churn-free
 * repos still bloom because we top up with rng-seeded extra particles to a floor
 * of ~150 strokes. Pure generative: ctx.rng + ctx.noise2D only, fully deterministic.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneStroke, SceneText, Vec2 } from '../scene';
import { typeScale, formatDate, sampleNodes } from '../compose';
import { fontStack } from '../fonts';
import { withAlpha, adjustLightness } from '../palette';

const TITLE_FONT = 'Syne';
const CREDIT_FONT = 'JetBrainsMono';

const TAU = Math.PI * 2;
/** Floor on stroke count so even a 1-commit repo reads as a field. */
const MIN_STROKES = 160;

interface Seed {
    /** Normalized seed position in [0,1]^2 (pre-margin). */
    u: number;
    v: number;
    /** 0..1 churn for width, author hue index, and whether it's a real commit. */
    churn: number;
    authorIdx: number;
}

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, encoding, rng, noise2D, options } = ctx;

    // Generous margins keep ribbons off the edges and reserve negative space.
    const margin = Math.round(Math.min(width, height) * 0.085);
    const left = margin;
    const top = margin;
    const right = width - margin;
    const bottom = height - margin;
    const innerW = right - left;
    const innerH = bottom - top;

    // Field frequency scales with canvas so curl reads the same at any size.
    const freq = (0.0016 + 0.0022 * encoding.turbulence) / Math.max(1, Math.min(width, height) / 1000);
    const turbAmp = 1 + 1.4 * encoding.turbulence;
    const stepLen = Math.max(2, Math.min(width, height) * 0.006);
    const maxChurn = Math.max(1, signals.maxChurn);
    const authorCount = Math.max(1, signals.authorCount);

    // Map each ranked author to a stable index for hue assignment.
    const authorIndex = new Map<string, number>();
    signals.rankedAuthors.forEach((a, i) => authorIndex.set(a.name, i));

    // --- Build particle seeds -------------------------------------------------
    const seeds: Seed[] = [];

    // 1) One seed per commit, placed by (t, lane) so the artwork still encodes
    //    the repo's shape: time runs left→right, lanes spread vertically. Cap the
    //    particle count so a huge repo doesn't trace thousands of heavy paths.
    const { kept: seedNodes } = sampleNodes(ctx.nodes, ctx.graph.defaultHead, 600);
    const maxLane = seedNodes.reduce((m, n) => Math.max(m, n.lane), 0);
    for (const n of seedNodes) {
        const add = n.commit.stats?.additions ?? 0;
        const del = n.commit.stats?.deletions ?? 0;
        const churn = signals.hasChurn ? Math.min(1, (add + del) / maxChurn) : 0;
        const t = Number.isFinite(n.t) ? n.t : 0.5;
        const laneU = maxLane > 0 ? n.lane / maxLane : 0.5;
        seeds.push({
            u: t,
            // Spread lanes across the vertical band, jittered by noise for organic feel.
            v: 0.12 + 0.76 * laneU + 0.06 * noise2D(t * 7, laneU * 7),
            churn,
            authorIdx: authorIndex.get(n.commit.authorName) ?? 0,
        });
    }

    // 2) Top up with rng-seeded extra particles so the field is always lush.
    //    densityAmount (0.05..1) scales how far above the floor we go.
    const desired = Math.max(
        MIN_STROKES,
        Math.round(seeds.length * (1 + 2.5 * encoding.densityAmount)) + Math.round(140 * encoding.densityAmount)
    );
    while (seeds.length < desired) {
        seeds.push({
            u: rng(),
            v: rng(),
            churn: signals.hasChurn ? rng() * 0.5 : 0,
            // Borrow the existing author palette spread so extras stay on-brand.
            authorIdx: Math.floor(rng() * authorCount),
        });
    }

    // --- Trace each seed through the flow field -------------------------------
    const strokes: SceneStroke[] = [];
    const baseW = Math.max(1, Math.min(width, height) * 0.0022) * encoding.weightScale;

    for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i];
        let x = left + clamp01(seed.u) * innerW;
        let y = top + clamp01(seed.v) * innerH;

        // Per-particle step budget: real commits walk longer than rng fillers.
        const steps = 80 + Math.floor((40 + seed.churn * 120) * (1 + 0.4 * (noise2D(x * freq, y * freq) + 1)));
        const pts: Vec2[] = [{ x, y }];

        for (let s = 0; s < Math.min(200, steps); s++) {
            const angle = noise2D(x * freq, y * freq) * TAU * turbAmp;
            x += Math.cos(angle) * stepLen;
            y += Math.sin(angle) * stepLen;
            // Stop cleanly at the margins rather than clamping into a wall.
            if (x < left || x > right || y < top || y > bottom) break;
            pts.push({ x, y });
        }
        if (pts.length < 4) continue; // skip stubs

        // Hue: per-author categorical, nudged along the ramp by position for depth.
        const author = palette.categoryColor(seed.authorIdx, authorCount);
        const tinted = adjustLightness(author, (noise2D(seed.u * 3, seed.v * 3)) * 0.06);

        // Width from churn; opacity low so overlaps accumulate into richness.
        const width2 = baseW * (0.7 + 2.6 * seed.churn);
        const opacity = 0.25 + 0.32 * (1 - seed.churn) * (0.6 + 0.4 * rng());

        strokes.push({
            id: `flow-${i}`,
            points: pts,
            color: tinted,
            width: width2,
            opacity: Math.min(0.62, opacity),
            smooth: true,
        });
    }

    // --- Minimal elegant typography -------------------------------------------
    const texts: SceneText[] = [];
    const scale = typeScale(width * 0.05, 1.25);

    // Title — bottom-left, sitting in the reserved margin band.
    const title = (options.title || options.repoName || 'flow field').toString();
    texts.push(text(title.toUpperCase(), left, bottom + scale(-1.2), {
        font: fontStack(TITLE_FONT), size: scale(0.2), weight: 700,
        color: palette.fg, align: 'start', spacing: width * 0.004,
    }));

    // Subtitle / tagline directly under the title.
    const tagline = options.subtitle
        || `${signals.commitCount} commits · ${signals.authorCount} authors`;
    texts.push(text(tagline, left, bottom + scale(-1.2) + scale(-1.6), {
        font: fontStack(CREDIT_FONT), size: scale(-2.6), weight: 400,
        color: palette.fgMuted, align: 'start', spacing: width * 0.002,
    }));

    // Thin credit line — bottom-right, mirrors the title baseline.
    const credit = signals.timeSpanMs > 0
        ? `${formatDate(signals.firstCommitMs)} — ${formatDate(signals.lastCommitMs)}`.toUpperCase()
        : 'GENERATIVE FLOW FIELD';
    texts.push(text(credit, right, bottom + scale(-1.2), {
        font: fontStack(CREDIT_FONT), size: scale(-2.8), weight: 400,
        color: palette.fgMuted, align: 'end', spacing: width * 0.003,
    }));

    if (options.showWatermark) {
        texts.push(text('GITSONAR.COM', right, top, {
            font: fontStack(CREDIT_FONT), size: scale(-3.2), weight: 500,
            color: withAlpha(palette.fg, 0.45), align: 'end', spacing: width * 0.005,
        }));
    }

    return {
        width,
        height,
        background: {
            kind: 'gradient',
            color: palette.bg,
            color2: adjustLightness(palette.bg, palette.variant === 'dark' ? 0.03 : -0.03),
            angle: 155,
            vignette: 0.4,
            grain: 0.05,
        },
        strokes,
        edges: [],
        nodes: [],
        texts,
        fontsUsed: [TITLE_FONT, CREDIT_FONT],
    };
}

function clamp01(n: number): number {
    return n < 0 ? 0 : n > 1 ? 1 : n;
}

function text(
    str: string,
    x: number,
    y: number,
    o: { font: string; size: number; weight: number; color: string; align: 'start' | 'middle' | 'end'; spacing?: number }
): SceneText {
    return {
        id: `t-${Math.round(x)}-${Math.round(y)}-${str.slice(0, 6)}`,
        x, y, text: str,
        fontFamily: o.font, fontSize: o.size, fontWeight: o.weight, color: o.color, align: o.align,
        letterSpacing: o.spacing,
    };
}

export const flowFieldTemplate: PosterTemplate = {
    id: 'flow-field',
    name: 'Flow Field',
    group: 'generative',
    description: 'Fidenza-style noise field traced by hundreds of curved commit ribbons, colored by author and weighted by churn.',
    defaultAspect: 24 / 36,
    recommendedLayout: 'vertical',
    fonts: [TITLE_FONT, CREDIT_FONT],
    build,
};
