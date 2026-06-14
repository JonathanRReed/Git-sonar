/**
 * Shared graph layout math — the single source of truth for node positioning.
 *
 * Historically `getNodeWorldPos` / `getNodePos` / `getLabelPos` were copy-pasted
 * across use-spatial-index.ts, png-generator.ts, and svg-generator.ts and had
 * begun to drift. This module hoists that math into one place so the interactive
 * canvas, the PNG exporter, and the SVG exporter all position commits identically
 * ("what you see is what you export").
 */

import type { PositionedNode } from '@lib/git/types';

export type LayoutMode = 'vertical' | 'horizontal' | 'radial';

export interface Vec2 {
    x: number;
    y: number;
}

export interface LayoutConfig {
    layoutMode: LayoutMode;
    laneWidth: number;
    rowHeight: number;
    paddingLeft: number;
    paddingTop: number;
    /** Inner radius of the innermost ring (radial). */
    radialStartRadius?: number;
    /** Radial growth per row (radial). */
    radialStep?: number;
    /** Explicit center for radial layouts. */
    radialCenter?: Vec2;
}

export const DEFAULT_RADIAL_START_RADIUS = 150;
export const DEFAULT_RADIAL_STEP = 40;

/**
 * Build a map from commit id to row index. Newest commit is row 0 (top),
 * matching the historical render order used everywhere in the app.
 */
export function buildRowMap(nodes: PositionedNode[]): Map<string, number> {
    const map = new Map<string, number>();
    // `nodes` is oldest-first (topo order); reverse so newest = index 0.
    for (let i = nodes.length - 1, row = 0; i >= 0; i--, row++) {
        map.set(nodes[i].id, row);
    }
    return map;
}

/** Highest lane index present (0 when empty). */
export function maxLane(nodes: PositionedNode[]): number {
    let m = 0;
    for (const n of nodes) if (n.lane > m) m = n.lane;
    return m;
}

/**
 * A reusable positioner bound to a node set + config.
 *
 * For radial layouts the angle is derived from a node's *fractional position
 * within its lane over time* rather than the raw lane index, and the radius is
 * driven by the normalized time `t` — producing a balanced sunburst instead of
 * the old ever-expanding single spiral. Falls back gracefully when `t` is flat.
 */
export function createPositioner(nodes: PositionedNode[], config: LayoutConfig) {
    const rowMap = buildRowMap(nodes);
    const lanes = maxLane(nodes);
    const totalLanes = lanes + 1;
    const rowCount = Math.max(1, nodes.length - 1);

    const {
        layoutMode,
        laneWidth,
        rowHeight,
        paddingLeft,
        paddingTop,
        radialStartRadius = DEFAULT_RADIAL_START_RADIUS,
        radialStep = DEFAULT_RADIAL_STEP,
        radialCenter,
    } = config;

    const center: Vec2 = radialCenter ?? {
        x: paddingLeft + 400,
        y: paddingTop + 300,
    };

    function getPos(node: PositionedNode): Vec2 {
        const rowIndex = rowMap.get(node.id) ?? 0;

        if (layoutMode === 'horizontal') {
            return {
                x: paddingTop + rowIndex * rowHeight,
                y: paddingLeft + node.lane * laneWidth,
            };
        }

        if (layoutMode === 'radial') {
            // Radius: prefer normalized time so spacing reflects real cadence,
            // fall back to row index when every commit shares a timestamp.
            const tBased = Number.isFinite(node.t) ? node.t : rowIndex / rowCount;
            let angle: number;
            if (totalLanes <= 2) {
                // Near-linear repo (the common shape): a lane-only angle would put
                // every commit on the same spoke (album disc collapses to a line).
                // Sweep by time around the full circle so it reads as a sunburst.
                angle = -Math.PI / 2 + tBased * 2 * Math.PI;
            } else {
                // Spread lanes evenly; cap the angular bins so a branch-heavy repo
                // (lanes are never freed upstream) stays a readable sunburst rather
                // than a hair-thin pinwheel.
                const effectiveLanes = Math.min(totalLanes, 24);
                const anglePerLane = (2 * Math.PI) / effectiveLanes;
                angle = (node.lane % effectiveLanes) * anglePerLane - Math.PI / 2 + anglePerLane * 0.18;
            }
            const radius = radialStartRadius + tBased * radialStep * rowCount;
            return {
                x: center.x + radius * Math.cos(angle),
                y: center.y + radius * Math.sin(angle),
            };
        }

        // vertical (default)
        return {
            x: paddingLeft + node.lane * laneWidth,
            y: paddingTop + rowIndex * rowHeight,
        };
    }

    function getLabelPos(node: PositionedNode, labelOffset: number): Vec2 {
        const pos = getPos(node);
        if (layoutMode === 'horizontal') {
            return { x: labelOffset, y: pos.y };
        }
        if (layoutMode === 'radial') {
            const dx = pos.x - center.x;
            const dy = pos.y - center.y;
            const length = Math.hypot(dx, dy) || 1;
            return {
                x: pos.x + (dx / length) * labelOffset,
                y: pos.y + (dy / length) * labelOffset,
            };
        }
        return { x: pos.x, y: labelOffset };
    }

    return { getPos, getLabelPos, rowMap, center, totalLanes, maxLane: lanes };
}

export type Positioner = ReturnType<typeof createPositioner>;
