import type { CommitNode, RepoGraph } from './types';
import { buildRepoGraph } from './graph';
import { unzlibSync, inflateSync, unzipSync } from 'fflate';
import { debugLog, debugWarn, debugError } from '@lib/utils/debug';

/**
 * Parse a GitHub repository URL and return owner/repo.
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    const patterns = [
        /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/i,
        /^([^/]+)\/([^/]+)$/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
        }
    }
    return null;
}

/**
 * Parse a GitLab repository URL/path and return the full namespace path.
 * Supports paths like `group/repo` and `group/subgroup/repo`.
 */
export function parseGitLabProjectPath(urlOrPath: string): string | null {
    const input = urlOrPath.trim();
    if (!input) return null;

    const sshPrefix = 'git@gitlab.com:';
    let rawPath = input;

    try {
        if (/^https?:\/\//i.test(input)) {
            const parsed = new URL(input);
            if (parsed.hostname.toLowerCase() !== 'gitlab.com') return null;
            rawPath = parsed.pathname;
        } else if (input.toLowerCase().startsWith('gitlab.com/')) {
            rawPath = input.slice('gitlab.com/'.length);
        } else if (input.toLowerCase().startsWith(sshPrefix)) {
            rawPath = input.slice(sshPrefix.length);
        }
    } catch {
        return null;
    }

    const normalizedPath = rawPath
        .replace(/^\/+|\/+$/g, '')
        .replace(/\.git$/i, '');

    if (!normalizedPath) return null;

    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length < 2) return null;

    return segments.join('/');
}

/**
 * Parse a Bitbucket repository URL and return owner/repo.
 */
function parseBitbucketUrl(url: string): { owner: string; repo: string } | null {
    const patterns = [
        /bitbucket\.org\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/i,
        /^([^/]+)\/([^/]+)$/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
        }
    }
    return null;
}

/**
 * Options for Git repository import
 */
export interface GitRepoImportOptions {
    /** Maximum number of commits to fetch (default: 1000) */
    maxCommits?: number;
    /** Progress callback for loading status */
    onProgress?: (loaded: number, total: number | null) => void;
    /** Optional auth token (for rate limits/private repos) */
    authToken?: string;
}

function createGitHubHeaders(authToken?: string) {
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
    if (authToken) headers.Authorization = `token ${authToken}`;
    return headers;
}

function createGitLabHeaders(authToken?: string) {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (authToken) headers['PRIVATE-TOKEN'] = authToken;
    return headers;
}

function createBitbucketHeaders(authToken?: string) {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (authToken) headers.Authorization = `Basic ${btoa(authToken)}`;
    return headers;
}

/**
 * Import a public GitHub repository using the GitHub REST API.
 * This is the most reliable method for public repos.
 */
