/**
 * Heatmap utilities for Git Sonar
 * 
 * Calculates activity intensity values for commits based on
 * temporal density of commits.
 */

import type { PositionedNode } from '@lib/git/types';

/**
 * Calculate heatmap intensities for nodes based on commit activity
 * Uses a time-based sliding window to measure activity density
 * 
 * @param nodes - Positioned nodes from the graph
 * @param windowMs - Time window in milliseconds (default: 7 days)
 * @returns Map of node ID to intensity value (0-1)
 */
export function calculateHeatmapIntensities(
    nodes: PositionedNode[],
    windowMs = 7 * 24 * 60 * 60 * 1000 // 7 days
): Map<string, number> {
    const intensities = new Map<string, number>();

    if (nodes.length === 0) return intensities;

    // Get all commit times sorted
    const nodesByTime = [...nodes].sort(
        (a, b) => a.commit.authoredAt - b.commit.authoredAt
    );

    // Calculate activity for each node
    for (let i = 0; i < nodesByTime.length; i++) {
        const node = nodesByTime[i];
        const time = node.commit.authoredAt;
        const windowStart = time - windowMs / 2;
        const windowEnd = time + windowMs / 2;

        // Count commits within the window
        let count = 0;
        for (const other of nodesByTime) {
            const otherTime = other.commit.authoredAt;
            if (otherTime >= windowStart && otherTime <= windowEnd) {
                count++;
            }
        }

        // Store raw count for now, will normalize later
        intensities.set(node.id, count);
    }

    // Normalize to 0-1 range
    const maxCount = Math.max(...intensities.values(), 1);
    for (const [id, count] of intensities) {
        intensities.set(id, count / maxCount);
    }

    return intensities;
}

/**
 * Get heatmap color based on intensity value
 * Uses a gradient from cool (blue) to hot (red)
 * 
 * @param intensity - Value from 0 to 1
 * @param baseColor - Optional base color to blend with
 * @returns Hex color string
 */
export function getHeatmapColor(intensity: number, baseColor?: string): string {
    // Clamp intensity to 0-1
    const t = Math.max(0, Math.min(1, intensity));
    
    // Color stops: blue -> cyan -> green -> yellow -> orange -> red
    const stops = [
        { pos: 0, r: 49, g: 116, b: 143 },      // pine/blue
        { pos: 0.25, r: 156, g: 207, b: 216 },   // foam/cyan
        { pos: 0.5, r: 163, g: 190, b: 140 },    // green
        { pos: 0.75, r: 246, g: 193, b: 119 },   // gold
        { pos: 1, r: 235, g: 111, b: 146 },      // love/red
    ];

    // Find the two stops to interpolate between
    let lower = stops[0];
    let upper = stops[stops.length - 1];

    for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i].pos && t <= stops[i + 1].pos) {
            lower = stops[i];
            upper = stops[i + 1];
            break;
        }
    }

    // Interpolate between the two stops
    const range = upper.pos - lower.pos;
    const localT = range > 0 ? (t - lower.pos) / range : 0;

    const r = Math.round(lower.r + (upper.r - lower.r) * localT);
    const g = Math.round(lower.g + (upper.g - lower.g) * localT);
    const b = Math.round(lower.b + (upper.b - lower.b) * localT);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Calculate heatmap intensities by author activity
 * Nodes are colored based on how active the author was during that period
 * 
 * @param nodes - Positioned nodes from the graph
 * @returns Map of node ID to intensity value (0-1)
 */
export function calculateAuthorHeatmapIntensities(
    nodes: PositionedNode[]
): Map<string, number> {
    const intensities = new Map<string, number>();

    if (nodes.length === 0) return intensities;

    // Count commits per author (using name as identifier)
    const authorCounts = new Map<string, number>();
    for (const node of nodes) {
        const author = node.commit.authorName;
        authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    }

    // Normalize by max author commits
    const maxCount = Math.max(...authorCounts.values(), 1);

    for (const node of nodes) {
        const author = node.commit.authorName;
        const count = authorCounts.get(author) || 0;
        intensities.set(node.id, count / maxCount);
    }

    return intensities;
}
