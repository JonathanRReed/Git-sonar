/**
 * Utilities for batching edges by lane/color to minimize canvas state changes.
 */

import type { CommitEdge, PositionedNode } from '@lib/git/types';

export interface EdgeBatch {
    /** Lane index for color */
    lane: number;
    /** Whether edges in this batch are merges */
    isMerge: boolean;
    /** Screen coordinates of edges in this batch */
    edges: Array<{
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
    }>;
}

/**
 * Batch edges by lane and type to minimize canvas state changes.
 * 
 * This reduces the number of ctx.strokeStyle and ctx.lineWidth changes,
 * which are expensive operations.
 * 
 * @param edges - All commit edges
 * @param nodeById - Map of node ID to PositionedNode
 * @param getNodeWorldPos - Function to get world coordinates of a node
 * @param worldToScreen - Function to transform world to screen coordinates
 * @param visibleNodeIds - Set of node IDs that are visible (for edge culling)
 * @param edgeViewport - Viewport bounds for edge culling (in world coords)
 * @returns Batches of edges grouped by lane and type
 */
export function batchEdgesByLane(
    edges: CommitEdge[],
    nodeById: Map<string, PositionedNode>,
    getNodeWorldPos: (node: PositionedNode) => { x: number; y: number },
    worldToScreen: (wx: number, wy: number) => { x: number; y: number },
    visibleNodeIds: Set<string> | null,
    edgeViewport: { x: number; y: number; width: number; height: number } | null,
    positionsMap?: Map<string, { x: number; y: number }>
): EdgeBatch[] {
    const batches = new Map<string, EdgeBatch>();

    for (const edge of edges) {
        const fromNode = nodeById.get(edge.from);
        const toNode = nodeById.get(edge.to);
        if (!fromNode || !toNode) continue;

        // Viewport culling
        const fromWorld = positionsMap?.get(edge.from) ?? getNodeWorldPos(fromNode);
        const toWorld = positionsMap?.get(edge.to) ?? getNodeWorldPos(toNode);

        if (visibleNodeIds && edgeViewport) {
            const fromVisible = visibleNodeIds.has(edge.from);
            const toVisible = visibleNodeIds.has(edge.to);
            
            if (!fromVisible && !toVisible) {
                const bothAbove = fromWorld.y < edgeViewport.y && toWorld.y < edgeViewport.y;
                const bothBelow = fromWorld.y > edgeViewport.y + edgeViewport.height &&
                                toWorld.y > edgeViewport.y + edgeViewport.height;
                const bothLeft = fromWorld.x < edgeViewport.x && toWorld.x < edgeViewport.x;
                const bothRight = fromWorld.x > edgeViewport.x + edgeViewport.width &&
                                toWorld.x > edgeViewport.x + edgeViewport.width;
                
                if (bothAbove || bothBelow || bothLeft || bothRight) {
                    continue;
                }
            }
        }

        const key = `${toNode.lane}_${edge.isMerge}`;
        if (!batches.has(key)) {
            batches.set(key, { lane: toNode.lane, isMerge: edge.isMerge, edges: [] });
        }

        const from = worldToScreen(fromWorld.x, fromWorld.y);
        const to = worldToScreen(toWorld.x, toWorld.y);

        batches.get(key)!.edges.push({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
    }

    return Array.from(batches.values());
}
