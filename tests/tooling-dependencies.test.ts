import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';

const require = createRequire(import.meta.url);

test('lint schema dependency rejects oversized collections before parsing items', () => {
    const { z } = createRequire(require.resolve('eslint-plugin-react-hooks'))('zod');
    let visited = 0;
    const schema = z.array(z.string().superRefine(() => visited++)).max(2);
    expect(schema.safeParse(['one', 'two', 'three']).success).toBe(false);
    expect(visited).toBe(0);
    expect(schema.parse(['one', 'two'])).toEqual(['one', 'two']);
    expect(visited).toBe(2);
});

test('font HTTP client validates integrity without making external requests', async () => {
    const { MockAgent, fetch } = createRequire(require.resolve('unifont'))('undici');
    const dispatcher = new MockAgent();
    dispatcher.disableNetConnect();
    const body = 'local fixture';
    const integrity = `sha256-${createHash('sha256').update(body).digest('base64')}`;
    try {
        const pool = dispatcher.get('https://example.test');
        pool.intercept({ path: '/valid' }).reply(200, body);
        const response = await fetch('https://example.test/valid', { dispatcher, integrity });
        expect(await response.text()).toBe(body);
        pool.intercept({ path: '/mismatch' }).reply(200, 'different fixture');
        await expect(fetch('https://example.test/mismatch', { dispatcher, integrity })).rejects.toThrow();
    } finally {
        await dispatcher.close();
    }
});
