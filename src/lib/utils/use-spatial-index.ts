/**
 * React hook for managing a spatial index (Quadtree) of graph nodes.
 * Provides O(log n) queries for viewport culling and hit testing.
 */

import { useMemo, useCallback } from 'react';
import { Quadtree, type Bounds } from './quadtree';
import type { PositionedNode } from '@lib/git/types';

export interface NodePosition {
    x: number;
    y: number;
    node: PositionedNode;
}

export interface SpatialIndexConfig {
    layoutMode: 'vertical' | 'horizontal' | 'radial';
    laneWidth: number;
    rowHeight: number;
    paddingLeft: number;
    paddingTop: number;
    radialStartRadius?: number;
    radialStep?: number;
    radialCenter?: { x: number; y: number };
}

/**
 * Hook that maintains a spatial index of nodes for efficient queries.
 * Rebuilds automatically when nodes or layout config changes.
 */
export function useSpatialIndex(
    nodes: PositionedNode[],
    config: SpatialIndexConfig
) {
    // Build a map from node id to row index (newest at top = index 0)
    const nodeRowMap = useMemo(() => {
        const map = new Map<string, number>();
        const reversed = [...nodes].reverse();
        reversed.forEach((node, index) => {
            map.set(node.id, index);
        });
        return map;
    }, [nodes]);

    // Calculate node position in world coordinates
    const getNodeWorldPos = useCallback((node: PositionedNode): { x: number; y: number } => {
        const rowIndex = nodeRowMap.get(node.id) ?? 0;
        const {
            layoutMode,
            laneWidth,
            rowHeight,
            paddingLeft,
            paddingTop,
            radialStartRadius = 150,
            radialStep = 40,
            radialCenter,
        } = config;

        if (layoutMode === 'horizontal') {
            return {
                x: paddingTop + rowIndex * rowHeight,
                y: paddingLeft + node.lane * laneWidth,
            };
        } else if (layoutMode === 'radial') {
            const totalLanes = Math.max(...nodes.map(n => n.lane)) + 1;
            const anglePerLane = (2 * Math.PI) / totalLanes;
            const angle = node.lane * anglePerLane - Math.PI / 2;
            const radius = radialStartRadius + rowIndex * radialStep;
            const center = radialCenter ?? { x: paddingLeft + 400, y: paddingTop + 300 };
            return {
                x: center.x + radius * Math.cos(angle),
                y: center.y + radius * Math.sin(angle),
            };
        }
        // Default: vertical layout
        return {
            x: paddingLeft + node.lane * laneWidth,
            y: paddingTop + rowIndex * rowHeight,
        };
    }, [nodeRowMap, config, nodes]);

    // Build the spatial index
    const spatialIndex = useMemo(() => {
        if (nodes.length === 0) {
            return null;
        }

        // Calculate bounds for the quadtree
        const maxLane = Math.max(...nodes.map(n => n.lane), 0);
        const { laneWidth, rowHeight } = config;
        
        // Add generous padding to handle all layout modes
        const padding = 500;
        let width: number;
        let height: number;

        if (config.layoutMode === 'horizontal') {
            width = nodes.length * rowHeight + padding * 2;
            height = (maxLane + 1) * laneWidth + padding * 2;
        } else if (config.layoutMode === 'radial') {
            // Radial layout can extend in any direction
            const radialStartRadius = config.radialStartRadius ?? 150;
            const radialStep = config.radialStep ?? 40;
            const maxRadius = radialStartRadius + nodes.length * radialStep;
            width = maxRadius * 2 + padding * 2;
            height = maxRadius * 2 + padding * 2;
        } else {
            // Vertical layout
            width = (maxLane + 1) * laneWidth + padding * 2;
            height = nodes.length * rowHeight + padding * 2;
        }

        const bounds: Bounds = {
            x: -padding,
            y: -padding,
            width,
            height,
        };

        const qt = new Quadtree<PositionedNode>(bounds);

        // Insert all nodes with their world positions
        for (const node of nodes) {
            const pos = getNodeWorldPos(node);
            qt.insert(pos.x, pos.y, node);
        }

        return qt;
    }, [nodes, config, getNodeWorldPos]);

    // Pre-computed positions map for O(1) lookups during render
    const positionsMap = useMemo(() => {
        const map = new Map<string, { x: number; y: number }>();
        for (const node of nodes) {
            map.set(node.id, getNodeWorldPos(node));
        }
        return map;
    }, [nodes, getNodeWorldPos]);

    /**
     * Query nodes within a viewport (world coordinates)
     */
    const queryViewport = useCallback((viewport: Bounds): PositionedNode[] => {
        if (!spatialIndex) return [];
        
        // Add padding for node radius
        const paddedViewport: Bounds = {
            x: viewport.x - 50,
            y: viewport.y - 50,
            width: viewport.width + 100,
            height: viewport.height + 100,
        };

        return spatialIndex.queryRange(paddedViewport).map(item => item.data);
    }, [spatialIndex]);

    /**
     * Hit test: find node at a world position
     */
    const hitTestWorld = useCallback((worldX: number, worldY: number, radius: number = 25): PositionedNode | null => {
        if (!spatialIndex) return null;
        return spatialIndex.queryRadius(worldX, worldY, radius);
    }, [spatialIndex]);

    /**
     * Get the world position of a node by ID
     */
    const getPosition = useCallback((nodeId: string): { x: number; y: number } | null => {
        return positionsMap.get(nodeId) ?? null;
    }, [positionsMap]);

    return {
        /** Query nodes visible in a viewport */
        queryViewport,
        /** Hit test at a world position */
        hitTestWorld,
        /** Get world position of a node */
        getPosition,
        /** Get world position of a node (for use in render loop) */
        getNodeWorldPos,
        /** Map of node ID to row index */
        nodeRowMap,
        /** Pre-computed positions map */
        positionsMap,
        /** Number of indexed nodes */
        indexedCount: spatialIndex?.size() ?? 0,
    };
}
