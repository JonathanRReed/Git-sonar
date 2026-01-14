#!/usr/bin/env bun
/**
 * Git Sonar Export Tool
 * 
 * Generate a gitsonar.json file from any Git repository.
 * Run this in your repository root and drop the output into Git Sonar.
 * 
 * Usage:
 *   bun run tools/export/export.ts [options]
 * 
 * Options:
 *   --output, -o   Output file path (default: gitsonar.json)
 *   --stats, -s    Include file stats (additions/deletions)
 *   --limit, -n    Maximum number of commits (default: unlimited)
 */

import { $ } from 'bun';

interface ExportOptions {
    output: string;
    includeStats: boolean;
    limit?: number;
}

interface RawCommit {
    sha: string;
    parents: string[];
    author: string;
    email: string;
    date: string;
    subject: string;
    additions?: number;
    deletions?: number;
}

function parseArgs(): ExportOptions {
    const args = process.argv.slice(2);
    const options: ExportOptions = {
        output: 'gitsonar.json',
        includeStats: false,
        limit: undefined,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--output' || arg === '-o') {
            options.output = args[++i];
        } else if (arg === '--stats' || arg === '-s') {
            options.includeStats = true;
        } else if (arg === '--limit' || arg === '-n') {
            options.limit = parseInt(args[++i], 10);
        }
    }

    return options;
}

async function getRepoName(): Promise<string> {
    try {
        const result = await $`git remote get-url origin`.text();
        const url = result.trim();
        // Extract repo name from URL
        const match = url.match(/\/([^/]+?)(?:\.git)?$/);
        return match ? match[1] : 'unknown';
    } catch {
        // Fall back to directory name
        const cwd = process.cwd();
        return cwd.split('/').pop() ?? 'unknown';
    }
}

async function getBranches(): Promise<Record<string, string>> {
    const result = await $`git for-each-ref --format='%(refname:short) %(objectname:short)' refs/heads/`.text();
    const branches: Record<string, string> = {};

    for (const line of result.trim().split('\n')) {
        if (!line) continue;
        const [name, sha] = line.split(' ');
        if (name && sha) {
            branches[name] = sha;
        }
    }

    return branches;
}

async function getDefaultBranch(): Promise<string> {
    try {
        const result = await $`git symbolic-ref --short HEAD`.text();
        return result.trim();
    } catch {
        return 'main';
    }
}

async function getCommits(options: ExportOptions): Promise<RawCommit[]> {
    // Git log format: SHA|parents|author|email|date|subject
    const format = '%H|%P|%an|%ae|%aI|%s';

    let limitArg = '';
    if (options.limit) {
        limitArg = `-n ${options.limit}`;
    }

    const logResult = await $`git log ${limitArg} --pretty=format:${format}`.text();

    const commits: RawCommit[] = [];

    for (const line of logResult.trim().split('\n')) {
        if (!line) continue;

        const parts = line.split('|');
        if (parts.length < 6) continue;

        const [sha, parentsStr, author, email, date, ...subjectParts] = parts;
        const parents = parentsStr ? parentsStr.split(' ').filter(Boolean) : [];
        const subject = subjectParts.join('|'); // In case subject contains |

        commits.push({
            sha,
            parents,
            author,
            email,
            date,
            subject,
        });
    }

    // Get stats if requested
    if (options.includeStats) {
        console.log('Fetching file stats (this may take a moment)...');

        for (const commit of commits) {
            try {
                const statsResult = await $`git show --stat --format= ${commit.sha}`.text();
                const lastLine = statsResult.trim().split('\n').pop() ?? '';

                // Parse: "N files changed, X insertions(+), Y deletions(-)"
                const insertMatch = lastLine.match(/(\d+) insertion/);
                const deleteMatch = lastLine.match(/(\d+) deletion/);

                commit.additions = insertMatch ? parseInt(insertMatch[1], 10) : 0;
                commit.deletions = deleteMatch ? parseInt(deleteMatch[1], 10) : 0;
            } catch {
                // Skip stats for this commit
            }
        }
    }

    return commits;
}

async function main() {
    const options = parseArgs();

    console.log('🔍 Git Sonar Export Tool\n');

    // Check if we're in a git repo
    try {
        await $`git rev-parse --git-dir`.quiet();
    } catch {
        console.error('Error: Not in a git repository');
        process.exit(1);
    }

    console.log('📂 Repository:', await getRepoName());

    const refs = await getBranches();
    console.log('🌿 Branches:', Object.keys(refs).join(', '));

    const defaultBranch = await getDefaultBranch();
    console.log('📍 Default branch:', defaultBranch);

    console.log('\n⏳ Fetching commits...');
    const commits = await getCommits(options);
    console.log(`✅ Found ${commits.length} commits`);

    const exportData = {
        name: await getRepoName(),
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        defaultBranch,
        refs,
        commits,
    };

    await Bun.write(options.output, JSON.stringify(exportData, null, 2));
    console.log(`\n📦 Exported to ${options.output}`);
    console.log('\n🚀 Drop this file into Git Sonar to visualize!');
}

main().catch((err) => {
    console.error('Export failed:', err.message);
    process.exit(1);
});
