/**
 * Poster renderer — the orchestrator.
 *
 * Given a RepoGraph + PosterConfig it derives signals/palette/seed, picks the
 * template, builds the Scene at a fixed layout resolution, and reports the
 * target export pixel/physical size. Both the canvas preview and the SVG/PNG/PDF
 * exporters consume the returned Scene, so they never diverge.
 */

import type { RepoGraph } from '@lib/git/types';
import { generatePositionedNodes, generateEdges } from '@lib/git/graph';
import { getTheme } from '@lib/themes';
import { deriveArtSignals } from './signals';
import { buildPalette, printSafe as printSafeColor } from './palette';
import { makeRng, makeNoise2D } from './rng';
import { resolvePosterSize, sizeAspect, type ResolvedSize } from './sizes';
import { getTemplateOrDefault } from './templates';
import type { PosterConfig } from './poster-config';
import type { Scene, SceneNode, SceneStroke, SceneEdge } from './scene';
import type { TemplateContext, PosterTemplate } from './template';

/** Author the scene at a stable layout resolution (longest side = 1600). */
function layoutSize(aspect: number, base = 1600): { w: number; h: number } {
    if (aspect >= 1) return { w: base, h: Math.round(base / aspect) };
    return { w: Math.round(base * aspect), h: base };
}

// Graph-derived data (signals, positioned nodes/edges) depends only on the graph,
// not the poster config — so cache it per graph. Keeps studio slider drags cheap
// (they re-render constantly but never change the graph).
type GraphDerived = ReturnType<typeof computeDerived>;
const derivedCache = new WeakMap<RepoGraph, GraphDerived>();
function computeDerived(graph: RepoGraph) {
    return {
        signals: deriveArtSignals(graph),
        nodes: generatePositionedNodes(graph),
        edges: generateEdges(graph),
    };
}
function getDerived(graph: RepoGraph): GraphDerived {
    let d = derivedCache.get(graph);
    if (!d) {
        d = computeDerived(graph);
        derivedCache.set(graph, d);
    }
    return d;
}

export interface PosterRenderResult {
    scene: Scene;
    target: ResolvedSize;
    template: PosterTemplate;
    /** Default seed source so the studio can show / reroll it. */
    seedSource: string;
}

export function renderPoster(graph: RepoGraph, cfg: PosterConfig, repoName?: string): PosterRenderResult {
    const theme = getTheme(cfg.themeId);
    const palette = buildPalette(theme, cfg.paletteMood);
    const { signals, nodes, edges } = getDerived(graph);
    const template = getTemplateOrDefault(cfg.template);

    const aspect = sizeAspect(cfg.size, cfg.orientation, template.defaultAspect);
    const { w: lw, h: lh } = layoutSize(aspect);
    const target = resolvePosterSize(cfg.size, cfg.orientation, cfg.dpi, template.defaultAspect);

    const rootSha = graph.topoOrder[0] ?? graph.defaultHead ?? '';
    const seedSource = `${rootSha}:${cfg.seed}`;
    const rng = makeRng(seedSource);
    const noise2D = makeNoise2D(seedSource);

    const ctx: TemplateContext = {
        graph,
        nodes,
        edges,
        signals,
        palette,
        theme,
        encoding: cfg.encoding,
        layout: cfg.layout,
        rng,
        noise2D,
        width: lw,
        height: lh,
        options: {
            title: cfg.title,
            subtitle: cfg.subtitle,
            repoName: repoName ?? cfg.title ?? 'repository',
            showWatermark: cfg.showWatermark,
            showSignature: cfg.showSignature,
            printSafe: cfg.printSafe,
            // Deterministic: the repo's last-activity date (UTC), NOT the wall
            // clock — so a shared #p= permalink renders identically anywhere.
            dateLabel: formatStableDate(signals.lastCommitMs),
        },
    };

    let scene = template.build(ctx);
    if (cfg.printSafe) scene = applyPrintSafe(scene);

    return { scene, target, template, seedSource };
}

function formatStableDate(ms: number): string {
    if (!ms || !Number.isFinite(ms)) return '';
    try {
        return new Date(ms).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
        });
    } catch {
        return '';
    }
}

/** Map every scene color through the CMYK-safe chroma clamp. */
function applyPrintSafe(scene: Scene): Scene {
    const fix = (c: string) => printSafeColor(c);
    const nodes: SceneNode[] = scene.nodes.map((n) => ({ ...n, fill: fix(n.fill), stroke: n.stroke ? fix(n.stroke) : n.stroke }));
    const edges: SceneEdge[] = scene.edges.map((e) => ({ ...e, color: fix(e.color) }));
    const strokes: SceneStroke[] = scene.strokes.map((s) => ({ ...s, color: fix(s.color), fill: s.fill ? fix(s.fill) : s.fill }));
    return {
        ...scene,
        nodes,
        edges,
        strokes,
        background: {
            ...scene.background,
            color: scene.background.color ? fix(scene.background.color) : scene.background.color,
            color2: scene.background.color2 ? fix(scene.background.color2) : scene.background.color2,
        },
    };
}
