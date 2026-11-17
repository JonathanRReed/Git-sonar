import { create } from 'zustand';
import type { RepoGraph, PositionedNode, CommitEdge, BackgroundStyle } from '@lib/git/types';
import type { Theme, ThemeId } from '@lib/themes';
import { generatePositionedNodes, generateEdges } from '@lib/git/graph';
import { getTheme, applyThemeToCSS, getSavedTheme, saveTheme } from '@lib/themes';
import {
    type PosterConfig,
    makePosterConfig,
} from '@lib/art/poster-config';

const AUTH_TOKEN_STORAGE_KEY = 'git-sonar-auth-token';

function getSavedAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
}

function saveAuthToken(token: string | null, remember: boolean): void {
    if (typeof window === 'undefined') return;
    try {
        if (token) {
            sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
            if (remember) {
                localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
            } else {
                localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            }
        } else {
            sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        }
    } catch {
        // ignore storage errors
    }
}

/** What the import in flight is doing, shown in the empty frame while it loads. */
export interface ImportStatus {
    /** Repo or file being read. */
    name: string;
    /** Commits found so far (0 while the count is unknown). */
    found: number;
}

/** An earlier moment to capture: the repo as it stood at the end of that day. */
export interface Moment {
    /** End of the chosen day, Unix ms (UTC). */
    untilMs: number;
    /** The day as typed, YYYY-MM-DD. */
    date: string;
    /** What happened that day, e.g. "Reached 1,000 stars". May be empty. */
    label: string;
}

/** Build a Moment from a YYYY-MM-DD date and an optional label; null if the date is not valid. */
export function makeMoment(date: string | null | undefined, label: string | null | undefined = ''): Moment | null {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const untilMs = Date.parse(`${date}T23:59:59.999Z`);
    if (!Number.isFinite(untilMs)) return null;
    return { untilMs, date, label: (label ?? '').trim().slice(0, 80) };
}