export async function parseGitHubRepo(
    urlOrPath: string, 
    options: GitRepoImportOptions = {}
): Promise<RepoGraph> {
    const { maxCommits = 1000, onProgress, authToken } = options;
    const parsed = parseGitHubUrl(urlOrPath);
    if (!parsed) {
        throw new Error('Invalid GitHub URL. Use format: https://github.com/owner/repo or owner/repo');
    }

    const { owner, repo } = parsed;
    const commits = new Map<string, CommitNode>();
    const refs = new Map<string, string>();

    try {
        const headers = createGitHubHeaders(authToken);

        // Fetch repository info for default branch
        const repoInfoRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}`,
            { headers }
        );

        if (!repoInfoRes.ok) {
            if (repoInfoRes.status === 401) {
                throw new Error('GitHub authentication failed. Check your access token.');
            }
            if (repoInfoRes.status === 404) {
                throw new Error(`Repository not found: ${owner}/${repo}. Make sure it exists and is public.`);
            }
            if (repoInfoRes.status === 403) {
                throw new Error('GitHub API rate limit exceeded or access denied. Try again later or provide a token.');
            }
            throw new Error(`Failed to fetch repository: ${repoInfoRes.statusText}`);
        }

        const repoInfo = await repoInfoRes.json() as { default_branch?: string };
        const defaultBranchFromApi = repoInfo.default_branch ?? null;

        // Fetch branches
        const branchesRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
            { headers }
        );

        if (!branchesRes.ok) {
            if (branchesRes.status === 401) {
                throw new Error('GitHub authentication failed. Check your access token.');
            }
            if (branchesRes.status === 404) {
                throw new Error(`Repository not found: ${owner}/${repo}. Make sure it exists and is public.`);
            }
            if (branchesRes.status === 403) {
                throw new Error('GitHub API rate limit exceeded or access denied. Try again later or provide a token.');
            }
            throw new Error(`Failed to fetch branches: ${branchesRes.statusText}`);
        }

        const branches = await branchesRes.json() as Array<{ name: string; commit: { sha: string } }>;
        let defaultBranch = defaultBranchFromApi ?? 'main';

        for (const branch of branches) {
            refs.set(branch.name, branch.commit.sha);
            if (!defaultBranchFromApi && (branch.name === 'main' || branch.name === 'master')) {
                defaultBranch = branch.name;
            }
        }

        // Fetch commits with pagination
        let page = 1;
        const perPage = 100;
        const maxPages = maxCommits === Infinity ? 1000 : Math.ceil(maxCommits / perPage);

        while (page <= maxPages && commits.size < maxCommits) {
            const commitsRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`,
                { headers: createGitHubHeaders(authToken) }
            );

            if (!commitsRes.ok) {
                if (page === 1) {
                    if (commitsRes.status === 401) {
                        throw new Error('GitHub authentication failed. Check your access token.');
                    }
                    if (commitsRes.status === 403) {
                        throw new Error('GitHub API rate limit exceeded or access denied. Try again later or provide a token.');
                    }
                    throw new Error(`Failed to fetch commits: ${commitsRes.statusText}`);
                }
                break;
            }

            const pageCommits = await commitsRes.json() as Array<{
                sha: string;
                commit: {
                    author: { name: string; date: string };
                    message: string;
                };
                parents: Array<{ sha: string }>;
            }>;

            if (pageCommits.length === 0) break;

            for (const commit of pageCommits) {
                if (commits.has(commit.sha)) continue;
                if (commits.size >= maxCommits) break;

                const branchHints: string[] = [];
                for (const [name, sha] of refs) {
                    if (sha === commit.sha) branchHints.push(name);
                }

                commits.set(commit.sha, {
                    id: commit.sha,
                    parents: commit.parents.map(p => p.sha),
                    authorName: commit.commit.author.name,
                    authoredAt: new Date(commit.commit.author.date).getTime(),
                    messageSubject: commit.commit.message.split('\n')[0],
                    branchHints: branchHints.length > 0 ? branchHints : undefined,
                });
            }

            // Report progress
            if (onProgress) {
                onProgress(commits.size, null);
            }

            if (commits.size >= maxCommits) break;
            if (pageCommits.length < perPage) break;
            page++;
        }

        if (commits.size === 0) {
            throw new Error('No commits found in repository');
        }

        return buildRepoGraph(commits, refs, defaultBranch);
    } catch (err) {
        if (err instanceof TypeError && err.message.includes('fetch')) {
            throw new Error('Network error. Please check your connection and try again.');
        }
        throw err;
    }
}

/**
 * Import a public Bitbucket repository using Bitbucket REST API.
 */
