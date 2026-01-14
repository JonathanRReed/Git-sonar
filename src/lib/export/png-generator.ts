/**
 * Full-Graph PNG Generator for Git Sonar
 * 
 * Generates a full poster-quality PNG of the entire git graph,
 * not just the visible viewport.
 */

import type { RepoGraph, PositionedNode, CommitEdge, BackgroundStyle, ThemeColors } from '@lib/git/types';
import { hexToRgba, lightenColor } from '@lib/utils/color';
import { formatTimelineDate } from '@lib/utils/formatting';
import type { ExportSize, LayoutMode, SVGExportLayout } from './svg-generator';

// Default theme colors (Rosé Pine)
const DEFAULT_COLORS: ThemeColors = {
    base: '#191724',
    surface: '#1f1d2e',
    overlay: '#26233a',
    muted: '#6e6a86',
    subtle: '#908caa',
    text: '#e0def4',
    love: '#eb6f92',
    gold: '#f6c177',
    rose: '#ebbcba',
    pine: '#31748f',
    foam: '#9ccfd8',
    iris: '#c4a7e7',
    highlightLow: '#21202e',
    highlightMed: '#403d52',
    highlightHigh: '#524f67',
};

// Layout constants
const NODE_RADIUS = 10;
const NODE_RADIUS_MERGE = 13;
const LANE_WIDTH = 120;
const ROW_HEIGHT = 70;
const PADDING_TOP = 120;
const PADDING_LEFT = 100;

export interface PNGExportOptions {
    /** Include branch labels at top */
    includeLabels?: boolean;
    /** Include lane guide lines */
    includeLanes?: boolean;
    /** Background style */
    background?: BackgroundStyle | 'solid' | 'transparent';
    /** Custom background color (only for solid) */
    backgroundColor?: string;
    /** Theme colors for export */
    themeColors?: ThemeColors;
    /** Scale factor for high-DPI export (1, 2, or 4) */
    scale?: 1 | 2 | 4;
    /** Custom title for poster mode */
    title?: string;
    /** Include timeline ruler on the side */
    includeTimeline?: boolean;
    /** Export size preset */
    exportSize?: ExportSize;
    /** Layout mode used for the export */
    layoutMode?: LayoutMode;
    /** Layout dimensions to match the canvas */
    layout?: SVGExportLayout;
}

/**
 * Generate a full-graph PNG from the graph data.
 * Returns a Promise that resolves to a Blob.
 */
