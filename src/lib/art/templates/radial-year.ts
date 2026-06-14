/**
 * Radial "Year in Code" spiral.
 *
 * Maps every commit to polar coordinates around the poster center: the ANGLE is
 * the commit's fractional position within its calendar year (Jan 1 at top,
 * sweeping clockwise like a clock), and the RADIUS grows one ring per year, so
 * the whole repo reads as a spiral of concentric year-rings. The most shareable
 * template: a record-label title sits in the eye of the spiral, faint guide
 * circles mark each year, and a caption carries the date range.
 *
 * Degrades gracefully: a single-year repo collapses to one ring of dots (a clock
 * face), and a churn-less / single-author repo still reads via uniform sizing and
 * a sequential time ramp.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneNode, SceneStroke, SceneText, Vec2 } from '../scene';
import { typeScale, formatDate, sampleNodes } from '../compose';
import { fontStack } from '../fonts';
import { withAlpha } from '../palette';

const TITLE_FONT = 'SpaceGrotesk';
const LABEL_FONT = 'JetBrainsMono';

const YEAR_MS = 1000 * 60 * 60 * 24 * 365.2425;
const TWO_PI = Math.PI * 2;

/** Fraction (0..1) of the way through the calendar year for a ms timestamp. */
function yearFraction(ms: number): number {
    const d = new Date(ms);
    const year = d.getUTCFullYear();
    const start = Date.UTC(year, 0, 1);
    const end = Date.UTC(year + 1, 0, 1);
    const span = end - start || YEAR_MS;
    const f = (ms - start) / span;
    return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
}

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, encoding, rng } = ctx;
    const cx = width / 2;
    const cy = height / 2;
    const margin = Math.round(width * 0.085);
    const scale = typeScale(width * 0.045, 1.25);
    const texts: SceneText[] = [];
    const strokes: SceneStroke[] = [];
    const sceneNodes: SceneNode[] = [];

    // Ring geometry. Reserve the inner ~16% radius for the record-label title and
    // keep an outer margin. With multiple years we space rings evenly across that
    // band; with a single year the gap is tiny so everything sits on one ring.
    // Clamp ring count so a forged far-future commit can't draw thousands of rings.
    const years = Math.min(80, Math.max(1, (signals.lastYear || 0) - (signals.firstYear || 0) + 1));
    const maxR = Math.max(10, Math.min(width, height) / 2 - margin);
    const innerR = maxR * 0.16;
    const usable = maxR - innerR;
    const ringGap = years > 1 ? usable / years : usable * 0.0;
    const baseR = years > 1 ? innerR + ringGap * 0.5 : innerR + usable * 0.62;

    // Author -> categorical index for dominant-author coloring.
    const authorIndex = new Map<string, number>();
    signals.rankedAuthors.forEach((a, i) => authorIndex.set(a.name, i));
    const authorCount = Math.max(1, signals.authorCount);

    const radiusForYear = (year: number): number => {
        const ring = years > 1 ? Math.max(0, Math.min(years - 1, year - signals.firstYear)) : 0;
        return baseR + ring * ringGap;
    };

    // ---- Year guide rings + tiny year labels at the top of each ring ----------
    if (years > 1) {
        for (let i = 0; i < years; i++) {
            const yr = signals.firstYear + i;
            const r = radiusForYear(yr);
            strokes.push(ringStroke(`ring-${yr}`, cx, cy, r, withAlpha(palette.fgMuted, 0.18)));
            texts.push(text(`${yr}`, cx, cy - r - scale(-3.4) * 0.4, {
                font: fontStack(LABEL_FONT), size: scale(-3.4), weight: 500,
                color: withAlpha(palette.fgMuted, 0.85), align: 'middle', spacing: width * 0.001,
            }));
        }
    } else {
        // Single year: one ring + four "clock" tick rings of equal radius is
        // overkill, so just draw the one guide ring and its year label.
        const yr = signals.firstYear || signals.lastYear || 0;
        strokes.push(ringStroke('ring-solo', cx, cy, baseR, withAlpha(palette.fgMuted, 0.2)));
        if (yr) {
            texts.push(text(`${yr}`, cx, cy - baseR - scale(-3.2) * 0.5, {
                font: fontStack(LABEL_FONT), size: scale(-3.2), weight: 500,
                color: withAlpha(palette.fgMuted, 0.85), align: 'middle', spacing: width * 0.0015,
            }));
        }
    }

    // ---- One node per commit at its polar position ---------------------------
    const baseRadius = Math.max(2.2, Math.min(width, height) / 220);
    const colorByAuthor = encoding.hue !== 'time';
    // For short repos (< ~1 year) the year-fraction angle would bunch every
    // commit into one tiny arc; spread by fraction-of-span instead so a two-week
    // repo reads as a full clock of dots rather than a lopsided cluster.
    const useSpanAngle = signals.timeSpanMs > 0 && signals.timeSpanMs < YEAR_MS * 0.92;
    const { kept } = sampleNodes(ctx.nodes, ctx.graph.defaultHead, 1200);
    for (const n of kept) {
        const t = n.commit.authoredAt;
        const year = Number.isFinite(t) ? new Date(t).getUTCFullYear() : signals.firstYear;
        const frac = !Number.isFinite(t)
            ? (Number.isFinite(n.t) ? n.t : 0.5)
            : useSpanAngle
                ? Math.max(0, Math.min(1, (t - signals.firstCommitMs) / (signals.timeSpanMs || 1)))
                : yearFraction(t);
        // Jan 1 at top (12 o'clock), sweeping clockwise.
        const theta = -Math.PI / 2 + frac * TWO_PI;
        const ringR = radiusForYear(year);
        // Tiny deterministic radial jitter so same-day commits don't fully stack.
        const jitter = (rng() - 0.5) * (years > 1 ? ringGap * 0.34 : usable * 0.18);
        const r = clamp(ringR + jitter, innerR * 0.5, maxR + 2);
        const p: Vec2 = { x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r };

        const churn = (n.commit.stats?.additions ?? 0) + (n.commit.stats?.deletions ?? 0);
        const churnNorm = signals.maxChurn > 0 ? Math.min(1, churn / signals.maxChurn) : 0;
        const radius = signals.hasChurn
            ? baseRadius * (0.7 + 1.7 * churnNorm) * encoding.sizeScale
            : baseRadius * 1.1 * encoding.sizeScale;

        const fill = colorByAuthor
            ? palette.categoryColor(authorIndex.get(n.commit.authorName) ?? 0, authorCount)
            : palette.sequential(Number.isFinite(n.t) ? n.t : 0.5);
        const kind = n.commit.parents.length === 0 ? 'root'
            : n.commit.parents.length > 1 ? 'merge' : 'normal';

        sceneNodes.push({
            id: n.id,
            x: clamp(p.x, 0, width),
            y: clamp(p.y, 0, height),
            r: radius,
            fill,
            stroke: withAlpha(palette.bg, 0.7),
            strokeWidth: Math.max(0.4, radius * 0.16),
            shape: kind === 'merge' ? 'diamond' : 'circle',
            opacity: 0.94,
            glow: encoding.glow * (kind === 'merge' ? 1 : 0.6),
            sha: n.id.slice(0, 7),
            kind,
        });
    }

    // ---- Record-label title in the eye of the spiral -------------------------
    const labelTitle = (options.title || options.repoName || 'repository').toString().toUpperCase();
    const labelSize = Math.min(scale(-0.4), innerR * 0.9);
    texts.push(text(truncateMiddle(labelTitle, 18), cx, cy + labelSize * 0.34, {
        font: fontStack(TITLE_FONT), size: labelSize, weight: 700,
        color: palette.fg, align: 'middle', spacing: width * 0.001,
    }));
    texts.push(text('A YEAR IN CODE', cx, cy - labelSize * 0.7, {
        font: fontStack(LABEL_FONT), size: scale(-4), weight: 500,
        color: palette.accent, align: 'middle', spacing: width * 0.006,
    }));

    // ---- Caption: date range + headline stats, bottom-center -----------------
    const range = signals.timeSpanMs > 0
        ? `${formatDate(signals.firstCommitMs)} — ${formatDate(signals.lastCommitMs)}`.toUpperCase()
        : (signals.firstYear ? `${signals.firstYear}` : '');
    if (range) {
        texts.push(text(range, cx, height - margin, {
            font: fontStack(LABEL_FONT), size: scale(-2.6), weight: 500,
            color: palette.fg, align: 'middle', spacing: width * 0.003,
        }));
    }
    texts.push(text(
        `${signals.commitCount} COMMITS · ${signals.authorCount} AUTHORS · ${years} ${years === 1 ? 'YEAR' : 'YEARS'}`,
        cx, height - margin + scale(-2.6) * 1.5, {
            font: fontStack(LABEL_FONT), size: scale(-3.6), weight: 500,
            color: withAlpha(palette.fgMuted, 0.9), align: 'middle', spacing: width * 0.004,
        }));

    if (options.showWatermark) {
        texts.push(text('GITSONAR.COM', cx, margin, {
            font: fontStack(LABEL_FONT), size: scale(-3.6), weight: 600,
            color: withAlpha(palette.fg, 0.5), align: 'middle', spacing: width * 0.006,
        }));
    }

    return {
        width,
        height,
        background: { kind: 'solid', color: palette.bg, vignette: 0.32 },
        strokes,
        edges: [],
        nodes: sceneNodes,
        texts,
        fontsUsed: [TITLE_FONT, LABEL_FONT],
    };
}

/** Build a closed-circle guide ring as a polyline (renderer-agnostic). */
function ringStroke(id: string, cx: number, cy: number, r: number, color: string): SceneStroke {
    const segs = 96;
    const points: Vec2[] = [];
    for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * TWO_PI;
        points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return { id, points, color, width: 1, opacity: 1, closed: true, smooth: true };
}

function clamp(n: number, lo: number, hi: number): number {
    return n < lo ? lo : n > hi ? hi : n;
}

/** Shorten a label keeping head + tail, for the small record-label center. */
function truncateMiddle(s: string, max: number): string {
    if (s.length <= max) return s;
    const head = Math.ceil((max - 1) / 2);
    return `${s.slice(0, head)}…${s.slice(s.length - (max - 1 - head))}`;
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

export const radialYearTemplate: PosterTemplate = {
    id: 'radial-year',
    name: 'Year in Code',
    group: 'generative',
    description: 'A radial spiral of commits — one concentric ring per year, dotted around a record-label title.',
    defaultAspect: 1,
    recommendedLayout: 'radial',
    fonts: [TITLE_FONT, LABEL_FONT],
    build,
};
