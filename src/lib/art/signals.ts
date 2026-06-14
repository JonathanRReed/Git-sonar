/**
 * Art signals — derived, art-oriented metrics computed from a RepoGraph.
 *
 * computeMetrics() (graph.ts) yields only counts/totals/timeSpan. Generative
 * posters need richer rhythm/diversity/topology signals: cadence buckets, bursts,
 * author diversity (entropy/Gini), and branch topology. These map onto visual
 * channels (density, palette spread, ring thickness, turbulence, etc).
 */

import type { RepoGraph, CommitNode } from '@lib/git/types';

const DAY_MS = 1000 * 60 * 60 * 24;

export interface RankedAuthor {
    name: string;
    count: number;
    /** Fraction of total commits, 0..1. */
    share: number;
}

export interface BurstWindow {
    startMs: number;
    endMs: number;
    count: number;
}

export interface ArtSignals {
    commitCount: number;
    authorCount: number;
    mergeCount: number;
    /** Distinct branch heads. */
    branchCount: number;
    /** Highest number of lanes active at once. */
    maxConcurrentLanes: number;
    /** Longest chain of single-parent commits. */
    longestLinearRun: number;

    firstCommitMs: number;
    lastCommitMs: number;
    timeSpanMs: number;
    /** Calendar year of the first commit. */
    firstYear: number;
    lastYear: number;

    /** Commits per day across the span (length = number of day buckets). */
    perDay: number[];
    /** Commits per ISO week across the span. */
    perWeek: number[];
    /** Commits by hour-of-day local-ish (0..23). */
    hourOfDay: number[];
    /** Commits by day-of-week (0=Sun..6=Sat). */
    dayOfWeek: number[];
    /** Index into perDay of the most active day. */
    busiestDayIndex: number;
    /** Peak commits in any single day. */
    peakDayCount: number;

    /** Shannon entropy of author distribution normalized to 0..1. */
    authorEntropy: number;
    /** Gini coefficient of author distribution, 0..1. */
    authorGini: number;
    rankedAuthors: RankedAuthor[];

    /** Contiguous high-activity windows. */
    bursts: BurstWindow[];
    longestStreakDays: number;
    longestGapDays: number;

    totalAdditions: number;
    totalDeletions: number;
    /** True when any commit carries non-zero additions/deletions. */
    hasChurn: boolean;
    /** Largest single-commit churn (additions+deletions). */
    maxChurn: number;
}

function entropy(counts: number[]): number {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0 || counts.length <= 1) return 0;
    let h = 0;
    for (const c of counts) {
        if (c <= 0) continue;
        const p = c / total;
        h -= p * Math.log2(p);
    }
    const max = Math.log2(counts.length);
    return max > 0 ? h / max : 0;
}

function gini(counts: number[]): number {
    const n = counts.length;
    if (n <= 1) return 0;
    const sorted = [...counts].sort((a, b) => a - b);
    const total = sorted.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    let cumWeighted = 0;
    for (let i = 0; i < n; i++) cumWeighted += (i + 1) * sorted[i];
    return (2 * cumWeighted) / (n * total) - (n + 1) / n;
}

/** Compute the longest run of single-parent (linear) commits over topo order. */
function longestLinearRun(graph: RepoGraph): number {
    let best = 0;
    let run = 0;
    for (const id of graph.topoOrder) {
        const commit = graph.commits.get(id);
        if (!commit) continue;
        if (commit.parents.length <= 1) {
            run++;
            if (run > best) best = run;
        } else {
            run = 0;
        }
    }
    return best;
}

/** Estimate the max number of lanes occupied simultaneously. */
function maxConcurrentLanes(graph: RepoGraph): number {
    let max = 0;
    for (const lane of graph.lanes.values()) {
        if (lane + 1 > max) max = lane + 1;
    }
    return max;
}

