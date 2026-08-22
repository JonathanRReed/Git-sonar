import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    it('loads the selected demo when Load Demo is pressed', async () => {
        render(<ImportPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Load Demo' }));

        await waitFor(() => {
            expect(loadDemoDataset).toHaveBeenCalledWith('branching');
            expect(useGraphStore.getState().graph?.defaultHead).toBe('branching-000002');
        });
    });

    it('changes the selected demo with the size controls', async () => {
        render(<ImportPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Large' }));
        fireEvent.click(screen.getByRole('button', { name: 'Load Demo' }));

        await waitFor(() => {
            expect(loadDemoDataset).toHaveBeenCalledWith('complex');
            expect(useGraphStore.getState().graph?.defaultHead).toBe('complex-000002');
        });
    });
});
