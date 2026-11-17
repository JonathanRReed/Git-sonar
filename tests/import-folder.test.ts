import { createHash } from 'node:crypto';
import { zlibSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseGitFolder, type GitFolderEntry } from '@lib/git/import-git';
import { cleanSourceName, repoDisplayName } from '@lib/utils/repo-name';

/** Build a loose commit object the way git stores it: zlib("commit <len>\0<body>"). */
function looseCommit(body: string): { sha: string; data: Uint8Array } {
    const payload = strToU8(body);
    const header = strToU8(`commit ${payload.length}\0`);
    const raw = new Uint8Array(header.length + payload.length);
    raw.set(header);
    raw.set(payload, header.length);
    return { sha: createHash('sha1').update(raw).digest('hex'), data: zlibSync(raw) };
}

function entry(path: string, data: Uint8Array | string): GitFolderEntry {
    const bytes = typeof data === 'string' ? strToU8(data) : data;
    return { path, read: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
}

function objectPath(prefix: string, sha: string): string {
    return `${prefix}.git/objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
}

const TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function fixture(prefix: string): { entries: GitFolderEntry[]; head: string } {
    const root = looseCommit(
        `tree ${TREE}\nauthor Ada <ada@example.com> 1700000000 +0000\ncommitter Ada <ada@example.com> 1700000000 +0000\n\nInitial commit\n`
    );
    const head = looseCommit(
        `tree ${TREE}\nparent ${root.sha}\nauthor Grace <grace@example.com> 1700086400 +0000\ncommitter Grace <grace@example.com> 1700086400 +0000\n\nAdd the renderer\n`
    );
    return {
        head: head.sha,
        entries: [
            entry(`${prefix}.git/HEAD`, 'ref: refs/heads/main\n'),
            entry(`${prefix}.git/refs/heads/main`, `${head.sha}\n`),
            entry(objectPath(prefix, root.sha), root.data),
            entry(objectPath(prefix, head.sha), head.data),
        ],
    };
}

describe('parseGitFolder', () => {
    it('reads history from a picked project folder', async () => {
        const { entries, head } = fixture('my-repo/');
        const graph = await parseGitFolder(entries);

        expect(graph.commits.size).toBe(2);
        expect(graph.defaultHead).toBe(head);
        expect(graph.metrics.authorCount).toBe(2);
    });

    it('reads a bare .git directory handle listing', async () => {
        const { entries, head } = fixture('');
        const graph = await parseGitFolder(entries);

        expect(graph.defaultHead).toBe(head);
    });

    it('ignores source files, hooks and nested repositories', async () => {
        const { entries, head } = fixture('my-repo/');
        let touched = 0;
        const decoy = (path: string): GitFolderEntry => ({
            path,
            read: async () => {
                touched += 1;
                return strToU8('ref: refs/heads/other\n').buffer as ArrayBuffer;
            },
        });
        const graph = await parseGitFolder([
            decoy('my-repo/src/index.ts'),
            decoy('my-repo/.git/hooks/pre-commit'),
            decoy('my-repo/vendor/lib/.git/HEAD'),
            ...entries,
        ]);

        expect(graph.defaultHead).toBe(head);
        expect(touched).toBe(0);
    });

    it('explains what to pick when there is no .git folder', async () => {
        await expect(parseGitFolder([entry('notes/readme.md', 'hello')])).rejects.toThrow(/No \.git folder/);
    });
});

describe('repo naming', () => {
    it('names remote repos by their last path segment', () => {
        expect(repoDisplayName('https://github.com/sveltejs/svelte.git', null)).toBe('svelte');
        expect(repoDisplayName('facebook/react', null)).toBe('react');
    });

    it('names the sample repo and local sources', () => {
        expect(repoDisplayName(null, 'showcase')).toBe('Project Atlas');
        expect(repoDisplayName(null, null, 'my-app')).toBe('my-app');
        expect(repoDisplayName(null, null)).toBe('Untitled repo');
    });

    it('tidies archive names', () => {
        expect(cleanSourceName('my-app-git.zip')).toBe('my-app');
        expect(cleanSourceName('git-export.zip')).toBe('Local repo');
        expect(cleanSourceName('atlas')).toBe('atlas');
    });
});

describe('capturing an earlier moment', () => {
    it('cuts a history back to a day and re-points the head', async () => {
        const { buildShowcaseGraph } = await import('@lib/demo-data/showcase');
        const { snapshotGraphAt } = await import('@lib/git/graph');
        const { makeMoment, formatMomentDate } = await import('@lib/store/graph-store');
        const full = buildShowcaseGraph();
        const moment = makeMoment('2022-09-30', '  Reached 1,000 stars ')!;

        expect(moment.label).toBe('Reached 1,000 stars');
        expect(formatMomentDate(moment)).toBe('Sep 30, 2022');

        const then = snapshotGraphAt(full, moment.untilMs);
        expect(then.commits.size).toBeGreaterThan(0);
        expect(then.commits.size).toBeLessThan(full.commits.size);
        for (const c of then.commits.values()) {
            expect(c.authoredAt).toBeLessThanOrEqual(moment.untilMs);
            for (const p of c.parents) expect(then.commits.has(p)).toBe(true);
        }
        // The head is a commit from that time, on the main line.
        expect(then.commits.has(then.defaultHead)).toBe(true);
        expect(then.topoOrder.length).toBe(then.commits.size);
    });

    it('rejects days before the first commit and malformed dates', async () => {
        const { buildShowcaseGraph } = await import('@lib/demo-data/showcase');
        const { snapshotGraphAt } = await import('@lib/git/graph');
        const { makeMoment } = await import('@lib/store/graph-store');

        expect(() => snapshotGraphAt(buildShowcaseGraph(), Date.UTC(2001, 0, 1))).toThrow(/No commits on or before/);
        expect(makeMoment('yesterday')).toBeNull();
        expect(makeMoment('')).toBeNull();
    });
});
