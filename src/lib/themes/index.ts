/**
 * Theme Definitions for Git Sonar
 * 
 * Includes Rosé Pine, GitHub Dark, Nord, and Dracula themes.
 */

import type { Theme, ThemeColors } from '@lib/git/types';

export type { Theme, ThemeColors };

/**
 * Git Sonar Night Theme
 * The default product theme, aligned with the landing page.
 */
const ROSE_PINE_NIGHT: Theme = {
    id: 'night',
    name: 'Git Sonar Night',
    variant: 'dark',
    colors: {
        base: '#080908',
        surface: '#10120f',
        overlay: '#1a1f1b',
        muted: '#777d74',
        subtle: '#b9b6ac',
        text: '#f4f0e8',
        love: '#d86f61',
        gold: '#f2b36d',
        rose: '#d6a49b',
        pine: '#29423d',
        foam: '#8fd3c7',
        iris: '#c8b58a',
        highlightLow: '#18201c',
        highlightMed: '#314038',
        highlightHigh: '#4b6258',
    },
};

/**
 * Rosé Pine Dawn (Light) Theme
 * A fresh, light mode variant.
 */
const ROSE_PINE_DAWN: Theme = {
    id: 'dawn',
    name: 'Rosé Pine Dawn',
    variant: 'light',
    colors: {
        base: '#faf4ed',
        surface: '#fffaf3',
        overlay: '#f2e9e1',
        muted: '#9893a5',
        subtle: '#797593',
        text: '#575279',
        love: '#b4637a',
        gold: '#ea9d34',
        rose: '#d7827e',
        pine: '#286983',
        foam: '#56949f',
        iris: '#907aa9',
        highlightLow: '#f4ede8',
        highlightMed: '#dfdad9',
        highlightHigh: '#cecacd',
    },
};

/**
 * GitHub Dark Theme
 * Inspired by GitHub's dark mode color palette.
 */
const GITHUB_DARK: Theme = {
    id: 'github',
    name: 'GitHub Dark',
    variant: 'dark',
    colors: {
        base: '#0d1117',
        surface: '#161b22',
        overlay: '#21262d',
        muted: '#8b949e',
        subtle: '#c9d1d9',
        text: '#c9d1d9',
        love: '#ff7b72',
        gold: '#d29922',
        rose: '#f0883e',
        pine: '#3fb950',
        foam: '#58a6ff',
        iris: '#bc8cff',
        highlightLow: '#21262d',
        highlightMed: '#30363d',
        highlightHigh: '#8b949e',
    },
};

/**
 * Nord Theme
 * Inspired by Nord color palette - an arctic, north-bluish color palette.
 */
const NORD: Theme = {
    id: 'nord',
    name: 'Nord',
    variant: 'dark',
    colors: {
        base: '#2e3440',
        surface: '#3b4252',
        overlay: '#434c5e',
        muted: '#81a1c1',
        subtle: '#d8dee9',
        text: '#eceff4',
        love: '#bf616a',
        gold: '#ebcb8b',
        rose: '#d08770',
        pine: '#a3be8c',
        foam: '#88c0d0',
        iris: '#5e81ac',
        highlightLow: '#3b4252',
        highlightMed: '#4c566a',
        highlightHigh: '#81a1c1',
    },
};

/**
 * Dracula Theme
 * Inspired by the Dracula color palette.
 */
const DRACULA: Theme = {
    id: 'dracula',
    name: 'Dracula',
    variant: 'dark',
    colors: {
        base: '#282a36',
        surface: '#343746',
        overlay: '#44475a',
        muted: '#6272a4',
        subtle: '#f8f8f2',
        text: '#f8f8f2',
        love: '#ff5555',
        gold: '#ffb86c',
        rose: '#bd93f9',
        pine: '#50fa7b',
        foam: '#8be9fd',
        iris: '#bd93f9',
        highlightLow: '#44475a',
        highlightMed: '#6272a4',
        highlightHigh: '#f1fa8c',
    },
};

/**
 * Gallery Paper
 * Off-white stock with ink and primaries: the house look, made for framing.
 */
const GALLERY_PAPER: Theme = {
    id: 'paper',
    name: 'Gallery Paper',
    variant: 'light',
    colors: {
        base: '#fbfaf5',
        surface: '#f1efe8',
        overlay: '#e4e1d8',
        muted: '#6f6d67',
        subtle: '#4a4844',
        text: '#16181a',
        love: '#b3261e',
        gold: '#e2a019',
        rose: '#7a4fb5',
        pine: '#2f7d5b',
        foam: '#d92b25',
        iris: '#1f4b8f',
        highlightLow: '#f1efe8',
        highlightMed: '#dcd9cf',
        highlightHigh: '#b9b6ac',
    },
};

