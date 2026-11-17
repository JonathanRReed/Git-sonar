import { describe, expect, it } from 'vitest';
import { buildShowcaseGraph } from '@lib/demo-data/showcase';
import { renderPoster } from '@lib/art/poster-renderer';
import { makePosterConfig } from '@lib/art/poster-config';
import { sceneToSVG } from '@lib/art/render-svg';
import { TEMPLATE_LIST } from '@lib/art/templates';
import { THEME_IDS } from '@lib/themes';

const graph = buildShowcaseGraph();
const tiny = buildShowcaseGraph(7, 2);
const NEW_STYLES = ['growth-rings', 'transit-map', 'core-sample', 'weave', 'punch-card', 'receipt'];

function scene(template: string, extra: Parameters<typeof makePosterConfig>[0] = {}, g = graph) {
    return renderPoster(g, makePosterConfig({ template, title: 'Project Atlas', ...extra }), 'project-atlas').scene;
}

describe('data-drawn styles', () => {
    it('registers all six alongside the original eight', () => {
        const ids = TEMPLATE_LIST.map((t) => t.id);
        for (const id of NEW_STYLES) expect(ids).toContain(id);
        expect(ids.length).toBe(14);
    });

    it('stays inside the sheet on every theme, for a full repo and a tiny one', () => {
        for (const template of NEW_STYLES) {
            for (const themeId of THEME_IDS) {
                for (const g of [graph, tiny]) {
                    const s = scene(template, { themeId }, g);
                    const pad = s.width * 0.02;
                    for (const stroke of s.strokes) {
                        for (const p of stroke.points) {
                            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
                            expect(p.x).toBeGreaterThan(-pad);
                            expect(p.x).toBeLessThan(s.width + pad);
                            expect(p.y).toBeGreaterThan(-pad);
                            expect(p.y).toBeLessThan(s.height + pad);
                        }
                    }
                    expect(sceneToSVG(s).startsWith('<svg')).toBe(true);
                }
            }
        }
        // 168 posters: fine on its own, slow when the machine is busy.
    }, 30_000);

    it('fades the sheet into a second colour on themes that have a wash', () => {
        const washed = scene('transit-map', { themeId: 'acid' });
        expect(washed.background.kind).toBe('gradient');
        expect(washed.background.color2).toBe('#ff8ad8');
        // Pulsar prints on its own black, so a wash leaves it alone.
        expect(scene('pulsar', { themeId: 'acid' }).background.kind).toBe('solid');
        // Themes without a wash are unchanged.
        expect(scene('transit-map', { themeId: 'paper' }).background.kind).toBe('solid');
    });

    it('uses a theme\'s hand-picked inks in order', () => {
        const s = scene('transit-map', { themeId: 'blacklight', paletteMood: 'theme' });
        const side = s.strokes.filter((st) => st.id.startsWith('line-') && st.id !== 'line-0').map((st) => st.color.toLowerCase());
        expect(side).toContain('#39ff14');
        expect(side).toContain('#ff2bd6');
        expect(THEME_IDS.length).toBe(14);
    });

    it('is deterministic, and a new roll changes the generative ones', () => {
        for (const template of ['growth-rings', 'transit-map', 'core-sample']) {
            const a = sceneToSVG(scene(template, { seed: 'one' }));
            expect(sceneToSVG(scene(template, { seed: 'one' }))).toBe(a);
            expect(sceneToSVG(scene(template, { seed: 'two' }))).not.toBe(a);
        }
    });

    it('draws a side line on the transit map for every merged branch', () => {
        const s = scene('transit-map');
        const lines = s.strokes.filter((st) => st.id.startsWith('line-'));
        const links = s.strokes.filter((st) => st.id.startsWith('link-'));
        // The trunk plus one line per feature branch (12 merged, 2 still open).
        expect(lines.length).toBe(1 + 14);
        // Each merged branch leaves and rejoins; open ones only leave.
        expect(links.length).toBe(12 * 2 + 2);
        expect(s.texts.some((t) => /FEATURE\//.test(t.text))).toBe(true);
    });

    it('itemises the receipt so the author rows add up to the total', () => {
        const s = scene('receipt');
        const rows = s.texts.map((t) => t.text);
        expect(rows).toContain('TOTAL COMMITS');
        expect(rows).toContain(graph.metrics.commitCount.toLocaleString('en-US'));
        const qty = rows.map((r) => /^\s*(\d+)\s{2}[A-Z]/.exec(r)).filter(Boolean).map((m) => Number(m![1]));
        expect(qty.reduce((a, b) => a + b, 0)).toBe(graph.metrics.commitCount);
    });

    it('punches one slot per weekday-hour that has commits, and names the busiest', () => {
        const s = scene('punch-card');
        const slots = new Set<string>();
        for (const c of graph.commits.values()) {
            const d = new Date(c.authoredAt);
            slots.add(`${d.getUTCHours()}-${(d.getUTCDay() + 6) % 7}`);
        }
        expect(s.strokes.filter((st) => st.id.startsWith('hole-')).length).toBe(slots.size);
        expect(s.texts.some((t) => t.text.startsWith('Busiest slot: '))).toBe(true);
    });
});
