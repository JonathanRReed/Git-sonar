import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBitbucketRepo, parseGitHubRepo, parseGitLabProjectPath, parseGitLabRepo } from '@lib/git/import-git';
import { parseRepoInput } from '@lib/utils/repo-name';

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

describe('Bitbucket history as of a day', () => {
    const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const sha = (n: number) => n.toString(16).padStart(40, '0');
    const day = (n: number) => `2024-01-${String(n).padStart(2, '0')}T12:00:00Z`;
    const commit = (n: number) => ({ hash: sha(n), date: day(n), message: `Commit ${n}`, parents: n > 1 ? [{ hash: sha(n - 1) }] : [], author: { raw: 'Ada <a@x.io>' } });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /** Six commits, newest first, three to a page. */
    function stubBitbucket() {
        const calls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            calls.push(url);
            if (url.includes('/commits?')) {
                return url.includes('page=2')
                    ? jsonResponse({ values: [commit(3), commit(2), commit(1)] })
                    : jsonResponse({ values: [commit(6), commit(5), commit(4)], next: 'https://api.bitbucket.org/2.0/repositories/ada/engine/commits?pagelen=100&page=2' });
            }
            if (url.includes('/refs/branches')) return jsonResponse({ values: [{ name: 'main', target: { hash: sha(6) } }] });
            return jsonResponse({ mainbranch: { name: 'main' } });
        }));
        return calls;
    }

    it('pages past newer commits to reach the cutoff, even at the commit limit', async () => {
        const calls = stubBitbucket();
        // The newest three commits fill the limit on their own; all are after the cutoff.
        const graph = await parseBitbucketRepo('ada/engine', { maxCommits: 3, until: Date.UTC(2024, 0, 3, 23, 59, 59) });

        expect(calls.some((u) => u.includes('page=2'))).toBe(true);
        expect([...graph.commits.keys()].sort()).toEqual([sha(1), sha(2), sha(3)]);
        expect(graph.defaultHead).toBe(sha(3));
    });

    it('says so when nothing is that old', async () => {
        stubBitbucket();
        await expect(parseBitbucketRepo('ada/engine', { until: Date.UTC(2023, 0, 1) }))
            .rejects.toThrow('No commits on or before that date');
    });

    it('takes the newest commits when there is no cutoff', async () => {
        const calls = stubBitbucket();
        const graph = await parseBitbucketRepo('ada/engine', { maxCommits: 3 });

        expect(calls.some((u) => u.includes('page=2'))).toBe(false);
        expect(graph.defaultHead).toBe(sha(6));
    });
});

describe('parseRepoInput', () => {
    it('keeps plain owner/repo as GitHub', () => {
        expect(parseRepoInput(' sveltejs/svelte ')).toEqual({ provider: 'github', path: 'sveltejs/svelte' });
    });

    it('reduces a branch or file page to its repo', () => {
        expect(parseRepoInput('https://github.com/sveltejs/svelte/tree/main')).toEqual({ provider: 'github', path: 'sveltejs/svelte' });
        expect(parseRepoInput('https://github.com/sveltejs/svelte/blob/main/README.md?plain=1#L3')).toEqual({ provider: 'github', path: 'sveltejs/svelte' });
        expect(parseRepoInput('https://bitbucket.org/atlassian/aui/src/master/')).toEqual({ provider: 'bitbucket', path: 'atlassian/aui' });
    });

    it('handles clone addresses', () => {
        expect(parseRepoInput('git@github.com:facebook/react.git')).toEqual({ provider: 'github', path: 'facebook/react' });
        expect(parseRepoInput('https://www.github.com/facebook/react.git/')).toEqual({ provider: 'github', path: 'facebook/react' });
    });

    it('keeps nested GitLab groups and drops the page after /-/', () => {
        expect(parseRepoInput('https://gitlab.com/gitlab-org/quality/triage-ops/-/tree/master')).toEqual({ provider: 'gitlab', path: 'gitlab-org/quality/triage-ops' });
    });
});