/** "Mar 3, 2024" for a Moment's day. */
export function formatMomentDate(moment: Moment): string {
    return new Date(moment.untilMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** View modes for visualization */
export type ViewMode = 'inspect' | 'poster' | 'calendar';

/** Layout modes for graph positioning */
export type LayoutMode = 'vertical' | 'horizontal' | 'radial';

/** Application state */
interface GraphState {
    /** Current repository graph */
    graph: RepoGraph | null;
    /** Positioned nodes for rendering */
    nodes: PositionedNode[];
    /** Edges between nodes */
    edges: CommitEdge[];
    /** Currently selected commit SHA */
    selectedId: string | null;
    /** Current view mode */
    viewMode: ViewMode;
    /** Current layout mode */
    layoutMode: LayoutMode;
    /** Current theme ID */
    themeId: ThemeId;
    /** Current theme */
    theme: Theme;
    /** Background style for graph */
    backgroundStyle: BackgroundStyle;
    /** Whether reduced motion is preferred */
    reducedMotion: boolean;
    /** Whether keyboard help overlay is visible */
    showHelp: boolean;
    /** Whether commit details modal is open */
    showDetails: boolean;
    /** Whether teaching overlay is visible */
    showTeaching: boolean;
    /** Loading state */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
    /** Whether the current repo may have more commits to load */
    hasMoreCommits: boolean;
    /** Current repo path for reloading (e.g., "owner/repo") */
    currentRepoPath: string | null;
    /** Active demo dataset id (e.g. "showcase"), so share links can reload it. */
    currentDemo: string | null;
    /** Name of a locally opened folder or archive, for display and filenames. */
    currentSourceName: string | null;
    /** Live progress of the import in flight (null when idle). */
    importStatus: ImportStatus | null;
    /** The earlier moment being captured, or null for the repo as it is now. */
    moment: Moment | null;
    /** Current repo provider (GitHub/GitLab/Bitbucket) */
    currentRepoProvider: 'github' | 'gitlab' | 'bitbucket' | null;
    /** Optional auth token for imports */
    authToken: string | null;
    /** Number of commits currently loaded */
    loadedCommitCount: number;
    /** Custom title for poster mode */
    posterTitle: string;
    /** Whether to show timeline ruler in poster mode */
    showTimeline: boolean;
    /** Whether to show datelines on the canvas */
    showDatelines: boolean;
    /** Optional poster subtitle */
    posterSubtitle: string;
    /** Whether to show watermark */
    showWatermark: boolean;
    /** Whether to show signature with date */
    showSignature: boolean;
    /** Whether to show heatmap overlay */
    showHeatmap: boolean;
    /** Structured poster/art studio configuration (template, palette, encoding, size, seed…) */
    posterConfig: PosterConfig;
}

/** Store actions */
interface GraphActions {
    /** Set the repository graph */
    setGraph: (graph: RepoGraph) => void;
    /** Clear the current graph */
    clearGraph: () => void;
    /** Select a commit by SHA */
    selectCommit: (id: string | null) => void;
    /** Navigate to next commit in current lane */
    navigateNext: () => void;
    /** Navigate to previous commit in current lane */
    navigatePrev: () => void;
    /** Navigate to adjacent lane */
    navigateLane: (direction: 'up' | 'down') => void;
    /** Set view mode */
    setViewMode: (mode: ViewMode) => void;
    /** Set layout mode */
    setLayoutMode: (mode: LayoutMode) => void;
    /** Set background style */
    setBackgroundStyle: (style: BackgroundStyle) => void;
    /** Set theme */
    setTheme: (themeId: ThemeId) => void;
    /** Toggle reduced motion */
    setReducedMotion: (enabled: boolean) => void;
    /** Toggle help overlay */
    toggleHelp: () => void;
    /** Toggle details modal */
    toggleDetails: () => void;
    /** Toggle teaching overlay */
    toggleTeaching: () => void;
    /** Set loading state */
    setLoading: (loading: boolean) => void;
    /** Set error */
    setError: (error: string | null) => void;
    /** Set current repo path for potential reload */
    setRepoPath: (path: string | null, provider: 'github' | 'gitlab' | 'bitbucket' | null, hasMore: boolean) => void;
    /** Record which demo dataset is active (for shareable demo permalinks). */
    setCurrentDemo: (demo: string | null) => void;
    /** Record the name of a locally opened folder or archive. */
    setSourceName: (name: string | null) => void;
    /** Report import progress (null clears it). */
    setImportStatus: (status: ImportStatus | null) => void;
    /** Choose an earlier moment to capture (null for now). */
    setMoment: (moment: Moment | null) => void;
    /** Set auth token for imports */
    setAuthToken: (token: string | null, remember?: boolean) => void;
    /** Set poster title */
    setPosterTitle: (title: string) => void;
    /** Set poster subtitle */
    setPosterSubtitle: (subtitle: string) => void;
    /** Toggle watermark */
    toggleWatermark: () => void;
    /** Toggle signature */
    toggleSignature: () => void;
    /** Toggle heatmap overlay */
    toggleHeatmap: () => void;
    /** Toggle timeline ruler */
    toggleTimeline: () => void;
    /** Toggle date guide lines on the canvas */
    toggleDatelines: () => void;
    /** Replace the entire poster config (e.g. from a permalink). */
    setPosterConfig: (config: PosterConfig) => void;
    /** Merge a partial update into the poster config. */
    updatePosterConfig: (patch: Partial<PosterConfig>) => void;
    /** Reset poster config to defaults (keeps any title already typed). */
    resetPosterConfig: () => void;
    /** Zoom control callbacks - set by GraphCanvas */
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    /** Register zoom callbacks from GraphCanvas */
    registerZoomCallbacks: (callbacks: { zoomIn: () => void; zoomOut: () => void; resetView: () => void }) => void;
}

export type GraphStore = GraphState & GraphActions;

/**
 * The poster a new session opens on: Pulsar, the style that holds up for any
 * repo size. Values mirror its preset in art/templates (kept literal here so
 * the store does not pull the template code into every island).
 */
function freshPosterConfig(themeId: ThemeId, title = ''): PosterConfig {
    return makePosterConfig({ themeId, title, template: 'pulsar', paletteMood: 'mono', seed: 'pulse' });
}

export const useGraphStore = create<GraphStore>((set, get) => {
    const savedThemeId = getSavedTheme();
    const initialTheme = getTheme(savedThemeId);
    const savedAuthToken = getSavedAuthToken();
    applyThemeToCSS(initialTheme);

    return {
        graph: null,
        nodes: [],
        edges: [],
        selectedId: null,
        viewMode: 'poster',
        layoutMode: 'vertical',
        themeId: savedThemeId,
        theme: initialTheme,
        backgroundStyle: { type: 'solid' },
        reducedMotion: false,
        showHelp: false,
        showDetails: false,
        showTeaching: false,
        isLoading: false,
        error: null,
        hasMoreCommits: false,
        currentRepoPath: null,
        currentRepoProvider: null,
        currentDemo: null,
        currentSourceName: null,
        importStatus: null,
        moment: null,
        authToken: savedAuthToken,
        loadedCommitCount: 0,
        posterTitle: '',
        posterSubtitle: '',
        showTimeline: false,
        showDatelines: true,
        showWatermark: true,
        showSignature: true,
        showHeatmap: false,
        posterConfig: freshPosterConfig(savedThemeId),
        setGraph: (graph) => {
            const nodes = generatePositionedNodes(graph);
            const edges = generateEdges(graph);
            set({
                graph,
                nodes,
                edges,
                selectedId: graph.defaultHead,
                error: null,
                isLoading: false,
                loadedCommitCount: graph.commits.size,
                currentDemo: null,
                currentSourceName: null,
                importStatus: null,
            });
        },
        clearGraph: () => {
            set({
                graph: null,
                nodes: [],
                edges: [],
                selectedId: null,
                showDetails: false,
                showTeaching: false,
                error: null,
                isLoading: false,
                hasMoreCommits: false,
                currentRepoPath: null,
                currentRepoProvider: null,
                currentDemo: null,
                currentSourceName: null,
                importStatus: null,
                moment: null,
                loadedCommitCount: 0,
                posterTitle: '',
                posterSubtitle: '',
                showTimeline: false,
                showDatelines: true,
                showWatermark: true,
                showSignature: true,
                showHeatmap: false,
                posterConfig: freshPosterConfig(get().themeId),
            });
        },
        selectCommit: (id) => {
            set({ selectedId: id });
        },
        navigateNext: () => {
            const { nodes, selectedId } = get();
            if (!selectedId || nodes.length === 0) return;

            const currentIdx = nodes.findIndex((n) => n.id === selectedId);
            if (currentIdx === -1) return;

            const currentLane = nodes[currentIdx].lane;

            for (let i = currentIdx + 1; i < nodes.length; i++) {
                if (nodes[i].lane === currentLane) {
                    set({ selectedId: nodes[i].id });
                    return;
                }
            }

            if (currentIdx < nodes.length - 1) {
                set({ selectedId: nodes[currentIdx + 1].id });
            }
        },
        navigatePrev: () => {
            const { nodes, selectedId } = get();
            if (!selectedId || nodes.length === 0) return;

            const currentIdx = nodes.findIndex((n) => n.id === selectedId);
            if (currentIdx === -1) return;

            const currentLane = nodes[currentIdx].lane;

            for (let i = currentIdx - 1; i >= 0; i--) {
                if (nodes[i].lane === currentLane) {
                    set({ selectedId: nodes[i].id });
                    return;
                }
            }

            if (currentIdx > 0) {
                set({ selectedId: nodes[currentIdx - 1].id });
            }
        },
        navigateLane: (direction) => {
            const { nodes, selectedId } = get();
            if (!selectedId || nodes.length === 0) return;

            const currentIdx = nodes.findIndex((n) => n.id === selectedId);
            if (currentIdx === -1) return;

            const currentNode = nodes[currentIdx];
            const targetLane =
                direction === 'up' ? currentNode.lane - 1 : currentNode.lane + 1;

            const candidates = nodes.filter((n) => n.lane === targetLane);
            if (candidates.length === 0) return;

            let closest = candidates[0];
            let closestDist = Math.abs(closest.t - currentNode.t);

            for (const n of candidates) {
                const dist = Math.abs(n.t - currentNode.t);
                if (dist < closestDist) {
                    closest = n;
                    closestDist = dist;
                }
            }

            set({ selectedId: closest.id });
        },
        setViewMode: (mode) => {
            set({ viewMode: mode });
        },
        setLayoutMode: (mode) => {
            set({ layoutMode: mode });
        },
        setBackgroundStyle: (style) => {
            set({ backgroundStyle: style });
        },
        setTheme: (newThemeId) => {
            const newTheme = getTheme(newThemeId);
            applyThemeToCSS(newTheme);
            saveTheme(newThemeId);
            set((state) => ({
                themeId: newThemeId,
                theme: newTheme,
                posterConfig: makePosterConfig({ ...state.posterConfig, themeId: newThemeId }),
            }));
        },
        setReducedMotion: (enabled) => {
            set({ reducedMotion: enabled });
        },
        toggleHelp: () => {
            set((state) => ({ showHelp: !state.showHelp }));
        },
        toggleDetails: () => {
            set((state) => ({ showDetails: !state.showDetails }));
        },
        toggleTeaching: () => {
            set((state) => ({ showTeaching: !state.showTeaching }));
        },
        setLoading: (loading) => {
            set({ isLoading: loading });
        },
        setError: (error) => {
            // Only a real error ends the import in flight; clearing the last
            // error (done at the start of every import) must not.
            set(error ? { error, isLoading: false, importStatus: null } : { error: null });
        },
        setRepoPath: (path, provider, hasMore) => {
            set({ currentRepoPath: path, currentRepoProvider: provider, hasMoreCommits: hasMore, currentDemo: null });
        },
        setCurrentDemo: (demo) => {
            set({ currentDemo: demo });
        },
        setSourceName: (name) => {
            set({ currentSourceName: name });
        },
        setImportStatus: (status) => {
            set({ importStatus: status });
        },
        setMoment: (moment) => {
            set({ moment });
        },
        setAuthToken: (token, remember = false) => {
            saveAuthToken(token, remember);
            set({ authToken: token });
        },
        setPosterTitle: (title) => {
            set({ posterTitle: title });
        },
        setPosterSubtitle: (subtitle) => {
            set({ posterSubtitle: subtitle });
        },
        toggleWatermark: () => {
            set((state) => ({ showWatermark: !state.showWatermark }));
        },
        toggleSignature: () => {
            set((state) => ({ showSignature: !state.showSignature }));
        },
        toggleHeatmap: () => {
            set((state) => ({ showHeatmap: !state.showHeatmap }));
        },
        toggleTimeline: () => {
            set((state) => ({ showTimeline: !state.showTimeline }));
        },
        toggleDatelines: () => {
            set((state) => ({ showDatelines: !state.showDatelines }));
        },
        setPosterConfig: (config) => {
            set({ posterConfig: config });
        },
        updatePosterConfig: (patch) => {
            set((state) => ({ posterConfig: makePosterConfig({ ...state.posterConfig, ...patch }) }));
        },
        resetPosterConfig: () => {
            set((state) => ({
                posterConfig: freshPosterConfig(state.themeId, state.posterConfig.title),
            }));
        },
        // Zoom control callbacks - initialized as no-ops, registered by GraphCanvas
        zoomIn: () => {},
        zoomOut: () => {},
        resetView: () => {},
        registerZoomCallbacks: (callbacks) => {
            set({
                zoomIn: callbacks.zoomIn,
                zoomOut: callbacks.zoomOut,
                resetView: callbacks.resetView,
            });
        },
    };
});
