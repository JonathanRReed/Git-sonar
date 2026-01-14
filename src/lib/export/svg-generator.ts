/**
 * True Vector SVG Generator for Git Sonar
 * 
 * Generates real SVG elements (circles, paths, text) instead of
 * embedding raster images.
 */

import type { RepoGraph, PositionedNode, CommitEdge, BackgroundStyle, ThemeColors } from '@lib/git/types';
import { hexToRgba, lightenColor } from '@lib/utils/color';
import { formatTimelineDate } from '@lib/utils/formatting';

// Rosé Pine colors (default theme)
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

export type ExportSize = 'native' | 'A4' | 'A3' | 'A2' | 'A1' | 'Square' | 'Poster18x24' | 'Poster24x36';
export type LayoutMode = 'vertical' | 'horizontal' | 'radial';

export interface SVGExportLayout {
    laneWidth: number;
    rowHeight: number;
    paddingLeft: number;
    paddingTop: number;
    labelOffset: number;
    radialStartRadius?: number;
    radialStep?: number;
    radialCenter?: { x: number; y: number };
}

export interface SVGExportOptions {
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
    /** Scale factor for high-DPI export */
    scale?:1 | 2 | 4;
    /** Custom title for poster mode */
    title?: string;
    /** Include timeline ruler on the side */
    includeTimeline?: boolean;
    /** Export size preset */
    exportSize?: ExportSize;
    /** Bleed margin in inches (for print presets) */
    bleedInches?: number;
    /** Render crop marks for print */
    includeCropMarks?: boolean;
    /** Render safe-area guides for trimming */
    includeSafeArea?: boolean;
    /** Safe-area margin in inches */
    safeAreaInches?: number;
    /** Layout mode used for the export */
    layoutMode?: LayoutMode;
    /** Layout dimensions to match the canvas */
    layout?: SVGExportLayout;
}

/**
 * Generate a true vector SVG from the graph data.
 */
