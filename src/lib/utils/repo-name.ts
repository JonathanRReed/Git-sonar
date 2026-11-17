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
