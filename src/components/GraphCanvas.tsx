import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useGraphStore } from '@lib/store/graph-store';
import type { PositionedNode } from '@lib/git/types';
import { getRelativeTime as getRelativeTimeUtil, formatTimelineDate } from '@lib/utils/formatting';
import { hexToRgba, lightenColor as lightenColorUtil } from '@lib/utils/color';
import { useSpatialIndex } from '@lib/utils/use-spatial-index';
import { batchEdgesByLane } from '@lib/utils/edge-batching';

// Layout constants
const NODE_RADIUS = 10;
const NODE_RADIUS_MERGE = 13;
const NODE_RADIUS_SELECTED = 15;
const BASE_LANE_WIDTH = 120;
const BASE_ROW_HEIGHT = 70;
const BASE_PADDING_TOP = 160;
const BASE_PADDING_LEFT = 100;
const POSTER_LANE_WIDTH = 150;
const POSTER_ROW_HEIGHT = 82;
const POSTER_PADDING_TOP = 220;
const POSTER_PADDING_LEFT = 170;
const INSPECT_LABEL_OFFSET = 80;
const POSTER_LABEL_OFFSET = 70;
const RADIAL_START_RADIUS = 150;
const RADIAL_STEP = 40;
const CONTROLS_SAFE_TOP = 88;

// Drag threshold to distinguish click from drag
const DRAG_THRESHOLD = 5;

