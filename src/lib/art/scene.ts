/**
 * Scene model — the renderer-agnostic description of a poster.
 *
 * A template produces ONE `Scene`. The SVG renderer turns it into the canonical
 * vector poster (the single source of truth); the canvas renderer paints the
 * same Scene for the live studio preview and for raster export. Because both
 * consume the identical Scene, "what you see is what you export" holds by
 * construction.
 */

import type { Vec2 } from './layout';

export type { Vec2 };

export type GlyphShape =
    | 'circle'
    | 'hexagon'
    | 'diamond'
    | 'square'
    | 'triangle'
    | 'star'
    | 'ring'
    | 'plus'
    | 'none';

export interface SceneNode {
    id: string;
    x: number;
    y: number;
    /** Radius in poster px. */
    r: number;
    fill: string;
    stroke?: string;
    strokeWidth?: number;
    shape: GlyphShape;
    opacity: number;
    /** Halo intensity 0..1 (0 = none). */
    glow?: number;
    /** Optional metadata surfaced as data-* attributes in SVG. */
    sha?: string;
    kind?: 'normal' | 'merge' | 'root';
}

export interface SceneEdge {
    id: string;
    /** Polyline of >=2 points. */
    points: Vec2[];
    color: string;
    width: number;
    opacity: number;
    merge?: boolean;
    /** How to interpolate between points. */
    curve?: 'line' | 'smooth' | 'bezierV' | 'bezierH';
}

export interface SceneStroke {
    id: string;
    points: Vec2[];
    color: string;
    width: number;
    opacity: number;
    closed?: boolean;
    fill?: string;
    smooth?: boolean;
}

export interface SceneText {
    id: string;
    x: number;
    y: number;
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    color: string;
    align: 'start' | 'middle' | 'end';
    letterSpacing?: number;
    opacity?: number;
    /** Optional rotation in degrees about (x,y). */
    rotate?: number;
    /** Render as small-caps-ish all-caps (already uppercased by template). */
    mono?: boolean;
}

export interface SceneBackground {
    kind: 'solid' | 'gradient' | 'grid' | 'none';
    color?: string;
    color2?: string;
    angle?: number;
    gridColor?: string;
    gridSize?: number;
    /** Radial darkening at the edges (0..1). */
    vignette?: number;
    /** Film grain intensity (0..1). */
    grain?: number;
}

export interface SceneFrame {
    color: string;
    width: number;
    inset: number;
    radius?: number;
}

export interface Scene {
    width: number;
    height: number;
    background: SceneBackground;
    /** Generative under-layer (flow field, ridgelines, rings). */
    strokes: SceneStroke[];
    edges: SceneEdge[];
    nodes: SceneNode[];
    texts: SceneText[];
    /** Optional decorative border. */
    frame?: SceneFrame;
    /** Font families used, so the exporter can embed/await them. */
    fontsUsed?: string[];
}

/** Empty scene helper. */
export function emptyScene(width: number, height: number, background: SceneBackground): Scene {
    return { width, height, background, strokes: [], edges: [], nodes: [], texts: [] };
}
