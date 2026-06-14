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
}

const SPECS: Spec[] = [
    { id: 'pulsar', template: 'pulsar', themeId: 'night', label: 'Pulsar' },
    { id: 'flow-field', template: 'flow-field', themeId: 'dracula', label: 'Flow Field' },
    { id: 'movie', template: 'movie-one-sheet', themeId: 'night', label: 'Movie One-Sheet' },
    { id: 'radial', template: 'radial-year', themeId: 'nord', label: 'Year in Code' },
    { id: 'album', template: 'album-tracklist', themeId: 'github', label: 'Album' },
    { id: 'constellation', template: 'constellation', themeId: 'night', label: 'Constellation' },
    { id: 'festival', template: 'festival', themeId: 'dracula', label: 'Festival Lineup' },
    { id: 'swiss', template: 'swiss', themeId: 'nord', label: 'Swiss Grid' },
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
    /** Static file path served from /public. */
    src: string;
    /** Permalink that opens the full Showcase repo + this config in the studio. */
    remix: string;
}

/** Page-facing metadata (no heavy SVG strings). */
export const LANDING_POSTERS: LandingPoster[] = SPECS.map((s) => ({
    id: s.id,
    label: s.label,
    src: `/posters/${s.id}.webp`,
    remix: `/app?demo=showcase&view=poster#p=${encodePosterConfig(cfgFor(s))}`,
}));

/** The three posters shown in the hero fan (by id). */
export const HERO_POSTER_IDS = ['flow-field', 'movie', 'pulsar'];

/**
 * Build-time only: render each poster to an SVG string. Uses a deliberately
 * light Showcase graph so the generative templates (flow field, pulsar) stay
 * small as standalone files. Returns id → svg.
 */
export function renderLandingPosters(): { id: string; label: string; svg: string }[] {
    const graph = buildShowcaseGraph(0xC0FFEE, 22); // light graph → small SVGs
    return SPECS.map((s) => ({
        id: s.id,
        label: s.label,
        svg: sceneToSVG(renderPoster(graph, cfgFor(s), 'project-atlas').scene, {
            title: `Project Atlas — ${s.label} poster`,
        }),
    }));
}
