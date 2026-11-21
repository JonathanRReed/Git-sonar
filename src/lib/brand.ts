/**
 * Brand constants. The product name lives here so a rename is a one-file change
 * for every page, header and meta tag that shows it.
 *
 * Not covered: storage keys, which keep their existing values so saved themes
 * and tokens survive a rename.
 */
export const BRAND = {
    name: 'Git Sonar',
    tagline: 'Turn your Git repo into a poster.',
    description:
        'Turn a Git commit history into a poster you can print and frame. Runs right in your browser, so your code never gets uploaded.',
    siteUrl: 'https://gitsonar.jonathanrreed.com',
    repoUrl: 'https://github.com/JonathanRReed/Git-sonar',
    author: 'Jonathan Reed',
} as const;

/** The credit line printed on posters: the site's address, as a poster would set it. */
export const CREDIT = new URL(BRAND.siteUrl).host.toUpperCase();
