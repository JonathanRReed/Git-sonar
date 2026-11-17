/**
 * Brand constants. The product name lives here so a rename is a one-file change
 * for every page, header and meta tag that shows it.
 *
 * Not covered: the credit line baked into exported posters (see `compose.ts`
 * and the templates) and storage keys, which keep their existing values so
 * saved themes and tokens survive a rename.
 */
export const BRAND = {
    name: 'Git Sonar',
    tagline: 'Every repo deserves a retrospective.',
    description:
        'Git Sonar turns a commit history into a poster you can print and frame. It runs in your browser, so your code is never uploaded.',
    siteUrl: 'https://gitsonar.jonathanrreed.com',
    repoUrl: 'https://github.com/JonathanRReed/Git-sonar',
    author: 'Jonathan Reed',
} as const;