/**
 * Blueprint
 * White line on cyanotype blue, like an architect's print.
 */
const BLUEPRINT: Theme = {
    id: 'blueprint',
    name: 'Blueprint',
    variant: 'dark',
    colors: {
        base: '#123a6b',
        surface: '#17457d',
        overlay: '#1d5192',
        muted: '#9dbde4',
        subtle: '#c9dcf3',
        text: '#f2f7ff',
        love: '#ff9d8a',
        gold: '#ffe08a',
        rose: '#ffc2e0',
        pine: '#a8f0c6',
        foam: '#eaf3ff',
        iris: '#8ec1ff',
        highlightLow: '#17457d',
        highlightMed: '#2a62a8',
        highlightHigh: '#8ec1ff',
    },
};

/**
 * Riso
 * Two-drum risograph inks on newsprint: federal blue and fluorescent pink.
 */
const RISO: Theme = {
    id: 'riso',
    name: 'Riso',
    variant: 'light',
    colors: {
        base: '#f2efe6',
        surface: '#e9e5da',
        overlay: '#dcd7ca',
        muted: '#62616b',
        subtle: '#3d3c44',
        text: '#1d2a6d',
        love: '#ff4c3b',
        gold: '#ffb511',
        rose: '#ff6f4c',
        pine: '#00a95c',
        foam: '#ff48b0',
        iris: '#3255a4',
        highlightLow: '#e9e5da',
        highlightMed: '#d3cec0',
        highlightHigh: '#a9a495',
    },
};

/** Acid Test: electric yellow fading to hot pink, inked in violet. */
const ACID: Theme = {
    id: 'acid',
    name: 'Acid Test',
    variant: 'light',
    wash: { color: '#ff8ad8', angle: 160 },
    inks: ['#6a00f4', '#ff2e63', '#0066ff', '#ff5a00', '#d400c8', '#008f66', '#2a0a4a', '#00a2ff'],
    colors: {
        base: '#f4ff3d',
        surface: '#e9f52e',
        overlay: '#d9e61f',
        muted: '#5b3a86',
        subtle: '#3d1f66',
        text: '#2a0a4a',
        love: '#ff2e63',
        gold: '#ff5a00',
        rose: '#d400c8',
        pine: '#008f66',
        foam: '#6a00f4',
        iris: '#0066ff',
        highlightLow: '#e9f52e',
        highlightMed: '#cfdc1a',
        highlightHigh: '#a8b400',
    },
};

/** Blacklight: a velvet poster under UV, neon on violet-black. */
const BLACKLIGHT: Theme = {
    id: 'blacklight',
    name: 'Blacklight',
    variant: 'dark',
    wash: { color: '#3a0a5c', angle: 200 },
    inks: ['#39ff14', '#ff2bd6', '#00e5ff', '#fff000', '#b967ff', '#ff6b00', '#ff3b3b', '#3d5afe'],
    colors: {
        base: '#0b0221',
        surface: '#150637',
        overlay: '#22104f',
        muted: '#9a86c8',
        subtle: '#cbbcf0',
        text: '#f4eeff',
        love: '#ff3b3b',
        gold: '#ff2bd6',
        rose: '#b967ff',
        pine: '#fff000',
        foam: '#39ff14',
        iris: '#00e5ff',
        highlightLow: '#1b0a42',
        highlightMed: '#35187a',
        highlightHigh: '#6a3fd0',
    },
};

/** Thermal: the repo through a heat camera, indigo cold to white-yellow hot. */
const THERMAL: Theme = {
    id: 'thermal',
    name: 'Thermal',
    variant: 'dark',
    wash: { color: '#4a0050', angle: 180 },
    inks: ['#fff200', '#ffb000', '#ff6a00', '#ff1e56', '#d100d1', '#7a00ff', '#00c2ff', '#ffffff'],
    colors: {
        base: '#0a0033',
        surface: '#16004d',
        overlay: '#2a0a66',
        muted: '#b39ad6',
        subtle: '#e6d5ff',
        text: '#fff6d6',
        love: '#ff1e56',
        gold: '#fff200',
        rose: '#ff5ea8',
        pine: '#00c2ff',
        foam: '#ff9d00',
        iris: '#b100e8',
        highlightLow: '#16004d',
        highlightMed: '#3d1480',
        highlightHigh: '#7a3fd0',
    },
};

/** Phosphor: a green CRT left on overnight. */
const PHOSPHOR: Theme = {
    id: 'phosphor',
    name: 'Phosphor',
    variant: 'dark',
    wash: { color: '#06240f', angle: 180 },
    inks: ['#39ff6a', '#c6ff4d', '#00c98b', '#9dffcf', '#1f8f4a', '#eaff00', '#00ffb3', '#6dff3a'],
    colors: {
        base: '#020b05',
        surface: '#06170c',
        overlay: '#0b2414',
        muted: '#4f9d63',
        subtle: '#8fe39b',
        text: '#c8ffc4',
        love: '#ff6b6b',
        gold: '#c6ff4d',
        rose: '#9dffcf',
        pine: '#1f8f4a',
        foam: '#39ff6a',
        iris: '#00c98b',
        highlightLow: '#06170c',
        highlightMed: '#124023',
        highlightHigh: '#2a7a44',
    },
};

