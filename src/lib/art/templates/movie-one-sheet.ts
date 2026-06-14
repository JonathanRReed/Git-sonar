/**
 * Movie one-sheet.
 *
 * Three stacked zones: KEY ART (the graph, ~60%), TITLE TREATMENT (cinematic
 * condensed display), and a BILLING BLOCK (tiny condensed all-caps credits auto-
 * generated from contributors/stats) — the single cheapest trick that makes a
 * composition read as a real theatrical poster.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneText } from '../scene';
import { buildGraphScene, billingLines, typeScale, wrapText, type Box } from '../compose';
import { fontStack } from '../fonts';
import { withAlpha, adjustLightness } from '../palette';

const TITLE_FONT = 'Anton';
const SUB_FONT = 'Oswald';
const BILLING_FONT = 'BarlowCondensed';

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options } = ctx;
    const margin = Math.round(width * 0.06);
    const texts: SceneText[] = [];
    const scale = typeScale(width * 0.045, 1.33);

    // KEY ART — top ~60%
    const artBox: Box = {
        x: margin,
        y: height * 0.05,
        w: width - margin * 2,
        h: height * 0.58,
    };
    const { nodes, edges, sampledFrom } = buildGraphScene(ctx, {
        layout: ctx.layout,
        box: artBox,
        fitPadding: width * 0.02,
    });

    // Promote a focal node (HEAD/biggest) as an accent hero.
    if (nodes.length) {
        const hero = nodes.reduce((a, b) => (b.r > a.r ? b : a), nodes[0]);
        hero.fill = palette.accent2;
        hero.r *= 1.5;
        hero.glow = 1;
    }

    // TITLE — cinematic, centered in the lower-middle band
    const titleBandY = height * 0.7;
    const title = (options.title || options.repoName || 'UNTITLED').toUpperCase();
    const titleLines = wrapText(title, 14, 2);
    const titleSize = titleLines.length > 1 ? scale(1.4) : scale(2.1);
    titleLines.forEach((line, i) => {
        texts.push(text(line, width / 2, titleBandY + titleSize * i * 0.92, {
            font: fontStack(TITLE_FONT), size: titleSize, weight: 400, color: palette.fg, align: 'middle', spacing: width * 0.002,
        }));
    });

    // Tagline / subtitle
    const subY = titleBandY + titleSize * titleLines.length * 0.92 + scale(-0.4);
    const tagline = options.subtitle || defaultTagline(signals);
    if (tagline) {
        texts.push(text(tagline.toUpperCase(), width / 2, subY, {
            font: fontStack(SUB_FONT), size: scale(-1.6), weight: 500, color: palette.accent, align: 'middle', spacing: width * 0.006,
        }));
    }

    // BILLING BLOCK — tiny condensed all-caps at the very bottom
    const billing = billingLines(ctx);
    // Honesty: when the graph was downsampled, say so rather than implying the
    // art shows all N commits.
    if (sampledFrom > 0) billing.unshift(`KEY ART SHOWS ${nodes.length} OF ${sampledFrom.toLocaleString()} COMMITS`);
    const billSize = scale(-3.4);
    const billStart = height - margin - billing.length * billSize * 1.5;
    billing.forEach((line, i) => {
        texts.push(text(line, width / 2, billStart + i * billSize * 1.5, {
            font: fontStack(BILLING_FONT), size: billSize, weight: i === 0 ? 600 : 400,
            color: i === 0 ? withAlpha(palette.fg, 0.92) : withAlpha(palette.fg, 0.7), align: 'middle', spacing: width * 0.0015,
        }));
    });

    return {
        width,
        height,
        background: {
            kind: 'gradient',
            color: adjustLightness(palette.bg, -0.02),
            color2: palette.bgAlt,
            angle: 160,
            vignette: 0.45,
            grain: 0.06,
        },
        strokes: [],
        edges,
        nodes,
        texts,
        frame: { color: withAlpha(palette.fg, 0.14), width: Math.max(1, width * 0.0015), inset: margin * 0.5 },
        fontsUsed: [TITLE_FONT, SUB_FONT, BILLING_FONT],
    };
}

function defaultTagline(signals: { authorCount: number; timeSpanMs: number }): string {
    const years = signals.timeSpanMs / (1000 * 60 * 60 * 24 * 365);
    if (years >= 1) return `A ${years.toFixed(0)}-year story in ${signals.authorCount} hands`;
    return `Built by ${signals.authorCount}`;
}

function text(
    str: string,
    x: number,
    y: number,
    o: { font: string; size: number; weight: number; color: string; align: 'start' | 'middle' | 'end'; spacing?: number }
): SceneText {
    return {
        id: `t-${Math.round(x)}-${Math.round(y)}-${str.slice(0, 6)}`,
        x, y, text: str,
        fontFamily: o.font, fontSize: o.size, fontWeight: o.weight, color: o.color, align: o.align,
        letterSpacing: o.spacing,
    };
}

export const movieOneSheetTemplate: PosterTemplate = {
    id: 'movie-one-sheet',
    name: 'Movie One-Sheet',
    group: 'cinematic',
    description: 'Key-art graph, cinematic title, and an auto-generated billing block of contributors & stats.',
    defaultAspect: 24 / 36,
    recommendedLayout: 'vertical',
    fonts: [TITLE_FONT, SUB_FONT, BILLING_FONT],
    build,
};