export function GraphCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewState, setViewState] = useState({ offsetX: 0, offsetY: -50, scale: 1 });
    const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [showHint, setShowHint] = useState(true);

    // Calculate LOD level based on scale
    const lodLevel = useMemo(() => {
        if (viewState.scale < 0.3) return 'low';
        if (viewState.scale < 0.6) return 'medium';
        return 'high';
    }, [viewState.scale]);

    // Drag state tracking with refs for performance
    const dragRef = useRef({
        isDragging: false,
        hasDragged: false,
        startX: 0,
        startY: 0,
    });
    const hoverRafRef = useRef<number | null>(null);
    const lastHoverIdRef = useRef<string | null>(null);

    const { nodes, edges, selectedId, selectCommit, graph, toggleDetails, viewMode, reducedMotion, layoutMode, backgroundStyle, theme, showDatelines } = useGraphStore();
    const colors = theme.colors;
    const laneColors = useMemo(() => ([
        colors.foam,
        colors.iris,
        colors.gold,
        colors.love,
        colors.rose,
        colors.pine,
    ]), [colors]);
    const laneAccents = useMemo(() => laneColors.map(color => ({
        main: color,
        light: lightenColorUtil(color, 25),
    })), [laneColors]);
    const isPosterMode = viewMode === 'poster';
    const layout = useMemo(() => ({
        laneWidth: isPosterMode ? POSTER_LANE_WIDTH : BASE_LANE_WIDTH,
        rowHeight: isPosterMode ? POSTER_ROW_HEIGHT : BASE_ROW_HEIGHT,
        paddingTop: isPosterMode ? POSTER_PADDING_TOP : BASE_PADDING_TOP,
        paddingLeft: isPosterMode ? POSTER_PADDING_LEFT : BASE_PADDING_LEFT,
        labelOffset: isPosterMode ? POSTER_LABEL_OFFSET : INSPECT_LABEL_OFFSET,
    }), [isPosterMode]);

    const radialCenter = useMemo(() => ({
        x: layout.paddingLeft + 400,
        y: layout.paddingTop + 300,
    }), [layout.paddingLeft, layout.paddingTop]);

    // Spatial indexing for O(log n) viewport culling and hit testing
    const spatialConfig = useMemo(() => ({
        layoutMode,
        laneWidth: layout.laneWidth,
        rowHeight: layout.rowHeight,
        paddingLeft: layout.paddingLeft,
        paddingTop: layout.paddingTop,
        radialStartRadius: RADIAL_START_RADIUS,
        radialStep: RADIAL_STEP,
        radialCenter,
    }), [layoutMode, layout, radialCenter]);
    
    const { 
        queryViewport, 
        hitTestWorld, 
        getNodeWorldPos: getNodeWorldPosFromIndex,
        positionsMap 
    } = useSpatialIndex(nodes, spatialConfig);

    // Hide hint after 4 seconds
    useEffect(() => {
        if (nodes.length === 0) return;
        if (reducedMotion || isPosterMode) {
            setShowHint(false);
            return;
        }
        if (showHint) {
            const timeout = setTimeout(() => setShowHint(false), 3500);
            return () => clearTimeout(timeout);
        }
    }, [nodes.length, showHint, reducedMotion, isPosterMode]);

    // Node lookup map for O(1) access
    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

    // Use the spatial index's getNodeWorldPos function
    const getNodeWorldPos = getNodeWorldPosFromIndex;

    const getLabelPos = useCallback((node: PositionedNode) => {
        const pos = positionsMap.get(node.id) ?? getNodeWorldPos(node);
        if (layoutMode === 'horizontal') {
            return { x: layout.labelOffset, y: pos.y };
        }
        if (layoutMode === 'radial') {
            const dx = pos.x - radialCenter.x;
            const dy = pos.y - radialCenter.y;
            const length = Math.hypot(dx, dy) || 1;
            return {
                x: pos.x + (dx / length) * layout.labelOffset,
                y: pos.y + (dy / length) * layout.labelOffset,
            };
        }
        return { x: pos.x, y: layout.labelOffset };
    }, [getNodeWorldPos, layout.labelOffset, layoutMode, positionsMap, radialCenter]);

    // Transform world coordinates to screen coordinates
    const worldToScreen = useCallback((wx: number, wy: number) => {
        return {
            x: (wx - viewState.offsetX) * viewState.scale,
            y: (wy - viewState.offsetY) * viewState.scale,
        };
    }, [viewState]);

    // Transform screen coordinates to world coordinates
    const screenToWorld = useCallback((sx: number, sy: number) => {
        return {
            x: sx / viewState.scale + viewState.offsetX,
            y: sy / viewState.scale + viewState.offsetY,
        };
    }, [viewState]);

    // Find node at screen position using spatial index - O(log n)
    const hitTest = useCallback((screenX: number, screenY: number): PositionedNode | null => {
        const world = screenToWorld(screenX, screenY);
        // Use spatial index for O(log n) hit testing
        const hitRadius = NODE_RADIUS_MERGE + 10; // Max possible radius
        return hitTestWorld(world.x, world.y, hitRadius);
    }, [screenToWorld, hitTestWorld]);

    // Center view on graph when nodes first load - with retry logic
    useEffect(() => {
        if (nodes.length === 0) return;
        if (initialized) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        if (canvasWidth === 0 || canvasHeight === 0) {
            const retryId = setTimeout(() => setInitialized(false), 50);
            return () => clearTimeout(retryId);
        }

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (const node of nodes) {
            const pos = positionsMap.get(node.id) ?? getNodeWorldPos(node);
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x);
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y);
        }

        const graphCenterX = (minX + maxX) / 2;
        const graphCenterY = (minY + maxY) / 2;
        const anchorY = layoutMode === 'radial' ? graphCenterY : minY;

        setViewState({
            offsetX: graphCenterX - canvasWidth / 2,
            offsetY: anchorY - canvasHeight / 4,
            scale: 1,
        });

        if (nodes.length > 0 && !selectedId) {
            const newestNode = [...nodes].reverse()[0];
            if (newestNode) {
                selectCommit(newestNode.id);
            }
        }

        setInitialized(true);
        setShowHint(true);
    }, [nodes, initialized, selectedId, selectCommit, getNodeWorldPos, positionsMap, layoutMode]);

    // Reset initialized state when graph changes
    useEffect(() => {
        setInitialized(false);
    }, [graph]);

    // Smooth scroll to selected node (respects reduced motion preference)
    useEffect(() => {
        if (!selectedId || nodes.length === 0 || !initialized) return;

        const node = nodes.find(n => n.id === selectedId);
        if (!node) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        const pos = positionsMap.get(node.id) ?? getNodeWorldPos(node);
        const targetX = pos.x - canvasWidth / (2 * viewState.scale);
        const targetY = pos.y - canvasHeight / (2 * viewState.scale);

        // If reduced motion is preferred, jump immediately without animation
        if (reducedMotion) {
            setViewState(prev => ({
                ...prev,
                offsetX: targetX,
                offsetY: targetY,
            }));
            return;
        }

        let frameCount = 0;
        const maxFrames = 30;

        const animate = () => {
            frameCount++;
            if (frameCount > maxFrames) return;

            setViewState(prev => {
                const dx = targetX - prev.offsetX;
                const dy = targetY - prev.offsetY;

                if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return prev;

                return {
                    ...prev,
                    offsetX: prev.offsetX + dx * 0.15,
                    offsetY: prev.offsetY + dy * 0.15,
                };
            });

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }, [selectedId, nodes, getNodeWorldPos, positionsMap, viewState.scale, initialized, reducedMotion]);

    // Render the canvas - optimized for performance
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { alpha: true });
        if (!canvas || !ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;

        const drawBackground = () => {
            if (backgroundStyle.type === 'transparent') {
                ctx.clearRect(0, 0, canvasWidth, canvasHeight);
                return;
            }

            if (backgroundStyle.type === 'gradient') {
                const start = backgroundStyle.gradientStart ?? colors.base;
                const end = backgroundStyle.gradientEnd ?? colors.overlay;
                const angle = (backgroundStyle.gradientAngle ?? 135) * (Math.PI / 180);
                const cx = canvasWidth / 2;
                const cy = canvasHeight / 2;
                const half = Math.max(canvasWidth, canvasHeight) / 2;
                const x0 = cx + Math.cos(angle + Math.PI) * half;
                const y0 = cy + Math.sin(angle + Math.PI) * half;
                const x1 = cx + Math.cos(angle) * half;
                const y1 = cy + Math.sin(angle) * half;
                const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
                gradient.addColorStop(0, start);
                gradient.addColorStop(1, end);
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = backgroundStyle.color ?? colors.base;
            }

            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            if (backgroundStyle.type === 'grid') {
                const rowSpacing = layout.rowHeight * viewState.scale;
                const originY = (layout.paddingTop - viewState.offsetY) * viewState.scale;
                const startY = ((originY % rowSpacing) + rowSpacing) % rowSpacing;
                const colSpacing = layout.laneWidth * viewState.scale;
                const originX = (layout.paddingLeft - viewState.offsetX) * viewState.scale;
                const startX = ((originX % colSpacing) + colSpacing) % colSpacing;

                ctx.strokeStyle = hexToRgba(colors.highlightLow, 0.45);
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 10]);
                for (let x = startX; x <= canvasWidth; x += colSpacing) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, canvasHeight);
                    ctx.stroke();
                }
                for (let y = startY; y <= canvasHeight; y += rowSpacing) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(canvasWidth, y);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
            }
        };

        drawBackground();


        if (nodes.length === 0) {
            ctx.fillStyle = colors.muted;
            ctx.font = '16px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No repository loaded', canvasWidth / 2, canvasHeight / 2);
            return;
        }

        const { scale } = viewState;

        if (isPosterMode) {
            const border = 24 * scale;
            ctx.strokeStyle = hexToRgba(colors.highlightMed, 0.4);
            ctx.lineWidth = 1;
            ctx.strokeRect(border, border, canvasWidth - border * 2, canvasHeight - border * 2);
        }

        // Draw modern grid/lane lines with gradient
        const maxLane = Math.max(...nodes.map(n => n.lane), 0);

        if (!isPosterMode && backgroundStyle.type !== 'grid' && layoutMode !== 'radial') {
            for (let lane = 0; lane <= maxLane; lane++) {
                ctx.strokeStyle = hexToRgba(colors.highlightMed, 0.35);
                ctx.lineWidth = 1;
                ctx.setLineDash([6, 12]);
                ctx.beginPath();
                if (layoutMode === 'horizontal') {
                    const { y } = worldToScreen(0, layout.paddingLeft + lane * layout.laneWidth);
                    ctx.moveTo(0, y);
                    ctx.lineTo(canvasWidth, y);
                } else {
                    const { x } = worldToScreen(layout.paddingLeft + lane * layout.laneWidth, 0);
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, canvasHeight);
                }
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        // Draw dateline guides based on commit authoredAt
        if (showDatelines && layoutMode !== 'radial') {
            const authoredTimes = nodes
                .map((node) => node.commit.authoredAt)
                .filter((time) => Number.isFinite(time));

            if (authoredTimes.length > 1) {
                const newestDate = Math.max(...authoredTimes);
                const oldestDate = Math.min(...authoredTimes);
                const timeSpan = newestDate - oldestDate;
                const month = 1000 * 60 * 60 * 24 * 30;
                const numTicks = timeSpan <= 0
                    ? 0
                    : Math.min(6, Math.max(3, Math.floor(timeSpan / month)));

                const positions = nodes.map((node) => positionsMap.get(node.id) ?? getNodeWorldPos(node));
                const minX = Math.min(...positions.map((pos) => pos.x));
                const maxX = Math.max(...positions.map((pos) => pos.x));
                const minY = Math.min(...positions.map((pos) => pos.y));
                const maxY = Math.max(...positions.map((pos) => pos.y));

                ctx.strokeStyle = hexToRgba(colors.highlightMed, 0.25);
                ctx.fillStyle = colors.muted;
                ctx.lineWidth = 1;
                ctx.font = `${10 * scale}px Inter, system-ui, sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';

                for (let i = 0; i <= numTicks; i++) {
                    const ratio = numTicks === 0 ? 0 : i / numTicks;
                    const date = oldestDate + timeSpan * ratio;
                    const label = formatTimelineDate(date, timeSpan);

                    if (layoutMode === 'horizontal') {
                        const worldX = minX + (maxX - minX) * ratio;
                        const { x } = worldToScreen(worldX, 0);
                        ctx.beginPath();
                        ctx.moveTo(x, 0);
                        ctx.lineTo(x, canvasHeight);
                        ctx.stroke();
                        ctx.fillText(label, x + 6 * scale, 6 * scale);
                    } else {
                        const worldY = minY + (maxY - minY) * ratio;
                        const { y } = worldToScreen(0, worldY);
                        ctx.beginPath();
                        ctx.moveTo(0, y);
                        ctx.lineTo(canvasWidth, y);
                        ctx.stroke();
                        ctx.fillText(label, 8 * scale, y + 6 * scale);
                    }
                }
            }
        }

        // Calculate viewport bounds in world coordinates for spatial queries
        const viewportWorld = {
            x: viewState.offsetX,
            y: viewState.offsetY,
            width: canvasWidth / scale,
            height: canvasHeight / scale,
        };
        
        // Query only nodes in the visible viewport - O(log n) instead of O(n)
        const visibleNodes = queryViewport(viewportWorld);
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

        // Draw edges with clear, minimal styling and viewport culling
        // Batch by lane to minimize state changes
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Expand viewport for edge culling to catch edges that cross into view
        const edgePadding = Math.max(layout.rowHeight, layout.laneWidth) * 2;
        const edgeViewport = {
            x: viewState.offsetX - edgePadding,
            y: viewState.offsetY - edgePadding,
            width: canvasWidth / scale + edgePadding * 2,
            height: canvasHeight / scale + edgePadding * 2,
        };

        // Batch edges by lane and type for efficient rendering
        const edgeBatches = batchEdgesByLane(
            edges,
            nodeById,
            getNodeWorldPos,
            worldToScreen,
            visibleNodeIds,
            isPosterMode ? null : edgeViewport,
            positionsMap
        );

        // Draw each batch (minimizes state changes)
        for (const batch of edgeBatches) {
            const accent = laneAccents[batch.lane % laneAccents.length];
            const edgeColor = isPosterMode
                ? hexToRgba(accent.main, 0.7)
                : hexToRgba(accent.main, 0.9);
            const lineWidth = batch.isMerge ? 2.4 : 1.8;

            ctx.strokeStyle = edgeColor;
            ctx.lineWidth = lineWidth * scale;
            ctx.globalAlpha = 1;
            ctx.beginPath();

            // Draw all edges in this batch
            for (const edge of batch.edges) {
                ctx.moveTo(edge.fromX, edge.fromY);
                if (layoutMode === 'horizontal' && Math.abs(edge.fromY - edge.toY) > 1) {
                    const midX = (edge.fromX + edge.toX) / 2;
                    ctx.bezierCurveTo(midX, edge.fromY, midX, edge.toY, edge.toX, edge.toY);
                } else if (layoutMode !== 'radial' && Math.abs(edge.fromX - edge.toX) > 1) {
                    const midY = (edge.fromY + edge.toY) / 2;
                    ctx.bezierCurveTo(edge.fromX, midY, edge.toX, midY, edge.toX, edge.toY);
                } else {
                    ctx.lineTo(edge.toX, edge.toY);
                }
            }
            ctx.stroke();
        }

        // Draw branch labels at the top
        if (graph && lodLevel !== 'low') {
            const isPoster = isPosterMode;
            ctx.font = `600 ${12 * scale}px Inter, system-ui, sans-serif`;

            for (const [branchName, sha] of graph.heads) {
                const headNode = nodeById.get(sha);
                if (!headNode) continue;

                const labelPos = getLabelPos(headNode);
                const { x, y } = worldToScreen(labelPos.x, labelPos.y);
                const safeY = Math.max(y, CONTROLS_SAFE_TOP);
                const color = laneColors[headNode.lane % laneColors.length];

                if (isPoster) {
                    ctx.fillStyle = hexToRgba(colors.text, 0.8);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(branchName, x, safeY);
                    continue;
                }

                const textWidth = ctx.measureText(branchName).width;
                const padding = 10 * scale;
                const pillWidth = textWidth + padding * 2;
                const pillHeight = 24 * scale;
                const pillRadius = 8 * scale;

                ctx.fillStyle = hexToRgba(colors.surface, 0.9);
                ctx.strokeStyle = hexToRgba(color, 0.6);
                ctx.lineWidth = 1 * scale;

                ctx.beginPath();
                ctx.roundRect(
                    x - pillWidth / 2,
                    safeY - pillHeight / 2,
                    pillWidth,
                    pillHeight,
                    pillRadius
                );
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = colors.text;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(branchName, x, safeY);
            }
        }

        // Draw nodes - optimized with spatial index viewport culling
        // Apply LOD: skip details at low zoom levels
        const showDetails = lodLevel !== 'low';
        const simplified = lodLevel === 'low';

        // visibleNodes already calculated above for edge culling

        for (const node of visibleNodes) {
            const worldPos = positionsMap.get(node.id) ?? getNodeWorldPos(node);
            const { x, y } = worldToScreen(worldPos.x, worldPos.y);

            const isMerge = node.commit.parents.length > 1;
            const isRoot = node.commit.parents.length === 0;
            const isSelected = node.id === selectedId;
            const isHovered = node.id === hoverNodeId;
            const color = laneColors[node.lane % laneColors.length];

            let radius = isMerge ? NODE_RADIUS_MERGE : NODE_RADIUS;
            if (isSelected) radius = NODE_RADIUS_SELECTED;
            radius *= scale;

            // Draw outer ring only for selected/hovered
            if (!simplified && !isPosterMode && (isSelected || isHovered)) {
                const glowRadius = radius * (isSelected ? 2.2 : 1.8);
                ctx.beginPath();
                ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? hexToRgba(color, 0.2) : hexToRgba(color, 0.15);
                ctx.fill();

                // Additional ring for selected
                if (isSelected) {
                    ctx.beginPath();
                    ctx.arc(x, y, radius * 1.6, 0, Math.PI * 2);
                    ctx.strokeStyle = hexToRgba(color, 0.3);
                    ctx.lineWidth = 2 * scale;
                    ctx.stroke();
                }
            }

            // Draw node shape
            ctx.beginPath();
            if (isRoot) {
                // Diamond for root
                ctx.moveTo(x, y - radius);
                ctx.lineTo(x + radius, y);
                ctx.lineTo(x, y + radius);
                ctx.lineTo(x - radius, y);
                ctx.closePath();
            } else if (isMerge && showDetails) {
                // Hexagon for merge
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i - Math.PI / 6;
                    const px = x + radius * Math.cos(angle);
                    const py = y + radius * Math.sin(angle);
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
            } else {
                // Circle for regular
                ctx.arc(x, y, radius, 0, Math.PI * 2);
            }

            // Fill with solid color (faster than gradient)
            ctx.fillStyle = color;
            ctx.fill();

            // Border for selected/hovered
            if (!simplified && !isPosterMode && (isSelected || isHovered)) {
                ctx.strokeStyle = colors.text;
                ctx.lineWidth = (isSelected ? 3 : 2) * scale;
                ctx.stroke();
            }

            // Inner highlight dot (skip at low LOD)
            if (showDetails && !isPosterMode) {
                ctx.beginPath();
                ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.25, 0, Math.PI * 2);
                ctx.fillStyle = hexToRgba(lightenColorUtil(color, 60), 0.5);
                ctx.fill();
            }
        }

        // Draw modern glassmorphism tooltip for selected/hovered node
        const activeNode = (selectedId ? nodeById.get(selectedId) : null) ??
            (hoverNodeId ? nodeById.get(hoverNodeId) : null);

        if (activeNode && !isPosterMode) {
            const worldPos = getNodeWorldPos(activeNode);
            const { x, y } = worldToScreen(worldPos.x, worldPos.y);
            const commit = activeNode.commit;
            const gradientInfo = laneAccents[activeNode.lane % laneAccents.length];

            let tooltipX = x + 28 * scale;
            let tooltipY = y - 15 * scale;
            const padding = 16 * scale;
            const lineHeight = 22 * scale;

            ctx.font = `600 ${14 * scale}px Inter, system-ui, sans-serif`;
            const message = commit.messageSubject.slice(0, 60) + (commit.messageSubject.length > 60 ? '...' : '');
            const msgWidth = ctx.measureText(message).width;

            ctx.font = `${12 * scale}px Inter, system-ui, sans-serif`;
            const author = commit.authorName;
            const authorWidth = ctx.measureText(author).width;

            const tooltipWidth = Math.max(msgWidth, authorWidth, 200 * scale) + padding * 2;
            const tooltipHeight = lineHeight * 3.5 + padding * 1.5;

            const edgePadding = 12 * scale;
            const maxX = canvasWidth - tooltipWidth - edgePadding;
            const maxY = canvasHeight - tooltipHeight - edgePadding;
            tooltipX = Math.min(Math.max(tooltipX, edgePadding), maxX);
            tooltipY = Math.min(Math.max(tooltipY, edgePadding), maxY);

            // Subtle glass background
            ctx.fillStyle = hexToRgba(colors.surface, 0.95);
            ctx.strokeStyle = hexToRgba(gradientInfo.main, 0.35);
            ctx.lineWidth = 1 * scale;
            ctx.shadowColor = hexToRgba(colors.base, 0.45);
            ctx.shadowBlur = 12 * scale;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 6 * scale;

            ctx.beginPath();
            ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 12 * scale);
            ctx.fill();
            ctx.stroke();

            ctx.shadowColor = 'transparent';

            // Message with better typography
            ctx.fillStyle = colors.text;
            ctx.font = `600 ${14 * scale}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(message, tooltipX + padding + 8 * scale, tooltipY + padding + lineHeight * 0.7);

            // Author with icon
            ctx.fillStyle = colors.subtle;
            ctx.font = `${12 * scale}px Inter, system-ui, sans-serif`;
            ctx.fillText(`@${author}`, tooltipX + padding + 8 * scale, tooltipY + padding + lineHeight * 1.8);

            // Separator line
            const separatorY = tooltipY + padding + lineHeight * 2.4;
            ctx.beginPath();
            ctx.moveTo(tooltipX + padding + 8 * scale, separatorY);
            ctx.lineTo(tooltipX + tooltipWidth - padding, separatorY);
            ctx.strokeStyle = colors.highlightMed;
            ctx.lineWidth = 1 * scale;
            ctx.stroke();

            // SHA and time
            ctx.fillStyle = colors.muted;
            ctx.font = `bold ${11 * scale}px "JetBrains Mono", monospace`;
            const sha = activeNode.id.slice(0, 7);
            const timeAgo = getRelativeTimeUtil(commit.authoredAt);
            ctx.fillText(sha, tooltipX + padding + 8 * scale, tooltipY + padding + lineHeight * 2.8);
            ctx.textAlign = 'right';
            ctx.fillStyle = hexToRgba(gradientInfo.light, 0.8);
            ctx.fillText(timeAgo, tooltipX + tooltipWidth - padding, tooltipY + padding + lineHeight * 2.8);

            // Add small indicator for merge/root
            const isMerge = commit.parents.length > 1;
            const isRoot = commit.parents.length === 0;

            if (isMerge || isRoot) {
                const indicatorX = tooltipX + tooltipWidth - padding - 20 * scale;
                const indicatorY = tooltipY + 12 * scale;

                ctx.beginPath();
                if (isMerge) {
                    // Hexagon for merge indicator
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 3) * i - Math.PI / 6;
                        const px = indicatorX + 8 * Math.cos(angle);
                        const py = indicatorY + 8 * Math.sin(angle);
                        if (i === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fillStyle = hexToRgba(gradientInfo.light, 0.9);
                } else {
                    // Diamond for root indicator
                    ctx.moveTo(indicatorX, indicatorY - 6 * scale);
                    ctx.lineTo(indicatorX + 6 * scale, indicatorY);
                    ctx.lineTo(indicatorX, indicatorY + 6 * scale);
                    ctx.lineTo(indicatorX - 6 * scale, indicatorY);
                    ctx.closePath();
                    ctx.fillStyle = hexToRgba(colors.gold, 0.9);
                }
                ctx.fill();

                ctx.strokeStyle = hexToRgba(colors.text, 0.3);
                ctx.lineWidth = 1.5 * scale;
                ctx.stroke();
            }
        }

    }, [nodes, nodeById, edges, selectedId, hoverNodeId, viewState, graph, getNodeWorldPos, positionsMap, worldToScreen, lodLevel, showHint, isPosterMode, layout, layoutMode, backgroundStyle, colors, laneColors, laneAccents, queryViewport, getLabelPos, showDatelines]);

    // Canvas resize handler
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;

            const ctx = canvas.getContext('2d', { alpha: true });
            if (ctx) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.scale(dpr, dpr);
            }
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();

        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        return () => {
            if (hoverRafRef.current !== null) {
                cancelAnimationFrame(hoverRafRef.current);
            }
        };
    }, []);

    // Mouse handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        dragRef.current = {
            isDragging: true,
            hasDragged: false,
            startX: e.clientX,
            startY: e.clientY,
        };
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const drag = dragRef.current;

        if (drag.isDragging) {
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > DRAG_THRESHOLD) {
                drag.hasDragged = true;
            }

            if (drag.hasDragged) {
                setViewState((prev) => ({
                    ...prev,
                    offsetX: prev.offsetX - dx / prev.scale,
                    offsetY: prev.offsetY - dy / prev.scale,
                }));

                drag.startX = e.clientX;
                drag.startY = e.clientY;
            }
            return;
        }

        if (hoverRafRef.current !== null) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        hoverRafRef.current = requestAnimationFrame(() => {
            hoverRafRef.current = null;
            const hovered = hitTest(x, y);
            const hoveredId = hovered?.id ?? null;
            if (hoveredId !== lastHoverIdRef.current) {
                lastHoverIdRef.current = hoveredId;
                setHoverNodeId(hoveredId);
            }
        });
    }, [hitTest]);

    const handleMouseUp = useCallback(() => {
        dragRef.current.isDragging = false;
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (dragRef.current.hasDragged) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const node = hitTest(x, y);
        if (node) {
            selectCommit(node.id);
        }
    }, [hitTest, selectCommit]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const node = hitTest(x, y);
        if (node && node.id === selectedId) {
            toggleDetails();
        }
    }, [hitTest, selectedId, toggleDetails]);

    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldBefore = screenToWorld(mouseX, mouseY);

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.25, Math.min(3, viewState.scale * delta));

        const worldAfterX = mouseX / newScale + viewState.offsetX;
        const worldAfterY = mouseY / newScale + viewState.offsetY;

        setViewState({
            offsetX: viewState.offsetX + (worldBefore.x - worldAfterX),
            offsetY: viewState.offsetY + (worldBefore.y - worldAfterY),
            scale: newScale,
        });
    }, [viewState, screenToWorld]);

    // Add wheel listener with passive: false to allow preventDefault
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    // Zoom controls
    const zoomIn = useCallback(() => {
        setViewState(prev => ({
            ...prev,
            scale: Math.min(3, prev.scale * 1.25),
        }));
    }, []);

    const zoomOut = useCallback(() => {
        setViewState(prev => ({
            ...prev,
            scale: Math.max(0.25, prev.scale * 0.8),
        }));
    }, []);

    const fitToView = useCallback(() => {
        if (nodes.length === 0) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (const node of nodes) {
            const pos = positionsMap.get(node.id) ?? getNodeWorldPos(node);
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x);
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y);
        }

        const padding = Math.max(layout.rowHeight, layout.laneWidth) * 1.5;
        const graphWidth = maxX - minX + padding * 2;
        const graphHeight = maxY - minY + padding * 2;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const scaleX = canvasWidth / graphWidth;
        const scaleY = canvasHeight / graphHeight;
        const newScale = Math.min(scaleX, scaleY, 1) * 0.9;

        setViewState({
            offsetX: centerX - canvasWidth / (2 * newScale),
            offsetY: centerY - canvasHeight / (2 * newScale),
            scale: Math.max(0.25, newScale),
        });
    }, [nodes, layout, getNodeWorldPos, positionsMap]);

    useEffect(() => {
        if (!isPosterMode || nodes.length === 0) return;
        fitToView();
    }, [isPosterMode, nodes.length, fitToView]);

    const resetView = useCallback(() => {
        if (nodes.length === 0) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (const node of nodes) {
            const pos = positionsMap.get(node.id) ?? getNodeWorldPos(node);
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x);
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y);
        }

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const anchorY = layoutMode === 'radial' ? centerY : minY;

        setViewState({
            offsetX: centerX - canvasWidth / 2,
            offsetY: anchorY - canvasHeight / 4,
            scale: 1,
        });
    }, [nodes, getNodeWorldPos, positionsMap, layoutMode]);

    // Register zoom callbacks with the store for keyboard shortcuts
    const { registerZoomCallbacks } = useGraphStore();
    useEffect(() => {
        registerZoomCallbacks({ zoomIn, zoomOut, resetView });
    }, [registerZoomCallbacks, zoomIn, zoomOut, resetView]);

    const zoomPercent = Math.round(viewState.scale * 100);

    return (
        <div ref={containerRef} className={`graph-canvas ${isPosterMode ? 'graph-canvas--poster' : ''}`}>
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
            />

            {/* Zoom controls */}
            <div className="zoom-controls">
                <button onClick={zoomIn} title="Zoom in (+)" aria-label="Zoom in">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35M11 8v6m-3-3h6" />
                    </svg>
                </button>
                <span className="zoom-level">{zoomPercent}%</span>
                <button onClick={zoomOut} title="Zoom out (-)" aria-label="Zoom out">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35M8 11h6" />
                    </svg>
                </button>
                <div className="zoom-divider" />
                <button onClick={fitToView} title="Fit to view" aria-label="Fit to view">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
                    </svg>
                </button>
                <button onClick={resetView} title="Reset view (0)" aria-label="Reset view">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0" />
                        <path d="M3 12h4M12 7v5l3 3" />
                    </svg>
                </button>
            </div>

            {/* Onboarding hint - shows briefly */}
            {nodes.length > 0 && showHint && !isPosterMode && (
                <div className="canvas-hint">
                    <span>Scroll to zoom • Drag to pan • Click to select</span>
                </div>
            )}

            <style>{`
        .graph-canvas {
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: relative;
          background: transparent;
        }

        .graph-canvas--poster .zoom-controls,
        .graph-canvas--poster .canvas-hint {
          display: none;
        }
        
        .graph-canvas canvas {
          display: block;
          cursor: grab;
        }
        
        .zoom-controls {
          position: absolute;
          top: 1rem;
          right: 1rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: rgba(var(--rp-surface-rgb), 0.92);
          border: 1px solid var(--rp-highlight-low, #21202e);
          border-radius: 10px;
          padding: 0.3rem;
        }
        
        .zoom-controls button {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: 8px;
          color: var(--rp-subtle, #908caa);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        
        .zoom-controls button:hover {
          background: var(--rp-overlay, #26233a);
          color: var(--rp-text, #e0def4);
        }
        
        .zoom-controls button svg {
          width: 18px;
          height: 18px;
        }

        .zoom-level {
          min-width: 48px;
          text-align: center;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--rp-subtle, #908caa);
          font-family: 'JetBrains Mono', monospace;
        }

        .zoom-divider {
          width: 1px;
          height: 24px;
          background: var(--rp-highlight-med, #403d52);
          margin: 0 0.25rem;
        }

        .canvas-hint {
          position: absolute;
          bottom: 4.5rem;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(var(--rp-surface-rgb), 0.92);
          border: 1px solid var(--rp-highlight-low, #21202e);
          border-radius: 999px;
          padding: 0.45rem 0.9rem;
          font-size: 0.8rem;
          color: var(--rp-subtle, #908caa);
          pointer-events: none;
        }
      `}</style>
        </div>
    );
}
