import { useEffect, useCallback, useState } from 'react';
import { useGraphStore } from '@lib/store/graph-store';
import { downloadVectorSVG, openPrintableSVG, type ExportSize } from '@lib/export/svg-generator';
import { downloadFullGraphPNG } from '@lib/export/png-generator';
import { parseGitHubRepo, parseGitLabRepo, parseBitbucketRepo } from '@lib/git/import-git';
import { THEMES } from '@lib/themes';
import type { BackgroundStyle } from '@lib/git/types';
import { generateShareableUrl, copyToClipboard, type ShareableState } from '@lib/utils/url-state';

// Categorized shortcuts with icons for visual guide
const SHORTCUT_CATEGORIES = [
    {
        name: 'Navigation',
        icon: 'M9 5l7 7-7 7',
        shortcuts: [
            { keys: ['←'], action: 'Previous commit' },
            { keys: ['→'], action: 'Next commit' },
            { keys: ['↑'], action: 'Move to upper lane' },
            { keys: ['↓'], action: 'Move to lower lane' },
        ],
    },
    {
        name: 'Actions',
        icon: 'M13 10V3L4 14h7v7l9-11h-7z',
        shortcuts: [
            { keys: ['Enter'], action: 'Open commit details' },
            { keys: ['Esc'], action: 'Close dialogs' },
            { keys: ['/'], action: 'Focus search' },
        ],
    },
    {
        name: 'View',
        icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
        shortcuts: [
            { keys: ['+', '-'], action: 'Zoom in/out' },
            { keys: ['0'], action: 'Reset zoom' },
            { keys: ['?'], action: 'Toggle this help' },
            { keys: ['T'], action: 'Teaching mode' },
        ],
    },
];

// Flat shortcuts list for legacy support
const SHORTCUTS = [
    { key: '←', action: 'Previous commit' },
    { key: '→', action: 'Next commit' },
    { key: '↑', action: 'Move to upper lane' },
    { key: '↓', action: 'Move to lower lane' },
    { key: 'Enter', action: 'Open commit details' },
    { key: 'Esc', action: 'Close dialogs' },
    { key: '/', action: 'Focus search' },
    { key: '+ -', action: 'Zoom in/out' },
    { key: '0', action: 'Reset zoom' },
    { key: '?', action: 'Toggle this help' },
    { key: 'T', action: 'Toggle teaching mode' },
];

const MAX_POSTER_COMMITS = 5000;

const EXPORT_LAYOUTS = {
    inspect: {
        laneWidth: 120,
        rowHeight: 70,
        paddingLeft: 100,
        paddingTop: 160,
        labelOffset: 80,
    },
    poster: {
        laneWidth: 150,
        rowHeight: 82,
        paddingLeft: 170,
        paddingTop: 220,
        labelOffset: 70,
    },
} as const;

