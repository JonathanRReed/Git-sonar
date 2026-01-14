import { describe, it, expect } from 'vitest';
import {
    buildTopoOrder,
    assignLanes,
    computeMetrics,
    generatePositionedNodes,
    generateEdges,
    buildRepoGraph,
} from '@lib/git/graph';
import type { CommitNode } from '@lib/git/types';

/**
 * Create a simple commit for testing.
 */
function createCommit(
    id: string,
    parents: string[] = [],
    authoredAt: number = Date.now(),
    options: Partial<CommitNode> = {}
): CommitNode {
    return {
        id,
        parents,
        authorName: options.authorName ?? 'Test Author',
        authoredAt,
        messageSubject: options.messageSubject ?? `Commit ${id}`,
        branchHints: options.branchHints,
        stats: options.stats,
    };
}

describe('buildTopoOrder', () => {
    it('returns empty array for empty commits', () => {
        const commits = new Map<string, CommitNode>();
        const order = buildTopoOrder(commits);
        expect(order).toEqual([]);
    });

    it('returns single commit for single commit', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a'));
        const order = buildTopoOrder(commits);
        expect(order).toEqual(['a']);
    });

    it('orders parents before children in linear history', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 2000));
        commits.set('c', createCommit('c', ['b'], 3000));

        const order = buildTopoOrder(commits);

        expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });

    it('handles merge commits correctly', () => {
        const commits = new Map<string, CommitNode>();
        // Root -> A -> B
        //       -> C --^
        commits.set('root', createCommit('root', [], 1000));
        commits.set('a', createCommit('a', ['root'], 2000));
        commits.set('c', createCommit('c', ['root'], 2500));
        commits.set('b', createCommit('b', ['a', 'c'], 3000));

        const order = buildTopoOrder(commits);

        expect(order.indexOf('root')).toBeLessThan(order.indexOf('a'));
        expect(order.indexOf('root')).toBeLessThan(order.indexOf('c'));
        expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
    });
});

describe('assignLanes', () => {
    it('assigns lane 0 to single commit', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000, { branchHints: ['main'] }));

        const order = buildTopoOrder(commits);
        const lanes = assignLanes(commits, order);

        expect(lanes.get('a')).toBe(0);
    });

    it('keeps linear history in same lane', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 2000));
        commits.set('c', createCommit('c', ['b'], 3000));

        const order = buildTopoOrder(commits);
        const lanes = assignLanes(commits, order);

        expect(lanes.get('a')).toBe(lanes.get('b'));
        expect(lanes.get('b')).toBe(lanes.get('c'));
    });

    it('assigns main/master branch to lane 0', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000, { branchHints: ['main'] }));
        commits.set('b', createCommit('b', ['a'], 2000, { branchHints: ['main'] }));

        const order = buildTopoOrder(commits);
        const lanes = assignLanes(commits, order);

        expect(lanes.get('a')).toBe(0);
        expect(lanes.get('b')).toBe(0);
    });
});

describe('computeMetrics', () => {
    it('counts commits correctly', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a'));
        commits.set('b', createCommit('b', ['a']));
        commits.set('c', createCommit('c', ['b']));

        const metrics = computeMetrics(commits);

        expect(metrics.commitCount).toBe(3);
    });

    it('counts unique authors', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000, { authorName: 'Alice' }));
        commits.set('b', createCommit('b', ['a'], 2000, { authorName: 'Bob' }));
        commits.set('c', createCommit('c', ['b'], 3000, { authorName: 'Alice' }));

        const metrics = computeMetrics(commits);

        expect(metrics.authorCount).toBe(2);
        expect(metrics.authorCommits.get('Alice')).toBe(2);
        expect(metrics.authorCommits.get('Bob')).toBe(1);
    });

    it('counts merge commits', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', []));
        commits.set('b', createCommit('b', ['a']));
        commits.set('c', createCommit('c', ['a']));
        commits.set('d', createCommit('d', ['b', 'c'])); // merge

        const metrics = computeMetrics(commits);

        expect(metrics.mergeCount).toBe(1);
    });

    it('accumulates stats', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000, {
            stats: { additions: 100, deletions: 10 },
        }));
        commits.set('b', createCommit('b', ['a'], 2000, {
            stats: { additions: 50, deletions: 20 },
        }));

        const metrics = computeMetrics(commits);

        expect(metrics.totalAdditions).toBe(150);
        expect(metrics.totalDeletions).toBe(30);
    });
});

