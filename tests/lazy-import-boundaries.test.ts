import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('app lazy import boundaries', () => {
    it('keeps Git provider code out of the initial React island bundles', () => {
        const importPanel = readSource('../src/components/ImportPanel.tsx');
        const controlsOverlay = readSource('../src/components/ControlsOverlay.tsx');
        const staticGitImport = /^import .* from ['"]@lib\/git\/import-git['"];?$/m;

        expect(importPanel).not.toMatch(staticGitImport);
        expect(controlsOverlay).not.toMatch(staticGitImport);
        expect(importPanel).toContain("await import('@lib/git/import-git')");
        expect(controlsOverlay).toContain("await import('@lib/git/import-git')");
    });

    it('keeps demo loading code behind an interaction boundary', () => {
        const importPanel = readSource('../src/components/ImportPanel.tsx');
        const staticDemoImport = /^import .* from ['"]@lib\/demo-data['"];?$/m;

        expect(importPanel).not.toMatch(staticDemoImport);
        expect(importPanel).toContain("await import('@lib/demo-data')");
    });
});
