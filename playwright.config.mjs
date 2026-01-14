import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    retries: process.env.CI ? 2 : 0,
    use: {
        baseURL: 'http://127.0.0.1:4321',
        trace: 'on-first-retry',
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 4321',
        port: 4321,
        reuseExistingServer: !process.env.CI,
    },
});
