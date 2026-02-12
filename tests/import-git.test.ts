import { describe, expect, it } from 'vitest';
import { parseGitLabProjectPath } from '@lib/git/import-git';

describe('parseGitLabProjectPath', () => {
    it('parses a two-segment GitLab URL', () => {
        expect(parseGitLabProjectPath('https://gitlab.com/group/repo')).toBe('group/repo');
    });

    it('parses subgroup GitLab URLs', () => {
        expect(parseGitLabProjectPath('https://gitlab.com/group/subgroup/repo')).toBe('group/subgroup/repo');
    });

    it('handles trailing slash and .git suffix', () => {
        expect(parseGitLabProjectPath('https://gitlab.com/group/subgroup/repo.git/')).toBe('group/subgroup/repo');
    });

    it('accepts namespace paths without protocol', () => {
        expect(parseGitLabProjectPath('group/subgroup/repo')).toBe('group/subgroup/repo');
    });

    it('accepts git@gitlab.com ssh style URLs', () => {
        expect(parseGitLabProjectPath('git@gitlab.com:group/subgroup/repo.git')).toBe('group/subgroup/repo');
    });

    it('rejects invalid host and incomplete paths', () => {
        expect(parseGitLabProjectPath('https://example.com/group/repo')).toBeNull();
        expect(parseGitLabProjectPath('group')).toBeNull();
        expect(parseGitLabProjectPath('')).toBeNull();
    });
});
