/**
 * Template contract. A `PosterTemplate.build(ctx)` returns one `Scene`.
 *
 * Templates own composition (slots, negative space, focal hierarchy, billing
 * blocks) and call shared helpers in compose.ts for the key-art graph and type.
 */

import type { RepoGraph, PositionedNode, CommitEdge, Theme } from '@lib/git/types';
import type { ArtSignals } from './signals';
import type { Palette } from './palette';
import type { EncodingConfig } from './encoding';
import type { PaletteMood } from './palette';
import type { Scene } from './scene';
import type { RNG } from './rng';
import type { LayoutMode } from './layout';

/** Studio controls a template actually responds to (drives control gating). */
export type ControlKey =
    | 'layout'
    | 'hue'
    | 'size'
    | 'sizeScale'
    | 'weightScale'
    | 'turbulence'
    | 'densityAmount'
    | 'glow';

export type TemplateGroup = 'cinematic' | 'music' | 'generative' | 'data';

export interface PosterOptions {
    title: string;
    subtitle: string;
    /** Repo display name (for captions / billing). */
    repoName: string;
    showWatermark: boolean;
    showSignature: boolean;
    /** Nudge colors toward CMYK-safe gamut. */
    printSafe: boolean;
    /** A formatted date string for the signature line. */
    dateLabel: string;
}

export interface TemplateContext {
    graph: RepoGraph;
    nodes: PositionedNode[];
    edges: CommitEdge[];
    signals: ArtSignals;
    palette: Palette;
    theme: Theme;
    encoding: EncodingConfig;
    /** Active layout from the studio control; graph-based templates honor it. */
    layout: LayoutMode;
    rng: RNG;
    noise2D: (x: number, y: number) => number;
    /** Poster size in px, orientation already resolved. */
    width: number;
    height: number;
    options: PosterOptions;
}

export interface PosterTemplate {
    id: string;
    name: string;
    group: TemplateGroup;
    description: string;
    /** Aspect ratio width/height the template is designed for. */
    defaultAspect: number;
    /** Layout the key-art graph defaults to for this template. */
    recommendedLayout?: LayoutMode;
    /** Encoding overrides applied when this template is selected (its hero look). */
    defaultEncoding?: Partial<EncodingConfig>;
    /** Palette mood applied when this template is selected. */
    defaultMood?: PaletteMood;
    /** Seed that produces a flattering first render. */
    heroSeed?: string;
    /** Studio controls this template responds to; others are hidden. Omit = all. */
    relevantControls?: ControlKey[];
    /** Font keys (see fonts.ts) the template uses, for preload + embed. */
    fonts: string[];
    build(ctx: TemplateContext): Scene;
}