export function deriveArtSignals(graph: RepoGraph): ArtSignals {
    const commits = [...graph.commits.values()];
    // Linear min/max (NOT Math.min(...times)) — spreading a huge array overflows
    // the call stack on large monorepos (ZIP/folder imports aren't commit-capped).
    let firstCommitMs = Infinity;
    let lastCommitMs = -Infinity;
    let timeCount = 0;
    for (const c of commits) {
        const t = c.authoredAt;
        if (!Number.isFinite(t)) continue;
        timeCount++;
        if (t < firstCommitMs) firstCommitMs = t;
        if (t > lastCommitMs) lastCommitMs = t;
    }
    if (timeCount === 0) {
        firstCommitMs = 0;
        lastCommitMs = 0;
    }
    const timeSpanMs = Math.max(0, lastCommitMs - firstCommitMs);

    // Cap bucket allocation: a single forged/garbage timestamp (e.g. year 9999)
    // would otherwise allocate millions of buckets and OOM the tab.
    const MAX_DAY_BUCKETS = 20000; // ~55 years of daily resolution
    const dayBuckets = Math.min(MAX_DAY_BUCKETS, Math.max(1, Math.ceil(timeSpanMs / DAY_MS) + 1));
    const perDay = new Array<number>(dayBuckets).fill(0);
    const weekBuckets = Math.max(1, Math.ceil(dayBuckets / 7));
    const perWeek = new Array<number>(weekBuckets).fill(0);
    const hourOfDay = new Array<number>(24).fill(0);
    const dayOfWeek = new Array<number>(7).fill(0);

    const authorCounts = new Map<string, number>();
    let mergeCount = 0;
    let totalAdditions = 0;
    let totalDeletions = 0;
    let maxChurn = 0;

    for (const commit of commits) {
        const t = commit.authoredAt;
        if (Number.isFinite(t)) {
            const dayIdx = Math.min(dayBuckets - 1, Math.floor((t - firstCommitMs) / DAY_MS));
            perDay[dayIdx]++;
            perWeek[Math.min(weekBuckets - 1, Math.floor(dayIdx / 7))]++;
            const d = new Date(t);
            hourOfDay[d.getUTCHours()]++;
            dayOfWeek[d.getUTCDay()]++;
        }
        authorCounts.set(commit.authorName, (authorCounts.get(commit.authorName) ?? 0) + 1);
        if (commit.parents.length > 1) mergeCount++;
        const add = commit.stats?.additions ?? 0;
        const del = commit.stats?.deletions ?? 0;
        totalAdditions += add;
        totalDeletions += del;
        if (add + del > maxChurn) maxChurn = add + del;
    }

    // Busiest day + bursts (days above 1.5x mean).
    let busiestDayIndex = 0;
    let peakDayCount = 0;
    const nonZero = perDay.filter((c) => c > 0);
    const meanDay = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
    const burstThreshold = Math.max(2, meanDay * 1.5);
    const bursts: BurstWindow[] = [];
    let burstStart = -1;
    for (let i = 0; i < perDay.length; i++) {
        if (perDay[i] > peakDayCount) {
            peakDayCount = perDay[i];
            busiestDayIndex = i;
        }
        if (perDay[i] >= burstThreshold) {
            if (burstStart < 0) burstStart = i;
        } else if (burstStart >= 0) {
            bursts.push({
                startMs: firstCommitMs + burstStart * DAY_MS,
                endMs: firstCommitMs + i * DAY_MS,
                count: perDay.slice(burstStart, i).reduce((a, b) => a + b, 0),
            });
            burstStart = -1;
        }
    }
    if (burstStart >= 0) {
        bursts.push({
            startMs: firstCommitMs + burstStart * DAY_MS,
            endMs: lastCommitMs,
            count: perDay.slice(burstStart).reduce((a, b) => a + b, 0),
        });
    }

    // Streaks / gaps (in days with/without commits).
    let longestStreakDays = 0;
    let longestGapDays = 0;
    let streak = 0;
    let gap = 0;
    for (const c of perDay) {
        if (c > 0) {
            streak++;
            longestStreakDays = Math.max(longestStreakDays, streak);
            gap = 0;
        } else {
            gap++;
            longestGapDays = Math.max(longestGapDays, gap);
            streak = 0;
        }
    }

    const counts = [...authorCounts.values()];
    const totalCommits = commits.length || 1;
    const rankedAuthors: RankedAuthor[] = [...authorCounts.entries()]
        .map(([name, count]) => ({ name, count, share: count / totalCommits }))
        .sort((a, b) => b.count - a.count);

    return {
        commitCount: commits.length,
        authorCount: authorCounts.size,
        mergeCount,
        branchCount: graph.heads.size,
        maxConcurrentLanes: maxConcurrentLanes(graph),
        longestLinearRun: longestLinearRun(graph),
        firstCommitMs,
        lastCommitMs,
        timeSpanMs,
        firstYear: firstCommitMs ? new Date(firstCommitMs).getUTCFullYear() : 0,
        lastYear: lastCommitMs ? new Date(lastCommitMs).getUTCFullYear() : 0,
        perDay,
        perWeek,
        hourOfDay,
        dayOfWeek,
        busiestDayIndex,
        peakDayCount,
        authorEntropy: entropy(counts),
        authorGini: gini(counts),
        rankedAuthors,
        bursts,
        longestStreakDays,
        longestGapDays,
        totalAdditions,
        totalDeletions,
        hasChurn: totalAdditions + totalDeletions > 0,
        maxChurn,
    };
}

/** A short human label for the busiest period (used in poster captions). */
export function describeBusiestPeriod(signals: ArtSignals): string {
    if (!signals.peakDayCount) return '';
    const day = new Date(signals.firstCommitMs + signals.busiestDayIndex * DAY_MS);
    return day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export type { CommitNode };
