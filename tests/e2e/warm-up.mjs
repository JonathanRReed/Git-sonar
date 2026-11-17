import { chromium } from '@playwright/test';

/**
 * Visit each page once before the tests start. The dev server compiles a page
 * and prebundles its dependencies on first request, which takes longer than a
 * test's timeout right after a build.
 */
export default async function warmUp(config) {
    const { baseURL } = config.projects[0].use;
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        for (const route of ['/', '/about', '/app?demo=branching&view=inspect', '/app?demo=showcase']) {
            await page.goto(baseURL + route, { waitUntil: 'networkidle', timeout: 120_000 });
        }
        await page.locator('.ps-canvas').waitFor({ timeout: 120_000 });
    } finally {
        await browser.close();
    }
}
