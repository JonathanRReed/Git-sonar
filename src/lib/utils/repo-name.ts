/**
 * Human name for whatever is loaded, used for the header, the default poster
 * title and export filenames.
 */
export function repoDisplayName(
    repoPath: string | null,
    demo: string | null,
    sourceName: string | null = null
): string {
    if (repoPath) {
        const parts = repoPath.replace(/\.git$/i, '').split('/').filter(Boolean);
        return parts[parts.length - 1] ?? repoPath;
    }
    if (sourceName) return sourceName;
    if (demo === 'showcase') return 'Project Atlas';
    if (demo) return `${demo.charAt(0).toUpperCase()}${demo.slice(1)} sample`;
    return 'Untitled repo';
}

/** Turn an archive or folder name into a tidy source name. */
export function cleanSourceName(name: string): string {
    const cleaned = name
        .replace(/\.(zip|json)$/i, '')
        .replace(/[-_.]?git([-_.]?export)?$/i, '')
        .replace(/^\.+/, '')
        .trim();
    return cleaned || 'Local repo';
}

export type RepoProvider = 'github' | 'gitlab' | 'bitbucket';

/**
 * Reduce whatever was pasted (a repo page, a branch or file page, a clone
 * address, or plain owner/repo) to the provider and the repo's own path.
 */
export function parseRepoInput(raw: string): { provider: RepoProvider; path: string } {
    const input = raw.trim();
    const provider: RepoProvider = /gitlab\.com/i.test(input) ? 'gitlab' : /bitbucket\.org/i.test(input) ? 'bitbucket' : 'github';
    const path = input
        .replace(/^(?:https?:\/\/|git@)?(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)[/:]/i, '')
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '');
    // GitLab projects can sit in nested groups, and its pages hang off "/-/".
    const repo = provider === 'gitlab' ? path.replace(/\/-\/.*$/, '') : path.split('/').slice(0, 2).join('/');
    return { provider, path: repo.replace(/\.git$/i, '') };
}
