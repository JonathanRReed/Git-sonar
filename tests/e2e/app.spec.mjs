import { test, expect } from '@playwright/test';

async function loadApp(page) {
    await page.goto('/app');
    await page.waitForLoadState('networkidle');
}

async function loadBranchingDemo(page) {
    await loadApp(page);
    await page.getByRole('button', { name: /Load Demo/ }).click();
    await expect(page.getByRole('heading', { name: 'Commits' })).toBeVisible({ timeout: 5000 });
}

test.describe('Git Sonar app', () => {
    test('loads the landing page', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /Your Git history, as art/ })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Open app' })).toBeVisible();
    });

    test('landing gallery remixes a poster into the studio', async ({ page }) => {
        await page.goto('/');
        const card = page.locator('.gallery-card').first();
        await expect(card).toBeVisible();
        // Each card is a real rendered poster image + a remix permalink.
        await expect(card.locator('img')).toBeVisible();
        await expect(card).toHaveAttribute('href', /\/app\?demo=showcase&view=poster#p=/);
        await card.click();
        // Lands in the studio with the showcase repo loaded and a live preview.
        await expect(page.locator('.ps-canvas')).toBeVisible({ timeout: 8000 });
    });

    test('loads the about page', async ({ page }) => {
        await page.goto('/about');
        await expect(page.getByRole('heading', { name: /Jonathan Reed builds Git Sonar/ })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Launch Git Sonar' })).toBeVisible();
    });

    test('shows import panel on app page', async ({ page }) => {
        await loadApp(page);
        // Import panel is shown first (before loading a repo)
        await expect(page.getByRole('heading', { name: 'Make a poster from your repo' })).toBeVisible();
        await expect(page.getByPlaceholder('https://github.com/owner/repo or https://gitlab.com/owner/repo')).toBeVisible();
        await expect(page.getByLabel('Git visualization').getByRole('button', { name: 'Import' })).toBeVisible();
    });

    test('can load demo data', async ({ page }) => {
        await loadBranchingDemo(page);
        // Search input should be available
        await expect(page.getByPlaceholder('Search commits...')).toBeVisible();
    });

    test('keyboard shortcuts work', async ({ page }) => {
        await loadBranchingDemo(page);
        
        // Press ? to open help
        await page.keyboard.press('?');
        await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeVisible();
        
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

        // Enter Poster mode from the controls bar.
        await page.getByRole('button', { name: /^Poster$/ }).click();

        // The studio preview canvas and template gallery should appear.
        await expect(page.locator('.ps-canvas')).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('button', { name: /Flow Field/ })).toBeVisible();

        // Switching templates should keep the preview mounted.
        await page.getByRole('button', { name: /Pulsar/ }).click();
        await expect(page.locator('.ps-canvas')).toBeVisible();

        // Exporting SVG should trigger a file download.
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('button', { name: /^SVG$/ }).click(),
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

    test('theme selector changes colors', async ({ page }) => {
        await loadBranchingDemo(page);
        
        // Change theme (the inspect-mode theme selector in the controls bar)
        const themeSelect = page.locator('#theme-select');
        await themeSelect.selectOption('github');
        
        // Verify CSS variable changed (GitHub Dark uses #0d1117 as base)
        const body = page.locator('body');
        await expect(body).toHaveCSS('--rp-base', '#0d1117');
    });
});
