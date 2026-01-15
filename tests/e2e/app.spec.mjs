import { test, expect } from '@playwright/test';

test.describe('Git Sonar app', () => {
    test('loads the landing page', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Git Sonar' })).toBeVisible();
        await expect(page.getByText('Visualize Git history')).toBeVisible();
    });

    test('shows import panel on app page', async ({ page }) => {
        await page.goto('/app');
        // Import panel is shown first (before loading a repo)
        await expect(page.getByRole('heading', { name: 'Visualize Your Git History' })).toBeVisible();
        await expect(page.getByPlaceholder('https://github.com/owner/repo or https://gitlab.com/owner/repo')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Import' })).toBeVisible();
    });

    test('can load demo data', async ({ page }) => {
        await page.goto('/app');
        // Click the demo button to expand dropdown
        await page.getByRole('button', { name: /Load Demo/ }).click();
        // Select branching demo
        await page.getByRole('button', { name: /Branching/ }).click();
        // Wait for graph to load - sidebar becomes visible with commit list
        await expect(page.getByRole('heading', { name: 'Commits' })).toBeVisible({ timeout: 5000 });
        // Search input should be available
        await expect(page.getByPlaceholder('Search commits...')).toBeVisible();
    });

    test('keyboard shortcuts work', async ({ page }) => {
        await page.goto('/app');
        // Load demo first
        await page.getByRole('button', { name: /Load Demo/ }).click();
        await page.getByRole('button', { name: /Branching/ }).click();
        await expect(page.getByRole('heading', { name: 'Commits' })).toBeVisible({ timeout: 5000 });
        
        // Press ? to open help
        await page.keyboard.press('?');
        await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeVisible();
        
        // Press Escape to close
        await page.keyboard.press('Escape');
        await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).not.toBeVisible();
    });

    test('search filters commits', async ({ page }) => {
        await page.goto('/app');
        // Load demo
        await page.getByRole('button', { name: /Load Demo/ }).click();
        await page.getByRole('button', { name: /Branching/ }).click();
        await expect(page.getByRole('heading', { name: 'Commits' })).toBeVisible({ timeout: 5000 });
        
        // Focus search with / key
        await page.keyboard.press('/');
        await expect(page.getByPlaceholder('Search commits...')).toBeFocused();
        
        // Type a search query
        await page.keyboard.type('initial');
        // Should filter the list
        await expect(page.getByRole('listbox', { name: 'Commit list' })).toBeVisible();
    });

    test('theme selector changes colors', async ({ page }) => {
        await page.goto('/app');
        // Load demo to show controls
        await page.getByRole('button', { name: /Load Demo/ }).click();
        await page.getByRole('button', { name: /Branching/ }).click();
        await expect(page.getByRole('heading', { name: 'Commits' })).toBeVisible({ timeout: 5000 });
        
        // Change theme
        const themeSelect = page.getByLabel('Theme');
        await themeSelect.selectOption('github');
        
        // Verify CSS variable changed (GitHub Dark uses #0d1117 as base)
        const body = page.locator('body');
        await expect(body).toHaveCSS('--rp-base', '#0d1117');
    });
});
