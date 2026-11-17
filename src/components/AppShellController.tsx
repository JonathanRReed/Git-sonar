import { useEffect } from 'react';
import { formatMomentDate, makeMoment, useGraphStore, type LayoutMode, type ViewMode } from '@lib/store/graph-store';
import { THEME_IDS, type ThemeId } from '@lib/themes';
import { repoDisplayName } from '@lib/utils/repo-name';

const DEFAULT_MAX_COMMITS = 1000;
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

    stat.append(valueSpan, ' ', labelSpan);
    statsEl.append(stat);
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
    const repo = document.createElement('span');
    repo.className = 'app-repo';
    repo.textContent = repoDisplayName(state.currentRepoPath, state.currentDemo, state.currentSourceName);
    statsEl.append(repo);
    const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
    appendStat(statsEl, metrics.commitCount.toLocaleString(), plural(metrics.commitCount, 'commit'));
    appendStat(statsEl, metrics.authorCount.toLocaleString(), plural(metrics.authorCount, 'author'));
    appendStat(statsEl, metrics.mergeCount.toLocaleString(), plural(metrics.mergeCount, 'merge'));
    if (state.moment) {
        const moment = document.createElement('span');
        moment.className = 'app-moment';
        moment.textContent = `as of ${formatMomentDate(state.moment)}`;
        statsEl.append(moment);
    }
}

/** Keep the header's Poster / History / Calendar switch in step with the store. */
function updateViewSwitch() {
    const state = useGraphStore.getState();
    const viewsEl = document.getElementById('app-views');
    if (!viewsEl) return;
    viewsEl.hidden = !state.graph || state.isLoading;
    for (const button of viewsEl.querySelectorAll<HTMLButtonElement>('button[data-view]')) {
        button.setAttribute('aria-pressed', String(button.dataset.view === state.viewMode));
    }
}

function updateView() {
    const state = useGraphStore.getState();
    const importEl = document.getElementById('import-container');
    const graphEl = document.getElementById('graph-container');
    const btnNew = document.getElementById('btn-new');
    const statsEl = document.getElementById('app-stats');

    document.body.dataset.viewMode = state.viewMode;
    updateViewSwitch();

    if (state.isLoading) {
        if (importEl) importEl.style.display = 'flex';
        if (graphEl) graphEl.style.display = 'none';
        if (statsEl) clearStats(statsEl);
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

    // An earlier moment to capture: ?until=2024-03-03&moment=Reached+1,000+stars
    const moment = makeMoment(params.get('until'), params.get('moment'));
    if (moment) state.setMoment(moment);

    // Deep-link a demo dataset (used by the landing gallery's "remix" links).
    const demoParam = params.get('demo');
    if (demoParam && !repoPath) {
        state.setLoading(true);
        state.setError(null);
        state.setImportStatus({ name: repoDisplayName(null, demoParam), found: 0 });
        try {
            const { loadDemoDataset } = await import('@lib/demo-data');
            let graph = await loadDemoDataset(demoParam);
            if (moment) {
                const { snapshotGraphAt } = await import('@lib/git/graph');
                graph = snapshotGraphAt(graph, moment.untilMs);
            }
            state.setGraph(graph);
            state.setCurrentDemo(demoParam);
        } catch (err) {
            state.setError(err instanceof Error ? err.message : 'Failed to load demo');
        }
        return;
    }

    if (!repoPath) return;

    const provider = githubRepo ? 'github' : gitlabRepo ? 'gitlab' : 'bitbucket';
    const commitParam = params.get('commit');

    const name = repoDisplayName(repoPath, null);
    state.setLoading(true);
    state.setError(null);
    state.setImportStatus({ name, found: 0 });

    try {
        const imports = await import('@lib/git/import-git');
        const options = {
            maxCommits: DEFAULT_MAX_COMMITS,
            authToken: state.authToken ?? undefined,
            until: moment?.untilMs,
            onProgress: (found: number) => useGraphStore.getState().setImportStatus({ name, found }),
        };
        const graph = provider === 'gitlab'
            ? await imports.parseGitLabRepo(repoPath, options)
            : provider === 'bitbucket'
                ? await imports.parseBitbucketRepo(repoPath, options)
                : await imports.parseGitHubRepo(repoPath, options);

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
                state.viewMode !== prevState.viewMode ||
                state.currentRepoPath !== prevState.currentRepoPath ||
                state.currentDemo !== prevState.currentDemo ||
                state.currentSourceName !== prevState.currentSourceName ||
                state.moment !== prevState.moment
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
        const handleViewSwitch = (event: Event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-view]');
            const view = button?.dataset.view as ViewMode | undefined;
            if (view && VIEW_MODES.includes(view)) useGraphStore.getState().setViewMode(view);
        };

        const btnNew = document.getElementById('btn-new');
        const btnHelp = document.getElementById('btn-help');
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const viewsEl = document.getElementById('app-views');

        viewsEl?.addEventListener('click', handleViewSwitch);
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
            viewsEl?.removeEventListener('click', handleViewSwitch);
            btnNew?.removeEventListener('click', handleNewImport);
            btnHelp?.removeEventListener('click', handleHelp);
            mobileMenuToggle?.removeEventListener('click', handleMobileMenu);
            sidebarOverlay?.removeEventListener('click', handleSidebarOverlay);
        };
    }, []);

    return null;
}
