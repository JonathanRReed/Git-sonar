/**
 * Showcase graph — a deterministic, rich, flattering repository history used for
 * the landing-page poster gallery and as the in-app "Showcase" demo. ~1 year,
 * 8 contributors, feature branches + merges, realistic churn and activity bursts,
 * so every template produces a poster that actually sells the product.
 *
 * Fully deterministic (seeded LCG, no wall clock) so the baked gallery posters
 * and the live remix render identically.
 */

import type { CommitNode, RepoGraph } from '@lib/git/types';
import { buildRepoGraph } from '@lib/git/graph';

const DAY = 86_400_000;
const AUTHORS = ['Ada Lovelace', 'Grace Hopper', 'Linus T.', 'Margaret H.', 'Ken T.', 'Radia P.', 'Barbara L.', 'Dennis R.'];

/** Tiny deterministic LCG so the showcase never depends on Math.random. */
function lcg(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * Build the showcase RepoGraph. Always identical for a given `seed`.
 */
export function buildShowcaseGraph(seed = 0xC0FFEE, trunkLen = 70): RepoGraph {
    const rnd = lcg(seed);
    const commits = new Map<string, CommitNode>();
    const start = Date.UTC(2022, 2, 1); // Mar 2022
    let t = start;
    let n = 0;
    let lastMain = '';

    const sha = (i: number) => `c${i.toString(36).padStart(7, '0')}`;
    const author = () => AUTHORS[Math.floor(rnd() * AUTHORS.length)];
    const churn = () => ({ additions: Math.floor(rnd() * rnd() * 900) + 5, deletions: Math.floor(rnd() * rnd() * 400) });

    const add = (parents: string[], hint?: string): string => {
        const id = sha(n++);
        // Advance time with occasional bursts (clusters of same-day commits).
        const burst = rnd() < 0.18;
        t += burst ? Math.floor(rnd() * DAY * 0.4) : Math.floor(rnd() * DAY * 6) + DAY;
        commits.set(id, {
            id,
            parents,
            authorName: author(),
            authoredAt: t,
            messageSubject: SUBJECTS[n % SUBJECTS.length],
            stats: churn(),
            branchHints: hint ? [hint] : undefined,
        });
        return id;
    };

    // Root + a trunk with periodic feature branches that merge back.
    lastMain = add([], 'main');
    for (let i = 0; i < trunkLen; i++) {
        lastMain = add([lastMain], 'main');
        // ~ every 6 trunk commits, spin a feature branch of 2-6 commits and merge.
        if (i % 6 === 3) {
            let tip = lastMain;
            const len = 2 + Math.floor(rnd() * 5);
            const branch = `feature/${BRANCH_NAMES[(n + i) % BRANCH_NAMES.length]}`;
            for (let k = 0; k < len; k++) tip = add([tip], branch);
            // Merge back into main.
            lastMain = add([lastMain, tip], 'main');
        }
    }

    // Leave a couple of branches open (in-flight work) so refs/branchCount reflect
    // reality rather than a single 'main'.
    const refs = new Map<string, string>([['main', lastMain]]);
    const openCount = trunkLen >= 40 ? 2 : 1;
    for (let b = 0; b < openCount; b++) {
        let tip = lastMain;
        const branch = `feature/${BRANCH_NAMES[(b * 3 + 2) % BRANCH_NAMES.length]}`;
        const len = 3 + Math.floor(rnd() * 4);
        for (let k = 0; k < len; k++) tip = add([tip], branch);
        refs.set(branch, tip);
    }
    return buildRepoGraph(commits, refs, 'main');
}

const SUBJECTS = [
    'Initial commit', 'Set up project scaffolding', 'Add core data model', 'Wire up the renderer',
    'Refactor the layout engine', 'Fix off-by-one in pagination', 'Improve cold-start performance',
    'Add dark mode', 'Introduce plugin system', 'Tighten type definitions', 'Migrate to the new API',
    'Add end-to-end tests', 'Polish empty states', 'Cache expensive computations', 'Ship v1.0',
    'Handle edge case in parser', 'Reduce bundle size', 'Add keyboard shortcuts', 'Document the public API',
    'Squash flaky test', 'Land the redesign', 'Optimize the hot path', 'Add telemetry opt-out',
    'Fix memory leak in worker', 'Prepare release', 'Bump dependencies', 'Add accessibility pass',
];

const BRANCH_NAMES = ['auth', 'search', 'export', 'theming', 'editor', 'api-v2', 'cache', 'mobile', 'a11y', 'perf'];
