/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/lib/**/*.ts'],
        },
    },
    resolve: {
        alias: {
            '@lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
            '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
            '@styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
        },
    },
});
