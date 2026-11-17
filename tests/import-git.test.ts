import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGitHubRepo, parseGitLabProjectPath, parseGitLabRepo } from '@lib/git/import-git';

describe('parseGitLabProjectPath', () => {
    it('parses a two-segment GitLab URL', () => {
        expect(parseGitLabProjectPath('https://gitlab.com/group/repo')).toBe('group/repo');
    });

    it('parses subgroup GitLab URLs', () => {
        expect(parseGitLabProjectPath('https://gitlab.com/group/subgroup/repo')).toBe('group/subgroup/repo');
    });

    it('handles trailing slash and .git suffix', () => {
        expect(parseGitLabProjectPath('https://gitlab.com/group/subgroup/repo.git/')).toBe('group/subgroup/repo');
    });

    it('accepts namespace paths without protocol', () => {
        expect(parseGitLabProjectPath('group/subgroup/repo')).toBe('group/subgroup/repo');
    });

    it('accepts git@gitlab.com ssh style URLs', () => {
        expect(parseGitLabProjectPath('git@gitlab.com:group/subgroup/repo.git')).toBe('group/subgroup/repo');
    });

    it('rejects invalid host and incomplete paths', () => {
        expect(parseGitLabProjectPath('https://example.com/group/repo')).toBeNull();
        expect(parseGitLabProjectPath('group')).toBeNull();
        expect(parseGitLabProjectPath('')).toBeNull();
    });
});

describe('line counts for hosted repos', () => {
    const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const sha = (n: number) => n.toString(16).padStart(40, '0');

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function stubGitHub(graphql: (body: { variables: { after: string | null } }) => Response) {
        const calls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            calls.push(url);
            if (url.endsWith('/graphql')) return graphql(JSON.parse(String(init?.body)));
            if (url.includes('/commits?')) {
                return jsonResponse([
                    { sha: sha(2), parents: [{ sha: sha(1) }], commit: { message: 'Second', author: { name: 'Ada', email: 'a@x.io', date: '2024-01-02T00:00:00Z' } } },
                    { sha: sha(1), parents: [], commit: { message: 'First', author: { name: 'Ada', email: 'a@x.io', date: '2024-01-01T00:00:00Z' } } },
                ]);
            }
            if (url.includes('/branches')) return jsonResponse([{ name: 'main', commit: { sha: sha(2) } }]);
            return jsonResponse({ default_branch: 'main' });
        }));
        return calls;
    }

    it('adds GitHub line counts over GraphQL when a token is supplied', async () => {
        const calls = stubGitHub(() => jsonResponse({
            data: { repository: { object: { history: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ oid: sha(2), additions: 40, deletions: 5 }, { oid: sha(1), additions: 100, deletions: 0 }],
            } } } },
        }));
        const graph = await parseGitHubRepo('ada/engine', { authToken: 't0ken' });

        expect(graph.commits.get(sha(2))?.stats).toEqual({ additions: 40, deletions: 5 });
        expect(graph.metrics.totalAdditions).toBe(140);
        expect(calls.some((u) => u.endsWith('/graphql'))).toBe(true);
    });

    it('never calls GraphQL without a token, and still imports', async () => {
        const calls = stubGitHub(() => new Response('nope', { status: 500 }));
        const graph = await parseGitHubRepo('ada/engine');

        expect(graph.commits.size).toBe(2);
        expect(graph.metrics.totalAdditions).toBe(0);
        expect(calls.some((u) => u.endsWith('/graphql'))).toBe(false);
    });

    it('still imports when the line-count request fails', async () => {
        stubGitHub(() => new Response('rate limited', { status: 403 }));
        const graph = await parseGitHubRepo('ada/engine', { authToken: 't0ken' });

        expect(graph.commits.size).toBe(2);
        expect(graph.commits.get(sha(2))?.stats).toBeUndefined();
    });

    it('asks GitHub for the history as of a day and re-points the default branch', async () => {
        const calls = stubGitHub(() => new Response('unused', { status: 500 }));
        const graph = await parseGitHubRepo('ada/engine', { until: Date.UTC(2024, 0, 1, 23, 59, 59) });

        expect(calls.some((u) => u.includes('until=2024-01-01T23%3A59%3A59.000Z'))).toBe(true);
        // Today's branch head (sha 2) is in this stubbed history, so it stays the head.
        expect(graph.defaultHead).toBe(sha(2));
        expect(graph.commits.has(graph.defaultHead)).toBe(true);
    });

    it('asks GitLab for stats with the commit list', async () => {
        const calls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            calls.push(url);
            if (url.includes('/repository/commits')) {
                return jsonResponse([
                    { id: sha(1), title: 'First', message: 'First', author_name: 'Ada', author_email: 'a@x.io', created_at: '2024-01-01T00:00:00Z', parent_ids: [], stats: { additions: 12, deletions: 3 } },
                ]);
            }
            if (url.includes('/repository/branches')) return jsonResponse([{ name: 'main', commit: { id: sha(1) } }]);
            return jsonResponse({ default_branch: 'main' });
        }));
        const graph = await parseGitLabRepo('group/engine');

        expect(calls.some((u) => u.includes('with_stats=true'))).toBe(true);
        expect(graph.commits.get(sha(1))?.stats).toEqual({ additions: 12, deletions: 3 });
    });
});