export async function parseBitbucketRepo(
    urlOrPath: string,
    options: GitRepoImportOptions = {}
): Promise<RepoGraph> {
    const { maxCommits = 1000, onProgress, authToken } = options;
    const parsed = parseBitbucketUrl(urlOrPath);
    if (!parsed) {
        throw new Error('Invalid Bitbucket URL. Use format: https://bitbucket.org/owner/repo or owner/repo');
    }

    const { owner, repo } = parsed;
    const commits = new Map<string, CommitNode>();
    const refs = new Map<string, string>();

    try {
        // Fetch repo info to get default branch
        const repoInfoRes = await fetch(
            `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}`,
            { headers: createBitbucketHeaders(authToken) }
        );

        if (!repoInfoRes.ok) {
            if (repoInfoRes.status === 401 || repoInfoRes.status === 403) {
                throw new Error('Bitbucket authentication failed or access denied. Check your username/app password.');
            }
            if (repoInfoRes.status === 404) {
                throw new Error(`Repository not found: ${owner}/${repo}`);
            }
            throw new Error(`Failed to fetch repository: ${repoInfoRes.statusText}`);
        }

        const repoInfo = await repoInfoRes.json() as { mainbranch?: { name?: string } };
        const defaultBranch = repoInfo.mainbranch?.name ?? 'main';

        // Fetch commits with pagination
        let nextUrl: string | null = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/commits?pagelen=100`;

        while (nextUrl && commits.size < maxCommits) {
            const commitsRes = await fetch(nextUrl, { headers: createBitbucketHeaders(authToken) });
            if (!commitsRes.ok) {
                if (commitsRes.status === 401 || commitsRes.status === 403) {
                    throw new Error('Bitbucket authentication failed or access denied. Check your username/app password.');
                }
                throw new Error(`Failed to fetch commits: ${commitsRes.statusText}`);
            }

            const data = await commitsRes.json() as { values: Array<{
                hash: string;
                date: string;
                message: string;
                parents: Array<{ hash: string }>;
                author: { raw: string };
            }>; next?: string };

            for (const commit of data.values) {
                if (commits.has(commit.hash)) continue;
                if (commits.size >= maxCommits) break;

                const authorName = commit.author.raw.split('<')[0].trim();
                commits.set(commit.hash, {
                    id: commit.hash,
                    parents: commit.parents.map(p => p.hash),
                    authorName,
                    authoredAt: new Date(commit.date).getTime(),
                    messageSubject: commit.message.split('\n')[0],
                });
            }

            if (onProgress) {
                onProgress(commits.size, null);
            }

            nextUrl = data.next ?? null;
        }

        // Fetch branches for refs
        const branchesRes = await fetch(
            `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/refs/branches?pagelen=100`,
            { headers: createBitbucketHeaders(authToken) }
        );

        if (branchesRes.ok) {
            const branchesData = await branchesRes.json() as { values: Array<{ name: string; target: { hash: string } }> };
            for (const branch of branchesData.values) {
                refs.set(branch.name, branch.target.hash);
            }
        }

        if (commits.size === 0) {
            throw new Error('No commits found in repository');
        }

        return buildRepoGraph(commits, refs, defaultBranch);
    } catch (err) {
        if (err instanceof TypeError && err.message.includes('fetch')) {
            throw new Error('Network error. Please check your connection and try again.');
        }
        throw err;
    }
}

/**
 * Parse a ZIP file containing a .git directory.
 */
export async function parseGitLabRepo(
    urlOrPath: string,
    options: GitRepoImportOptions = {}
): Promise<RepoGraph> {
    const { maxCommits = 1000, onProgress, authToken } = options;
    const projectPath = parseGitLabProjectPath(urlOrPath);
    if (!projectPath) {
        throw new Error('Invalid GitLab URL. Use format: https://gitlab.com/group/repo, https://gitlab.com/group/subgroup/repo, or group/subgroup/repo');
    }
    const commits = new Map<string, CommitNode>();
    const refs = new Map<string, string>();
    const encodedProjectPath = encodeURIComponent(projectPath);

    try {
        // Fetch repository info first to get default branch
        const repoInfoRes = await fetch(
            `https://gitlab.com/api/v4/projects/${encodedProjectPath}`,
            { headers: createGitLabHeaders(authToken) }
        );

        if (!repoInfoRes.ok) {
            if (repoInfoRes.status === 401 || repoInfoRes.status === 403) {
                throw new Error('GitLab authentication failed or access denied. Check your access token.');
            }
            if (repoInfoRes.status === 404) {
                throw new Error(`Repository not found: ${projectPath}`);
            }
            throw new Error(`Failed to fetch repository: ${repoInfoRes.statusText}`);
        }

        const repoInfo = await repoInfoRes.json() as { default_branch?: string };
        const defaultBranch = repoInfo.default_branch ?? 'main';

        // Fetch commits with pagination
        let page = 1;
        const perPage = 100;
        const maxPages = maxCommits === Infinity ? 1000 : Math.ceil(maxCommits / perPage);

        while (page <= maxPages && commits.size < maxCommits) {
            const commitsRes = await fetch(
                `https://gitlab.com/api/v4/projects/${encodedProjectPath}/repository/commits?per_page=${perPage}&page=${page}`,
                { headers: createGitLabHeaders(authToken) }
            );

            if (!commitsRes.ok) {
                if (page === 1) {
                    if (commitsRes.status === 401 || commitsRes.status === 403) {
                        throw new Error('GitLab authentication failed or access denied. Check your access token.');
                    }
                    throw new Error(`Failed to fetch commits: ${commitsRes.statusText}`);
                }
                break;
            }

            const pageCommits = await commitsRes.json() as Array<{
                id: string;
                title: string;
                author_name: string;
                author_email: string;
                created_at: string;
                parent_ids: string[];
                message: string;
            }>;

            for (const commit of pageCommits) {
                if (commits.has(commit.id)) continue;

                commits.set(commit.id, {
                    id: commit.id,
                    parents: commit.parent_ids,
                    authorName: commit.author_name,
                    authoredAt: new Date(commit.created_at).getTime(),
                    messageSubject: commit.message.split('\n')[0],
                });
            }

            if (onProgress) {
                onProgress(commits.size, null);
            }

            if (commits.size >= maxCommits) break;
            if (pageCommits.length < perPage) break;
            page++;
        }

        // Fetch branches for refs
        const branchesRes = await fetch(
            `https://gitlab.com/api/v4/projects/${encodedProjectPath}/repository/branches?per_page=100`,
            { headers: createGitLabHeaders(authToken) }
        );

        if (branchesRes.ok) {
            const branches = await branchesRes.json() as Array<{ name: string; commit: { id: string } }>;
            for (const branch of branches) {
                refs.set(branch.name, branch.commit.id);
            }
        }

        if (commits.size === 0) {
            throw new Error('No commits found in repository');
        }

        return buildRepoGraph(commits, refs, defaultBranch);
    } catch (err) {
        if (err instanceof TypeError && err.message.includes('fetch')) {
            throw new Error('Network error. Please check your connection and try again.');
        }
        throw err;
    }
}

