/**
 * Constellation star-map.
 *
 * Renders the commit history as a night sky: each commit is a star scattered
 * (deterministically, via ctx.rng) across an upper key-art panel, brightness and
 * size driven by churn when present and uniform otherwise. Parent→child links
 * become faint "constellation" lines, and a sprinkle of tiny background dust
 * fills the void. Flatters small/medium repos — it reads beautifully with as few
 * as three commits because empty sky is the point, not a flaw.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneText, SceneNode, SceneEdge, Vec2 } from '../scene';
import { typeScale, formatDate, type Box, inset, sampleNodes } from '../compose';
import { fontStack } from '../fonts';
import { withAlpha, adjustLightness } from '../palette';
import { rangeOf } from '../rng';

const TITLE_FONT = 'Cormorant';
const SUB_FONT = 'PlayfairDisplay';
const MONO_FONT = 'JetBrainsMono';

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, edges, rng, encoding } = ctx;
    // Cap stars so a huge repo stays a legible sky (and the SVG stays light).
    const { kept: nodes } = sampleNodes(ctx.nodes, ctx.graph.defaultHead, 900);
    const margin = Math.round(width * 0.085);
    const texts: SceneText[] = [];
    const scale = typeScale(width * 0.05, 1.25);

    // Sky panel: top ~72%, leaving an airy lower band for the title + caption.
    const sky: Box = inset(
        { x: 0, y: 0, w: width, h: height * 0.74 },
        { t: margin, r: margin, b: margin * 0.5, l: margin }
    );

    // --- Place each commit as a star via a seeded, jittered scatter ----------
    // A loose horizontal-band layout (time → x, lane/jitter → y) keeps a sense
    // of chronology while jitter dissolves any grid into a sky.
    const starBase = Math.max(2.2, Math.min(sky.w, sky.h) / 95);
    const maxLane = nodes.reduce((m, n) => Math.max(m, n.lane), 0);
    const placed = new Map<string, Vec2>();
    const stars: SceneNode[] = [];

    for (const n of nodes) {
        const t = Number.isFinite(n.t) ? n.t : 0.5;
        // Lay time left→right; spread lanes vertically, then jitter both axes.
        const laneT = maxLane > 0 ? n.lane / maxLane : 0.5;
        const jx = ctx.noise2D(t * 6, n.lane * 1.7) * 0.06;
        const jy = (rng() - 0.5) * 0.5;
        const px = sky.x + sky.w * clamp01(0.06 + t * 0.88 + jx);
        const py = sky.y + sky.h * clamp01(0.12 + laneT * 0.5 + 0.25 + jy * 0.4);
        placed.set(n.id, { x: px, y: py });

        // Brightness/size from churn when available, otherwise gentle variation.
        const add = n.commit.stats?.additions ?? 0;
        const del = n.commit.stats?.deletions ?? 0;
        const churn = add + del;
        const bright = signals.hasChurn && signals.maxChurn > 0
            ? 0.35 + 0.65 * Math.min(1, churn / signals.maxChurn)
            : 0.45 + 0.4 * rng();
        const r = starBase * (0.7 + 1.7 * bright) * encoding.sizeScale;
        const isMerge = n.commit.parents.length > 1;
        const isRoot = n.commit.parents.length === 0;

        stars.push({
            id: n.id,
            x: px,
            y: py,
            r,
            // Time-tinted star color: older = accent2, newer = accent.
            fill: isMerge ? palette.accent2 : palette.sequential(t),
            shape: isRoot ? 'diamond' : isMerge ? 'star' : 'circle',
            opacity: 0.7 + 0.3 * bright,
            glow: bright > 0.7 ? Math.min(1, encoding.glow + bright * 0.5) : encoding.glow * 0.4,
            sha: n.id.slice(0, 7),
            kind: isRoot ? 'root' : isMerge ? 'merge' : 'normal',
        });
    }

    // Brighten the newest commit (HEAD) into the lead star.
    if (stars.length) {
        const head = stars[stars.length - 1];
        head.fill = palette.accent;
        head.r *= 1.45;
        head.glow = 1;
        head.shape = 'star';
    }

    // --- Constellation lines: faint parent→child connectors -----------------
    const sceneEdges: SceneEdge[] = [];
    for (const e of edges) {
        const from = placed.get(e.from);
        const to = placed.get(e.to);
        if (!from || !to) continue;
        sceneEdges.push({
            id: `c-${e.from}->${e.to}`,
            points: [from, to],
            color: withAlpha(palette.fg, e.isMerge ? 0.34 : 0.22),
            width: (e.isMerge ? 1.0 : 0.7) * encoding.weightScale,
            opacity: e.isMerge ? 0.85 : 0.7,
            merge: e.isMerge,
            curve: 'line',
        });
    }

    // --- Dust: tiny low-opacity filler stars across the whole sky -----------
    // Count scales gently with poster area and the density slider; deterministic.
    const dustCount = Math.round(90 + sky.w * sky.h * 0.00016 * encoding.densityAmount);
    for (let i = 0; i < dustCount; i++) {
        const dx = sky.x + rng() * sky.w;
        const dy = sky.y + rng() * sky.h;
        const dr = rangeOf(rng, 0.4, 1.4);
        stars.push({
            id: `dust-${i}`,
            x: dx,
            y: dy,
            r: dr,
            fill: withAlpha(palette.fg, rangeOf(rng, 0.12, 0.4)),
            shape: 'circle',
            opacity: 1,
            kind: 'normal',
        });
    }

    // --- Title + caption in the lower band ----------------------------------
    const title = (options.title || options.repoName || 'Untitled').toString();
    const titleSize = title.length > 22 ? scale(1.0) : scale(1.7);
    const titleY = height * 0.84;
    texts.push(text(title, width / 2, titleY, {
        font: fontStack(TITLE_FONT), size: titleSize, weight: 600, color: palette.fg, align: 'middle', spacing: width * 0.003,
    }));

    // Subtitle / tagline in italic-feel serif.
    const tagline = options.subtitle || defaultTagline(signals);
    if (tagline) {
        texts.push(text(tagline, width / 2, titleY + titleSize * 0.78, {
            font: fontStack(SUB_FONT), size: scale(-1.4), weight: 400, color: palette.accent, align: 'middle', spacing: width * 0.002,
        }));
    }

    // Caption: commit count + date range, mono, understated.
    const caption: string[] = [`${signals.commitCount} STARS`];
    if (signals.authorCount > 0) caption.push(`${signals.authorCount} HANDS`);
    if (signals.timeSpanMs > 0) {
        caption.push(`${formatDate(signals.firstCommitMs)} — ${formatDate(signals.lastCommitMs)}`.toUpperCase());
    }
    texts.push(text(caption.join('   ·   '), width / 2, height - margin, {
        font: fontStack(MONO_FONT), size: scale(-3), weight: 500, color: withAlpha(palette.fgMuted, 0.85), align: 'middle', spacing: width * 0.003,
    }));

    if (options.showWatermark) {
        texts.push(text('GITSONAR.COM', width / 2, margin * 0.85, {
            font: fontStack(MONO_FONT), size: scale(-3.4), weight: 600, color: withAlpha(palette.fgMuted, 0.55), align: 'middle', spacing: width * 0.006,
        }));
    }

    return {
        width,
        height,
        background: {
            kind: 'gradient',
            // Deep night sky: a touch lighter at center, dark at the rim.
            color: adjustLightness(palette.bg, 0.03),
            color2: adjustLightness(palette.bg, -0.04),
            angle: 90,
            vignette: 0.55,
            grain: 0.04,
        },
        strokes: [],
        edges: sceneEdges,
        nodes: stars,
        texts,
        fontsUsed: [TITLE_FONT, SUB_FONT, MONO_FONT],
    };
}

/** A short fallback tagline when no subtitle is supplied. */
function defaultTagline(signals: { commitCount: number; timeSpanMs: number }): string {
    const years = signals.timeSpanMs / (1000 * 60 * 60 * 24 * 365);
    if (years >= 1) {
        const y = Math.round(years);
        return `A constellation charted over ${y} year${y === 1 ? '' : 's'}`;
    }
    return 'A map of every commit';
}

function clamp01(n: number): number {
    return !Number.isFinite(n) ? 0.5 : n < 0 ? 0 : n > 1 ? 1 : n;
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

export const constellationTemplate: PosterTemplate = {
    id: 'constellation',
    name: 'Constellation',
    group: 'generative',
    description: 'A night-sky star-map of commits with faint constellation links — flatters small and medium repos.',
    defaultAspect: 16 / 20,
    recommendedLayout: 'vertical',
    fonts: [TITLE_FONT, SUB_FONT, MONO_FONT],
    build,
};
