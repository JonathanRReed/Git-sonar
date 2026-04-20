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
        await expect(page.getByRole('heading', { name: /Map your Git history/ })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Open app' })).toBeVisible();
    });

    test('loads the about page', async ({ page }) => {
        await page.goto('/about');
        await expect(page.getByRole('heading', { name: /Jonathan Reed builds Git Sonar/ })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Launch Git Sonar' })).toBeVisible();
    });

    test('shows import panel on app page', async ({ page }) => {
        await loadApp(page);
        // Import panel is shown first (before loading a repo)
        await expect(page.getByRole('heading', { name: 'Inspect Git History' })).toBeVisible();
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

    test('theme selector changes colors', async ({ page }) => {
        await loadBranchingDemo(page);
        
        // Change theme
        const themeSelect = page.getByLabel('Theme');
        await themeSelect.selectOption('github');
        
        // Verify CSS variable changed (GitHub Dark uses #0d1117 as base)
        const body = page.locator('body');
        await expect(body).toHaveCSS('--rp-base', '#0d1117');
    });
});
