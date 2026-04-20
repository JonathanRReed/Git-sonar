import { useEffect } from 'react';
import { useGraphStore, type LayoutMode, type ViewMode } from '@lib/store/graph-store';
import type { ThemeId } from '@lib/themes';

const DEFAULT_MAX_COMMITS = 1000;
const THEME_IDS: ThemeId[] = ['night', 'dawn', 'github', 'nord', 'dracula'];
const LAYOUT_MODES: LayoutMode[] = ['vertical', 'horizontal', 'radial'];
const VIEW_MODES: ViewMode[] = ['inspect', 'poster', 'calendar'];

function clearStats(statsEl: HTMLElement) {
    statsEl.replaceChildren();
}

function appendStat(statsEl: HTMLElement, value: string, label: string) {
    const stat = document.createElement('div');
    stat.className = 'stat';

    const valueSpan = document.createElement('span');
    valueSpan.className = 'stat__value';
    valueSpan.textContent = value;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'stat__label';
    labelSpan.textContent = label;

    stat.append(valueSpan, labelSpan);
    statsEl.append(stat);
}

function setStatsLoading(statsEl: HTMLElement) {
    clearStats(statsEl);
    const loading = document.createElement('div');
    loading.className = 'loading-indicator';
    loading.textContent = 'Loading...';
    statsEl.append(loading);
}

function setSidebarOpen(open: boolean) {
    const sidebarEl = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');

    if (!sidebarEl || !sidebarOverlay || !mobileMenuToggle) return;

    sidebarEl.classList.toggle('open', open);
    sidebarOverlay.classList.toggle('open', open);
    mobileMenuToggle.setAttribute('aria-expanded', String(open));
}

function updateStats() {
    const state = useGraphStore.getState();
    const statsEl = document.getElementById('app-stats');
    if (!statsEl) return;

    if (!state.graph) {
        clearStats(statsEl);
        return;
    }

    clearStats(statsEl);
    const metrics = state.graph.metrics;
    appendStat(statsEl, metrics.commitCount.toLocaleString(), 'commits');
    appendStat(statsEl, metrics.authorCount.toLocaleString(), 'authors');
    appendStat(statsEl, metrics.mergeCount.toLocaleString(), 'merges');
}

function updateView() {
    const state = useGraphStore.getState();
    const importEl = document.getElementById('import-container');
    const graphEl = document.getElementById('graph-container');
    const btnNew = document.getElementById('btn-new');
    const statsEl = document.getElementById('app-stats');

    document.body.dataset.viewMode = state.viewMode;

    if (state.isLoading) {
        if (importEl) importEl.style.display = 'flex';
        if (graphEl) graphEl.style.display = 'none';
        if (statsEl) setStatsLoading(statsEl);
        return;
    }

    if (state.graph) {
        if (importEl) importEl.style.display = 'none';
        if (graphEl) graphEl.style.display = 'flex';
        if (btnNew) btnNew.style.display = 'flex';
    } else {
        if (importEl) importEl.style.display = 'flex';
        if (graphEl) graphEl.style.display = 'none';
        if (btnNew) btnNew.style.display = 'none';
        setSidebarOpen(false);
    }

    updateStats();
}

async function handleQueryImport() {
    const params = new URLSearchParams(window.location.search);
    const githubRepo = params.get('github');
    const gitlabRepo = params.get('gitlab');
    const bitbucketRepo = params.get('bitbucket');
    const repoPath = githubRepo || gitlabRepo || bitbucketRepo;

    const state = useGraphStore.getState();

    const themeParam = params.get('theme');
    if (themeParam && THEME_IDS.includes(themeParam as ThemeId)) {
        state.setTheme(themeParam as ThemeId);
    }

    const layoutParam = params.get('layout');
    if (layoutParam && LAYOUT_MODES.includes(layoutParam as LayoutMode)) {
        state.setLayoutMode(layoutParam as LayoutMode);
    }

    const viewParam = params.get('view');
    if (viewParam && VIEW_MODES.includes(viewParam as ViewMode)) {
        state.setViewMode(viewParam as ViewMode);
    }

    if (!repoPath) return;

    const provider = githubRepo ? 'github' : gitlabRepo ? 'gitlab' : 'bitbucket';
    const commitParam = params.get('commit');

    state.setLoading(true);
    state.setError(null);

    try {
        const imports = await import('@lib/git/import-git');
        const graph = provider === 'gitlab'
            ? await imports.parseGitLabRepo(repoPath, { maxCommits: DEFAULT_MAX_COMMITS })
            : provider === 'bitbucket'
                ? await imports.parseBitbucketRepo(repoPath, { maxCommits: DEFAULT_MAX_COMMITS })
                : await imports.parseGitHubRepo(repoPath, { maxCommits: DEFAULT_MAX_COMMITS });

        state.setGraph(graph);
        state.setRepoPath(repoPath, provider, graph.commits.size >= DEFAULT_MAX_COMMITS);

        if (!commitParam) return;

        const shortSha = commitParam.toLowerCase();
        for (const [sha] of graph.commits) {
            if (sha.startsWith(shortSha) || sha === shortSha) {
                state.selectCommit(sha);
                break;
            }
        }
    } catch (err) {
        state.setError(err instanceof Error ? err.message : 'Failed to import repository');
    }
}

export function AppShellController() {
    useEffect(() => {
        const unsubscribe = useGraphStore.subscribe((state, prevState) => {
            if (
                state.graph !== prevState.graph ||
                state.isLoading !== prevState.isLoading ||
                state.viewMode !== prevState.viewMode
            ) {
                updateView();
            }
        });

        const handleNewImport = () => useGraphStore.getState().clearGraph();
        const handleHelp = () => useGraphStore.getState().toggleHelp();
        const handleMobileMenu = () => {
            const isOpen = document.getElementById('sidebar')?.classList.contains('open') ?? false;
            setSidebarOpen(!isOpen);
        };
        const handleSidebarOverlay = () => setSidebarOpen(false);

        const btnNew = document.getElementById('btn-new');
        const btnHelp = document.getElementById('btn-help');
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const sidebarOverlay = document.getElementById('sidebar-overlay');

        btnNew?.addEventListener('click', handleNewImport);
        btnHelp?.addEventListener('click', handleHelp);
        mobileMenuToggle?.addEventListener('click', handleMobileMenu);
        sidebarOverlay?.addEventListener('click', handleSidebarOverlay);

        const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        useGraphStore.getState().setReducedMotion(reducedMotionQuery.matches);

        updateView();
        void handleQueryImport();

        return () => {
            unsubscribe();
            btnNew?.removeEventListener('click', handleNewImport);
            btnHelp?.removeEventListener('click', handleHelp);
            mobileMenuToggle?.removeEventListener('click', handleMobileMenu);
            sidebarOverlay?.removeEventListener('click', handleSidebarOverlay);
        };
    }, []);

    return null;
}
