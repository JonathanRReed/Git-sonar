import { create } from 'zustand';
import type { RepoGraph, PositionedNode, CommitEdge, BackgroundStyle } from '@lib/git/types';
import type { Theme, ThemeId } from '@lib/themes';
import { generatePositionedNodes, generateEdges } from '@lib/git/graph';
import { getTheme, applyThemeToCSS, getSavedTheme, saveTheme } from '@lib/themes';

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
    /** Zoom control callbacks - set by GraphCanvas */
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    /** Register zoom callbacks from GraphCanvas */
    registerZoomCallbacks: (callbacks: { zoomIn: () => void; zoomOut: () => void; resetView: () => void }) => void;
}

export type GraphStore = GraphState & GraphActions;

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
        viewMode: 'inspect',
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
        authToken: savedAuthToken,
        loadedCommitCount: 0,
        posterTitle: '',
        posterSubtitle: '',
        showTimeline: false,
        showDatelines: true,
        showWatermark: true,
        showSignature: true,
        showHeatmap: false,
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
                loadedCommitCount: 0,
                posterTitle: '',
                showTimeline: false,
                showDatelines: true,
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
            set({ themeId: newThemeId, theme: newTheme });
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
            set({ error, isLoading: false });
        },
        setRepoPath: (path, provider, hasMore) => {
            set({ currentRepoPath: path, currentRepoProvider: provider, hasMoreCommits: hasMore });
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