export function ControlsOverlay() {
    const [exportDPI, setExportDPI] = useState<1 | 2 | 4>(1);
    const [exportSize, setExportSize] = useState<ExportSize>('native');
    const [bleedEnabled, setBleedEnabled] = useState(false);
    const [cropMarksEnabled, setCropMarksEnabled] = useState(false);
    const [safeAreaEnabled, setSafeAreaEnabled] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);

    const {
        showHelp,
        toggleHelp,
        toggleDetails,
        navigateNext,
        navigatePrev,
        navigateLane,
        viewMode,
        setViewMode,
        layoutMode,
        setLayoutMode,
        showDatelines,
        toggleDatelines,
        graph,
        nodes,
        edges,
        theme,
        themeId,
        setTheme,
        backgroundStyle,
        setBackgroundStyle,
        zoomIn,
        zoomOut,
        resetView,
        hasMoreCommits,
        currentRepoPath,
        currentRepoProvider,
        authToken,
        setLoading,
        setError,
        setGraph,
        posterTitle,
        setPosterTitle,
        posterSubtitle,
        setPosterSubtitle,
        showWatermark,
        toggleWatermark,
        showSignature,
        toggleSignature,
        showTimeline,
        toggleTimeline,
        showHeatmap,
        toggleHeatmap,
        showTeaching,
        toggleTeaching,
        selectedId,
    } = useGraphStore();

    const exportLayout = viewMode === 'poster' ? EXPORT_LAYOUTS.poster : EXPORT_LAYOUTS.inspect;

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            // Don't capture if user is typing in an input (except for / which focuses search)
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement ||
                (e.target instanceof HTMLElement && e.target.isContentEditable)
            ) {
                // Escape to blur from input
                if (e.key === 'Escape') {
                    (e.target as HTMLElement).blur();
                }
                return;
            }

            switch (e.key) {
                case 'ArrowRight':
                    e.preventDefault();
                    navigateNext();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    navigatePrev();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    navigateLane('up');
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    navigateLane('down');
                    break;
                case 'Enter':
                    if (selectedId) {
                        e.preventDefault();
                        toggleDetails();
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (useGraphStore.getState().showHelp) {
                        toggleHelp();
                    } else if (useGraphStore.getState().showDetails) {
                        toggleDetails();
                    } else if (useGraphStore.getState().showTeaching) {
                        toggleTeaching();
                    }
                    break;
                case '/':
                    e.preventDefault();
                    document.getElementById('search-input')?.focus();
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    zoomIn();
                    break;
                case '-':
                case '_':
                    e.preventDefault();
                    zoomOut();
                    break;
                case '0':
                    e.preventDefault();
                    resetView();
                    break;
                case '?':
                    e.preventDefault();
                    toggleHelp();
                    break;
                case 't':
                case 'T':
                    e.preventDefault();
                    toggleTeaching();
                    break;
            }
        },
        [navigateNext, navigatePrev, navigateLane, toggleDetails, toggleHelp, toggleTeaching, zoomIn, zoomOut, resetView, selectedId]
    );

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Export as PNG (full graph, not just visible viewport)
    const handleExportPNG = useCallback(async () => {
        if (!graph || nodes.length === 0) return;

        try {
            await downloadFullGraphPNG(graph, nodes, edges, `git-sonar-${exportDPI}x.png`, {
                includeLabels: true,
                includeLanes: true,
                background: backgroundStyle,
                themeColors: theme.colors,
                scale: exportDPI,
                title: posterTitle || undefined,
                includeTimeline: showTimeline,
                layoutMode,
                layout: exportLayout,
            });
        } catch (err) {
            console.error('Failed to export PNG:', err);
        }
    }, [graph, nodes, edges, exportDPI, backgroundStyle, theme.colors, posterTitle, showTimeline, layoutMode, exportLayout]);

    // Export as SVG (true vector)
    const handleExportSVG = useCallback(() => {
        if (!graph || nodes.length === 0) return; 

        downloadVectorSVG(graph, nodes, edges, `git-sonar-${exportDPI}x.svg`, {
            includeLabels: true,
            includeLanes: true,
            background: backgroundStyle,
            themeColors: theme.colors,
            scale: exportDPI,
            title: posterTitle || undefined,
            includeTimeline: showTimeline,
            exportSize,
            bleedInches: bleedEnabled ? 0.125 : 0,
            includeCropMarks: cropMarksEnabled,
            includeSafeArea: safeAreaEnabled,
            layoutMode,
            layout: exportLayout,
        });
    }, [graph, nodes, edges, exportDPI, exportSize, bleedEnabled, cropMarksEnabled, safeAreaEnabled, backgroundStyle, theme.colors, posterTitle, showTimeline, layoutMode, exportLayout]);

    const handleExportPDF = useCallback(() => {
        if (!graph || nodes.length === 0) return;

        openPrintableSVG(graph, nodes, edges, {
            includeLabels: true,
            includeLanes: true,
            background: backgroundStyle,
            themeColors: theme.colors,
            scale: exportDPI,
            title: posterTitle || undefined,
            includeTimeline: showTimeline,
            exportSize,
            bleedInches: bleedEnabled ? 0.125 : 0,
            includeCropMarks: cropMarksEnabled,
            includeSafeArea: safeAreaEnabled,
            layoutMode,
            layout: exportLayout,
        });
    }, [graph, nodes, edges, exportDPI, exportSize, bleedEnabled, cropMarksEnabled, safeAreaEnabled, backgroundStyle, theme.colors, posterTitle, showTimeline, layoutMode, exportLayout]);

    const handleLoadAllCommits = useCallback(async () => {
        if (!currentRepoPath || !currentRepoProvider) return;

        const confirmed = window.confirm(
            `Load up to ${MAX_POSTER_COMMITS.toLocaleString()} commits? Large repositories may slow down your browser.`
        );
        if (!confirmed) return;

        setLoading(true);
        setError(null);
        try {
            let graph;
            const authTokenValue = authToken ?? undefined;
            if (currentRepoProvider === 'gitlab') {
                graph = await parseGitLabRepo(currentRepoPath, { maxCommits: MAX_POSTER_COMMITS, authToken: authTokenValue });
            } else if (currentRepoProvider === 'bitbucket') {
                graph = await parseBitbucketRepo(currentRepoPath, { maxCommits: MAX_POSTER_COMMITS, authToken: authTokenValue });
            } else {
                graph = await parseGitHubRepo(currentRepoPath, { maxCommits: MAX_POSTER_COMMITS, authToken: authTokenValue });
            }
            setGraph(graph);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load commits');
        }
    }, [currentRepoPath, currentRepoProvider, authToken, setLoading, setError, setGraph]);

    // Handle share link generation
    const handleShareLink = useCallback(async () => {
        const state: ShareableState = {};

        // Add repository info
        if (currentRepoPath && currentRepoProvider) {
            if (currentRepoProvider === 'github') state.github = currentRepoPath;
            else if (currentRepoProvider === 'gitlab') state.gitlab = currentRepoPath;
            else if (currentRepoProvider === 'bitbucket') state.bitbucket = currentRepoPath;
        }

        // Add view settings (non-defaults only)
        state.theme = themeId;
        state.layout = layoutMode;
        state.view = viewMode;
        if (selectedId) state.commit = selectedId;

        const url = generateShareableUrl(state);
        const success = await copyToClipboard(url);

        if (success) {
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        }
    }, [currentRepoPath, currentRepoProvider, themeId, layoutMode, viewMode, selectedId]);

        return (
            <>
                {/* Bottom controls bar */}
                <div className="controls-bar">
                    <div className="mode-toggle" role="group" aria-label="Graph mode">
                        <button
                            type="button"
                            className={`mode-btn ${viewMode === 'inspect' ? 'mode-btn--active' : ''}`}
                            onClick={() => setViewMode('inspect')}
                            aria-pressed={viewMode === 'inspect'}
                        >
                            Inspect
                        </button>
                        <button
                            type="button"
                            className={`mode-btn ${viewMode === 'poster' ? 'mode-btn--active' : ''}`}
                            onClick={() => setViewMode('poster')}
                            aria-pressed={viewMode === 'poster'}
                        >
                            Poster
                        </button>
                        <button
                            type="button"
                            className={`mode-btn ${viewMode === 'calendar' ? 'mode-btn--active' : ''}`}
                            onClick={() => setViewMode('calendar')}
                            aria-pressed={viewMode === 'calendar'}
                        >
                            Calendar
                        </button>
                    </div>

                    {/* Load All Commits button for poster mode */}
                    {viewMode === 'poster' && hasMoreCommits && currentRepoPath && (
                        <button
                            type="button"
                            className="control-btn control-btn--load-all"
                            onClick={handleLoadAllCommits}
                            aria-label={`Load up to ${MAX_POSTER_COMMITS.toLocaleString()} commits for poster`}
                            title={`Load up to ${MAX_POSTER_COMMITS.toLocaleString()} commits (for complete poster)`}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            <span className="control-btn__text">Load {MAX_POSTER_COMMITS / 1000}k</span>
                        </button>
                    )}

                    {/* Poster mode controls */}
                    {viewMode === 'poster' && (
                        <>
                            <div className="poster-inputs">
                                <input
                                    type="text"
                                    className="poster-title-input"
                                    placeholder="Poster title..."
                                    value={posterTitle}
                                    onChange={(e) => setPosterTitle(e.target.value)}
                                    aria-label="Poster title"
                                />
                                <input
                                    type="text"
                                    className="poster-subtitle-input"
                                    placeholder="Subtitle (optional)..."
                                    value={posterSubtitle}
                                    onChange={(e) => setPosterSubtitle(e.target.value)}
                                    aria-label="Poster subtitle"
                                />
                            </div>
                            
                            <div className="poster-options">
                                <button
                                    type="button"
                                    className={`control-btn control-btn--small ${showTimeline ? 'control-btn--active' : ''}`}
                                    onClick={toggleTimeline}
                                    aria-pressed={showTimeline}
                                    title="Show timeline ruler"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 2v20" />
                                        <path d="M8 6h8M6 12h12M8 18h8" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    className={`control-btn control-btn--small ${showWatermark ? 'control-btn--active' : ''}`}
                                    onClick={toggleWatermark}
                                    aria-pressed={showWatermark}
                                    title="Show Git Sonar watermark"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <text x="12" y="16" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none">GS</text>
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    className={`control-btn control-btn--small ${showSignature ? 'control-btn--active' : ''}`}
                                    onClick={toggleSignature}
                                    aria-pressed={showSignature}
                                    title="Show date signature"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                    </svg>
                                </button>
                            </div>
                        </>
                    )}

                    <div className="layout-selector">
                        <label htmlFor="layout-select">Layout</label>
                        <select
                            id="layout-select"
                            value={layoutMode}
                            onChange={(e) => setLayoutMode(e.target.value as 'vertical' | 'horizontal' | 'radial')}
                            aria-label="Graph layout"
                        >
                            <option value="vertical">Vertical</option>
                            <option value="horizontal">Horizontal</option>
                            <option value="radial">Radial</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        className={`control-btn control-btn--text ${showDatelines ? 'control-btn--active' : ''}`}
                        onClick={toggleDatelines}
                        aria-pressed={showDatelines}
                        title={`Datelines ${showDatelines ? 'ON' : 'OFF'}`}
                    >
                        <span className="control-btn__label">Datelines</span>
                    </button>

                    <button
                        type="button"
                        className={`control-btn ${showHeatmap ? 'control-btn--active' : ''}`}
                        onClick={toggleHeatmap}
                        aria-pressed={showHeatmap}
                        title={`Activity heatmap ${showHeatmap ? 'ON' : 'OFF'}`}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                        </svg>
                    </button>

                    <div className="dpi-selector">
                        <label htmlFor="dpi-select">DPI</label>
                        <select
                            id="dpi-select"
                            value={exportDPI}
                            onChange={(e) => setExportDPI(Number(e.target.value) as 1 | 2 | 4)}
                            aria-label="Export DPI"
                        >
                            <option value={1}>1x</option>
                            <option value={2}>2x</option>
                            <option value={4}>4x</option>
                        </select>
                    </div>

                    <div className="size-selector">
                        <label htmlFor="size-select">Size</label>
                        <select
                            id="size-select"
                            value={exportSize}
                            onChange={(e) => setExportSize(e.target.value as ExportSize)}
                            aria-label="Export size"
                        >
                            <option value="native">Native</option>
                            <option value="A4">A4</option>
                            <option value="A3">A3</option>
                            <option value="A2">A2</option>
                            <option value="A1">A1</option>
                            <option value="Square">Square</option>
                            <option value="Poster18x24">Poster 18×24</option>
                            <option value="Poster24x36">Poster 24×36</option>
                        </select>
                        <label className="bleed-toggle">
                            <input
                                type="checkbox"
                                checked={bleedEnabled}
                                onChange={(e) => setBleedEnabled(e.target.checked)}
                            />
                            Add 0.125″ bleed
                        </label>
                        <label className="bleed-toggle">
                            <input
                                type="checkbox"
                                checked={cropMarksEnabled}
                                onChange={(e) => setCropMarksEnabled(e.target.checked)}
                            />
                            Show crop marks
                        </label>
                        <label className="bleed-toggle">
                            <input
                                type="checkbox"
                                checked={safeAreaEnabled}
                                onChange={(e) => setSafeAreaEnabled(e.target.checked)}
                            />
                            Show safe area
                        </label>
                    </div>

                    <div className="background-selector">
                        <label htmlFor="bg-select">Background</label>
                        <select
                            id="bg-select"
                            value={backgroundStyle.type}
                            onChange={(e) => {
                                const type = e.target.value as BackgroundStyle['type'];
                                if (type === 'gradient') {
                                    setBackgroundStyle({ type, gradientAngle: 135 });
                                } else {
                                    setBackgroundStyle({ type });
                                }
                            }}
                            aria-label="Background style"
                        >
                            <option value="solid">Solid</option>
                            <option value="transparent">Transparent</option>
                            <option value="gradient">Gradient</option>
                            <option value="grid">Grid</option>
                        </select>
                    </div>

                    <div className="theme-selector">
                        <label htmlFor="theme-select">Theme</label>
                        <select
                            id="theme-select"
                            value={themeId}
                            onChange={(e) => setTheme(e.target.value as keyof typeof THEMES)}
                            aria-label="Theme"
                        >
                            {Object.values(THEMES).map((themeOption) => (
                                <option key={themeOption.id} value={themeOption.id}>
                                    {themeOption.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Share link button */}
                    {currentRepoPath && (
                        <button
                            type="button"
                            className={`control-btn ${shareCopied ? 'control-btn--active' : ''}`}
                            onClick={handleShareLink}
                            aria-label={shareCopied ? 'Link copied!' : 'Copy share link'}
                            title={shareCopied ? 'Link copied to clipboard!' : 'Copy shareable link'}
                        >
                            {shareCopied ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="18" cy="5" r="3" />
                                    <circle cx="6" cy="12" r="3" />
                                    <circle cx="18" cy="19" r="3" />
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                                </svg>
                            )}
                        </button>
                    )}

                    <button
                        type="button"
                        className="control-btn"
                        onClick={toggleHelp}
                        aria-label="Keyboard shortcuts"
                        title="Keyboard shortcuts (?)"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 11h16m-8 0a4 4 0 1 1 0 -8 4 4 0 0 1 0 8" />
                            <path d="M12 3v2M12 19v2M8 7h8" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className={`control-btn ${showTeaching ? 'control-btn--active' : ''}`}
                        onClick={toggleTeaching}
                        aria-label="Teaching mode"
                        title="Teaching mode (T)"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2l9 4-9 4-9-4 9-4" />
                            <path d="M3 10v6a9 9 0 0 0 18 0v-6" />
                            <path d="M9 14h6" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        className="control-btn"
                        onClick={handleExportPNG}
                        aria-label="Export as PNG"
                        title="Export as PNG"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2 3h6l2-3h4a2 2 0 012 2v11z" />
                            <circle cx="12" cy="13" r="4" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="control-btn"
                        onClick={handleExportSVG}
                        aria-label="Export as SVG"
                        title="Export as SVG"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14,2 14,8 20,8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10,9 9,9 8,9" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="control-btn"
                        onClick={handleExportPDF}
                        aria-label="Export as PDF"
                        title="Export as PDF"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9V2h12v7" />
                            <path d="M6 18h12" />
                            <rect x="6" y="14" width="12" height="6" rx="1" />
                            <path d="M8 16h3" />
                        </svg>
                    </button>
                </div>

            {/* Teaching overlay */}
            {showTeaching && (
                <div
                    className="help-overlay teaching-overlay"
                    role="dialog"
                    aria-labelledby="teaching-title"
                    onClick={toggleTeaching}
                >
                    <div className="help-panel teaching-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="help-header">
                            <h2 id="teaching-title">Teaching Mode</h2>
                            <button
                                type="button"
                                className="help-close"
                                onClick={toggleTeaching}
                                aria-label="Close teaching mode"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="teaching-grid">
                            <div>
                                <h3>For Developers</h3>
                                <ul>
                                    <li>Use search to jump by author, SHA, or message</li>
                                    <li>Arrow keys navigate commits; Enter opens details</li>
                                    <li>Load all commits for full‑history posters</li>
                                </ul>
                            </div>
                            <div>
                                <h3>For Artists</h3>
                                <ul>
                                    <li>Switch to Poster mode for clean exports</li>
                                    <li>Try theme + background combos for contrast</li>
                                    <li>Export SVG/PDF for print‑ready output</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Help overlay */}
            {showHelp && (
                <div
                    className="help-overlay"
                    role="dialog"
                    aria-labelledby="help-title"
                    onClick={toggleHelp}
                >
                    <div className="help-panel help-panel--wide" onClick={(e) => e.stopPropagation()}>
                        <div className="help-header">
                            <h2 id="help-title">Keyboard Shortcuts</h2>
                            <button
                                type="button"
                                className="help-close"
                                onClick={toggleHelp}
                                aria-label="Close help"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="shortcuts-grid">
                            {SHORTCUT_CATEGORIES.map((category) => (
                                <div key={category.name} className="shortcut-category">
                                    <div className="shortcut-category__header">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d={category.icon} />
                                        </svg>
                                        <span>{category.name}</span>
                                    </div>
                                    <dl className="shortcut-category__list">
                                        {category.shortcuts.map(({ keys, action }) => (
                                            <div key={action} className="shortcut-row">
                                                <dt className="shortcut-keys">
                                                    {keys.map((k, i) => (
                                                        <span key={k}>
                                                            <kbd>{k}</kbd>
                                                            {i < keys.length - 1 && <span className="key-sep">/</span>}
                                                        </span>
                                                    ))}
                                                </dt>
                                                <dd>{action}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            ))}
                        </div>

                        <div className="help-footer">
                            <div className="help-tip">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 16v-4m0-4h.01" />
                                </svg>
                                <span>Drag to pan, scroll to zoom, and click commits to select.</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .controls-bar {
          position: absolute;
          top: 1rem;
          left: 1rem;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          row-gap: 0.5rem;
          max-width: calc(100% - 5.5rem);
          z-index: 10;
          padding: 0.35rem;
          background: rgba(var(--rp-surface-rgb), 0.88);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          backdrop-filter: blur(12px);
        }

        .mode-toggle {
          display: flex;
          align-items: center;
          background: rgba(var(--rp-surface-rgb), 0.9);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 0.2rem;
        }

        .mode-btn {
          padding: 0.35rem 0.7rem;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--rp-subtle);
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
        }

        .mode-btn--active {
          background: rgba(156, 207, 216, 0.15);
          color: var(--rp-text);
        }

        .dpi-selector {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(var(--rp-surface-rgb), 0.9);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 0.2rem 0.5rem;
        }

        .dpi-selector label {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--rp-subtle);
          letter-spacing: 0.02em;
        }

        .dpi-selector select {
          background: rgba(var(--rp-overlay-rgb), 0.8);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 0.2rem 0.4rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--rp-text);
          cursor: pointer;
          outline: none;
          transition: all 0.2s ease;
        }

        .dpi-selector select:hover {
          border-color: rgba(156, 207, 216, 0.3);
          background: rgba(var(--rp-overlay-rgb), 0.95);
        }

        .dpi-selector select:focus {
          border-color: var(--rp-foam);
        }

        .layout-selector {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(var(--rp-surface-rgb), 0.9);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 0.2rem 0.5rem;
        }

        .layout-selector label {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--rp-subtle);
          letter-spacing: 0.02em;
        }

        .layout-selector select {
          background: rgba(var(--rp-overlay-rgb), 0.8);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 0.2rem 0.4rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--rp-text);
          cursor: pointer;
          outline: none;
          transition: all 0.2s ease;
        }

        .layout-selector select:hover {
          border-color: rgba(156, 207, 216, 0.3);
          background: rgba(var(--rp-overlay-rgb), 0.95);
        }

        .layout-selector select:focus {
          border-color: var(--rp-foam);
        }

.background-selector,
        .size-selector {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .background-selector label,
        .size-selector label {
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--rp-subtle);
        }

        .background-selector select,
        .size-selector select {
          padding: 0.45rem 0.65rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(var(--rp-surface-rgb), 0.92);
          backdrop-filter: blur(12px);
          color: var(--rp-text);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          outline: none;
          transition: all 0.2s ease;
        }

        .bleed-toggle {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.7rem;
          color: var(--rp-subtle);
        }

        .bleed-toggle input {
          accent-color: var(--rp-iris);
        }

        .background-selector select:hover,
        .size-selector select:hover {
          border-color: rgba(156, 207, 216, 0.3);
          background: rgba(var(--rp-overlay-rgb), 0.95);
        }

        .background-selector select:focus,
        .size-selector select:focus {
          border-color: var(--rp-foam);
        }

        .theme-selector {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .theme-selector label {
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--rp-subtle);
        }

        .theme-selector select {
          padding: 0.45rem 0.65rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(var(--rp-surface-rgb), 0.92);
          backdrop-filter: blur(12px);
          color: var(--rp-text);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          outline: none;
          transition: all 0.2s ease;
        }

        .theme-selector select:hover {
          border-color: rgba(156, 207, 216, 0.3);
          background: rgba(var(--rp-overlay-rgb), 0.95);
        }

        .theme-selector select:focus {
          border-color: var(--rp-foam);
        }

        .control-btn {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          background: rgba(var(--rp-surface-rgb), 0.92);
          backdrop-filter: blur(16px);
          color: var(--rp-text);
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease;
        }

        .control-btn--active {
          border-color: rgba(156, 207, 216, 0.4);
          background: rgba(var(--rp-overlay-rgb), 0.95);
        }

        .control-btn--load-all {
          width: auto;
          gap: 0.5rem;
          padding: 0 0.75rem;
        }

        .control-btn--text {
          width: auto;
          padding: 0 0.75rem;
        }

        .control-btn__label {
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        .control-btn--load-all .control-btn__text {
          font-size: 0.75rem;
          font-weight: 600;
        }

        .poster-title-input {
          width: auto;
          min-width: 150px;
          max-width: 250px;
          padding: 0.5rem 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          background: rgba(var(--rp-surface-rgb), 0.92);
          backdrop-filter: blur(16px);
          color: var(--rp-text);
          font-size: 0.75rem;
          font-weight: 600;
          outline: none;
          transition: all 0.2s ease;
        }

        .poster-title-input:focus {
          border-color: var(--rp-foam);
        }

        .poster-title-input::placeholder {
          color: var(--rp-subtle);
        }

        .poster-inputs {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .poster-subtitle-input {
          width: auto;
          min-width: 150px;
          max-width: 250px;
          padding: 0.35rem 0.6rem;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          background: rgba(var(--rp-surface-rgb), 0.85);
          backdrop-filter: blur(16px);
          color: var(--rp-subtle);
          font-size: 0.7rem;
          font-weight: 500;
          outline: none;
          transition: all 0.2s ease;
        }

        .poster-subtitle-input:focus {
          border-color: var(--rp-iris);
          color: var(--rp-text);
        }

        .poster-subtitle-input::placeholder {
          color: var(--rp-muted);
        }

        .poster-options {
          display: flex;
          gap: 0.25rem;
        }

        .control-btn--small {
          width: 32px;
          height: 32px;
          padding: 0;
        }

        .control-btn--small svg {
          width: 16px;
          height: 16px;
        }

        .control-btn svg {
          width: 20px;
          height: 20px;
        }

        .control-btn:hover {
          background: rgba(var(--rp-overlay-rgb), 0.92);
          border-color: rgba(156, 207, 216, 0.3);
        }

.help-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .help-panel {
          background: rgba(var(--rp-surface-rgb), 0.95);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 1.5rem;
          width: min(420px, 90vw);
          color: var(--rp-text);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .teaching-panel {
          width: min(560px, 92vw);
        }

        .teaching-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1rem;
          margin-top: 0.75rem;
        }

        .teaching-grid h3 {
          margin: 0 0 0.5rem;
          font-size: 0.9rem;
          color: var(--rp-subtle);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .teaching-grid ul {
          margin: 0;
          padding-left: 1rem;
          color: var(--rp-text);
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .teaching-grid li {
          margin-bottom: 0.4rem;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .help-panel {
          max-width: 380px;
          width: 90%;
          padding: 2rem;
          background: rgba(var(--rp-surface-rgb), 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          box-shadow:
            0 30px 60px -12px rgba(0, 0, 0, 0.5),
            0 0 40px rgba(156, 207, 216, 0.15);
          backdrop-filter: blur(20px);
        }

        .help-panel--wide {
          max-width: 580px;
          padding: 1.5rem 2rem;
        }

        .help-close svg {
          width: 18px;
          height: 18px;
        }

        .shortcuts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 1.5rem;
        }

        .shortcut-category {
          background: rgba(var(--rp-overlay-rgb), 0.4);
          border-radius: 12px;
          padding: 1rem;
        }

        .shortcut-category__header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          color: var(--rp-foam);
          font-weight: 600;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .shortcut-category__header svg {
          width: 16px;
          height: 16px;
          opacity: 0.8;
        }

        .shortcut-category__list {
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .shortcut-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.35rem 0;
        }

        .shortcut-row:hover kbd {
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(156, 207, 216, 0.25);
        }

        .shortcut-keys {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .key-sep {
          color: var(--rp-muted);
          font-size: 0.75rem;
          margin: 0 0.1rem;
        }

        .shortcut-row dd {
          margin: 0;
          color: var(--rp-subtle);
          font-size: 0.8rem;
          font-weight: 500;
          text-align: right;
        }

        .help-footer {
          margin-top: 1.25rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .help-footer .help-tip {
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: linear-gradient(135deg, rgba(156, 207, 216, 0.08), rgba(196, 167, 231, 0.08));
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          font-size: 0.8rem;
          color: var(--rp-subtle);
          text-align: center;
        }

        .help-footer .help-tip svg {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          color: var(--rp-iris);
        }

        .help-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.75rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .help-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--rp-foam), var(--rp-iris));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .help-close {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          background: transparent;
          color: var(--rp-subtle);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .help-close:hover {
          background: rgba(235, 111, 146, 0.1);
          color: var(--rp-love);
          transform: rotate(90deg);
        }

        .shortcuts-list {
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .shortcut {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          padding: 0.5rem;
          border-radius: 8px;
          transition: background 0.2s ease;
        }

        .shortcut:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .shortcut dt {
          width: 80px;
          text-align: right;
        }

        .shortcut dd {
          margin: 0;
          color: var(--rp-subtle);
          font-size: 0.95rem;
          font-weight: 500;
        }

        kbd {
          display: inline-block;
          padding: 0.25em 0.5em;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          font-weight: 600;
          background: linear-gradient(135deg, rgba(var(--rp-surface-rgb), 0.9), rgba(var(--rp-overlay-rgb), 0.9));
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          color: var(--rp-foam);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.15);
          transition: all 0.15s ease;
          min-width: 24px;
          text-align: center;
        }

        .shortcut:hover kbd {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(156, 207, 216, 0.3);
        }

        .help-tip {
          margin: 1.75rem 0 0;
          padding: 1rem 1.25rem;
          background: linear-gradient(135deg, rgba(156, 207, 216, 0.1), rgba(196, 167, 231, 0.1));
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          font-size: 0.9rem;
          color: var(--rp-text);
          text-align: center;
          line-height: 1.6;
        }

        @media (max-width: 720px) {
          .controls-bar {
            left: 0.75rem;
            right: 0.75rem;
            max-width: none;
            padding: 0.25rem;
            gap: 0.35rem;
          }

          .mode-btn {
            padding: 0.3rem 0.5rem;
            font-size: 0.7rem;
          }

          .control-btn {
            width: 38px;
            height: 38px;
          }

          .control-btn svg {
            width: 18px;
            height: 18px;
          }

          .control-btn--small {
            width: 28px;
            height: 28px;
          }

          .control-btn--small svg {
            width: 14px;
            height: 14px;
          }

          .control-btn--text {
            padding: 0 0.5rem;
          }

          .control-btn__label {
            font-size: 0.65rem;
          }

          .dpi-selector,
          .layout-selector,
          .size-selector,
          .background-selector,
          .theme-selector {
            display: none;
          }

          .poster-inputs {
            display: none;
          }

          .help-panel--wide {
            max-width: 95vw;
            padding: 1rem;
          }

          .shortcuts-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .shortcut-category {
            padding: 0.75rem;
          }
        }

        @media (max-width: 480px) {
          .controls-bar {
            top: 0.5rem;
            left: 0.5rem;
            right: 0.5rem;
          }

          .mode-toggle {
            flex: 1;
            justify-content: center;
          }

          .control-btn--load-all .control-btn__text {
            display: none;
          }
        }
      `}</style>
        </>
    );
}