export function generateVectorSVG(
    graph: RepoGraph,
    nodes: PositionedNode[],
    edges: CommitEdge[],
    options: SVGExportOptions = {}
): string {
    const {
        includeLabels = true,
        includeLanes = true,
        background = 'solid',
        backgroundColor,
        themeColors,
        scale = 1,
        title,
        includeTimeline = false,
        exportSize = 'native',
        bleedInches = 0,
        includeCropMarks = false,
        includeSafeArea = false,
        safeAreaInches = 0.25,
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

    const padding = 40;
    const paddedMinX = bounds.minX - padding;
    const paddedMinY = bounds.minY - padding;
    const paddedMaxX = bounds.maxX + padding;
    const paddedMaxY = bounds.maxY + padding;

    const contentWidth = Math.max(1, paddedMaxX - paddedMinX);
    const contentHeight = Math.max(1, paddedMaxY - paddedMinY);
    const offsetX = -paddedMinX;
    const offsetY = -paddedMinY;

    const width = contentWidth * scale;
    const height = contentHeight * scale;

    const sizePresets: Record<ExportSize, { width: number; height: number } | null> = {
        native: null,
        A4: { width: 11.69, height: 8.27 },
        A3: { width: 16.54, height: 11.69 },
        A2: { width: 23.39, height: 16.54 },
        A1: { width: 33.11, height: 23.39 },
        Square: { width: 24, height: 24 },
        Poster18x24: { width: 24, height: 18 },
        Poster24x36: { width: 36, height: 24 },
    };

    const preset = sizePresets[exportSize];
    const bleedTotal = preset ? bleedInches * 2 : 0;
    const widthAttr = preset ? `${preset.width + bleedTotal}in` : `${width}`;
    const heightAttr = preset ? `${preset.height + bleedTotal}in` : `${height}`;

    // Create SVG
    const svgParts: string[] = [];
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" height="${heightAttr}" viewBox="0 0 ${contentWidth} ${contentHeight}">`);

    // Crop marks for print presets
    if (preset && includeCropMarks) {
        const markLength = 20;
        const offset = bleedInches > 0 ? bleedInches * 72 : 9; // 72px per inch in SVG units
        const maxX = contentWidth;
        const maxY = contentHeight;

        svgParts.push(`  <g class="crop-marks" stroke="${hexToRgba(colors.highlightMed, 0.4)}" stroke-width="1" fill="none">`);
        // Top-left
        svgParts.push(`    <line x1="${offset}" y1="${offset}" x2="${offset + markLength}" y2="${offset}" />`);
        svgParts.push(`    <line x1="${offset}" y1="${offset}" x2="${offset}" y2="${offset + markLength}" />`);
        // Top-right
        svgParts.push(`    <line x1="${maxX - offset - markLength}" y1="${offset}" x2="${maxX - offset}" y2="${offset}" />`);
        svgParts.push(`    <line x1="${maxX - offset}" y1="${offset}" x2="${maxX - offset}" y2="${offset + markLength}" />`);
        // Bottom-left
        svgParts.push(`    <line x1="${offset}" y1="${maxY - offset}" x2="${offset + markLength}" y2="${maxY - offset}" />`);
        svgParts.push(`    <line x1="${offset}" y1="${maxY - offset - markLength}" x2="${offset}" y2="${maxY - offset}" />`);
        // Bottom-right
        svgParts.push(`    <line x1="${maxX - offset - markLength}" y1="${maxY - offset}" x2="${maxX - offset}" y2="${maxY - offset}" />`);
        svgParts.push(`    <line x1="${maxX - offset}" y1="${maxY - offset - markLength}" x2="${maxX - offset}" y2="${maxY - offset}" />`);
        svgParts.push(`  </g>`);
    }

    // Safe area guide
    if (preset && includeSafeArea) {
        const inset = (bleedInches + safeAreaInches) * 72;
        const guideX = inset;
        const guideY = inset;
        const guideWidth = contentWidth - inset * 2;
        const guideHeight = contentHeight - inset * 2;

        if (guideWidth > 0 && guideHeight > 0) {
            svgParts.push(`  <rect x="${guideX}" y="${guideY}" width="${guideWidth}" height="${guideHeight}" fill="none" stroke="${hexToRgba(colors.highlightHigh, 0.35)}" stroke-width="1" stroke-dasharray="4 4" />`);
        }
    }


    // Definitions for gradients, filters, etc.
    svgParts.push(`  <defs>`);
    if (normalizedBackground.type === 'gradient') {
        const angle = resolvedBackground.gradientAngle * (Math.PI / 180);
        const cx = contentWidth / 2;
        const cy = contentHeight / 2;
        const half = Math.max(contentWidth, contentHeight) / 2;
        const x0 = cx + Math.cos(angle + Math.PI) * half;
        const y0 = cy + Math.sin(angle + Math.PI) * half;
        const x1 = cx + Math.cos(angle) * half;
        const y1 = cy + Math.sin(angle) * half;

        svgParts.push(`    <linearGradient id="bgGradient" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}">`);
        svgParts.push(`      <stop offset="0%" stop-color="${resolvedBackground.gradientStart}"/>`);
        svgParts.push(`      <stop offset="100%" stop-color="${resolvedBackground.gradientEnd}"/>`);
        svgParts.push(`    </linearGradient>`);
    }
    if (normalizedBackground.type === 'grid') {
        const gridSize = 80;
        const gridLine = hexToRgba(colors.highlightMed, 0.25);
        svgParts.push(`    <pattern id="bgGrid" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">`);
        svgParts.push(`      <path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="${gridLine}" stroke-width="1"/>`);
        svgParts.push(`    </pattern>`);
    }
    svgParts.push(`    <style>`);
    svgParts.push(`      .node-label { font-family: 'Inter', system-ui, sans-serif; font-size: 12px; font-weight: 600; fill: ${colors.text}; }`);
    svgParts.push(`      .branch-label { font-family: 'Inter', system-ui, sans-serif; font-size: 12px; font-weight: 600; fill: ${colors.text}; }`);
    svgParts.push(`    </style>`);
    svgParts.push(`  </defs>`);

    // Background
    if (normalizedBackground.type === 'solid') {
        svgParts.push(`  <rect width="100%" height="100%" fill="${resolvedBackground.color}"/>`);
    } else if (normalizedBackground.type === 'gradient') {
        svgParts.push(`  <rect width="100%" height="100%" fill="url(#bgGradient)"/>`);
    } else if (normalizedBackground.type === 'grid') {
        svgParts.push(`  <rect width="100%" height="100%" fill="${resolvedBackground.color}"/>`);
        svgParts.push(`  <rect width="100%" height="100%" fill="url(#bgGrid)"/>`);
    }

    // Lane lines
    if (includeLanes && layoutMode !== 'radial') {
        svgParts.push(`    <!-- Lane guide lines -->`);
        const maxLane = Math.max(...nodes.map(n => n.lane), 0);
        svgParts.push(`    <g class="lanes" stroke="${hexToRgba(colors.highlightMed, 0.35)}" stroke-width="1" stroke-dasharray="6 12">`);
        for (let lane = 0; lane <= maxLane; lane++) {
            if (layoutMode === 'horizontal') {
                const y = layout.paddingLeft + lane * layout.laneWidth + offsetY;
                svgParts.push(`      <line x1="0" y1="${y}" x2="${contentWidth}" y2="${y}"/>`);
            } else {
                const x = layout.paddingLeft + lane * layout.laneWidth + offsetX;
                svgParts.push(`      <line x1="${x}" y1="0" x2="${x}" y2="${contentHeight}"/>`);
            }
        }
        svgParts.push(`    </g>`);
    }

    // Branch labels
    if (includeLabels && graph) {
        svgParts.push(`    <!-- Branch labels -->`);
        svgParts.push(`    <g class="branch-labels">`);
        for (const [branchName, sha] of graph.heads) {
            const headNode = nodes.find(node => node.id === sha);
            if (!headNode) continue;

            const labelPos = getLabelPos(headNode);
            const x = labelPos.x + offsetX;
            const y = labelPos.y + offsetY;
            const color = laneColors[headNode.lane % laneColors.length];

            // Measure text width (approximate)
            const textWidth = branchName.length * 7;
            const padding = 10;
            const pillWidth = textWidth + padding * 2;
            const pillHeight = 24;
            const pillRadius = 8;

            svgParts.push(`      <rect x="${x - pillWidth / 2}" y="${y - pillHeight / 2}" width="${pillWidth}" height="${pillHeight}" rx="${pillRadius}" fill="${hexToRgba(colors.surface, 0.9)}" stroke="${hexToRgba(color, 0.6)}" stroke-width="1"/>`);
            svgParts.push(`      <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" class="branch-label">${escapeXml(branchName)}</text>`);
        }
        svgParts.push(`    </g>`);
    }

    // Title (poster mode)
    if (title) {
        svgParts.push(`    <!-- Title -->`);
        svgParts.push(`    <g class="title">`);
        svgParts.push(`      <text x="${contentWidth / 2 + offsetX}" y="${30 + offsetY}" text-anchor="middle" font-family="'Inter', system-ui, sans-serif" font-size="24" font-weight="700" fill="${colors.text}">${escapeXml(title)}</text>`);
        svgParts.push(`    </g>`);
    }

    // Timeline ruler (poster mode)
    if (includeTimeline && layoutMode === 'vertical') {
        svgParts.push(`    <!-- Timeline ruler -->`);
        svgParts.push(`    <g class="timeline">`);
        svgParts.push(`      <line x1="${60 + offsetX}" y1="${layout.paddingTop + offsetY}" x2="${60 + offsetX}" y2="${bounds.maxY + offsetY}" stroke="${hexToRgba(colors.highlightMed, 0.4)}" stroke-width="1"/>`);
        
        // Add tick marks for dates
        if (nodes.length > 0) {
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

                    svgParts.push(`      <line x1="${60 + offsetX}" y1="${y}" x2="${70 + offsetX}" y2="${y}" stroke="${hexToRgba(colors.highlightMed, 0.4)}" stroke-width="1"/>`);
                    svgParts.push(`      <text x="${50 + offsetX}" y="${y + 3}" text-anchor="end" font-family="'Inter', system-ui, sans-serif" font-size="10" fill="${colors.muted}">${dateStr}</text>`);
                }
            }
        }
        svgParts.push(`    </g>`);
    }

    // Edges
    svgParts.push(`    <!-- Edges -->`);
    svgParts.push(`    <g class="edges" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    for (const edge of edges) {
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        if (!fromNode || !toNode) continue;

        const from = getNodePos(fromNode);
        const to = getNodePos(toNode);
        const color = laneColors[toNode.lane % laneColors.length];
        const strokeWidth = edge.isMerge ? 2.4 : 1.8;

        let pathD: string;
        if (layoutMode === 'horizontal' && Math.abs(from.y - to.y) > 1) {
            const fromX = from.x + offsetX;
            const fromY = from.y + offsetY;
            const toX = to.x + offsetX;
            const toY = to.y + offsetY;
            const midX = (fromX + toX) / 2;
            pathD = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
        } else if (layoutMode !== 'radial' && Math.abs(from.x - to.x) > 1) {
            // Bezier curve for cross-lane edges
            const fromX = from.x + offsetX;
            const fromY = from.y + offsetY;
            const toX = to.x + offsetX;
            const toY = to.y + offsetY;
            const midY = (fromY + toY) / 2;
            pathD = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
        } else {
            // Straight line for same-lane edges
            pathD = `M ${from.x + offsetX} ${from.y + offsetY} L ${to.x + offsetX} ${to.y + offsetY}`;
        }

        svgParts.push(`      <path d="${pathD}" stroke="${hexToRgba(color, 0.9)}" stroke-width="${strokeWidth}"/>`);
    }
    svgParts.push(`    </g>`);

    // Nodes
    svgParts.push(`    <!-- Nodes -->`);
    svgParts.push(`    <g class="nodes">`);
    for (const node of nodes) {
        const pos = getNodePos(node);
        const isMerge = node.commit.parents.length > 1;
        const isRoot = node.commit.parents.length === 0;
        const color = laneColors[node.lane % laneColors.length];
        const radius = isMerge ? NODE_RADIUS_MERGE : NODE_RADIUS;
        const cx = pos.x + offsetX;
        const cy = pos.y + offsetY;

        if (isRoot) {
            // Diamond for root commits
            const points = [
                `${cx},${cy - radius}`,
                `${cx + radius},${cy}`,
                `${cx},${cy + radius}`,
                `${cx - radius},${cy}`,
            ].join(' ');
            svgParts.push(`      <polygon points="${points}" fill="${color}" data-sha="${node.id.slice(0, 7)}" data-type="root"/>`);
        } else if (isMerge) {
            // Hexagon for merge commits
            const points: string[] = [];
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                const px = cx + radius * Math.cos(angle);
                const py = cy + radius * Math.sin(angle);
                points.push(`${px},${py}`);
            }
            svgParts.push(`      <polygon points="${points.join(' ')}" fill="${color}" data-sha="${node.id.slice(0, 7)}" data-type="merge"/>`);
        } else {
            // Circle for regular commits
            svgParts.push(`      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}" data-sha="${node.id.slice(0, 7)}"/>`);
        }

        // Inner highlight dot
        const highlightRadius = radius * 0.25;
        svgParts.push(`      <circle cx="${cx - radius * 0.25}" cy="${cy - radius * 0.25}" r="${highlightRadius}" fill="${hexToRgba(lightenColor(color, 60), 0.5)}"/>`);
    }
    svgParts.push(`    </g>`);

    // Close SVG
    svgParts.push(`</svg>`);

    return svgParts.join('\n');
}

/**
 * Generate SVG and trigger download.
 */
export function downloadVectorSVG(
    graph: RepoGraph,
    nodes: PositionedNode[],
    edges: CommitEdge[],
    filename = 'git-sonar.svg',
    options?: SVGExportOptions
): void {
    const svgContent = generateVectorSVG(graph, nodes, edges, options);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();

    window.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

/**
 * Open a print dialog for vector SVG (PDF export).
 */
export function openPrintableSVG(
    graph: RepoGraph,
    nodes: PositionedNode[],
    edges: CommitEdge[],
    options?: SVGExportOptions
): void {
    const svgContent = generateVectorSVG(graph, nodes, edges, options);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Git Sonar Export</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
    body { display: flex; align-items: center; justify-content: center; background: #111; }
    svg { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body>
${svgContent}
</body>
</html>`);

    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
    };
}

/**
 * Escape XML special characters.
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
