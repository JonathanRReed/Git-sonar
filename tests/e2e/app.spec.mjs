import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Make a real repository on disk with a feature branch merged back in, so the
 * folder import is tested against what git itself writes. `packed` runs gc,
 * which moves the objects into a packfile.
 */
function makeRepo({ packed }) {
    const dir = mkdtempSync(path.join(tmpdir(), 'gallery-repo-'));
    const git = (...args) => execFileSync('git', args, {
        cwd: dir,
        stdio: 'pipe',
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Ada Lovelace', GIT_AUTHOR_EMAIL: 'ada@example.com',
            GIT_COMMITTER_NAME: 'Ada Lovelace', GIT_COMMITTER_EMAIL: 'ada@example.com',
            GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
        },
    });
    const commit = (file, message, author) => {
        writeFileSync(path.join(dir, file), `${message}\n`);
        git('add', file);
        git('commit', '-q', '-m', message, ...(author ? ['--author', author] : []));
    };
    git('init', '-q', '-b', 'main');
    commit('a.txt', 'Initial commit');
    commit('b.txt', 'Add the renderer');
    git('checkout', '-q', '-b', 'feature/labels');
    commit('c.txt', 'Add wall labels', 'Grace Hopper <grace@example.com>');
    commit('d.txt', 'Polish the labels', 'Grace Hopper <grace@example.com>');
    git('checkout', '-q', 'main');
    commit('e.txt', 'Tune the lighting');
    git('merge', '-q', '--no-ff', '-m', 'Merge the labels', 'feature/labels');
    if (packed) git('gc', '-q', '--aggressive');
    return dir;
}

async function loadApp(page) {
    await page.goto('/app');
    await page.waitForLoadState('networkidle');
}

/** Load the small branching sample straight into the History view. */
async function loadBranchingDemo(page) {
    await page.goto('/app?demo=branching&view=inspect');
    await expect(page.getByRole('heading', { name: 'Commits' })).toBeVisible({ timeout: 8000 });
}

