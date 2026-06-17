/**
 * Composition toolkit shared by every template: grids, modular type scale,
 * focal anchors, the auto-generated billing block, and the encoding-driven
 * "key-art" graph builder that turns commits into placed, colored, sized glyphs.
 */

import type { PositionedNode } from '@lib/git/types';
import type { GlyphShape, SceneEdge, SceneNode, Vec2 } from './scene';
import type { TemplateContext } from './template';
import { createPositioner, type LayoutMode } from './layout';
import { withAlpha } from './palette';

export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Modular type scale: returns the font size `step` steps from `base`. */
export function typeScale(base: number, ratio = 1.25) {
    return (step: number): number => base * Math.pow(ratio, step);
}

/** Rule-of-thirds / golden focal anchors within a box. */
export function focalAnchor(box: Box, kind: 'thirds' | 'golden' = 'thirds'): Vec2 {
    if (kind === 'golden') {
        return { x: box.x + box.w * 0.382, y: box.y + box.h * 0.382 };
    }
    return { x: box.x + box.w * (2 / 3), y: box.y + box.h * (1 / 3) };
}

/** Inset a box by uniform margin (or per-side). */
export function inset(box: Box, m: number | { t: number; r: number; b: number; l: number }): Box {
    const s = typeof m === 'number' ? { t: m, r: m, b: m, l: m } : m;
    return { x: box.x + s.l, y: box.y + s.t, w: box.w - s.l - s.r, h: box.h - s.t - s.b };
}

/** Split a box into a top key-art region and a bottom text region. */
export function splitVertical(box: Box, topFraction: number): [Box, Box] {
    const topH = box.h * topFraction;
    return [
        { x: box.x, y: box.y, w: box.w, h: topH },
        { x: box.x, y: box.y + topH, w: box.w, h: box.h - topH },
    ];
}

/** Fit a set of points into a target box (uniform scale, centered). */
export function fitter(points: Vec2[], box: Box, pad = 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX)) {
        minX = 0; minY = 0; maxX = 1; maxY = 1;
    }
    const cw = Math.max(1, maxX - minX);
    const ch = Math.max(1, maxY - minY);
    const inner = inset(box, pad);
    const scale = Math.min(inner.w / cw, inner.h / ch);
    const offsetX = inner.x + (inner.w - cw * scale) / 2 - minX * scale;
    const offsetY = inner.y + (inner.h - ch * scale) / 2 - minY * scale;
    return {
        scale,
        apply: (p: Vec2): Vec2 => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY }),
    };
}

function glyphFor(node: PositionedNode): GlyphShape {
    if (node.commit.parents.length === 0) return 'diamond';
    if (node.commit.parents.length > 1) return 'hexagon';
    return 'circle';
}

/** Build a 0..1 churn norm for a node given the max churn in the repo. */
function churnNorm(node: PositionedNode, maxChurn: number): number {
    if (maxChurn <= 0) return 0;
    const add = node.commit.stats?.additions ?? 0;
    const del = node.commit.stats?.deletions ?? 0;
    return Math.min(1, (add + del) / maxChurn);
}

export interface GraphSceneOptions {
    layout: LayoutMode;
    box: Box;
    /** Base node radius before encoding scale. */
    baseRadius?: number;
    /** Padding inside the box when fitting. */
    fitPadding?: number;
    /** Draw edges (off for pure point-cloud templates). */
    edges?: boolean;
    /** Max nodes to draw before time-stratified downsampling (default 800). */
    nodeBudget?: number;
}

/**
 * The encoding-driven key-art builder: positions commits with the shared
 * layout engine, maps git signals to color/size/glyph per the encoding config,
 * and fits everything into `box`. Returns Scene nodes + edges.
 */