/** Sherbet: pink paper melting into peach, with candy inks. */
const SHERBET: Theme = {
    id: 'sherbet',
    name: 'Sherbet',
    variant: 'light',
    wash: { color: '#ffe9c2', angle: 150 },
    inks: ['#ff3d7f', '#ff8c00', '#6f4dff', '#0fa697', '#e63946', '#ff5fa2', '#3b1b4a', '#00a6e0'],
    colors: {
        base: '#ffe0ec',
        surface: '#ffd3e3',
        overlay: '#ffc2d8',
        muted: '#85557f',
        subtle: '#5c3566',
        text: '#3b1b4a',
        love: '#e63946',
        gold: '#ff8c00',
        rose: '#ff5fa2',
        pine: '#0fa697',
        foam: '#ff3d7f',
        iris: '#6f4dff',
        highlightLow: '#ffd3e3',
        highlightMed: '#ffb3cf',
        highlightHigh: '#e889b0',
    },
};

/** Gold Leaf: gilt on lacquer black. */
const GOLD_LEAF: Theme = {
    id: 'goldleaf',
    name: 'Gold Leaf',
    variant: 'dark',
    wash: { color: '#221a08', angle: 135 },
    inks: ['#f9e08a', '#d4af37', '#b8860b', '#e9c46a', '#fff3c4', '#a67c00', '#c8553d', '#8d7a3a'],
    colors: {
        base: '#0d0b07',
        surface: '#161208',
        overlay: '#231c0d',
        muted: '#9c8a5a',
        subtle: '#d8c58c',
        text: '#f6e7b8',
        love: '#c8553d',
        gold: '#f9e08a',
        rose: '#e9c46a',
        pine: '#7d6b2a',
        foam: '#d4af37',
        iris: '#b8860b',
        highlightLow: '#161208',
        highlightMed: '#3a2f14',
        highlightHigh: '#7d6b2a',
    },
};

export const THEMES = {
    night: ROSE_PINE_NIGHT,
    dawn: ROSE_PINE_DAWN,
    paper: GALLERY_PAPER,
    riso: RISO,
    blueprint: BLUEPRINT,
    acid: ACID,
    blacklight: BLACKLIGHT,
    thermal: THERMAL,
    phosphor: PHOSPHOR,
    sherbet: SHERBET,
    goldleaf: GOLD_LEAF,
    github: GITHUB_DARK,
    nord: NORD,
    dracula: DRACULA,
} as const;

/** Every theme id, for validating links and saved settings. */
export const THEME_IDS = Object.keys(THEMES) as (keyof typeof THEMES)[];

export type ThemeId = keyof typeof THEMES;

const THEME_STORAGE_KEY = 'git-sonar-theme';

export const DEFAULT_THEME: ThemeId = 'night';

/**
 * Get the saved theme ID from localStorage.
 */
export function getSavedTheme(): ThemeId {
    if (typeof window === 'undefined') return DEFAULT_THEME;

    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved && saved in THEMES) {
            return saved as ThemeId;
        }
    } catch {
        // localStorage may be disabled or full
    }

    return DEFAULT_THEME;
}

/**
 * Save the theme ID to localStorage.
 */
export function saveTheme(themeId: ThemeId): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
        // localStorage may be disabled or full
    }
}

/**
 * Get theme by ID. Falls back to the default theme for unknown ids so a stale
 * or hand-edited permalink can never produce an undefined theme (which would
 * crash palette derivation downstream).
 */
export function getTheme(id: ThemeId): Theme {
    return THEMES[id] ?? THEMES[DEFAULT_THEME];
}

/**
 * Publish the art theme as CSS variables. The page chrome is a fixed gallery
 * palette (see global.css), so these are namespaced --art-* and only style
 * things that sit on the artwork itself.
 */
export function applyThemeToCSS(theme: Theme): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const c = theme.colors;

    root.style.setProperty('--art-base', c.base);
    root.style.setProperty('--art-surface', c.surface);
    root.style.setProperty('--art-overlay', c.overlay);
    root.style.setProperty('--art-muted', c.muted);
    root.style.setProperty('--art-subtle', c.subtle);
    root.style.setProperty('--art-text', c.text);
    root.style.setProperty('--art-accent', c.foam);
    root.style.setProperty('--art-accent-2', c.gold);
    root.dataset.artVariant = theme.variant;
}