describe('generatePositionedNodes', () => {
    it('generates positioned nodes from graph', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 2000));

        const graph = buildRepoGraph(commits);
        const nodes = generatePositionedNodes(graph);

        expect(nodes).toHaveLength(2);
        expect(nodes[0].id).toBe('a');
        expect(nodes[1].id).toBe('b');
    });

    it('normalizes time to 0-1 range', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 2000));
        commits.set('c', createCommit('c', ['b'], 3000));

        const graph = buildRepoGraph(commits);
        const nodes = generatePositionedNodes(graph);

        expect(nodes.find(n => n.id === 'a')?.t).toBe(0);
        expect(nodes.find(n => n.id === 'c')?.t).toBe(1);
    });
});

describe('generateEdges', () => {
    it('creates edges for parent-child relationships', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', []));
        commits.set('b', createCommit('b', ['a']));

        const graph = buildRepoGraph(commits);
        const edges = generateEdges(graph);

        expect(edges).toHaveLength(1);
        expect(edges[0].from).toBe('a');
        expect(edges[0].to).toBe('b');
    });

    it('marks merge edges correctly', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', []));
        commits.set('b', createCommit('b', ['a']));
        commits.set('c', createCommit('c', ['a']));
        commits.set('d', createCommit('d', ['b', 'c'])); // merge

        const graph = buildRepoGraph(commits);
        const edges = generateEdges(graph);

        const mergeEdges = edges.filter(e => e.to === 'd');
        expect(mergeEdges).toHaveLength(2);
        expect(mergeEdges.every(e => e.isMerge)).toBe(true);
    });
});

describe('buildRepoGraph', () => {
    it('builds complete graph with all properties', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000, { branchHints: ['main'] }));
        commits.set('b', createCommit('b', ['a'], 2000, { branchHints: ['main'] }));

        const refs = new Map([['main', 'b']]);
        const graph = buildRepoGraph(commits, refs, 'main');

        expect(graph.commits.size).toBe(2);
        expect(graph.heads.get('main')).toBe('b');
        expect(graph.defaultHead).toBe('b');
        expect(graph.topoOrder).toContain('a');
        expect(graph.topoOrder).toContain('b');
        expect(graph.lanes.size).toBe(2);
        expect(graph.metrics.commitCount).toBe(2);
    });

    it('falls back to main/master when no default branch specified', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 2000));

        const refs = new Map([['main', 'b']]);
        const graph = buildRepoGraph(commits, refs);

        expect(graph.defaultHead).toBe('b');
    });

    it('uses first available ref when no main/master exists', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 2000));

        const refs = new Map([['develop', 'b']]);
        const graph = buildRepoGraph(commits, refs);

        expect(graph.defaultHead).toBe('b');
    });

    it('handles empty refs by using last topo commit', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 2000));

        const graph = buildRepoGraph(commits);

        expect(graph.defaultHead).toBe('b');
    });
});

describe('edge cases', () => {
    it('handles disconnected commits', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', [], 2000)); // disconnected root

        const order = buildTopoOrder(commits);
        expect(order).toHaveLength(2);
    });

    it('handles octopus merge (3+ parents)', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 2000));
        commits.set('c', createCommit('c', ['a'], 2100));
        commits.set('d', createCommit('d', ['a'], 2200));
        commits.set('e', createCommit('e', ['b', 'c', 'd'], 3000)); // octopus merge

        const graph = buildRepoGraph(commits);
        const edges = generateEdges(graph);
        const mergeEdges = edges.filter(e => e.to === 'e');

        expect(mergeEdges).toHaveLength(3);
        expect(mergeEdges.every(e => e.isMerge)).toBe(true);
        expect(graph.metrics.mergeCount).toBe(1);
    });

    it('computes correct time span', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 5000));

        const metrics = computeMetrics(commits);

        expect(metrics.timeSpan).toBe(4000);
    });

    it('handles commits with missing stats gracefully', () => {
        const commits = new Map<string, CommitNode>();
        commits.set('a', createCommit('a', [], 1000));
        commits.set('b', createCommit('b', ['a'], 2000, {
            stats: { additions: 10, deletions: 5 },
        }));
        commits.set('c', createCommit('c', ['b'], 3000)); // no stats

        const metrics = computeMetrics(commits);

        expect(metrics.totalAdditions).toBe(10);
        expect(metrics.totalDeletions).toBe(5);
    });
});
