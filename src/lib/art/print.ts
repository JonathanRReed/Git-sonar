/**
 * Print-on-demand groundwork.
 *
 * The print-ready artifact already exists: `posterToPDFBlob` emits a true-vector,
 * correctly-dimensioned PDF with bleed + crop marks. What POD additionally needs
 * is (a) a normalized print spec and (b) a fulfillment seam.
 *
 * NOTE ON FULFILLMENT: actually placing an order with a dropship partner
 * (Printful / Gelato / Prodigi) requires the site owner's account + API key and
 * a tiny serverless endpoint to keep that key off the client — Git Sonar is
 * otherwise strictly static/no-server. So this module defines the *seam* and the
 * spec; wiring a concrete provider is a deliberate, owner-credentialed follow-up
 * rather than something to hardcode blind. `validatePrintSpec` lets the UI warn
 * before any of that (resolution too low, unsupported size, gamut caveat).
 */

import type { PosterConfig } from './poster-config';
import { POSTER_SIZES } from './sizes';

export interface PrintSpec {
    /** Trim size in inches (orientation-resolved). */
    widthIn: number;
    heightIn: number;
    /** Target print resolution. */
    dpi: number;
    /** Bleed per side in inches. */
    bleedIn: number;
    /** Human size label. */
    sizeName: string;
    /** Always sRGB — browsers cannot truly produce CMYK; the print RIP converts. */
    colorSpace: 'sRGB';
    /** Whether the chosen color is gamut-nudged for print. */
    printSafe: boolean;
}

const DEFAULT_BLEED_IN = 0.125;

/** Derive a normalized print spec from a poster config (print sizes only). */
export function getPrintSpec(cfg: PosterConfig): PrintSpec | null {
    const spec = POSTER_SIZES[cfg.size];
    if (!spec.inches) return null; // native/social sizes aren't print targets
    const portrait = cfg.orientation === 'portrait';
    return {
        widthIn: portrait ? spec.inches.w : spec.inches.h,
        heightIn: portrait ? spec.inches.h : spec.inches.w,
        dpi: 300,
        bleedIn: DEFAULT_BLEED_IN,
        sizeName: spec.name,
        colorSpace: 'sRGB',
        printSafe: cfg.printSafe,
    };
}

export interface PrintValidation {
    ok: boolean;
    warnings: string[];
}

/** Surface print-readiness warnings for the UI before any order/export. */
export function validatePrintSpec(cfg: PosterConfig): PrintValidation {
    const spec = getPrintSpec(cfg);
    const warnings: string[] = [];
    if (!spec) {
        return { ok: false, warnings: ['Choose a print size (A4–A1, 18×24, 24×36) to order a print.'] };
    }
    if (!cfg.printSafe) {
        warnings.push('Colors are sRGB; saturated accents may shift in CMYK printing. Enable “print-safe color” for safer results.');
    }
    // 24×36 @ 300dpi raster exceeds browser canvas caps — export uses vector PDF.
    if (spec.widthIn * spec.heightIn * spec.dpi * spec.dpi > 16_000_000) {
        warnings.push('At this size, export the vector PDF (not PNG) for full print resolution.');
    }
    return { ok: true, warnings };
}

/**
 * Fulfillment seam. A concrete provider (Printful/Gelato/Prodigi) implements
 * this against a serverless endpoint that holds the API key. Intentionally
 * unimplemented here — see the module header.
 */
export interface PrintProvider {
    id: string;
    name: string;
    /** Submit a print order; returns a checkout/confirmation URL. */
    createOrder(spec: PrintSpec, artwork: Blob): Promise<{ checkoutUrl: string }>;
}

/** No provider configured yet — the UI should route to a "coming soon" / contact flow. */
export const PRINT_PROVIDER: PrintProvider | null = null;
