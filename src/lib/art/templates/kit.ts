/**
 * Small shared kit for the data-drawn templates (rings, transit, core sample,
 * weave, punch card, receipt): scene primitives and time bucketing.
 */

import type { TemplateContext } from '../template';
import type { SceneStroke, SceneText, Vec2 } from '../scene';

const DAY_MS = 86_400_000;

export interface TextOpts {
    font: string;
    size: number;
    weight: number;
    color: string;
    align?: 'start' | 'middle' | 'end';
    spacing?: number;
    opacity?: number;
    rotate?: number;
}

let textSerial = 0;

export function text(str: string, x: number, y: number, o: TextOpts): SceneText {
    return {
        id: `t${textSerial++ % 1_000_000}-${Math.round(x)}-${Math.round(y)}`,
        x,
        y,
        text: str,
        fontFamily: o.font,
        fontSize: o.size,
        fontWeight: o.weight,
        color: o.color,
        align: o.align ?? 'start',
        letterSpacing: o.spacing,
        opacity: o.opacity,
        rotate: o.rotate,
    };
}

/** A filled polygon (no outline unless `stroke` is given). */
export function poly(id: string, points: Vec2[], fill: string, stroke?: { color: string; width: number }, opacity = 1): SceneStroke {
    return {
        id,
        points,
        color: stroke?.color ?? fill,
        width: stroke?.width ?? 0,
        opacity,
        closed: true,
        fill,
    };
}

export function rect(id: string, x: number, y: number, w: number, h: number, fill: string, opacity = 1): SceneStroke {
    return poly(id, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], fill, undefined, opacity);
}

/** An open polyline. */
export function line(id: string, points: Vec2[], color: string, width: number, opacity = 1, smooth = false): SceneStroke {
    return { id, points, color, width, opacity, smooth };
}

export function titleOf(ctx: TemplateContext): string {
    return (ctx.options.title || ctx.options.repoName || 'repository').toString();
}

export interface TimeBucket {
    startMs: number;
    endMs: number;
    count: number;
    /** Author with the most commits in this bucket ('' when empty). */
    lead: string;
}

/**
 * Split the repo's lifetime into at most `maxBuckets` equal spans of at least
 * `minDays` each, counting commits and the leading author in each.
 */
export function timeBuckets(ctx: TemplateContext, maxBuckets: number, minDays: number): TimeBucket[] {
    const { signals, graph } = ctx;
    const spanDays = Math.max(1, Math.ceil(signals.timeSpanMs / DAY_MS) + 1);
    const days = Math.max(minDays, Math.ceil(spanDays / Math.max(1, maxBuckets)));
    const n = Math.max(1, Math.min(maxBuckets, Math.ceil(spanDays / days)));
    const size = days * DAY_MS;
    const counts = new Array<number>(n).fill(0);
    const authors: Map<string, number>[] = Array.from({ length: n }, () => new Map());

    for (const c of graph.commits.values()) {
        if (!Number.isFinite(c.authoredAt)) continue;
        const i = Math.max(0, Math.min(n - 1, Math.floor((c.authoredAt - signals.firstCommitMs) / size)));
        counts[i]++;
        authors[i].set(c.authorName, (authors[i].get(c.authorName) ?? 0) + 1);
    }

    return counts.map((count, i) => {
        let lead = '';
        let best = 0;
        for (const [name, k] of authors[i]) {
            if (k > best) {
                best = k;
                lead = name;
            }
        }
        const startMs = signals.firstCommitMs + i * size;
        return { startMs, endMs: startMs + size, count, lead };
    });
}

/** Colour for an author by their rank, stable across templates. */
export function authorColorer(ctx: TemplateContext): (name: string) => string {
    const { signals, palette } = ctx;
    const rank = new Map<string, number>();
    signals.rankedAuthors.forEach((a, i) => rank.set(a.name, i));
    // Beyond the first dozen, colours repeat; the eye cannot separate more anyway.
    const total = Math.max(2, Math.min(12, signals.authorCount));
    return (name) => palette.categoryColor((rank.get(name) ?? 0) % total, total);
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function monthYear(ms: number): string {
    const d = new Date(ms);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function shortDate(ms: number): string {
    const d = new Date(ms);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
}

export function plural(n: number, word: string): string {
    return `${n.toLocaleString('en-US')} ${n === 1 ? word : `${word}s`}`;
}
