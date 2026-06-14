import { describe, it, expect } from 'vitest';
import { buildRepoGraph } from '@lib/git/graph';
import type { CommitNode, RepoGraph } from '@lib/git/types';

import { createPositioner } from '@lib/art/layout';
import { deriveArtSignals } from '@lib/art/signals';
import { buildPalette } from '@lib/art/palette';
import { hexToRgba, lightenColor } from '@lib/utils/color';
import { makeRng, makeNoise2D, hashStringToSeed } from '@lib/art/rng';
import { resolvePosterSize, sizeAspect, exceedsCanvasArea } from '@lib/art/sizes';
import { encodePosterConfig, decodePosterConfig, makePosterConfig, DEFAULT_POSTER_CONFIG } from '@lib/art/poster-config';
import { renderPoster } from '@lib/art/poster-renderer';
import { posterPermalink } from '@lib/art/export';
import { sceneToSVG } from '@lib/art/render-svg';
import { TEMPLATE_LIST } from '@lib/art/templates';
import { getTheme } from '@lib/themes';
import { getPrintSpec, validatePrintSpec } from '@lib/art/print';
import { FONT_FILES, fontFilesForKeys } from '@lib/art/font-files';
import { FONTS, embeddedFontFaceCss } from '@lib/art/fonts';

const DAY = 1000 * 60 * 60 * 24;

/** Build a non-trivial graph: a trunk, a feature branch, a merge, multi-author, stats. */
function makeGraph(): RepoGraph {
    const commits = new Map<string, CommitNode>();
    const base = Date.UTC(2024, 0, 1);
    const c = (id: string, parents: string[], dayOffset: number, author: string, add = 0, del = 0): CommitNode => ({
        id,
        parents,
        authorName: author,
        authoredAt: base + dayOffset * DAY,
        messageSubject: `Commit ${id} does a thing`,
        stats: { additions: add, deletions: del },
        branchHints: id === 'a' ? ['main'] : undefined,
    });
    commits.set('a', c('a', [], 0, 'Alice', 120, 0));
    commits.set('b', c('b', ['a'], 1, 'Alice', 40, 10));
    commits.set('f1', c('f1', ['a'], 1, 'Bob', 200, 5));
    commits.set('f2', c('f2', ['f1'], 2, 'Bob', 60, 80));
    commits.set('c', c('c', ['b'], 3, 'Carol', 30, 30));
    commits.set('m', c('m', ['c', 'f2'], 4, 'Alice', 10, 4));
    commits.set('d', c('d', ['m'], 6, 'Carol', 90, 12));
    const refs = new Map([['main', 'd']]);
    return buildRepoGraph(commits, refs, 'main');
}

