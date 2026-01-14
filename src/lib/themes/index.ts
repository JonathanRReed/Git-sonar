/**
 * Theme Definitions for Git Sonar
 * 
 * Includes Rosé Pine, GitHub Dark, Nord, and Dracula themes.
 */

import type { Theme, ThemeColors } from '@lib/git/types';

export type { Theme, ThemeColors };

/**
 * Rosé Pine Night (Dark) Theme
 * The classic dark mode theme.
 */
const ROSE_PINE_NIGHT: Theme = {
    id: 'night',
    name: 'Rosé Pine Night',
    variant: 'dark',
    colors: {
        base: '#191724',
        surface: '#1f1d2e',
        overlay: '#26233a',
        muted: '#6e6a86',
        subtle: '#908caa',
        text: '#e0def4',
        love: '#eb6f92',
        gold: '#f6c177',
        rose: '#ebbcba',
        pine: '#31748f',
        foam: '#9ccfd8',
        iris: '#c4a7e7',
        highlightLow: '#21202e',
        highlightMed: '#403d52',
        highlightHigh: '#524f67',
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

export const THEMES = {
    night: ROSE_PINE_NIGHT,
    dawn: ROSE_PINE_DAWN,
    github: GITHUB_DARK,
    nord: NORD,
    dracula: DRACULA,
} as const;

export type ThemeId = keyof typeof THEMES;

const THEME_STORAGE_KEY = 'git-sonar-theme';

/**
 * RGB color maps for new themes
 */
const THEME_RGB: Record<ThemeId, { base: string; surface: string; text: string }> = {
    night: {
        base: '25, 23, 36',
        surface: '31, 29, 46',
        text: '224, 222, 244',
    },
    dawn: {
        base: '250, 244, 237',
        surface: '255, 250, 243',
        text: '87, 82, 121',
    },
    github: {
        base: '13, 17, 23',
        surface: '22, 27, 34',
        text: '201, 209, 217',
    },
    nord: {
        base: '46, 52, 64',
        surface: '59, 66, 82',
        text: '236, 239, 244',
    },
    dracula: {
        base: '40, 42, 54',
        surface: '52, 55, 70',
        text: '248, 248, 242',
    },
};

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
 * Get theme by ID.
 */
export function getTheme(id: ThemeId): Theme {
    return THEMES[id];
}

/**
 * Apply theme colors to CSS variables.
 */
export function applyThemeToCSS(theme: Theme): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const c = theme.colors;
    const rgb = THEME_RGB[theme.id as ThemeId];
    
    const toRgb = (hex: string) => {
        const num = parseInt(hex.slice(1), 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `${r}, ${g}, ${b}`;
    };

    root.style.setProperty('--rp-base', c.base);
    root.style.setProperty('--rp-surface', c.surface);
    root.style.setProperty('--rp-overlay', c.overlay);
    root.style.setProperty('--rp-muted', c.muted);
    root.style.setProperty('--rp-subtle', c.subtle);
    root.style.setProperty('--rp-text', c.text);
    root.style.setProperty('--rp-love', c.love);
    root.style.setProperty('--rp-gold', c.gold);
    root.style.setProperty('--rp-rose', c.rose);
    root.style.setProperty('--rp-pine', c.pine);
    root.style.setProperty('--rp-foam', c.foam);
    root.style.setProperty('--rp-iris', c.iris);
    root.style.setProperty('--rp-highlight-low', c.highlightLow);
    root.style.setProperty('--rp-highlight-med', c.highlightMed);
    root.style.setProperty('--rp-highlight-high', c.highlightHigh);
    
    // Use pre-computed RGB values or fallback to computed values
    root.style.setProperty('--rp-base-rgb', rgb?.base ?? toRgb(c.base));
    root.style.setProperty('--rp-surface-rgb', rgb?.surface ?? toRgb(c.surface));
    root.style.setProperty('--rp-overlay-rgb', toRgb(c.overlay));
    root.style.setProperty('--rp-text-rgb', rgb?.text ?? toRgb(c.text));
}
