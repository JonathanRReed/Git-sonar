/**
 * Transit map: the repo as a metro network. The history runs along one long
 * line that doubles back across the sheet; every branch is its own coloured
 * line running alongside until it rejoins, commits are stations and merges are
 * interchanges. The legend names the busiest lines after their branches.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneNode, SceneStroke, SceneText, Vec2 } from '../scene';
import { fontStack } from '../fonts';
import { withAlpha } from '../palette';
import { sampleNodes } from '../compose';
import { line, monthYear, plural, text, titleOf } from './kit';
import { CREDIT } from '../../brand';

const TITLE_FONT = 'SpaceGrotesk';
const MONO_FONT = 'JetBrainsMono';
/** Parallel tracks either side of the trunk; later branches reuse them. */
const SIDE_TRACKS = 6;

/** A polyline you can walk by distance, with a smoothed normal for offsets. */
function makeRoute(vertices: Vec2[]) {
    const cum: number[] = [0];
    for (let i = 1; i < vertices.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(vertices[i].x - vertices[i - 1].x, vertices[i].y - vertices[i - 1].y));
    }
    const length = cum[cum.length - 1] || 1;
    const at = (s: number): Vec2 => {
        const d = Math.max(0, Math.min(length, s));
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const seg = cum[i] - cum[i - 1] || 1;
        const u = (d - cum[i - 1]) / seg;
        return {
            x: vertices[i - 1].x + (vertices[i].x - vertices[i - 1].x) * u,
            y: vertices[i - 1].y + (vertices[i].y - vertices[i - 1].y) * u,
        };
    };
    const offset = (s: number, o: number, soften: number): Vec2 => {
        const p = at(s);
        if (o === 0) return p;
        const a = at(s - soften);
        const b = at(s + soften);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: p.x - ((b.y - a.y) / len) * o, y: p.y + ((b.x - a.x) / len) * o };
    };
    return { length, at, offset };
}

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, rng, graph } = ctx;
    const margin = Math.round(width * 0.075);
    const strokes: SceneStroke[] = [];
    const nodes: SceneNode[] = [];
    const texts: SceneText[] = [];

    const ordered = [...ctx.nodes].sort((a, b) => a.t - b.t || a.depth - b.depth);
    const count = ordered.length;
    const indexOf = new Map<string, number>();
    ordered.forEach((n, i) => indexOf.set(n.id, i));

    // ---- the route: a line that doubles back across the sheet -------------
    const artX = margin;
    const artW = width - margin * 2;
    const artTop = height * 0.235;
    const artBottom = height * 0.775;
    const rows = Math.max(3, Math.min(7, Math.round(Math.sqrt(Math.max(1, count) / 12)) + 2 + Math.floor(rng() * 2)));
    const rowGap = (artBottom - artTop) / (rows - 1);
    const chamfer = rowGap * 0.3;
    const track = Math.min(width * 0.024, rowGap / (SIDE_TRACKS + 3));
    const inset = track * (SIDE_TRACKS / 2 + 1);
    const leftX = artX + inset;
    const rightX = artX + artW - inset;
    const startLeft = rng() < 0.5;

    const vertices: Vec2[] = [];
    for (let r = 0; r < rows; r++) {
        const y = artTop + r * rowGap;
        const goingRight = (r % 2 === 0) === startLeft;
        const from = goingRight ? leftX : rightX;
        const to = goingRight ? rightX : leftX;
        const dir = goingRight ? 1 : -1;
        vertices.push({ x: r === 0 ? from : from + dir * chamfer, y });
        if (r < rows - 1) {
            vertices.push({ x: to - dir * chamfer, y });
            vertices.push({ x: to, y: y + chamfer });
            vertices.push({ x: to, y: y + rowGap - chamfer });
        } else {
            vertices.push({ x: to, y });
        }
    }
    const route = makeRoute(vertices);
    const sOf = (i: number) => (count <= 1 ? route.length / 2 : (i / (count - 1)) * route.length);

    // ---- find the lines ------------------------------------------------------
    // The trunk is the first-parent chain back from HEAD. Everything else is a
    // side line: it starts where work left the trunk and ends where it rejoined.
    const byId = new Map(ordered.map((n) => [n.id, n]));
    const lineOf = new Map<string, number>();
    let cursor: string | undefined = byId.has(graph.defaultHead) ? graph.defaultHead : ordered[count - 1]?.id;
    while (cursor && byId.has(cursor) && !lineOf.has(cursor)) {
        lineOf.set(cursor, 0);
        cursor = byId.get(cursor)!.commit.parents[0];
    }
    interface Line { first: number; last: number; size: number; names: Map<string, number>; slot: number }
    const lines: Line[] = [{ first: 0, last: Math.max(0, count - 1), size: 0, names: new Map(), slot: 0 }];
    const continued = new Set<string>();
    ordered.forEach((n, i) => {
        let id = lineOf.get(n.id);
        if (id === undefined) {
            const parent = n.commit.parents[0];
            const parentLine = parent ? lineOf.get(parent) : undefined;
            if (parent && parentLine !== undefined && parentLine !== 0 && !continued.has(parent)) {
                id = parentLine;
                continued.add(parent);
            } else {
                id = lines.length;
                lines.push({ first: i, last: i, size: 0, names: new Map(), slot: 1 });
            }
            lineOf.set(n.id, id);
        }
        const info = lines[id];
        info.first = Math.min(info.first, i);
        info.last = Math.max(info.last, i);
        info.size++;
        const hint = n.commit.branchHints?.[0];
        if (hint) info.names.set(hint, (info.names.get(hint) ?? 0) + 1);
    });
    // A side line stays on the map until the commit that merges it.
    for (const e of ctx.edges) {
        const a = indexOf.get(e.from);
        const b = indexOf.get(e.to);
        if (a === undefined || b === undefined) continue;
        const from = lineOf.get(e.from) ?? 0;
        if (from !== 0 && lineOf.get(e.to) !== from) lines[from].last = Math.max(lines[from].last, b - 1, a);
    }
    // Give each side line the nearest free track for as long as it runs.
    const busyUntil = new Array<number>(SIDE_TRACKS + 1).fill(-1);
    // Successive branches alternate sides so the map stays balanced.
    lines.slice(1).sort((x, y) => x.first - y.first).forEach((info, k) => {
        let slot = 1 + (k % 2);
        let tries = 0;
        while (tries < SIDE_TRACKS && busyUntil[slot] >= info.first) {
            slot = (slot % SIDE_TRACKS) + 1;
            tries++;
        }
        info.slot = slot;
        busyUntil[slot] = info.last;
    });

    const offsetOf = (id: number) => {
        const slot = lines[id]?.slot ?? 0;
        return slot === 0 ? 0 : (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * track;
    };
    const colorOf = (id: number) => (id === 0 ? palette.fg : palette.categoryColor((id - 1) % 8, 8));
    const lineW = Math.max(2, width * 0.0085);
    const step = Math.max(4, width * 0.006);
    const soften = chamfer * 0.7;
    const pos = (i: number, id: number) => route.offset(sOf(i), offsetOf(id), soften);

    // Side lines first so the trunk sits on top.
    for (let id = lines.length - 1; id >= 0; id--) {
        const info = lines[id];
        const s0 = sOf(info.first);
        const s1 = Math.max(s0 + step, sOf(info.last));
        const pts: Vec2[] = [];
        for (let s = s0; s < s1; s += step) pts.push(route.offset(s, offsetOf(id), soften));
        pts.push(route.offset(s1, offsetOf(id), soften));
        strokes.push(line(`line-${id}`, pts, colorOf(id), id === 0 ? lineW * 1.15 : lineW));
    }

    // Where work leaves or rejoins a line, a short link in the side line's colour.
    let interchanges = 0;
    for (const e of ctx.edges) {
        const a = indexOf.get(e.from);
        const b = indexOf.get(e.to);
        if (a === undefined || b === undefined) continue;
        const la = lineOf.get(e.from) ?? 0;
        const lb = lineOf.get(e.to) ?? 0;
        if (la === lb) continue;
        interchanges++;
        const side = la === 0 ? lb : la;
        // Leave from, or arrive at, the side line's own end so links stay short.
        const from = la === 0 ? pos(Math.max(a, lines[lb].first - 1), la) : pos(lines[la].last, la);
        const to = la === 0 ? pos(lines[lb].first, lb) : pos(b, lb);
        strokes.push(line(`link-${e.from.slice(0, 7)}-${e.to.slice(0, 7)}`, [from, to], colorOf(side), lineW));
    }

    // ---- stations ----------------------------------------------------------
    const { kept } = sampleNodes(ordered, graph.defaultHead, 220);
    const stationR = lineW * 0.6;
    for (const n of kept) {
        const i = indexOf.get(n.id)!;
        const p = pos(i, lineOf.get(n.id) ?? 0);
        const hub = n.commit.parents.length !== 1 || i === count - 1;
        nodes.push({
            id: n.id,
            x: p.x,
            y: p.y,
            r: hub ? stationR * 1.75 : stationR,
            fill: palette.bg,
            stroke: palette.fg,
            strokeWidth: hub ? lineW * 0.4 : lineW * 0.28,
            shape: 'circle',
            opacity: 1,
            sha: n.id.slice(0, 7),
            kind: n.commit.parents.length === 0 ? 'root' : n.commit.parents.length > 1 ? 'merge' : 'normal',
        });
    }

    // Termini.
    if (count > 0) {
        const first = route.at(0);
        const last = route.at(route.length);
        const labelSize = width * 0.0125;
        texts.push(text(`FIRST COMMIT, ${monthYear(signals.firstCommitMs)}`, first.x, first.y - track * 1.9, {
            font: fontStack(MONO_FONT), size: labelSize, weight: 600, color: palette.fg, align: startLeft ? 'start' : 'end', spacing: width * 0.0012,
        }));
        const endsRight = last.x > width / 2;
        texts.push(text(`HEAD, ${monthYear(signals.lastCommitMs)}`, last.x, last.y + track * 2.4, {
            font: fontStack(MONO_FONT), size: labelSize, weight: 600, color: palette.fg, align: endsRight ? 'end' : 'start', spacing: width * 0.0012,
        }));
    }

    // ---- title and legend --------------------------------------------------
    const title = titleOf(ctx);
    const titleSize = Math.min(width * 0.1, ((width - margin * 2) / Math.max(5, title.length)) * 1.75);
    texts.push(text(title, margin, margin + titleSize * 0.8, { font: fontStack(TITLE_FONT), size: titleSize, weight: 700, color: palette.fg, spacing: -titleSize * 0.02 }));
    const sub = options.subtitle || `Network map. ${plural(signals.commitCount, 'station')}, ${plural(interchanges, 'interchange')}.`;
    texts.push(text(sub.toUpperCase(), margin, margin + titleSize * 0.8 + width * 0.036, {
        font: fontStack(MONO_FONT), size: width * 0.0152, weight: 500, color: palette.fgMuted, spacing: width * 0.0022,
    }));

    const busiest = lines.map((info, id) => ({ info, id })).sort((x, y) => y.info.size - x.info.size).slice(0, 6);
    const legendTop = height * 0.868;
    const rowH = width * 0.029;
    busiest.forEach(({ info, id }, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = margin + col * (artW / 2);
        const y = legendTop + row * rowH;
        const named = [...info.names.entries()].sort((p, q) => q[1] - p[1])[0]?.[0];
        const label = named ?? (id === 0 ? 'main line' : `branch ${id}`);
        strokes.push(line(`key-${id}`, [{ x, y }, { x: x + width * 0.05, y }], colorOf(id), lineW));
        texts.push(text(`${label}, ${plural(info.size, 'stop')}`.toUpperCase(), x + width * 0.064, y + width * 0.005, {
            font: fontStack(MONO_FONT), size: width * 0.0152, weight: 500, color: palette.fgMuted, spacing: width * 0.001,
        }));
    });
    if (options.showWatermark) {
        texts.push(text(CREDIT, width - margin, height - margin, {
            font: fontStack(MONO_FONT), size: width * 0.013, weight: 600, color: withAlpha(palette.fg, 0.5), align: 'end', spacing: width * 0.004,
        }));
    }

    return {
        width,
        height,
        background: { kind: 'solid', color: palette.bg },
        strokes,
        edges: [],
        nodes,
        texts,
        fontsUsed: [TITLE_FONT, MONO_FONT],
    };
}

export const transitMapTemplate: PosterTemplate = {
    id: 'transit-map',
    name: 'Transit Map',
    group: 'data',
    description: 'A metro network: branches are lines, commits are stations, merges are interchanges.',
    defaultAspect: 18 / 24,
    fonts: [TITLE_FONT, MONO_FONT],
    build,
};
