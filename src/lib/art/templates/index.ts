/**
 * Template registry. Add new templates here; the studio reads `TEMPLATE_LIST`
 * for its gallery and `getTemplate` to resolve a config's `template` id.
 *
 * Per-template PRESETS (defaultEncoding / defaultMood / heroSeed / relevantControls)
 * are applied centrally here so each template opens on its strongest "hero" look
 * and the studio only shows the controls that template actually responds to.
 */

import type { PosterTemplate } from '../template';
import { swissTemplate } from './swiss';
import { movieOneSheetTemplate } from './movie-one-sheet';
import { albumTracklistTemplate } from './album-tracklist';
import { pulsarTemplate } from './pulsar';
import { radialYearTemplate } from './radial-year';
import { flowFieldTemplate } from './flow-field';
import { festivalTemplate } from './festival';
import { constellationTemplate } from './constellation';
import { growthRingsTemplate } from './growth-rings';
import { transitMapTemplate } from './transit-map';
import { coreSampleTemplate } from './core-sample';
import { weaveTemplate } from './weave';
import { punchCardTemplate } from './punch-card';
import { receiptTemplate } from './receipt';

type Preset = Pick<PosterTemplate, 'defaultEncoding' | 'defaultMood' | 'heroSeed' | 'relevantControls'>;

const PRESETS: Record<string, Preset> = {
    pulsar: { defaultMood: 'mono', heroSeed: 'pulse', relevantControls: [] },
    'flow-field': {
        defaultEncoding: { hue: 'author', turbulence: 0.72, densityAmount: 0.72, weightScale: 1.1 },
        defaultMood: 'vivid', heroSeed: 'fidenza',
        relevantControls: ['hue', 'turbulence', 'densityAmount', 'weightScale'],
    },
    'movie-one-sheet': {
        defaultEncoding: { size: 'churn', hue: 'author', glow: 0.6 },
        defaultMood: 'theme', heroSeed: 'reel',
        relevantControls: ['layout', 'hue', 'size', 'sizeScale', 'glow'],
    },
    'radial-year': {
        defaultEncoding: { hue: 'author', size: 'churn', glow: 0.5 },
        defaultMood: 'theme', heroSeed: 'orbit',
        relevantControls: ['hue', 'size', 'sizeScale', 'glow'],
    },
    'album-tracklist': {
        defaultEncoding: { hue: 'author', size: 'churn', glow: 0.5 },
        defaultMood: 'duotone', heroSeed: 'sideA',
        relevantControls: ['hue', 'size', 'sizeScale', 'glow'],
    },
    festival: { defaultMood: 'theme', heroSeed: 'fest', relevantControls: [] },
    constellation: {
        defaultEncoding: { size: 'churn', densityAmount: 0.6, glow: 0.7 },
        defaultMood: 'theme', heroSeed: 'orion',
        relevantControls: ['size', 'densityAmount', 'glow'],
    },
    // The data-drawn styles compose themselves; only the roll and palette apply.
    'growth-rings': { defaultMood: 'duotone', heroSeed: 'oak', relevantControls: [] },
    'transit-map': { defaultMood: 'vivid', heroSeed: 'central', relevantControls: [] },
    'core-sample': { defaultMood: 'theme', heroSeed: 'bedrock', relevantControls: [] },
    weave: { defaultMood: 'vivid', heroSeed: 'loom', relevantControls: [] },
    'punch-card': { defaultMood: 'duotone', heroSeed: 'hollerith', relevantControls: [] },
    receipt: { defaultMood: 'mono', heroSeed: 'till', relevantControls: [] },
    swiss: {
        defaultEncoding: { size: 'uniform', hue: 'time' },
        defaultMood: 'mono', heroSeed: 'grid',
        relevantControls: ['layout', 'hue'],
    },
};

function withPreset(t: PosterTemplate): PosterTemplate {
    return { ...t, ...(PRESETS[t.id] ?? {}) };
}

/** Ordered so the gallery leads with the most robust, broadly-flattering looks. */
const ALL: PosterTemplate[] = [
    pulsarTemplate,
    flowFieldTemplate,
    growthRingsTemplate,
    transitMapTemplate,
    coreSampleTemplate,
    weaveTemplate,
    punchCardTemplate,
    receiptTemplate,
    radialYearTemplate,
    albumTracklistTemplate,
    movieOneSheetTemplate,
    constellationTemplate,
    festivalTemplate,
    swissTemplate,
].map(withPreset);

export const TEMPLATES: Record<string, PosterTemplate> = Object.fromEntries(
    ALL.map((t) => [t.id, t])
);

export const TEMPLATE_LIST: PosterTemplate[] = ALL;

export function getTemplate(id: string): PosterTemplate | undefined {
    return TEMPLATES[id];
}

export function getTemplateOrDefault(id: string): PosterTemplate {
    return TEMPLATES[id] ?? TEMPLATES['movie-one-sheet'];
}