describe('layout positioner', () => {
    it('places vertical layout by lane (x) and row (y)', () => {
        const graph = makeGraph();
        const nodes = [...graph.commits.values()].map((commit) => ({
            id: commit.id,
            t: 0.5,
            lane: graph.lanes.get(commit.id) ?? 0,
            depth: 0,
            commit,
        }));
        const p = createPositioner(nodes, { layoutMode: 'vertical', laneWidth: 100, rowHeight: 50, paddingLeft: 0, paddingTop: 0 });
        const a = p.getPos(nodes[0]);
        expect(Number.isFinite(a.x)).toBe(true);
        expect(Number.isFinite(a.y)).toBe(true);
    });

    it('radial layout keeps all nodes within a finite, spread bounding box', () => {
        const graph = makeGraph();
        const nodes = [...graph.commits.values()].map((commit) => ({
            id: commit.id,
            t: Math.random(),
            lane: graph.lanes.get(commit.id) ?? 0,
            depth: 0,
            commit,
        }));
        const p = createPositioner(nodes, { layoutMode: 'radial', laneWidth: 100, rowHeight: 50, paddingLeft: 0, paddingTop: 0 });
        const pts = nodes.map((n) => p.getPos(n));
        const xs = pts.map((q) => q.x);
        const ys = pts.map((q) => q.y);
        // Not all collapsed to one point (the old bug) — radial must spread.
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
        expect(pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
    });
});

describe('art signals', () => {
    it('derives cadence, diversity, topology and churn', () => {
        const s = deriveArtSignals(makeGraph());
        expect(s.commitCount).toBe(7);
        expect(s.authorCount).toBe(3);
        expect(s.mergeCount).toBe(1);
        expect(s.hasChurn).toBe(true);
        expect(s.totalAdditions).toBeGreaterThan(0);
        expect(s.authorEntropy).toBeGreaterThan(0);
        expect(s.authorEntropy).toBeLessThanOrEqual(1);
        expect(s.rankedAuthors[0].count).toBeGreaterThanOrEqual(s.rankedAuthors[s.rankedAuthors.length - 1].count);
        expect(s.perDay.reduce((x, y) => x + y, 0)).toBe(7);
    });

    it('handles an empty graph without throwing', () => {
        const empty = buildRepoGraph(new Map());
        const s = deriveArtSignals(empty);
        expect(s.commitCount).toBe(0);
        expect(s.hasChurn).toBe(false);
    });
});

describe('palette engine', () => {
    it('derives a coherent palette from each theme and spaces author hues', () => {
        for (const id of ['night', 'dawn', 'github', 'nord', 'dracula'] as const) {
            const pal = buildPalette(getTheme(id));
            expect(pal.ramp(5)).toHaveLength(5);
            expect(pal.sequential(0)).toMatch(/^#/);
            expect(pal.diverging(-1)).toMatch(/^#/);
            const c0 = pal.categoryColor(0, 8);
            const c4 = pal.categoryColor(4, 8);
            expect(c0).not.toBe(c4);
        }
    });

    it('color shim survives shorthand and 8-digit hex (old crash)', () => {
        expect(hexToRgba('#fff', 0.5)).toMatch(/^rgba/);
        expect(hexToRgba('#ffffffff', 0.5)).toMatch(/^rgba/);
        expect(lightenColor('#3366cc', 40)).toMatch(/^#/);
    });
});

describe('seeded rng', () => {
    it('is deterministic for the same seed', () => {
        const a = makeRng('seed-x');
        const b = makeRng('seed-x');
        expect(a()).toBe(b());
        expect(a()).toBe(b());
        expect(hashStringToSeed('abc')).toBe(hashStringToSeed('abc'));
        const noise = makeNoise2D('seed-x');
        expect(Number.isFinite(noise(0.2, 0.4))).toBe(true);
    });
});

describe('poster sizes', () => {
    it('treats 18x24 / 24x36 as portrait (w < h) — orientation bug fixed', () => {
        const p18 = resolvePosterSize('18x24', 'portrait', 1, 0.75);
        expect(p18.wPx).toBeLessThan(p18.hPx);
        const p24 = resolvePosterSize('24x36', 'portrait', 1, 0.66);
        expect(p24.wPx).toBeLessThan(p24.hPx);
        // Landscape swaps.
        const land = resolvePosterSize('18x24', 'landscape', 1, 0.75);
        expect(land.wPx).toBeGreaterThan(land.hPx);
        expect(sizeAspect('18x24', 'portrait', 1)).toBeCloseTo(18 / 24, 2);
    });

    it('flags print-size raster that exceeds the Safari canvas cap', () => {
        const big = resolvePosterSize('24x36', 'portrait', 4, 0.66);
        expect(exceedsCanvasArea(big.area)).toBe(true);
    });
});

describe('poster config permalink', () => {
    it('round-trips through deflate/base64url', () => {
        const cfg = makePosterConfig({ template: 'swiss', title: 'My Repo', seed: 'abc', dpi: 4 });
        const encoded = encodePosterConfig(cfg);
        expect(typeof encoded).toBe('string');
        const decoded = decodePosterConfig(encoded);
        expect(decoded?.template).toBe('swiss');
        expect(decoded?.title).toBe('My Repo');
        expect(decoded?.dpi).toBe(4);
    });

    it('returns null on garbage input', () => {
        expect(decodePosterConfig('not-valid!!!')).toBeNull();
    });

    it('builds reproducible permalinks for public repos/demos, settings-only otherwise', () => {
        const cfg = makePosterConfig({ template: 'pulsar', title: 'X' });
        const base = 'https://gitsonar.test/app';
        const pub = posterPermalink(cfg, { provider: 'github', repoPath: 'facebook/react' }, base);
        expect(pub.reproducible).toBe(true);
        expect(pub.url).toContain('github=facebook%2Freact');
        expect(pub.url).toContain('#p=');
        const demo = posterPermalink(cfg, { demo: 'showcase' }, base);
        expect(demo.reproducible).toBe(true);
        expect(demo.url).toContain('demo=showcase');
        // Private/local import: only the config rides along (no repo source).
        const local = posterPermalink(cfg, {}, base);
        expect(local.reproducible).toBe(false);
        expect(local.url).toContain('#p=');
        expect(local.url).not.toContain('github=');
        // Round-trips back to the same config.
        const hash = local.url.split('#p=')[1];
        expect(decodePosterConfig(hash)?.template).toBe('pulsar');
    });

    it('coerces hostile/stale fields so a bad permalink can never crash the renderer', () => {
        // Simulate a stale/hand-edited config with invalid enum values.
        const hostile = encodePosterConfig(makePosterConfig({
            // @ts-expect-error intentionally invalid for the test
            themeId: 'not-a-theme', size: 'bogus', layout: 'sideways', paletteMood: 'rainbow', dpi: 99,
            encoding: { hue: 'nonsense' } as never,
        }));
        const decoded = decodePosterConfig(hostile)!;
        expect(['night', 'dawn', 'github', 'nord', 'dracula']).toContain(decoded.themeId);
        expect(decoded.size).toBe('native');
        expect(decoded.layout).toBe('vertical');
        // And it must render without throwing.
        expect(() => renderPoster(makeGraph(), decoded, 'demo')).not.toThrow();
    });

    it('round-trips unicode + emoji titles', () => {
        const cfg = makePosterConfig({ title: 'café ☕ 日本語 — 🚀 répo', subtitle: 'naïve ✨' });
        const decoded = decodePosterConfig(encodePosterConfig(cfg))!;
        expect(decoded.title).toBe('café ☕ 日本語 — 🚀 répo');
        expect(decoded.subtitle).toBe('naïve ✨');
    });
});

describe('robustness on hostile / large input', () => {
    it('survives a large repo + forged far-future timestamp without crashing or OOM', () => {
        const commits = new Map<string, CommitNode>();
        const base = Date.UTC(2023, 0, 1);
        for (let i = 0; i < 4000; i++) {
            commits.set(`c${i}`, {
                id: `c${i}`,
                parents: i === 0 ? [] : [`c${i - 1}`],
                authorName: `dev${i % 12}`,
                authoredAt: base + i * 3600_000,
                messageSubject: `commit ${i}`,
                stats: { additions: i % 50, deletions: i % 20 },
            });
        }
        // A forged committer date far in the future (would allocate millions of buckets).
        commits.set('bad', { id: 'bad', parents: ['c3999'], authorName: 'evil', authoredAt: Date.UTC(9999, 0, 1), messageSubject: 'forged' });
        const graph = buildRepoGraph(commits, new Map([['main', 'bad']]), 'main');
        const s = deriveArtSignals(graph);
        expect(s.perDay.length).toBeLessThanOrEqual(20000);
        expect(Number.isFinite(s.firstCommitMs)).toBe(true);
        // Every template must render without throwing and stay bounded.
        for (const template of TEMPLATE_LIST) {
            const cfg = makePosterConfig({ template: template.id, title: 'Big' });
            const result = renderPoster(graph, cfg, 'big');
            expect(result.scene.nodes.length).toBeLessThanOrEqual(2000);
            expect(() => sceneToSVG(result.scene)).not.toThrow();
        }
    });
});

describe('determinism', () => {
    it('renders byte-identical SVG twice (no wall-clock drift)', () => {
        const graph = makeGraph();
        const cfg = makePosterConfig({ template: 'movie-one-sheet', title: 'Stable', seed: 'fixed' });
        const a = sceneToSVG(renderPoster(graph, cfg, 'demo').scene);
        const b = sceneToSVG(renderPoster(graph, cfg, 'demo').scene);
        expect(a).toBe(b);
        // The poster must NOT contain the wall-clock "GENERATED <today>" text.
        expect(a).not.toMatch(/GENERATED/);
    });

    it('same seed => identical generative output; different seed => different', () => {
        const graph = makeGraph();
        const base = makePosterConfig({ template: 'flow-field', seed: 's1' });
        const same = sceneToSVG(renderPoster(graph, base, 'demo').scene);
        const same2 = sceneToSVG(renderPoster(graph, base, 'demo').scene);
        const diff = sceneToSVG(renderPoster(graph, makePosterConfig({ template: 'flow-field', seed: 's2' }), 'demo').scene);
        expect(same).toBe(same2);
        expect(same).not.toBe(diff);
    });
});

describe('poster renderer → SVG', () => {
    it('renders every registered template to valid, non-empty SVG with nodes', () => {
        const graph = makeGraph();
        for (const template of TEMPLATE_LIST) {
            const cfg = makePosterConfig({ template: template.id, title: 'Demo Repo', subtitle: 'a test' });
            const result = renderPoster(graph, cfg, 'demo-repo');
            // Content present: nodes (graph templates) OR strokes (joyplot/flow field).
            expect(result.scene.nodes.length + result.scene.strokes.length).toBeGreaterThan(0);
            const svg = sceneToSVG(result.scene);
            expect(svg.startsWith('<svg')).toBe(true);
            expect(svg).toContain('</svg>');
            // every node coordinate is finite and sized
            expect(result.scene.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && n.r > 0)).toBe(true);
            // every stroke point is finite
            expect(
                result.scene.strokes.every((s) => s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
            ).toBe(true);
            // text present (title/billing/caption)
            expect(result.scene.texts.length).toBeGreaterThan(0);
        }
    });

    it('default config renders without a repo name', () => {
        const result = renderPoster(makeGraph(), DEFAULT_POSTER_CONFIG);
        expect(result.scene.width).toBeGreaterThan(0);
        expect(result.scene.height).toBeGreaterThan(0);
    });

    it('emits a CSS-animated, reduced-motion-gated SVG with a visible static fallback', () => {
        const cfg = makePosterConfig({ template: 'movie-one-sheet', title: 'Demo' });
        const { scene } = renderPoster(makeGraph(), cfg, 'demo');
        const still = sceneToSVG(scene);
        const animated = sceneToSVG(scene, { animate: true });
        expect(still).not.toContain('animation-delay');
        expect(animated).toContain('animation-delay');
        // Motion is gated so reduced-motion viewers see the static poster.
        expect(animated).toContain('prefers-reduced-motion: no-preference');
    });

    it('includes accessible <title>/<desc>/role on every poster (WCAG 1.1.1)', () => {
        const { scene } = renderPoster(makeGraph(), makePosterConfig(), 'demo');
        const svg = sceneToSVG(scene, { title: 'My Repo poster', desc: 'A movie one-sheet of My Repo.' });
        expect(svg).toContain('role="img"');
        expect(svg).toContain('<title>My Repo poster</title>');
        expect(svg).toContain('<desc>A movie one-sheet of My Repo.</desc>');
    });
});

describe('print groundwork', () => {
    it('derives an sRGB print spec for print sizes and rejects non-print sizes', () => {
        const print = getPrintSpec(makePosterConfig({ size: '24x36', orientation: 'portrait' }));
        expect(print).not.toBeNull();
        expect(print!.colorSpace).toBe('sRGB');
        expect(print!.widthIn).toBeLessThan(print!.heightIn);
        expect(getPrintSpec(makePosterConfig({ size: 'native' }))).toBeNull();
        expect(getPrintSpec(makePosterConfig({ size: 'social-story' }))).toBeNull();
    });

    it('warns about gamut + raster ceiling but validates a print size', () => {
        const v = validatePrintSpec(makePosterConfig({ size: '24x36', printSafe: false }));
        expect(v.ok).toBe(true);
        expect(v.warnings.length).toBeGreaterThan(0);
        const bad = validatePrintSpec(makePosterConfig({ size: 'native' }));
        expect(bad.ok).toBe(false);
    });
});

describe('export font embedding', () => {
    it('maps font keys to served files, with family names matching the FONTS registry', () => {
        for (const f of FONT_FILES) {
            // The @font-face family MUST equal what templates emit, or the
            // embedded face won't match the SVG text and type falls back.
            expect(FONTS[f.key]?.family).toBe(f.family);
            expect(f.file).toMatch(/^[A-Za-z]+-\d+$/);
        }
        expect(fontFilesForKeys(['Anton']).map((f) => f.family)).toEqual(['Anton']);
        expect(fontFilesForKeys(['NotAFont']).length).toBe(0);
    });

    it('embeds the exact weights the templates emit (so SVG/PDF match the live preview)', () => {
        const weights = (key: string) => fontFilesForKeys([key]).map((f) => f.weight).sort((a, b) => a - b);
        // Audited from every text() call across templates/*.ts.
        expect(weights('JetBrainsMono')).toEqual([400, 500, 600]);
        expect(weights('Oswald')).toEqual([500, 600]);
        expect(weights('SpaceGrotesk')).toEqual([600, 700]);
        expect(weights('Syne')).toEqual([600, 700]);
        expect(weights('BarlowCondensed')).toEqual([400, 600]);
        expect(weights('Anton')).toEqual([400]);
        expect(weights('Unbounded')).toEqual([700]);
    });

    it('covers every font every template uses (no export falls back to system type)', () => {
        for (const tpl of TEMPLATE_LIST) {
            for (const key of tpl.fonts) {
                expect(
                    FONT_FILES.some((f) => f.key === key),
                    `template "${tpl.id}" font "${key}" has no embeddable file`
                ).toBe(true);
            }
        }
    });

    it('degrades gracefully to no embedded faces when the fonts cannot be fetched', async () => {
        // In the test runtime the served /fonts/*.ttf are unreachable; the
        // exporter must resolve to '' rather than throw (SVG still downloads).
        const css = await embeddedFontFaceCss(['Anton', 'JetBrainsMono']);
        expect(typeof css).toBe('string');
    });
});