/**
 * Parse a ZIP file containing a .git directory.
 */
export async function parseGitZip(zipFile: File): Promise<RepoGraph> {
    const buffer = await zipFile.arrayBuffer();
    const files = unzipSync(new Uint8Array(buffer));

    const fs = createMemoryFS();

    for (const [path, content] of Object.entries(files)) {
        let entryPath = path.replace(/\\/g, '/').replace(/^\.\/+/, '');
        if (!entryPath || entryPath.startsWith('__MACOSX/')) continue;

        // Skip directories (content is empty Uint8Array for dirs)
        if (content.length === 0 && entryPath.endsWith('/')) continue;

        // Normalize path
        let normalizedPath = entryPath.replace(/\/+/g, '/');
        if (!normalizedPath.startsWith('.git') && !normalizedPath.startsWith('/.git')) {
            // Check if it's inside a folder that contains .git
            const gitIdx = normalizedPath.indexOf('.git');
            if (gitIdx !== -1) {
                normalizedPath = normalizedPath.slice(gitIdx);
            } else {
                normalizedPath = '.git/' + normalizedPath;
            }
        }

        await fs.writeFile(normalizedPath, content);
    }

    return parseFromFS(fs, '.');
}

/**
 * Parse git history from a virtual filesystem using manual git object parsing.
 */
async function parseFromFS(fs: MemoryFS, _dir: string): Promise<RepoGraph> {
    const commits = new Map<string, CommitNode>();
    const refs = new Map<string, string>();
    const packedRefs = new Map<string, string>();

    // Load pack index for packed objects
    const packIndex = await loadPackIndex(fs);

    // Read HEAD info
    const headInfo = await readHeadInfo(fs);

    // Read packed-refs
    const packedText = await readTextFile(fs, '.git/packed-refs');
    if (packedText) {
        for (const [ref, sha] of parsePackedRefs(packedText)) {
            packedRefs.set(ref, sha);
            if (ref.startsWith('refs/heads/')) {
                refs.set(ref.replace('refs/heads/', ''), sha);
            }
        }
    }

    // Read loose refs from .git/refs/heads/
    const looseRefs = await readLooseRefs(fs);
    for (const [name, sha] of looseRefs) {
        refs.set(name, sha);
    }

    // Resolve HEAD if it points to a ref
    if (headInfo && headInfo.ref && !headInfo.sha) {
        const looseSha = await readTextFile(fs, `.git/${headInfo.ref}`);
        headInfo.sha = looseSha?.trim() || packedRefs.get(headInfo.ref) || null;
    }

    if (refs.size === 0 && headInfo?.sha) {
        refs.set('HEAD', headInfo.sha);
    }

    if (refs.size === 0 && !headInfo) {
        const gitFile = await readTextFile(fs, '.git');
        if (gitFile?.trim().startsWith('gitdir:')) {
            const gitDir = gitFile.trim().replace(/^gitdir:\s*/, '');
            throw new Error(`This ZIP contains a .git file (worktree). Run "git rev-parse --git-dir" in your repo and zip that directory instead (gitdir: ${gitDir}).`);
        }
        throw new Error('No .git/HEAD found. Your ZIP likely excluded hidden .git files. Create the ZIP with "zip -r git-export.zip .git".');
    }

    // Determine default branch
    let defaultBranch = 'main';
    if (headInfo?.ref?.startsWith('refs/heads/')) {
        const headBranch = headInfo.ref.replace('refs/heads/', '');
        if (refs.has(headBranch)) {
            defaultBranch = headBranch;
        }
    } else {
        if (refs.has('main')) defaultBranch = 'main';
        else if (refs.has('master')) defaultBranch = 'master';
        else defaultBranch = Array.from(refs.keys())[0] || 'main';
    }

    // Get starting ref
    const defaultRef = refs.get(defaultBranch) || Array.from(refs.values())[0];
    if (!defaultRef) {
        throw new Error('No commits found in repository');
    }

    // Walk all commits from all branch heads
    const visited = new Set<string>();
    const toVisit: string[] = Array.from(refs.values());
    const failedReads: string[] = [];

    while (toVisit.length > 0) {
        const oid = toVisit.pop()!;
        if (visited.has(oid)) continue;
        visited.add(oid);

        try {
            const commitData = await readGitObject(fs, oid, packIndex);
            if (!commitData) {
                failedReads.push(oid);
                continue;
            }
            if (commitData.type !== 'commit') continue;

            const parsed = parseCommitObject(commitData.data);
            if (!parsed) continue;

            // Find branch hints for this commit
            const branchHints: string[] = [];
            for (const [name, sha] of refs) {
                if (sha === oid) {
                    branchHints.push(name);
                }
            }

            const node: CommitNode = {
                id: oid,
                parents: parsed.parents,
                authorName: parsed.authorName,
                authoredAt: parsed.authoredAt,
                messageSubject: parsed.message.split('\n')[0],
                branchHints: branchHints.length > 0 ? branchHints : undefined,
            };

            commits.set(oid, node);

            // Queue parents for visiting
            for (const parent of parsed.parents) {
                if (!visited.has(parent)) {
                    toVisit.push(parent);
                }
            }
        } catch {
            failedReads.push(oid);
        }
    }

    // Log failed reads for debugging
    if (failedReads.length > 0) {
        debugWarn('Git Import', `Could not read ${failedReads.length} objects:`, failedReads.slice(0, 5));
        debugWarn('Git Import', `Pack index has ${packIndex?.offsets.size || 0} objects`);
    }

    if (commits.size === 0) {
        throw new Error('No commits could be read from repository. Make sure your ZIP includes .git/objects.');
    }

    return buildRepoGraph(commits, refs, defaultBranch);
}

