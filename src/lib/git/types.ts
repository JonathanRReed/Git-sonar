/**
 * Git Sonar Type Definitions
 * 
 * Core types for representing Git repository data, graph structures,
 * and visualization elements.
 */

// =============================================================================
// Core Git Data Types
// =============================================================================

/**
 * Statistics for a single commit (additions/deletions).
 */
export interface CommitStats {
    additions?: number;
    deletions?: number;
}

/**
 * A single commit node in the repository graph.
 */
export interface CommitNode {
    /** Full SHA hash of the commit */
    id: string;
    /** Parent commit SHAs (empty for root commits, multiple for merges) */
    parents: string[];
    /** Author's display name */
    authorName: string;
    /** MD5 hash of author's email (for Gravatar) */
    authorEmailHash?: string;
    /** Commit timestamp in Unix milliseconds */
    authoredAt: number;
    /** First line of commit message */
    messageSubject: string;
    /** Branch names that point to or contain this commit */
    branchHints?: string[];
    /** File change statistics */
    stats?: CommitStats;
}

// =============================================================================
// Repository Graph Types
// =============================================================================

/**
 * Aggregate metrics for the repository.
 */
export interface RepoMetrics {
    /** Total number of commits */
    commitCount: number;
    /** Number of merge commits (commits with 2+ parents) */
    mergeCount: number;
    /** Number of unique authors */
    authorCount: number;
    /** Map of author name to commit count */
    authorCommits: Map<string, number>;
    /** Total lines added across all commits */
    totalAdditions: number;
    /** Total lines deleted across all commits */
    totalDeletions: number;
    /** Time span from oldest to newest commit in ms */
    timeSpan: number;
}

/**
 * Complete repository graph structure.
 */
export interface RepoGraph {
    /** Map of SHA to commit node */
    commits: Map<string, CommitNode>;
    /** Map of branch name to HEAD SHA */
    heads: Map<string, string>;
    /** SHA of the default branch HEAD */
    defaultHead: string;
    /** Commits in topological order (parents before children) */
    topoOrder: string[];
    /** Map of SHA to lane index for visualization */
    lanes: Map<string, number>;
    /** Aggregate repository metrics */
    metrics: RepoMetrics;
}

// =============================================================================
// Visualization Types
// =============================================================================

/**
 * A commit node positioned for rendering in the graph canvas.
 */
export interface PositionedNode {
    /** Commit SHA */
    id: string;
    /** Normalized time position (0 = oldest, 1 = newest) */
    t: number;
    /** Lane index for horizontal positioning */
    lane: number;
    /** Depth from root commits */
    depth: number;
    /** Reference to the full commit data */
    commit: CommitNode;
}

/**
 * An edge connecting two commits in the visualization.
 */
export interface CommitEdge {
    /** Parent commit SHA */
    from: string;
    /** Child commit SHA */
    to: string;
    /** Whether this edge represents a merge relationship */
    isMerge: boolean;
}

// =============================================================================
// Import/Export Types
// =============================================================================

/**
 * Raw commit data from JSON export format.
 */
export interface RawCommit {
    /** Full SHA hash */
    sha: string;
    /** Parent commit SHAs */
    parents: string[];
    /** Author's display name */
    author: string;
    /** Author's email address */
    email?: string;
    /** ISO 8601 date string */
    date: string;
    /** Commit message subject line */
    subject: string;
    /** Lines added */
    additions?: number;
    /** Lines deleted */
    deletions?: number;
    /** Branch hints */
    branchHints?: string[];
}

/**
 * Git Sonar JSON export format.
 */
export interface GitSonarExport {
    /** Repository name */
    name: string;
    /** Export timestamp (ISO 8601) */
    exportedAt: string;
    /** Export format version */
    version: string;
    /** Default branch name */
    defaultBranch?: string;
    /** Map of branch name to SHA */
    refs?: Record<string, string>;
    /** Array of commits */
    commits: RawCommit[];
}

// =============================================================================
// Theme Types
// =============================================================================

/**
 * Color palette for a theme.
 */
export interface ThemeColors {
    base: string;
    surface: string;
    overlay: string;
    muted: string;
    subtle: string;
    text: string;
    love: string;
    gold: string;
    rose: string;
    pine: string;
    foam: string;
    iris: string;
    highlightLow: string;
    highlightMed: string;
    highlightHigh: string;
}

/**
 * Theme variant (dark or light).
 */
export type ThemeVariant = 'dark' | 'light';

/**
 * Complete theme definition.
 */
export interface Theme {
    id: string;
    name: string;
    variant: ThemeVariant;
    colors: ThemeColors;
}

// =============================================================================
// Layout Types
// =============================================================================

/**
 * Available layout modes for the graph visualization.
 */
export type LayoutMode = 'vertical' | 'horizontal' | 'radial' | 'compact';

/**
 * Background style options for poster mode.
 */
export interface BackgroundStyle {
    type: 'solid' | 'transparent' | 'gradient' | 'grid';
    color?: string;
    gradientStart?: string;
    gradientEnd?: string;
    gradientAngle?: number;
}

/**
 * Export options for PNG/SVG output.
 */
export interface ExportOptions {
    format: 'png' | 'svg' | 'jpeg';
    scale: 1 | 2 | 4;
    width?: number;
    height?: number;
    background: BackgroundStyle;
    includeLabels: boolean;
    includeTooltips: boolean;
}
