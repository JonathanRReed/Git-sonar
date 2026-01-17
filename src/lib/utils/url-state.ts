/**
 * URL State Management for Git Sonar
 * 
 * Handles encoding and decoding application state to/from URL parameters
 * for shareable links.
 */

import type { ViewMode, LayoutMode } from '@lib/store/graph-store';
import type { ThemeId } from '@lib/themes';

export interface ShareableState {
    /** Repository provider and path */
    github?: string;
    gitlab?: string;
    bitbucket?: string;
    /** Theme ID */
    theme?: ThemeId;
    /** Layout mode */
    layout?: LayoutMode;
    /** View mode */
    view?: ViewMode;
    /** Selected commit SHA (short) */
    commit?: string;
}

const VALID_THEMES: ThemeId[] = ['night', 'dawn', 'github', 'nord', 'dracula'];
const VALID_LAYOUTS: LayoutMode[] = ['vertical', 'horizontal', 'radial'];
const VALID_VIEWS: ViewMode[] = ['inspect', 'poster', 'calendar'];

/**
 * Parse URL parameters into shareable state
 */
export function parseUrlState(search: string): ShareableState {
    const params = new URLSearchParams(search);
    const state: ShareableState = {};

    // Repository
    const github = params.get('github');
    const gitlab = params.get('gitlab');
    const bitbucket = params.get('bitbucket');

    if (github) state.github = github;
    if (gitlab) state.gitlab = gitlab;
    if (bitbucket) state.bitbucket = bitbucket;

    // Theme
    const theme = params.get('theme');
    if (theme && VALID_THEMES.includes(theme as ThemeId)) {
        state.theme = theme as ThemeId;
    }

    // Layout
    const layout = params.get('layout');
    if (layout && VALID_LAYOUTS.includes(layout as LayoutMode)) {
        state.layout = layout as LayoutMode;
    }

    // View
    const view = params.get('view');
    if (view && VALID_VIEWS.includes(view as ViewMode)) {
        state.view = view as ViewMode;
    }

    // Selected commit
    const commit = params.get('commit');
    if (commit && /^[a-f0-9]{7,40}$/i.test(commit)) {
        state.commit = commit.toLowerCase();
    }

    return state;
}

/**
 * Generate a shareable URL from current state
 */
export function generateShareableUrl(state: ShareableState): string {
    const url = new URL(window.location.href);
    const params = new URLSearchParams();

    // Repository - only include one provider
    if (state.github) {
        params.set('github', state.github);
    } else if (state.gitlab) {
        params.set('gitlab', state.gitlab);
    } else if (state.bitbucket) {
        params.set('bitbucket', state.bitbucket);
    }

    // Only include non-default values
    if (state.theme && state.theme !== 'night') {
        params.set('theme', state.theme);
    }

    if (state.layout && state.layout !== 'vertical') {
        params.set('layout', state.layout);
    }

    if (state.view && state.view !== 'inspect') {
        params.set('view', state.view);
    }

    if (state.commit) {
        params.set('commit', state.commit.substring(0, 7));
    }

    url.search = params.toString();
    return url.toString();
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    } catch {
        return false;
    }
}