/**
 * Read loose refs from .git/refs/heads/
 */
async function readLooseRefs(fs: MemoryFS): Promise<Map<string, string>> {
    const refs = new Map<string, string>();
    try {
        const heads = await fs.readdir('.git/refs/heads');
        for (const name of heads) {
            const sha = await readTextFile(fs, `.git/refs/heads/${name}`);
            if (sha && /^[0-9a-f]{40}$/i.test(sha.trim())) {
                refs.set(name, sha.trim());
            }
        }
    } catch {
        // No loose refs
    }
    return refs;
}

/**
 * Read a git object (loose or packed)
 */
async function readGitObject(
    fs: MemoryFS,
    oid: string,
    packIndex: PackIndex | null
): Promise<{ type: string; data: Uint8Array } | null> {
    // Try loose object first
    const loosePath = `.git/objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
    try {
        const compressed = await fs.readFile(loosePath);
        // Git loose objects use zlib compression (not raw deflate)
        const decompressed = unzlibSync(compressed);
        
        // Parse object header "type size\0data"
        const nullIdx = decompressed.indexOf(0);
        if (nullIdx === -1) return null;
        
        const header = new TextDecoder().decode(decompressed.slice(0, nullIdx));
        const [type] = header.split(' ');
        const data = decompressed.slice(nullIdx + 1);
        
        return { type, data };
    } catch {
        // Not a loose object, try pack
    }

    // Try packed object
    if (packIndex) {
        return readPackedObject(fs, oid, packIndex);
    }

    return null;
}

interface PackIndex {
    packPath: string;
    offsets: Map<string, number>;
    extendedOffsets?: Map<string, { packPath: string; offset: number }>;
}

/**
 * Load ALL pack index files (repos can have multiple packs)
 */
async function loadPackIndex(fs: MemoryFS): Promise<PackIndex | null> {
    try {
        const packDir = await fs.readdir('.git/objects/pack');
        const idxFiles = packDir.filter(f => f.endsWith('.idx'));
        const packFiles = packDir.filter(f => f.endsWith('.pack'));
        
        if (idxFiles.length === 0 || packFiles.length === 0) return null;

        // Merge all pack indices
        const allOffsets = new Map<string, { packPath: string; offset: number }>();
        
        for (const idxFile of idxFiles) {
            const packName = idxFile.replace('.idx', '.pack');
            if (!packFiles.includes(packName)) continue;
            
            const idxData = await fs.readFile(`.git/objects/pack/${idxFile}`);
            const offsets = parsePackIndex(idxData);
            const packPath = `.git/objects/pack/${packName}`;
            
            for (const [sha, offset] of offsets) {
                allOffsets.set(sha, { packPath, offset });
            }
        }
        
        debugLog('loadPackIndex', `Loaded ${idxFiles.length} pack(s) with ${allOffsets.size} total objects`);
        
        // Create a simple offsets map for backward compatibility
        const simpleOffsets = new Map<string, number>();
        for (const [sha, info] of allOffsets) {
            simpleOffsets.set(sha, info.offset);
        }
        
        return {
            packPath: idxFiles.length === 1 ? `.git/objects/pack/${idxFiles[0].replace('.idx', '.pack')}` : '',
            offsets: simpleOffsets,
            extendedOffsets: allOffsets,
        };
    } catch (err) {
        debugError('loadPackIndex', 'Error:', err);
        return null;
    }
}

/**
 * Parse a pack index file (v2 format)
 */
function parsePackIndex(data: Uint8Array): Map<string, number> {
    const offsets = new Map<string, number>();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    
    // Check for v2 header
    const magic = view.getUint32(0);
    if (magic !== 0xff744f63) {
        // v1 format - not commonly used anymore
        return offsets;
    }
    
    const version = view.getUint32(4);
    if (version !== 2) return offsets;

    // Fanout table at offset 8, 256 entries of 4 bytes each
    const fanoutEnd = 8 + 256 * 4;
    const totalObjects = view.getUint32(fanoutEnd - 4);
    
    // SHA table starts after fanout
    const shaTableStart = fanoutEnd;
    const shaTableEnd = shaTableStart + totalObjects * 20;
    
    // CRC table (skip)
    const crcTableEnd = shaTableEnd + totalObjects * 4;
    
    // Offset table (4-byte offsets)
    const offsetTableStart = crcTableEnd;
    const offsetTableEnd = offsetTableStart + totalObjects * 4;
    
    // 64-bit offset table comes after (if any large offsets exist)
    const largeOffsetTableStart = offsetTableEnd;
    
    for (let i = 0; i < totalObjects; i++) {
        // Read SHA
        const shaOffset = shaTableStart + i * 20;
        const sha = Array.from(data.slice(shaOffset, shaOffset + 20))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        
        // Read offset (4 bytes)
        const offset32 = view.getUint32(offsetTableStart + i * 4);
        
        // Check MSB - if set, this is an index into the 64-bit offset table
        if (offset32 & 0x80000000) {
            const largeOffsetIndex = offset32 & 0x7fffffff;
            const largeOffsetPos = largeOffsetTableStart + largeOffsetIndex * 8;
            // Read 64-bit offset (JavaScript can handle up to 2^53 safely)
            const high = view.getUint32(largeOffsetPos);
            const low = view.getUint32(largeOffsetPos + 4);
            const offset64 = high * 0x100000000 + low;
            offsets.set(sha, offset64);
        } else {
            offsets.set(sha, offset32);
        }
    }
    
    return offsets;
}

/**
 * Read an object from a pack file
 */
async function readPackedObject(
    fs: MemoryFS,
    oid: string,
    packIndex: PackIndex & { extendedOffsets?: Map<string, { packPath: string; offset: number }> }
): Promise<{ type: string; data: Uint8Array } | null> {
    // Use extended offsets if available (includes pack path per object)
    const extendedInfo = packIndex.extendedOffsets?.get(oid);
    if (extendedInfo) {
        try {
            const packData = await fs.readFile(extendedInfo.packPath);
            return readPackObject(packData, extendedInfo.offset, packIndex, fs);
        } catch {
            return null;
        }
    }
    
    // Fallback to simple offset lookup
    const offset = packIndex.offsets.get(oid);
    if (offset === undefined) return null;

    try {
        const packData = await fs.readFile(packIndex.packPath);
        return readPackObject(packData, offset, packIndex, fs);
    } catch {
        return null;
    }
}

/**
 * Decompress data from a pack file.
 * Git pack files normally use raw DEFLATE, but some may have zlib-wrapped data.
 * We detect the zlib header (78 xx) and use the appropriate decompressor.
 */
function inflatePackData(data: Uint8Array): Uint8Array {
    // Check for zlib header: 78 01, 78 5e, 78 9c, or 78 da
    // These indicate zlib compression levels (no/low/default/best)
    if (data.length >= 2 && data[0] === 0x78 && 
        (data[1] === 0x01 || data[1] === 0x5e || data[1] === 0x9c || data[1] === 0xda)) {
        return unzlibSync(data);
    }
    
    // Otherwise use raw deflate (standard git pack format)
    return inflateSync(data);
}

/**
 * Read a single object from pack data at given offset
 */
function readPackObject(
    packData: Uint8Array,
    offset: number,
    packIndex: PackIndex,
    _fs: MemoryFS,
    depth: number = 0
): { type: string; data: Uint8Array } | null {
    const types = ['', 'commit', 'tree', 'blob', 'tag', '', 'ofs_delta', 'ref_delta'];
    
    // Prevent infinite recursion
    if (depth > 50) return null;
    
    // Bounds check
    if (offset < 0 || offset >= packData.length) return null;
    
    try {
        let pos = offset;
        let byte = packData[pos++];
        const type = (byte >> 4) & 0x7;
        let size = byte & 0x0f;
        let shift = 4;
        
        while (byte & 0x80) {
            if (pos >= packData.length) return null;
            byte = packData[pos++];
            size |= (byte & 0x7f) << shift;
            shift += 7;
        }
        
        // Debug logging for problematic offsets (only in development)
        if (depth === 0 && offset > 2780000 && offset < 2790000) {
            const headerBytes = Array.from(packData.slice(offset, offset + 20)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            debugLog('readPackObject', `offset=${offset} type=${type} (${types[type]}) size=${size} pos=${pos} headerBytes=${headerBytes}`);
        }

        if (type === 6) {
            // OFS_DELTA - offset delta
            byte = packData[pos++];
            let baseOffset = byte & 0x7f;
            while (byte & 0x80) {
                if (pos >= packData.length) return null;
                byte = packData[pos++];
                baseOffset = ((baseOffset + 1) << 7) | (byte & 0x7f);
            }
            // Pack files use raw DEFLATE (no zlib header)
            const deltaData = inflatePackData(packData.subarray(pos));
            const baseResult = readPackObject(packData, offset - baseOffset, packIndex, _fs, depth + 1);
            if (!baseResult) return null;
            const result = applyDelta(baseResult.data, deltaData);
            return { type: baseResult.type, data: result };
        }
        
        if (type === 7) {
            // REF_DELTA - reference delta
            const baseOid = Array.from(packData.slice(pos, pos + 20))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            pos += 20;
            const deltaData = inflatePackData(packData.subarray(pos));
            
            // Need to find base object
            const baseOffset = packIndex.offsets.get(baseOid);
            if (baseOffset === undefined) {
                // Base object not in this pack - might be a loose object or in another pack
                return null;
            }
            const baseResult = readPackObject(packData, baseOffset, packIndex, _fs, depth + 1);
            if (!baseResult) return null;
            const result = applyDelta(baseResult.data, deltaData);
            return { type: baseResult.type, data: result };
        }

        // Non-delta object - decompress and return (raw DEFLATE)
        const objectData = inflatePackData(packData.subarray(pos));
        return { type: types[type] || 'unknown', data: objectData.slice(0, size) };
    } catch (err) {
        if (depth === 0) {
            debugError('readPackObject', 'Error at offset', offset, ':', err);
        }
        return null;
    }
}

/**
 * Apply a git delta to a base object
 */
function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array {
    let pos = 0;
    
    // Read base size (variable length) - skip it, just need to advance pos
    let shift = 0;
    let byte: number;
    do {
        byte = delta[pos++];
        shift += 7;
    } while (byte & 0x80);
    
    // Read result size
    let resultSize = 0;
    shift = 0;
    do {
        byte = delta[pos++];
        resultSize |= (byte & 0x7f) << shift;
        shift += 7;
    } while (byte & 0x80);
    
    const result = new Uint8Array(resultSize);
    let resultPos = 0;
    
    while (pos < delta.length) {
        const cmd = delta[pos++];
        if (cmd & 0x80) {
            // Copy from base
            let copyOffset = 0;
            let copySize = 0;
            if (cmd & 0x01) copyOffset |= delta[pos++];
            if (cmd & 0x02) copyOffset |= delta[pos++] << 8;
            if (cmd & 0x04) copyOffset |= delta[pos++] << 16;
            if (cmd & 0x08) copyOffset |= delta[pos++] << 24;
            if (cmd & 0x10) copySize |= delta[pos++];
            if (cmd & 0x20) copySize |= delta[pos++] << 8;
            if (cmd & 0x40) copySize |= delta[pos++] << 16;
            if (copySize === 0) copySize = 0x10000;
            result.set(base.slice(copyOffset, copyOffset + copySize), resultPos);
            resultPos += copySize;
        } else if (cmd > 0) {
            // Insert new data
            result.set(delta.slice(pos, pos + cmd), resultPos);
            pos += cmd;
            resultPos += cmd;
        }
    }
    
    return result;
}

/**
 * Parse a commit object's content
 */
function parseCommitObject(data: Uint8Array): {
    parents: string[];
    authorName: string;
    authoredAt: number;
    message: string;
} | null {
    const text = new TextDecoder().decode(data);
    const lines = text.split('\n');
    
    const parents: string[] = [];
    let authorName = 'Unknown';
    let authoredAt = Date.now();
    let messageStart = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') {
            messageStart = i + 1;
            break;
        }
        if (line.startsWith('parent ')) {
            parents.push(line.slice(7));
        } else if (line.startsWith('author ')) {
            // Format: "author Name <email> timestamp timezone"
            const match = line.match(/^author (.+) <[^>]+> (\d+)/);
            if (match) {
                authorName = match[1];
                authoredAt = parseInt(match[2], 10) * 1000;
            }
        }
    }
    
    const message = lines.slice(messageStart).join('\n');
    
    return { parents, authorName, authoredAt, message };
}

async function readTextFile(fs: MemoryFS, path: string): Promise<string | null> {
    try {
        const data = await fs.readFile(path);
        return new TextDecoder().decode(data);
    } catch {
        return null;
    }
}

function parsePackedRefs(text: string): Map<string, string> {
    const refs = new Map<string, string>();
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('^')) continue;
        const [sha, ref] = trimmed.split(' ');
        if (sha && ref) {
            refs.set(ref, sha);
        }
    }
    return refs;
}

async function readHeadInfo(fs: MemoryFS): Promise<{ ref?: string; sha?: string | null } | null> {
    const headText = await readTextFile(fs, '.git/HEAD');
    if (!headText) return null;
    const trimmed = headText.trim();
    if (trimmed.startsWith('ref:')) {
        return { ref: trimmed.replace(/^ref:\s*/, ''), sha: null };
    }
    if (/^[0-9a-f]{40}$/i.test(trimmed)) {
        return { sha: trimmed };
    }
    return null;
}

/**
 * Simple in-memory filesystem for isomorphic-git.
 * isomorphic-git expects methods under fs.promises.*
 */
interface MemoryFSPromises {
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, data: Uint8Array): Promise<void>;
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }>;
    mkdir(path: string): Promise<void>;
    lstat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; size: number }>;
    readlink(path: string): Promise<string>;
    symlink(target: string, path: string): Promise<void>;
    unlink(path: string): Promise<void>;
    rmdir(path: string): Promise<void>;
}

interface MemoryFS {
    promises: MemoryFSPromises;
    // Direct methods for our internal use
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, data: Uint8Array): Promise<void>;
    readdir(path: string): Promise<string[]>;
}

function createMemoryFS(): MemoryFS {
    const files = new Map<string, Uint8Array>();
    const dirs = new Set<string>(['.', '.git']);

    const normalizePath = (p: string): string => {
        // Remove leading ./ and / prefixes, trailing slashes, and normalize multiple slashes
        return p.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/');
    };

    const createFsError = (code: string, path: string): Error => {
        const err = new Error(`${code}: ${path}`) as Error & { code?: string };
        err.code = code;
        return err;
    };

    const ensureParentDirs = (path: string): void => {
        const parts = path.split('/');
        let current = '';
        for (let i = 0; i < parts.length - 1; i++) {
            current = current ? current + '/' + parts[i] : parts[i];
            dirs.add(current);
        }
    };

    const readFile = async (path: string): Promise<Uint8Array> => {
        const normalized = normalizePath(path);
        const data = files.get(normalized);
        if (!data) {
            throw createFsError('ENOENT', path);
        }
        return data;
    };

    const writeFile = async (path: string, data: Uint8Array): Promise<void> => {
        const normalized = normalizePath(path);
        ensureParentDirs(normalized);
        files.set(normalized, data);
    };

    const readdir = async (path: string): Promise<string[]> => {
        const normalized = normalizePath(path);
        const hasDir = dirs.has(normalized) ||
            Array.from(files.keys()).some(f => f.startsWith(normalized + '/'));
        if (!hasDir && normalized !== '') {
            throw createFsError('ENOENT', path);
        }
        const prefix = normalized ? normalized + '/' : '';
        const entries = new Set<string>();

        for (const filePath of files.keys()) {
            if (filePath.startsWith(prefix)) {
                const remainder = filePath.slice(prefix.length);
                const firstPart = remainder.split('/')[0];
                if (firstPart) entries.add(firstPart);
            }
        }

        for (const dirPath of dirs) {
            if (dirPath.startsWith(prefix) && dirPath !== normalized) {
                const remainder = dirPath.slice(prefix.length);
                const firstPart = remainder.split('/')[0];
                if (firstPart) entries.add(firstPart);
            }
        }

        return Array.from(entries);
    };

    const stat = async (path: string) => {
        const normalized = normalizePath(path);
        const isFile = files.has(normalized);
        const isDir = dirs.has(normalized) ||
            Array.from(files.keys()).some(f => f.startsWith(normalized + '/'));

        if (!isFile && !isDir) {
            throw createFsError('ENOENT', path);
        }

        return {
            isFile: () => isFile,
            isDirectory: () => isDir && !isFile,
            size: isFile ? files.get(normalized)!.length : 0,
        };
    };

    const mkdir = async (path: string): Promise<void> => {
        const normalized = normalizePath(path);
        dirs.add(normalized);
    };

    const lstat = async (path: string) => {
        const s = await stat(path);
        return {
            ...s,
            isSymbolicLink: () => false,
        };
    };

    const readlink = async (path: string): Promise<string> => {
        throw createFsError('ENOSYS', path);
    };

    const symlink = async (_target: string, path: string): Promise<void> => {
        throw createFsError('ENOSYS', path);
    };

    const unlink = async (path: string): Promise<void> => {
        const normalized = normalizePath(path);
        files.delete(normalized);
    };

    const rmdir = async (path: string): Promise<void> => {
        const normalized = normalizePath(path);
        dirs.delete(normalized);
    };

    const promisesApi: MemoryFSPromises = {
        readFile,
        writeFile,
        readdir,
        stat,
        mkdir,
        lstat,
        readlink,
        symlink,
        unlink,
        rmdir,
    };

    return {
        promises: promisesApi,
        readFile,
        writeFile,
        readdir,
    };
}