test.describe('Git Sonar app', () => {
    test('loads the landing page', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /Every repo deserves a retrospective/ })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Open the studio' }).first()).toBeVisible();
        // The call to action is the empty frame with the repo box inside it.
        await expect(page.getByRole('button', { name: 'Make my poster' })).toBeVisible();
    });

    test('every page opts in to the frame transition inline', async ({ page }) => {
        // From a linked stylesheet the opt-in arrives too late and the built
        // site skips the transition, so it has to be a <style> in the head.
        for (const route of ['/', '/app', '/about']) {
            await page.goto(route);
            const inline = await page.evaluate(() =>
                [...document.head.querySelectorAll('style')].some((s) => s.textContent.includes('@view-transition')));
            expect(inline, route).toBe(true);
        }
    });

    test('the empty frame sends a pasted repo to the studio', async ({ page }) => {
        await page.route('https://api.github.com/**', (route) => route.abort());
        await page.goto('/');
        await page.getByLabel('Paste a repo link to see it hung.').fill('https://github.com/sveltejs/svelte');
        await page.getByRole('button', { name: 'Make my poster' }).click();
        await expect(page).toHaveURL(/\/app\?github=sveltejs%2Fsvelte/);
    });

    test('landing collection remixes a poster into the studio', async ({ page }) => {
        await page.goto('/');
        const label = page.locator('.salon__label').first();
        await expect(label).toBeVisible();
        // Each piece is a real rendered poster image + a remix permalink.
        await expect(page.locator('.salon__piece img').first()).toBeVisible();
        await expect(label).toHaveAttribute('href', /\/app\?demo=showcase&view=poster#p=/);
        await label.click();
        // Lands in the studio with the sample repo loaded and a live preview.
        await expect(page.locator('.ps-canvas')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('.app-repo')).toHaveText('Project Atlas');
    });

    test('loads the about page', async ({ page }) => {
        await page.goto('/about');
        await expect(page.getByRole('heading', { name: /Jonathan Reed builds Git Sonar/ })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Make a poster' })).toBeVisible();
    });

    test('shows the front desk on the app page', async ({ page }) => {
        await loadApp(page);
        await expect(page.getByRole('heading', { name: 'Which repo are we hanging?' })).toBeVisible();
        await expect(page.getByPlaceholder('Paste a GitHub, GitLab or Bitbucket link')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Make poster' })).toBeVisible();
    });

    test('front desk fits a phone without clipping the heading', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await loadApp(page);
        await expect(page.getByRole('heading', { name: 'Which repo are we hanging?' })).toBeInViewport();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
    });

    test('the sample repo opens straight in the studio', async ({ page }) => {
        await loadApp(page);
        await page.getByRole('button', { name: /Use the sample repo/ }).click();
        await expect(page.locator('.ps-canvas')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('.app-repo')).toHaveText('Project Atlas');
        // Header stats read as words, not run together.
        await expect(page.locator('#app-stats')).toContainText('147 commits');
    });

    test('can load demo data into the History view', async ({ page }) => {
        await loadBranchingDemo(page);
        await expect(page.getByPlaceholder('Search commits...')).toBeVisible();
    });

    test('keyboard shortcuts work', async ({ page }) => {
        await loadBranchingDemo(page);
        
        // Press ? to open help
        await page.keyboard.press('?');
        const helpDialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
        await expect(helpDialog).toBeVisible();
        await expect(helpDialog).toHaveJSProperty('open', true);
        
        // Press Escape to close
        await page.keyboard.press('Escape');
        await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).not.toBeVisible();
    });

    test('search filters commits', async ({ page }) => {
        await loadBranchingDemo(page);
        
        // Focus search with / key
        await page.keyboard.press('/');
        await expect(page.getByPlaceholder('Search commits...')).toBeFocused();
        
        // Type a search query
        await page.keyboard.type('initial');
        // Should filter the list
        await expect(page.getByRole('listbox', { name: 'Commit list' })).toBeVisible();
    });

    test('poster studio renders a preview and exports', async ({ page }) => {
        await loadBranchingDemo(page);

        // Switch to the studio from the header.
        await page.getByRole('button', { name: 'Poster', exact: true }).click();

        // The studio preview canvas and the style rail should appear.
        await expect(page.locator('.ps-canvas')).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('button', { name: /Flow field/ })).toBeVisible();

        // Switching styles should keep the preview mounted and mark the pick.
        await page.getByRole('button', { name: /Flow field/ }).click();
        await expect(page.locator('.ps-canvas')).toBeVisible();
        await expect(page.getByRole('button', { name: /Flow field/ })).toHaveAttribute('aria-pressed', 'true');

        // Shuffling deals a second roll into the tray, and undo takes it back.
        await expect(page.locator('.ps-vars button')).toHaveCount(1);
        await page.getByRole('button', { name: 'Shuffle the composition' }).click();
        await expect(page.locator('.ps-vars button')).toHaveCount(2);
        await page.getByRole('button', { name: 'Undo' }).click();
        await expect(page.locator('.ps-vars button').first()).toHaveAttribute('aria-pressed', 'true');

        // Download asks what the poster is for; the SVG option downloads a file.
        await page.getByRole('button', { name: 'Download' }).click();
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.locator('[data-export="svg"]').click(),
        ]);
        expect(download.suggestedFilename()).toMatch(/\.svg$/);

        // The exported SVG must inline the real fonts (base64 @font-face) so it
        // renders with correct type off-machine — proves the /fonts/ fetch path.
        const fs = await import('node:fs/promises');
        const path = await download.path();
        const svg = await fs.readFile(path, 'utf-8');
        expect(svg).toContain('@font-face');
        expect(svg).toContain('data:font/ttf;base64,');
    });

    test('the light switch dims the gallery and is remembered', async ({ page }) => {
        await page.goto('/');
        const lights = page.getByRole('button', { name: 'Gallery lights' });
        await expect(lights).toHaveAttribute('aria-pressed', 'true');
        await lights.click();
        await expect(lights).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('html')).toHaveAttribute('data-lights', 'off');
        // Wall labels are paper: they keep dark ink in the dark.
        await expect(page.locator('.g-label').first()).toHaveCSS('color', 'rgb(22, 24, 26)');
        await page.goto('/about');
        await expect(page.locator('html')).toHaveAttribute('data-lights', 'off');
        await page.getByRole('button', { name: 'Gallery lights' }).click();
        await expect(page.locator('html')).not.toHaveAttribute('data-lights', 'off');
    });

    test('the sound button mutes the controls and is remembered', async ({ page }) => {
        await page.goto('/');
        const sounds = page.getByRole('button', { name: 'Sounds' });
        await expect(sounds).toHaveAttribute('aria-pressed', 'true');
        await sounds.click();
        await expect(sounds).toHaveAttribute('aria-pressed', 'false');
        await page.goto('/app');
        await expect(page.getByRole('button', { name: 'Sounds' })).toHaveAttribute('aria-pressed', 'false');
    });

    test('the collection hangs all fourteen styles', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'One repo, hung fourteen ways.' })).toBeVisible();
        await expect(page.locator('.salon__piece')).toHaveCount(14);
    });

    test('on a wall hangs the poster framed, to scale, over a bench', async ({ page }) => {
        await page.goto('/app?demo=showcase');
        await expect(page.locator('.ps-canvas')).toBeVisible({ timeout: 8000 });
        await page.getByRole('button', { name: /Transit map/ }).click();
        await page.getByRole('button', { name: 'On a wall' }).click();
        await page.selectOption('select[aria-label="Paper size"]', '24x36');
        await expect(page.locator('.ps-bench')).toBeVisible();
        await expect(page.locator('.ps-dim--w')).toHaveText('24 in');
        await expect(page.locator('.ps-dim--h').first()).toHaveText('36 in');
        // The sheet is drawn at wall size: 36 in tall against a 60 in bench.
        // (The redraw is debounced, so wait for it to settle.)
        await expect
            .poll(async () => {
                const sheet = await page.locator('.ps-canvas').boundingBox();
                const bench = await page.locator('.ps-bench').boundingBox();
                return sheet.height / bench.width;
            })
            .toBeCloseTo(36 / 60, 1);
        await page.getByRole('button', { name: 'Oak', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Oak', exact: true })).toHaveAttribute('aria-pressed', 'true');
    });

    for (const packed of [false, true]) {
        test(`opens a real project folder (${packed ? 'packed' : 'loose'} objects)`, async ({ page }) => {
            const repo = makeRepo({ packed });
            try {
                // Use the folder input every browser has, not the Chromium-only picker.
                await page.addInitScript(() => {
                    delete window.showDirectoryPicker;
                });
                await loadApp(page);
                const chooser = page.waitForEvent('filechooser');
                await page.getByRole('button', { name: /Open a folder on this computer/ }).click();
                await (await chooser).setFiles(repo);

                await expect(page.locator('.ps-canvas')).toBeVisible({ timeout: 10000 });
                // 6 commits by 2 people, one of them a merge.
                await expect(page.locator('#app-stats')).toContainText('6 commits');
                await expect(page.locator('#app-stats')).toContainText('2 authors');
                await expect(page.locator('#app-stats')).toContainText('1 merge');
                await expect(page.locator('.app-repo')).toHaveText(path.basename(repo));
            } finally {
                rmSync(repo, { recursive: true, force: true });
            }
        });
    }

    test('the studio plays the history and stamps a saved file', async ({ page }) => {
        await page.goto('/app?demo=showcase');
        await expect(page.locator('.ps-canvas')).toBeVisible({ timeout: 8000 });
        await page.getByRole('button', { name: 'Listen' }).click();
        await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
        await page.getByRole('button', { name: 'Stop' }).click();
        await expect(page.getByRole('button', { name: 'Listen' })).toBeVisible();

        await page.getByRole('button', { name: 'Download' }).click();
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.locator('[data-export="png"]').click(),
        ]);
        expect(download.suggestedFilename()).toBe('project-atlas-pulsar.png');
        await expect(page.locator('.ps-seal')).toBeVisible();
    });

    test('theme selector changes colors', async ({ page }) => {
        await loadBranchingDemo(page);
        
        // Change theme (the inspect-mode theme selector in the controls bar)
        const themeSelect = page.locator('#theme-select');
        await themeSelect.selectOption('github');
        
        // The art theme changes (GitHub Dark uses #0d1117 as base) while the
        // page chrome keeps its gallery palette.
        const body = page.locator('body');
        await expect(body).toHaveCSS('--art-base', '#0d1117');
        await expect(body).toHaveCSS('--rp-base', '#f7f7f4');
    });
});