export function buildGraphScene(
    ctx: TemplateContext,
    opts: GraphSceneOptions
): GraphScene {
    const { nodes, edges, signals, palette, encoding } = ctx;
    const { layout, box } = opts;
    const baseRadius = opts.baseRadius ?? Math.max(3, Math.min(box.w, box.h) / 90);
    const drawEdges = opts.edges ?? true;

    if (nodes.length === 0) return { nodes: [], edges: [], sampledFrom: 0 };

    // Downsample huge repos so the key art reads as art (not a solid bar) and the
    // exported SVG stays light/embeddable. Keeps roots, merges, HEAD and the
    // highest-churn commits, then fills the budget with an even time stratification.
    const budget = opts.nodeBudget ?? 800;
    const { kept: srcNodes, total: sampledFrom } = downsampleNodes(nodes, ctx.graph.defaultHead, budget);
    const keepSet = new Set(srcNodes.map((n) => n.id));

    const laneWidth = 120;
    const rowHeight = 70;
    const positioner = createPositioner(srcNodes, {
        layoutMode: layout,
        laneWidth,
        rowHeight,
        paddingLeft: 0,
        paddingTop: 0,
    });

    // World positions.
    const world = new Map<string, Vec2>();
    for (const n of srcNodes) world.set(n.id, positioner.getPos(n));

    // Organic spread for near-linear repos (the most common shape): a 1-2 lane
    // history would otherwise fit to a hairline column. Bend it into a flowing
    // serpentine ribbon (seeded, deterministic) that fills the box.
    const lowLane = positioner.maxLane <= 1 && (layout === 'vertical' || layout === 'horizontal');
    if (lowLane && srcNodes.length > 2) {
        const amp = laneWidth * 3.4;
        const turns = Math.max(1.5, Math.min(4.5, srcNodes.length / 14));
        srcNodes.forEach((n, i) => {
            const w = world.get(n.id)!;
            const tt = i / (srcNodes.length - 1);
            const wobble = Math.sin(tt * Math.PI * turns) * amp + ctx.noise2D(tt * 2.5, 0.37) * amp * 0.45;
            if (layout === 'vertical') w.x += wobble; else w.y += wobble;
        });
    }

    const fit = fitter([...world.values()], box, opts.fitPadding ?? 0);
    const placed = new Map<string, Vec2>();
    for (const [id, p] of world) placed.set(id, fit.apply(p));

    const totalLanes = positioner.maxLane + 1;
    const authorIndex = new Map<string, number>();
    signals.rankedAuthors.forEach((a, i) => authorIndex.set(a.name, i));
    const authorCount = Math.max(1, signals.authorCount);
    const nodeById = new Map<string, PositionedNode>(srcNodes.map((n) => [n.id, n]));
    // URL-imported repos carry no churn → the churn channel would flatten every
    // dot. Fall back to recency so size still varies.
    const sizeMode = encoding.size === 'churn' && !signals.hasChurn ? 'recency' : encoding.size;

    const colorFor = (n: PositionedNode): string => {
        switch (encoding.hue) {
            case 'lane':
                return palette.categoryColor(n.lane, totalLanes);
            case 'time':
                return palette.sequential(Number.isFinite(n.t) ? n.t : 0.5);
            case 'churn': {
                const add = n.commit.stats?.additions ?? 0;
                const del = n.commit.stats?.deletions ?? 0;
                const denom = add + del || 1;
                return palette.diverging((add - del) / denom);
            }
            case 'author':
            default:
                return palette.categoryColor(authorIndex.get(n.commit.authorName) ?? 0, authorCount);
        }
    };

    const sizeFor = (n: PositionedNode): number => {
        let s: number;
        switch (sizeMode) {
            case 'churn':
                s = baseRadius * (0.7 + 1.5 * churnNorm(n, signals.maxChurn));
                break;
            case 'recency':
                s = baseRadius * (0.6 + 0.9 * (Number.isFinite(n.t) ? n.t : 0.5));
                break;
            case 'merge':
                s = baseRadius * (n.commit.parents.length > 1 ? 1.7 : 1);
                break;
            case 'uniform':
            default:
                s = baseRadius;
        }
        return s * encoding.sizeScale;
    };

    const sceneNodes: SceneNode[] = srcNodes.map((n) => {
        const p = placed.get(n.id)!;
        const kind = n.commit.parents.length === 0 ? 'root' : n.commit.parents.length > 1 ? 'merge' : 'normal';
        return {
            id: n.id,
            x: p.x,
            y: p.y,
            r: sizeFor(n),
            fill: colorFor(n),
            stroke: withAlpha(palette.bg, 0.85),
            strokeWidth: Math.max(0.5, sizeFor(n) * 0.18),
            shape: glyphFor(n),
            opacity: 1,
            glow: encoding.glow,
            sha: n.id.slice(0, 7),
            kind,
        };
    });

    const sceneEdges: SceneEdge[] = [];
    if (drawEdges) {
        for (const e of edges) {
            if (!keepSet.has(e.from) || !keepSet.has(e.to)) continue;
            const from = placed.get(e.from);
            const to = placed.get(e.to);
            if (!from || !to) continue;
            const toNode = nodeById.get(e.to);
            const lane = toNode?.lane ?? 0;
            const color =
                encoding.hue === 'lane'
                    ? palette.categoryColor(lane, totalLanes)
                    : withAlpha(palette.fg, 0.55);
            sceneEdges.push({
                id: `${e.from}->${e.to}`,
                points: [from, to],
                color,
                width: (e.isMerge ? 2.2 : 1.6) * encoding.weightScale,
                opacity: e.isMerge ? 0.92 : 0.7,
                merge: e.isMerge,
                curve: layout === 'horizontal' ? 'bezierH' : layout === 'radial' ? 'line' : 'bezierV',
            });
        }
    }

    return { nodes: sceneNodes, edges: sceneEdges, sampledFrom };
}

/** Result of buildGraphScene; `sampledFrom` > 0 means the repo was downsampled. */
export interface GraphScene {
    nodes: SceneNode[];
    edges: SceneEdge[];
    /** Original commit count if the scene was downsampled, else 0. */
    sampledFrom: number;
}

/**
 * Reduce a large commit set to a drawable budget. Always keeps roots, merges and
 * HEAD plus the highest-churn commits, then fills the rest with an even time
 * stratification — preserving topology landmarks while thinning the linear bulk.
 * Exported so templates that don't use buildGraphScene (flow field, pulsar-free
 * point clouds, constellation, radial-year) can cap their element counts too.
 */
