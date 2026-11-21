import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportPanel } from '@components/ImportPanel';
import { useGraphStore } from '@lib/store/graph-store';
import type { RepoGraph } from '@lib/git/types';

const loadDemoDataset = vi.fn(async (key: string) => makeGraph(key));

vi.mock('@lib/demo-data/catalog', () => ({
    getDemoDatasets: () => ({
        simple: {
            name: 'Simple',
            description: 'Linear history',
            iconName: 'file-text',
        },
        branching: {
            name: 'Branching',
            description: 'Branching history',
            iconName: 'git-branch',
        },
        complex: {
            name: 'Complex',
            description: 'Complex history',
            iconName: 'network',
        },
    }),
}));

vi.mock('@lib/demo-data', () => ({
    loadDemoDataset: (key: string) => loadDemoDataset(key),
}));

function makeGraph(key: string): RepoGraph {
    const root = `${key}-000001`;
    const head = `${key}-000002`;
    return {
        commits: new Map([
            [
                root,
                {
                    id: root,
                    parents: [],
                    authorName: 'Alice',
                    authoredAt: 1704067200000,
                    messageSubject: 'Initial commit',
                },
            ],
            [
                head,
                {
                    id: head,
                    parents: [root],
                    authorName: 'Bob',
                    authoredAt: 1704153600000,
                    messageSubject: 'Add feature',
                },
            ],
        ]),
        heads: new Map([['main', head]]),
        defaultHead: head,
        topoOrder: [root, head],
        lanes: new Map([
            [root, 0],
            [head, 0],
        ]),
        metrics: {
            commitCount: 2,
            mergeCount: 0,
            authorCount: 2,
            authorCommits: new Map([
                ['Alice', 1],
                ['Bob', 1],
            ]),
            totalAdditions: 0,
            totalDeletions: 0,
            timeSpan: 86400000,
        },
    };
}

afterEach(() => {
    cleanup();
    useGraphStore.getState().clearGraph();
    loadDemoDataset.mockClear();
});

describe('ImportPanel', () => {
    it('gives repository and archive inputs persistent accessible names', () => {
        render(<ImportPanel />);

        expect(screen.getByLabelText('Repository URL').getAttribute('name')).toBe('repository-url');
        expect(screen.getByLabelText('Repository archive').getAttribute('name')).toBe('repository-archive');
    });

    it('asks one question and offers the ways in', () => {
        render(<ImportPanel />);

        expect(screen.getByRole('heading', { name: 'Pick a repo to start.' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Make poster' })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Open a folder on this computer/ })).toBeTruthy();
    });

    it('loads the sample repo and remembers which demo it is', async () => {
        render(<ImportPanel />);

        fireEvent.click(screen.getByRole('button', { name: /Use the sample repo/ }));

        await waitFor(() => {
            expect(loadDemoDataset).toHaveBeenCalledWith('showcase');
            expect(useGraphStore.getState().graph?.defaultHead).toBe('showcase-000002');
            expect(useGraphStore.getState().currentDemo).toBe('showcase');
        });
    });

    it('keeps the call to action enabled and focuses the box on an empty submit', () => {
        render(<ImportPanel />);

        const button = screen.getByRole('button', { name: 'Make poster' }) as HTMLButtonElement;
        expect(button.disabled).toBe(false);
        fireEvent.click(button);

        expect(document.activeElement).toBe(screen.getByLabelText('Repository URL'));
        expect(useGraphStore.getState().isLoading).toBe(false);
    });
});

describe('the earlier-moment form', () => {
    it('shows no cutoff once the store has dropped it', () => {
        render(<ImportPanel />);
        const day = screen.getByLabelText('The day') as HTMLInputElement;
        const label = screen.getByLabelText('What happened') as HTMLInputElement;

        fireEvent.change(day, { target: { value: '2024-03-03' } });
        fireEvent.change(label, { target: { value: 'Reached 1,000 stars' } });
        expect(useGraphStore.getState().moment).toMatchObject({ date: '2024-03-03', label: 'Reached 1,000 stars' });

        // "Change repo" clears the store while this form stays mounted.
        act(() => useGraphStore.getState().clearGraph());

        expect(useGraphStore.getState().moment).toBeNull();
        expect(day.value).toBe('');
        expect(label.value).toBe('');
    });

    it('keeps a trailing space while the label is being typed', () => {
        render(<ImportPanel />);
        fireEvent.change(screen.getByLabelText('The day'), { target: { value: '2024-03-03' } });
        const label = screen.getByLabelText('What happened') as HTMLInputElement;

        fireEvent.change(label, { target: { value: 'Reached ' } });

        expect(label.value).toBe('Reached ');
        expect(useGraphStore.getState().moment?.label).toBe('Reached');
    });

    it('picks up a moment set from a shared link', () => {
        render(<ImportPanel />);

        act(() => useGraphStore.getState().setMoment({ untilMs: Date.parse('2023-06-01T23:59:59.999Z'), date: '2023-06-01', label: 'Launch day' }));

        expect((screen.getByLabelText('The day') as HTMLInputElement).value).toBe('2023-06-01');
        expect((screen.getByLabelText('What happened') as HTMLInputElement).value).toBe('Launch day');
    });
});

describe('import state', () => {
    it('keeps the loading state when the previous error is cleared', () => {
        const store = useGraphStore.getState();
        store.setLoading(true);
        store.setError(null);
        store.setImportStatus({ name: 'svelte', found: 200 });

        expect(useGraphStore.getState().isLoading).toBe(true);
        expect(useGraphStore.getState().importStatus?.found).toBe(200);

        useGraphStore.getState().setError('Rate limited');
        expect(useGraphStore.getState().isLoading).toBe(false);
        expect(useGraphStore.getState().importStatus).toBeNull();
    });
});
