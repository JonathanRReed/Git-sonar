/**
 * Debug utilities for development logging.
 * These logs are stripped in production builds via dead code elimination.
 */

const isDev = import.meta.env?.DEV ?? (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');

/**
 * Log a debug message (only in development)
 */
export function debugLog(prefix: string, ...args: unknown[]): void {
    if (isDev) {
        // eslint-disable-next-line no-console
        console.log(`[${prefix}]`, ...args);
    }
}

/**
 * Log a warning message (only in development)
 */
export function debugWarn(prefix: string, ...args: unknown[]): void {
    if (isDev) {
        // eslint-disable-next-line no-console
        console.warn(`[${prefix}]`, ...args);
    }
}

/**
 * Log an error message (only in development)
 */
export function debugError(prefix: string, ...args: unknown[]): void {
    if (isDev) {
        // eslint-disable-next-line no-console
        console.error(`[${prefix}]`, ...args);
    }
}
