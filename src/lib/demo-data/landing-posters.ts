/**
 * Landing-page posters — shared by the build-time generator (tools/gen-landing-posters.mts)
 * and the landing page itself. The generator writes each poster to a standalone
 * /posters/<id>.svg file; the page references them via lazy <img> (so the HTML
 * stays tiny instead of inlining megabytes of generative SVG). The "remix"
 * permalink opens the full Showcase repo in the studio.
 */

import { buildShowcaseGraph } from './showcase';
import { renderPoster } from '@lib/art/poster-renderer';
import { sceneToSVG } from '@lib/art/render-svg';
import { makePosterConfig, encodePosterConfig, type PosterConfig } from '@lib/art/poster-config';
import { TEMPLATES } from '@lib/art/templates';
import type { ThemeId } from '@lib/themes';

interface Spec {
    id: string;
    template: string;
    themeId: ThemeId;
    label: string;
    /** Wall-label line: what the marks on this poster mean. */
    medium: string;
}

// Ordered and themed so the wall alternates dark sheets, paper and colour
// instead of bunching the dark ones together.
const SPECS: Spec[] = [
    { id: 'growth-rings', template: 'growth-rings', themeId: 'paper', label: 'Growth rings', medium: 'One ring for every week' },
    { id: 'pulsar', template: 'pulsar', themeId: 'night', label: 'Pulsar', medium: 'How often commits landed, as ridgelines' },
    { id: 'transit-map', template: 'transit-map', themeId: 'riso', label: 'Transit map', medium: 'Branches as lines, merges as interchanges' },
    { id: 'flow-field', template: 'flow-field', themeId: 'dawn', label: 'Flow field', medium: 'Lines coloured by author' },
    { id: 'receipt', template: 'receipt', themeId: 'blueprint', label: 'Receipt', medium: 'Every author, itemised' },
    { id: 'core-sample', template: 'core-sample', themeId: 'paper', label: 'Core sample', medium: 'A layer for every month' },
    { id: 'punch-card', template: 'punch-card', themeId: 'night', label: 'Punch card', medium: 'Commits by weekday and hour' },
    { id: 'weave', template: 'weave', themeId: 'paper', label: 'Weave', medium: 'A row per week, dyed by author' },
    { id: 'radial', template: 'radial-year', themeId: 'dawn', label: 'Year in code', medium: 'A year of commits in a spiral' },
    { id: 'album', template: 'album-tracklist', themeId: 'github', label: 'Album', medium: 'Top commits as a tracklist' },
    { id: 'movie', template: 'movie-one-sheet', themeId: 'night', label: 'Movie one-sheet', medium: 'Commit graph with a credits block' },
    { id: 'festival', template: 'festival', themeId: 'riso', label: 'Festival lineup', medium: 'Authors as the lineup' },
    { id: 'constellation', template: 'constellation', themeId: 'night', label: 'Constellation', medium: 'Every commit a star' },
    { id: 'swiss', template: 'swiss', themeId: 'paper', label: 'Swiss grid', medium: 'The numbers, set on a grid' },
];

function cfgFor(spec: Spec): PosterConfig {
    const t = TEMPLATES[spec.template];
    return makePosterConfig({
        template: spec.template,
        themeId: spec.themeId,
        paletteMood: t?.defaultMood ?? 'theme',
        layout: t?.recommendedLayout ?? 'vertical',
        seed: t?.heroSeed ?? 'sonar',
        encoding: { ...(t?.defaultEncoding ?? {}) },
        title: 'Project Atlas',
        orientation: 'portrait',
    });
}

export interface LandingPoster {
    id: string;
    label: string;
    medium: string;
    /** Intrinsic pixel size of the rasterized file, to reserve layout space. */
    width: number;
    height: number;
    /** Static file path served from /public. */
    src: string;
    /** Permalink that opens the full Showcase repo + this config in the studio. */
    remix: string;
}

/** Page-facing metadata (no heavy SVG strings). */
export const LANDING_POSTERS: LandingPoster[] = SPECS.map((s) => ({
    id: s.id,
    label: s.label,
    medium: s.medium,
    width: 1000,
    height: Math.round(1000 / (TEMPLATES[s.template]?.defaultAspect ?? 2 / 3)),
    src: `/posters/${s.id}.webp`,
    remix: `/app?demo=showcase&view=poster#p=${encodePosterConfig(cfgFor(s))}`,
}));

/** The framed posters hung beside the empty frame in the hero (by id). */
// In catalogue order, so the hero labels read No. 01, No. 02.
export const HERO_POSTER_IDS = ['growth-rings', 'pulsar'];

/** Facts about the sample repo, for wall labels. Build-time only. */
export function showcaseFacts(): { commits: number; authors: number; merges: number } {
    const m = buildShowcaseGraph().metrics;
    return { commits: m.commitCount, authors: m.authorCount, merges: m.mergeCount };
}

/**
 * Build-time only: render each poster to an SVG string from the same Showcase
 * graph the remix links open, so the wall and the studio show the same piece.
 * Returns id → svg.
 */
export function renderLandingPosters(): { id: string; label: string; svg: string }[] {
    const graph = buildShowcaseGraph();
    return SPECS.map((s) => ({
        id: s.id,
        label: s.label,
        svg: sceneToSVG(renderPoster(graph, cfgFor(s), 'project-atlas').scene, {
            title: `Project Atlas — ${s.label} poster`,
        }),
    }));
}
