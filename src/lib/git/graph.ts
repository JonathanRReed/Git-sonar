import type {
    CommitNode,
    RepoGraph,
    RepoMetrics,
    PositionedNode,
    CommitEdge,
} from './types';

/**
 * Build topological order of commits (parents before children).
 * Uses Kahn's algorithm for stable ordering.
 */
export function buildTopoOrder(commits: Map<string, CommitNode>): string[] {
    // Build child -> parent count (in-degree)
    const inDegree = new Map<string, number>();
    const children = new Map<string, string[]>();

    for (const [id, commit] of commits) {
        if (!inDegree.has(id)) {
            inDegree.set(id, 0);
        }
        if (!children.has(id)) {
            children.set(id, []);
        }

        for (const parentId of commit.parents) {
            if (commits.has(parentId)) {
                const parentChildren = children.get(parentId) ?? [];
                parentChildren.push(id);
                children.set(parentId, parentChildren);
                inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
            }
        }
    }

    // Find root commits (no parents in our set)
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) {
            queue.push(id);
        }
    }

    // Sort queue by timestamp for deterministic order
    queue.sort((a, b) => {
        const commitA = commits.get(a);
        const commitB = commits.get(b);
        return (commitA?.authoredAt ?? 0) - (commitB?.authoredAt ?? 0);
    });

    const result: string[] = [];

    while (queue.length > 0) {
        const id = queue.shift()!;
        result.push(id);

        const commitChildren = children.get(id) ?? [];
        for (const childId of commitChildren) {
            const newDegree = (inDegree.get(childId) ?? 1) - 1;
            inDegree.set(childId, newDegree);
            if (newDegree === 0) {
                queue.push(childId);
                // Re-sort to maintain timestamp order
                queue.sort((a, b) => {
                    const commitA = commits.get(a);
                    const commitB = commits.get(b);
                    return (commitA?.authoredAt ?? 0) - (commitB?.authoredAt ?? 0);
                });
            }
        }
    }

    return result;
}

/**
 * Assign lanes to commits for visualization.
 * Main branch stays in lane 0, feature branches get higher lanes.
 * Same-branch commits stay in the same lane.
 */
export function assignLanes(
    commits: Map<string, CommitNode>,
    topoOrder: string[]
): Map<string, number> {
    const lanes = new Map<string, number>();

    // Build parent -> children map
    const childrenOf = new Map<string, string[]>();
    for (const [id, commit] of commits) {
        for (const parentId of commit.parents) {
            if (commits.has(parentId)) {
                const children = childrenOf.get(parentId) ?? [];
                children.push(id);
                childrenOf.set(parentId, children);
            }
        }
    }

    // Track which lanes are in use at each "row" (we'll track globally for simplicity)
    const laneInUse = new Map<number, string>(); // lane -> current commit id using it

    // Process in TOPO order (oldest first), assigning lanes
    // This way parents get lanes first, children can inherit
    for (const id of topoOrder) {
        const commit = commits.get(id);
        if (!commit) continue;

        let assignedLane = -1;

        // If commit has branch hint and is first on that branch, use hint to determine lane
        if (commit.branchHints && commit.branchHints.length > 0) {
            const hint = commit.branchHints[0].toLowerCase();
            // Main branch always lane 0
            if (hint === 'main' || hint === 'master') {
                assignedLane = 0;
            }
        }

        // Try to inherit lane from first parent (the "main" lineage)
        if (assignedLane === -1 && commit.parents.length > 0) {
            const firstParent = commit.parents[0];
            if (lanes.has(firstParent)) {
                const parentLane = lanes.get(firstParent)!;
                // Check if this is a merge - if so and we're the "main" child, use parent's lane
                const parentChildren = childrenOf.get(firstParent) ?? [];
                // If parent has only one child, inherit its lane
                // Or if this commit is the first child of parent (continuing the branch)
                if (parentChildren.length === 1 || parentChildren[0] === id) {
                    assignedLane = parentLane;
                }
            }
        }

        // If still no lane, find the lowest free lane
        if (assignedLane === -1) {
            assignedLane = 0;
            while (laneInUse.has(assignedLane)) {
                assignedLane++;
            }
        }

        lanes.set(id, assignedLane);
        laneInUse.set(assignedLane, id);

        // If this is a merge commit, we might be "closing" second parent's lane
        // Mark second+ parent lanes as potentially free
        if (commit.parents.length > 1) {
            for (let i = 1; i < commit.parents.length; i++) {
                const parentId = commit.parents[i];
                const parentLane = lanes.get(parentId);
                if (parentLane !== undefined && parentLane !== assignedLane) {
                    // Check if any other commits still need this lane
                    // For simplicity, we keep it occupied
                }
            }
        }
    }

    return lanes;
}

