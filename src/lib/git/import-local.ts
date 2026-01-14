import type {
    CommitNode,
    GitSonarExport,
    RawCommit,
    RepoGraph,
} from './types';
import { buildRepoGraph } from './graph';

/**
 * Hash a string for avatar lookup (SHA-256 truncated).
 * Uses SubtleCrypto when available, falls back to empty string.
 */
async function hashEmail(email: string): Promise<string> {
    if (!email) return '';

    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(email.toLowerCase().trim());
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray
            .slice(0, 16)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    } catch {
        return '';
    }
}

/**
 * Parse a raw commit from the export format into a CommitNode.
 */
async function parseRawCommit(raw: RawCommit): Promise<CommitNode> {
    return {
        id: raw.sha,
        parents: raw.parents,
        authorName: raw.author,
        authorEmailHash: await hashEmail(raw.email ?? ''),
        authoredAt: new Date(raw.date).getTime(),
        messageSubject: raw.subject,
        stats:
            raw.additions !== undefined || raw.deletions !== undefined
                ? {
                    additions: raw.additions,
                    deletions: raw.deletions,
                }
                : undefined,
    };
}

/**
 * Validate the structure of a GitSonarExport.
 */
function validateExport(data: unknown): data is GitSonarExport {
    if (typeof data !== 'object' || data === null) return false;

    const obj = data as Record<string, unknown>;

    if (typeof obj.name !== 'string') return false;
    if (!Array.isArray(obj.commits)) return false;

    // Validate at least a sample of commits
    for (const commit of obj.commits.slice(0, 10)) {
        if (typeof commit !== 'object' || commit === null) return false;
        const c = commit as Record<string, unknown>;
        if (typeof c.sha !== 'string') return false;
        if (!Array.isArray(c.parents)) return false;
        if (typeof c.author !== 'string') return false;
        if (typeof c.date !== 'string') return false;
        if (typeof c.subject !== 'string') return false;
    }

    return true;
}

/**
 * Import a local gitsonar.json export file and build a RepoGraph.
 */
export async function importLocalExport(jsonString: string): Promise<RepoGraph> {
    const data = JSON.parse(jsonString);

    if (!validateExport(data)) {
        throw new Error('Invalid gitsonar.json format');
    }

    // Parse all commits
    const commits = new Map<string, CommitNode>();
    const parsePromises = data.commits.map(async (raw) => {
        const node = await parseRawCommit(raw);
        return { id: node.id, node };
    });

    const parsedCommits = await Promise.all(parsePromises);
    for (const { id, node } of parsedCommits) {
        commits.set(id, node);
    }

    // Build refs map
    const refs = new Map<string, string>();
    if (data.refs) {
        for (const [name, sha] of Object.entries(data.refs)) {
            refs.set(name, sha);
        }
    }

    // Build and return the full graph
    return buildRepoGraph(commits, refs, data.defaultBranch);
}

/**
 * Import from a File object (for drag-and-drop).
 */
export async function importFromFile(file: File): Promise<RepoGraph> {
    const text = await file.text();
    return importLocalExport(text);
}

/**
 * Generate a demo repository graph for testing.
 */