export function sampleNodes(
    nodes: PositionedNode[],
    headId: string,
    budget: number
): { kept: PositionedNode[]; total: number } {
    return downsampleNodes(nodes, headId, budget);
}

function downsampleNodes(
    nodes: PositionedNode[],
    headId: string,
    budget: number
): { kept: PositionedNode[]; total: number } {
    if (nodes.length <= budget) return { kept: nodes, total: 0 };
    const keep = new Set<number>();
    nodes.forEach((n, i) => {
        if (n.commit.parents.length !== 1) keep.add(i); // roots + merges
        if (n.id === headId) keep.add(i);
    });
    const byChurn = nodes
        .map((n, i) => ({ i, c: (n.commit.stats?.additions ?? 0) + (n.commit.stats?.deletions ?? 0) }))
        .sort((a, b) => b.c - a.c);
    const churnKeep = Math.min(byChurn.length, Math.floor(budget * 0.15));
    for (let k = 0; k < churnKeep; k++) keep.add(byChurn[k].i);
    const remaining = budget - keep.size;
    if (remaining > 0) {
        const step = nodes.length / remaining;
        for (let k = 0; k < remaining; k++) keep.add(Math.min(nodes.length - 1, Math.floor(k * step)));
    }
    const kept = nodes.filter((_, i) => keep.has(i));
    return { kept, total: nodes.length };
}

/**
 * Build a real "billing block": the dense, condensed all-caps credits strip that
 * makes a composition read as a theatrical one-sheet. Returns ordered lines.
 */
export function billingLines(ctx: TemplateContext): string[] {
    const { signals, options } = ctx;
    const top = signals.rankedAuthors.slice(0, 6).map((a) => a.name.toUpperCase());
    const lines: string[] = [];
    if (top.length) lines.push(top.join('   ·   '));
    const totals: string[] = [
        `${signals.commitCount} COMMITS`,
        `${signals.authorCount} AUTHORS`,
        `${signals.mergeCount} MERGES`,
        `${signals.branchCount} BRANCHES`,
    ];
    if (signals.hasChurn) {
        totals.push(`+${formatCompact(signals.totalAdditions)} / -${formatCompact(signals.totalDeletions)}`);
    }
    lines.push(totals.join('   ·   '));
    if (signals.timeSpanMs > 0) {
        lines.push(formatDateRange(signals.firstCommitMs, signals.lastCommitMs).toUpperCase());
    }
    if (options.showSignature) {
        lines.push('GITSONAR.COM');
    }
    return lines;
}

/** Project commits into a numbered "tracklist" (for album templates). */
export interface Track {
    index: number;
    title: string;
    duration: string;
}
export function trackList(ctx: TemplateContext, max = 12): Track[] {
    const { nodes } = ctx;
    // Newest-first, like a side A tracklist.
    const ordered = [...nodes].reverse().slice(0, max);
    const out: Track[] = [];
    for (let i = 0; i < ordered.length; i++) {
        const n = ordered[i];
        const churn = (n.commit.stats?.additions ?? 0) + (n.commit.stats?.deletions ?? 0);
        // Derived "duration": map churn (or recency) to mm:ss for flavor.
        const secs = churn > 0 ? Math.min(599, 30 + churn) : 60 + ((i * 37) % 240);
        const mm = Math.floor(secs / 60);
        const ss = secs % 60;
        out.push({
            index: i + 1,
            title: truncate(n.commit.messageSubject || 'untitled', 38),
            duration: `${mm}:${ss.toString().padStart(2, '0')}`,
        });
    }
    return out;
}

export function truncate(s: string, max: number): string {
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function formatCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return `${n}`;
}

export function formatDate(ms: number): string {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Format a date range, deterministically (UTC). Falls back to day granularity
 * when both ends share a month+year so a short/new repo doesn't render the
 * embarrassing "Jun 2026 — Jun 2026"; expands to year-only when it spans years.
 */
export function formatDateRange(firstMs: number, lastMs: number): string {
    if (!firstMs || !lastMs) return '';
    const a = new Date(firstMs);
    const b = new Date(lastMs);
    const sameMonth = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
    const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
    if (sameMonth) {
        const mon = b.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        return `${mon} ${a.getUTCDate()}–${b.getUTCDate()}, ${b.getUTCFullYear()}`;
    }
    if (sameYear) {
        const ma = a.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        const mb = b.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        return `${ma} — ${mb} ${b.getUTCFullYear()}`;
    }
    return `${formatDate(firstMs)} — ${formatDate(lastMs)}`;
}

/** Greedy word-wrap into at most `maxLines` lines of ~maxChars each. */
export function wrapText(text: string, maxChars: number, maxLines = 3): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
        if ((cur + ' ' + w).trim().length > maxChars && cur) {
            lines.push(cur.trim());
            cur = w;
            if (lines.length === maxLines - 1) break;
        } else {
            cur = (cur + ' ' + w).trim();
        }
    }
    if (cur) lines.push(cur.trim());
    return lines.slice(0, maxLines);
}