/**
 * Compute aggregate metrics for the repository.
 */
export function computeMetrics(commits: Map<string, CommitNode>): RepoMetrics {
    const authorCommits = new Map<string, number>();
    let mergeCount = 0;
    let totalAdditions = 0;
    let totalDeletions = 0;
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const commit of commits.values()) {
        // Count authors
        const count = authorCommits.get(commit.authorName) ?? 0;
        authorCommits.set(commit.authorName, count + 1);

        // Count merges
        if (commit.parents.length > 1) {
            mergeCount++;
        }

        // Accumulate stats
        if (commit.stats) {
            totalAdditions += commit.stats.additions ?? 0;
            totalDeletions += commit.stats.deletions ?? 0;
        }

        // Track time range
        if (commit.authoredAt < minTime) minTime = commit.authoredAt;
        if (commit.authoredAt > maxTime) maxTime = commit.authoredAt;
    }

    return {
        commitCount: commits.size,
        mergeCount,
        authorCount: authorCommits.size,
        authorCommits,
        totalAdditions,
        totalDeletions,
        timeSpan: maxTime > minTime ? maxTime - minTime : 0,
    };
}

/**
 * Generate positioned nodes for rendering.
 */
export function generatePositionedNodes(
    graph: RepoGraph
): PositionedNode[] {
    const nodes: PositionedNode[] = [];
    const depthMap = new Map<string, number>();

    // Calculate depth (distance from roots)
    for (const id of graph.topoOrder) {
        const commit = graph.commits.get(id);
        if (!commit) continue;

        let depth = 0;
        for (const parentId of commit.parents) {
            const parentDepth = depthMap.get(parentId);
            if (parentDepth !== undefined) {
                depth = Math.max(depth, parentDepth + 1);
            }
        }
        depthMap.set(id, depth);
    }

    // Find time range for normalization
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const commit of graph.commits.values()) {
        if (commit.authoredAt < minTime) minTime = commit.authoredAt;
        if (commit.authoredAt > maxTime) maxTime = commit.authoredAt;
    }
    const timeRange = maxTime - minTime || 1;

    // Generate positioned nodes
    for (const id of graph.topoOrder) {
        const commit = graph.commits.get(id);
        if (!commit) continue;

        nodes.push({
            id,
            t: (commit.authoredAt - minTime) / timeRange,
            lane: graph.lanes.get(id) ?? 0,
            depth: depthMap.get(id) ?? 0,
            commit,
        });
    }

    return nodes;
}

/**
 * Generate edges between commits for rendering.
 */
export function generateEdges(graph: RepoGraph): CommitEdge[] {
    const edges: CommitEdge[] = [];
    const mergeTargets = new Set<string>();

    // First pass: identify merge targets
    for (const commit of graph.commits.values()) {
        if (commit.parents.length > 1) {
            for (const parentId of commit.parents) {
                mergeTargets.add(parentId);
            }
        }
    }

    // Second pass: create edges
    for (const [id, commit] of graph.commits) {
        for (const parentId of commit.parents) {
            if (graph.commits.has(parentId)) {
                edges.push({
                    from: parentId,
                    to: id,
                    isMerge: commit.parents.length > 1,
                });
            }
        }
    }

    return edges;
}

/**
 * Build a complete RepoGraph from a commits map and optional refs.
 */
export function buildRepoGraph(
    commits: Map<string, CommitNode>,
    refs: Map<string, string> = new Map(),
    defaultBranch?: string
): RepoGraph {
    const topoOrder = buildTopoOrder(commits);
    const lanes = assignLanes(commits, topoOrder);
    const metrics = computeMetrics(commits);

    // Determine default head
    let defaultHead = '';
    if (defaultBranch && refs.has(defaultBranch)) {
        defaultHead = refs.get(defaultBranch)!;
    } else if (refs.has('main')) {
        defaultHead = refs.get('main')!;
    } else if (refs.has('master')) {
        defaultHead = refs.get('master')!;
    } else if (refs.size > 0) {
        defaultHead = Array.from(refs.values())[0];
    } else if (topoOrder.length > 0) {
        defaultHead = topoOrder[topoOrder.length - 1];
    }

    return {
        commits,
        heads: refs,
        defaultHead,
        topoOrder,
        lanes,
        metrics,
    };
}