export function generateDemoGraph(): RepoGraph {
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;

    const commits = new Map<string, CommitNode>();

    // Root commit
    commits.set('a1b2c3d', {
        id: 'a1b2c3d',
        parents: [],
        authorName: 'Alice',
        authoredAt: now - 14 * day,
        messageSubject: 'Initial commit',
        branchHints: ['main'],
    });

    // Main branch commits
    commits.set('b2c3d4e', {
        id: 'b2c3d4e',
        parents: ['a1b2c3d'],
        authorName: 'Bob',
        authoredAt: now - 13 * day,
        messageSubject: 'Add project structure',
        stats: { additions: 150, deletions: 0 },
        branchHints: ['main'],
    });

    commits.set('c3d4e5f', {
        id: 'c3d4e5f',
        parents: ['b2c3d4e'],
        authorName: 'Alice',
        authoredAt: now - 12 * day,
        messageSubject: 'Add core utilities',
        stats: { additions: 200, deletions: 10 },
        branchHints: ['main'],
    });

    // Feature branch
    commits.set('d4e5f6g', {
        id: 'd4e5f6g',
        parents: ['c3d4e5f'],
        authorName: 'Charlie',
        authoredAt: now - 11 * day,
        messageSubject: 'Start feature-x',
        branchHints: ['feature-x'],
    });

    commits.set('e5f6g7h', {
        id: 'e5f6g7h',
        parents: ['d4e5f6g'],
        authorName: 'Charlie',
        authoredAt: now - 10 * day,
        messageSubject: 'Implement feature-x core',
        stats: { additions: 300, deletions: 20 },
        branchHints: ['feature-x'],
    });

    // Meanwhile on main
    commits.set('f6g7h8i', {
        id: 'f6g7h8i',
        parents: ['c3d4e5f'],
        authorName: 'Alice',
        authoredAt: now - 10 * day + hour,
        messageSubject: 'Fix critical bug',
        stats: { additions: 5, deletions: 3 },
        branchHints: ['main'],
    });

    commits.set('g7h8i9j', {
        id: 'g7h8i9j',
        parents: ['f6g7h8i'],
        authorName: 'Bob',
        authoredAt: now - 9 * day,
        messageSubject: 'Add documentation',
        stats: { additions: 100, deletions: 0 },
        branchHints: ['main'],
    });

    // Merge feature-x into main
    commits.set('h8i9j0k', {
        id: 'h8i9j0k',
        parents: ['g7h8i9j', 'e5f6g7h'],
        authorName: 'Alice',
        authoredAt: now - 8 * day,
        messageSubject: 'Merge feature-x into main',
        branchHints: ['main'],
    });

    // More main commits
    commits.set('i9j0k1l', {
        id: 'i9j0k1l',
        parents: ['h8i9j0k'],
        authorName: 'Bob',
        authoredAt: now - 7 * day,
        messageSubject: 'Refactor utilities',
        stats: { additions: 80, deletions: 60 },
        branchHints: ['main'],
    });

    commits.set('j0k1l2m', {
        id: 'j0k1l2m',
        parents: ['i9j0k1l'],
        authorName: 'Charlie',
        authoredAt: now - 5 * day,
        messageSubject: 'Add tests',
        stats: { additions: 250, deletions: 0 },
        branchHints: ['main'],
    });

    // Another feature branch
    commits.set('k1l2m3n', {
        id: 'k1l2m3n',
        parents: ['j0k1l2m'],
        authorName: 'Diana',
        authoredAt: now - 4 * day,
        messageSubject: 'Start feature-y',
        branchHints: ['feature-y'],
    });

    commits.set('l2m3n4o', {
        id: 'l2m3n4o',
        parents: ['j0k1l2m'],
        authorName: 'Alice',
        authoredAt: now - 3 * day,
        messageSubject: 'Performance improvements',
        stats: { additions: 40, deletions: 100 },
        branchHints: ['main'],
    });

    commits.set('m3n4o5p', {
        id: 'm3n4o5p',
        parents: ['k1l2m3n'],
        authorName: 'Diana',
        authoredAt: now - 2 * day,
        messageSubject: 'Complete feature-y',
        stats: { additions: 180, deletions: 30 },
        branchHints: ['feature-y'],
    });

    // Merge feature-y
    commits.set('n4o5p6q', {
        id: 'n4o5p6q',
        parents: ['l2m3n4o', 'm3n4o5p'],
        authorName: 'Alice',
        authoredAt: now - 1 * day,
        messageSubject: 'Merge feature-y into main',
        branchHints: ['main'],
    });

    // Latest commit
    commits.set('o5p6q7r', {
        id: 'o5p6q7r',
        parents: ['n4o5p6q'],
        authorName: 'Bob',
        authoredAt: now - 2 * hour,
        messageSubject: 'Prepare release v1.0',
        stats: { additions: 10, deletions: 5 },
        branchHints: ['main'],
    });

    const refs = new Map([
        ['main', 'o5p6q7r'],
        ['feature-x', 'e5f6g7h'],
        ['feature-y', 'm3n4o5p'],
    ]);

    return buildRepoGraph(commits, refs, 'main');
}