export async function generateFullGraphPNG(
    graph: RepoGraph,
    nodes: PositionedNode[],
    edges: CommitEdge[],
    options: PNGExportOptions = {}
): Promise<Blob> {
    const {
        includeLabels = true,
        includeLanes = true,
        background = 'solid',
        backgroundColor,
        themeColors,
        scale = 1,
        title,
        includeTimeline = false,
        layoutMode = 'vertical',
        layout: layoutOverrides,
    } = options;

    const colors = themeColors ?? DEFAULT_COLORS;
    const laneColors = [
        colors.foam,
        colors.iris,
        colors.gold,
        colors.love,
        colors.rose,
        colors.pine,
    ];

    const defaultRadialCenter = { x: PADDING_LEFT + 400, y: PADDING_TOP + 300 };
    const layout: SVGExportLayout = {
        laneWidth: LANE_WIDTH,
        rowHeight: ROW_HEIGHT,
        paddingLeft: PADDING_LEFT,
        paddingTop: PADDING_TOP,
        labelOffset: 40,
        radialStartRadius: 150,
        radialStep: 40,
        radialCenter: layoutOverrides?.radialCenter ?? defaultRadialCenter,
        ...layoutOverrides,
    };

    const normalizedBackground: BackgroundStyle = typeof background === 'string'
        ? { type: background }
        : (background ?? { type: 'solid' });

    const resolvedBackground = {
        color: normalizedBackground.color ?? backgroundColor ?? colors.base,
        gradientStart: normalizedBackground.gradientStart ?? colors.base,
        gradientEnd: normalizedBackground.gradientEnd ?? colors.overlay,
        gradientAngle: normalizedBackground.gradientAngle ?? 135,
    };

    // Build row map (newest at top = index 0)
    const nodeRowMap = new Map<string, number>();
    const reversed = [...nodes].reverse();
    reversed.forEach((node, index) => {
        nodeRowMap.set(node.id, index);
    });

    // Calculate node position
    const getNodePos = (node: PositionedNode) => {
        const rowIndex = nodeRowMap.get(node.id) ?? 0;

        if (layoutMode === 'horizontal') {
            return {
                x: layout.paddingTop + rowIndex * layout.rowHeight,
                y: layout.paddingLeft + node.lane * layout.laneWidth,
            };
        }

        if (layoutMode === 'radial') {
            const totalLanes = Math.max(...nodes.map(n => n.lane), 0) + 1;
            const anglePerLane = (2 * Math.PI) / totalLanes;
            const angle = node.lane * anglePerLane - Math.PI / 2;
            const radius = (layout.radialStartRadius ?? 150) + rowIndex * (layout.radialStep ?? 40);
            const center = layout.radialCenter ?? defaultRadialCenter;
            return {
                x: center.x + radius * Math.cos(angle),
                y: center.y + radius * Math.sin(angle),
            };
        }

        return {
            x: layout.paddingLeft + node.lane * layout.laneWidth,
            y: layout.paddingTop + rowIndex * layout.rowHeight,
        };
    };

    const getLabelPos = (node: PositionedNode) => {
        const pos = getNodePos(node);
        if (layoutMode === 'horizontal') {
            return { x: layout.labelOffset, y: pos.y };
        }
        if (layoutMode === 'radial') {
            const center = layout.radialCenter ?? defaultRadialCenter;
            const dx = pos.x - center.x;
            const dy = pos.y - center.y;
            const length = Math.hypot(dx, dy) || 1;
            return {
                x: pos.x + (dx / length) * layout.labelOffset,
                y: pos.y + (dy / length) * layout.labelOffset,
            };
        }
        return { x: pos.x, y: layout.labelOffset };
    };

    // Calculate bounds
    const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
    };

    const includeBounds = (x: number, y: number) => {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
    };

    for (const node of nodes) {
        const pos = getNodePos(node);
        const radius = node.commit.parents.length > 1 ? NODE_RADIUS_MERGE : NODE_RADIUS;
        includeBounds(pos.x - radius, pos.y - radius);
        includeBounds(pos.x + radius, pos.y + radius);
    }

    if (includeLabels && graph) {
        for (const [branchName, sha] of graph.heads) {
            const headNode = nodes.find(node => node.id === sha);
            if (!headNode) continue;

            const { x, y } = getLabelPos(headNode);
            const textWidth = branchName.length * 7;
            const padding = 10;
            const pillWidth = textWidth + padding * 2;
            const pillHeight = 24;

            includeBounds(x - pillWidth / 2, y - pillHeight / 2);
            includeBounds(x + pillWidth / 2, y + pillHeight / 2);
        }
    }

    if (!Number.isFinite(bounds.minX)) {
        bounds.minX = 0;
        bounds.minY = 0;
        bounds.maxX = PADDING_LEFT * 2 + LANE_WIDTH;
        bounds.maxY = PADDING_TOP * 2 + ROW_HEIGHT;
    }

    const graphPadding = 60;
    const paddedMinX = bounds.minX - graphPadding;
    const paddedMinY = bounds.minY - graphPadding;
    const paddedMaxX = bounds.maxX + graphPadding;
    const paddedMaxY = bounds.maxY + graphPadding;

    const contentWidth = Math.max(1, paddedMaxX - paddedMinX);
    const contentHeight = Math.max(1, paddedMaxY - paddedMinY);
    const offsetX = -paddedMinX;
    const offsetY = -paddedMinY;

    const canvasWidth = Math.ceil(contentWidth * scale);
    const canvasHeight = Math.ceil(contentHeight * scale);

    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to create canvas context');
    }

    // Apply scale
    ctx.scale(scale, scale);

    // Draw background
    if (normalizedBackground.type === 'transparent') {
        ctx.clearRect(0, 0, contentWidth, contentHeight);
    } else if (normalizedBackground.type === 'gradient') {
        const angle = (resolvedBackground.gradientAngle ?? 135) * (Math.PI / 180);
        const cx = contentWidth / 2;
        const cy = contentHeight / 2;
        const half = Math.max(contentWidth, contentHeight) / 2;
        const x0 = cx + Math.cos(angle + Math.PI) * half;
        const y0 = cy + Math.sin(angle + Math.PI) * half;
        const x1 = cx + Math.cos(angle) * half;
        const y1 = cy + Math.sin(angle) * half;
        const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
        gradient.addColorStop(0, resolvedBackground.gradientStart);
        gradient.addColorStop(1, resolvedBackground.gradientEnd);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, contentWidth, contentHeight);
    } else {
        ctx.fillStyle = resolvedBackground.color;
        ctx.fillRect(0, 0, contentWidth, contentHeight);
    }

    // Draw grid if needed
    if (normalizedBackground.type === 'grid') {
        const gridSize = 80;
        ctx.strokeStyle = hexToRgba(colors.highlightMed, 0.25);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 10]);
        for (let x = 0; x <= contentWidth; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, contentHeight);
            ctx.stroke();
        }
        for (let y = 0; y <= contentHeight; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(contentWidth, y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    // Draw poster border
    const borderMargin = 24;
    ctx.strokeStyle = hexToRgba(colors.highlightMed, 0.4);
    ctx.lineWidth = 1;
    ctx.strokeRect(borderMargin, borderMargin, contentWidth - borderMargin * 2, contentHeight - borderMargin * 2);

    // Draw title if provided
    if (title) {
        ctx.font = 'bold 24px Inter, system-ui, sans-serif';
        ctx.fillStyle = colors.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, contentWidth / 2, 30);
    }

    // Draw lane lines
    if (includeLanes && layoutMode !== 'radial') {
        const maxLane = Math.max(...nodes.map(n => n.lane), 0);
        ctx.strokeStyle = hexToRgba(colors.highlightMed, 0.35);
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 12]);
        for (let lane = 0; lane <= maxLane; lane++) {
            ctx.beginPath();
            if (layoutMode === 'horizontal') {
                const y = layout.paddingLeft + lane * layout.laneWidth + offsetY;
                ctx.moveTo(0, y);
                ctx.lineTo(contentWidth, y);
            } else {
                const x = layout.paddingLeft + lane * layout.laneWidth + offsetX;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, contentHeight);
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    // Draw timeline if enabled
    if (includeTimeline && layoutMode === 'vertical' && nodes.length > 0) {
        const timelineX = 60 + offsetX;
        ctx.strokeStyle = hexToRgba(colors.highlightMed, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(timelineX, layout.paddingTop + offsetY);
        ctx.lineTo(timelineX, bounds.maxY + offsetY);
        ctx.stroke();

        const authoredTimes = nodes
            .map((node) => node.commit.authoredAt)
            .filter((time) => Number.isFinite(time));

        if (authoredTimes.length > 0) {
            const newestDate = Math.max(...authoredTimes);
            const oldestDate = Math.min(...authoredTimes);
            const timeSpan = newestDate - oldestDate;

            const week = 1000 * 60 * 60 * 24 * 7;
            const numTicks = timeSpan <= 0
                ? 0
                : Math.min(5, Math.max(3, Math.floor(timeSpan / week)));

            for (let i = 0; i <= numTicks; i++) {
                const ratio = numTicks === 0 ? 0 : i / numTicks;
                const date = oldestDate + (timeSpan * ratio);
                const dateStr = formatTimelineDate(date, timeSpan);
                const y = layout.paddingTop + ((bounds.maxY - layout.paddingTop) * ratio) + offsetY;

                ctx.beginPath();
                ctx.moveTo(timelineX, y);
                ctx.lineTo(timelineX + 10, y);
                ctx.stroke();

                ctx.font = '10px Inter, system-ui, sans-serif';
                ctx.fillStyle = colors.muted;
                ctx.textAlign = 'end';
                ctx.textBaseline = 'middle';
                ctx.fillText(dateStr, timelineX - 10, y);
            }
        }
    }

    // Draw edges
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const edge of edges) {
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        if (!fromNode || !toNode) continue;

        const from = getNodePos(fromNode);
        const to = getNodePos(toNode);
        const color = laneColors[toNode.lane % laneColors.length];
        const strokeWidth = edge.isMerge ? 2.4 : 1.8;

        const fromX = from.x + offsetX;
        const fromY = from.y + offsetY;
        const toX = to.x + offsetX;
        const toY = to.y + offsetY;

        ctx.strokeStyle = hexToRgba(color, 0.9);
        ctx.lineWidth = strokeWidth;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);

        if (layoutMode === 'horizontal' && Math.abs(fromY - toY) > 1) {
            const midX = (fromX + toX) / 2;
            ctx.bezierCurveTo(midX, fromY, midX, toY, toX, toY);
        } else if (layoutMode !== 'radial' && Math.abs(fromX - toX) > 1) {
            const midY = (fromY + toY) / 2;
            ctx.bezierCurveTo(fromX, midY, toX, midY, toX, toY);
        } else {
            ctx.lineTo(toX, toY);
        }
        ctx.stroke();
    }

    // Draw branch labels
    if (includeLabels && graph) {
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        for (const [branchName, sha] of graph.heads) {
            const headNode = nodes.find(node => node.id === sha);
            if (!headNode) continue;

            const labelPos = getLabelPos(headNode);
            const x = labelPos.x + offsetX;
            const y = labelPos.y + offsetY;
            const color = laneColors[headNode.lane % laneColors.length];

            const textWidth = ctx.measureText(branchName).width;
            const padding = 10;
            const pillWidth = textWidth + padding * 2;
            const pillHeight = 24;
            const pillRadius = 8;

            // Draw pill background
            ctx.fillStyle = hexToRgba(colors.surface, 0.9);
            ctx.strokeStyle = hexToRgba(color, 0.6);
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.roundRect(x - pillWidth / 2, y - pillHeight / 2, pillWidth, pillHeight, pillRadius);
            ctx.fill();
            ctx.stroke();

            // Draw text
            ctx.fillStyle = colors.text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(branchName, x, y);
        }
    }

    // Draw nodes
    for (const node of nodes) {
        const pos = getNodePos(node);
        const isMerge = node.commit.parents.length > 1;
        const isRoot = node.commit.parents.length === 0;
        const color = laneColors[node.lane % laneColors.length];
        const radius = isMerge ? NODE_RADIUS_MERGE : NODE_RADIUS;
        const cx = pos.x + offsetX;
        const cy = pos.y + offsetY;

        ctx.fillStyle = color;
        ctx.beginPath();

        if (isRoot) {
            // Diamond for root commits
            ctx.moveTo(cx, cy - radius);
            ctx.lineTo(cx + radius, cy);
            ctx.lineTo(cx, cy + radius);
            ctx.lineTo(cx - radius, cy);
            ctx.closePath();
        } else if (isMerge) {
            // Hexagon for merge commits
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                const px = cx + radius * Math.cos(angle);
                const py = cy + radius * Math.sin(angle);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        } else {
            // Circle for regular commits
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        }
        ctx.fill();

        // Inner highlight dot
        const highlightRadius = radius * 0.25;
        ctx.beginPath();
        ctx.arc(cx - radius * 0.25, cy - radius * 0.25, highlightRadius, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(lightenColor(color, 60), 0.5);
        ctx.fill();
    }

    // Convert canvas to blob
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create PNG blob'));
            }
        }, 'image/png', 1.0);
    });
}

/**
 * Generate full-graph PNG and trigger download.
 */
export async function downloadFullGraphPNG(
    graph: RepoGraph,
    nodes: PositionedNode[],
    edges: CommitEdge[],
    filename = 'git-sonar.png',
    options?: PNGExportOptions
): Promise<void> {
    const blob = await generateFullGraphPNG(graph, nodes, edges, options);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();

    window.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}
