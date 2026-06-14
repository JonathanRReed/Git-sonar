/**
 * Festival lineup poster.
 *
 * Treats the repo's contributors as a music-festival lineup: the festival name
 * (repo/title) crowns the top in an expressive display face, the contributors
 * cascade down in descending tiers — top author HUGE as the headliner, the rest
 * shrinking by commit share like a Coachella/Glastonbury bill — separated by
 * thin middot rows. A short band of graph dots provides key-art texture, but
 * type is the hero. Degrades to a single huge headliner for one-author repos.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneText, SceneNode } from '../scene';
import { buildGraphScene, typeScale, formatDate, type Box } from '../compose';
import { fontStack } from '../fonts';
import { withAlpha } from '../palette';

const TITLE_FONT = 'Unbounded';   // expressive festival name
const NAME_FONT = 'BarlowCondensed'; // all-caps lineup names
const META_FONT = 'Oswald';          // dates / stats / watermark

/** Group ranked authors into descending lineup tiers (headliner first). */
function buildTiers(
    authors: { name: string; count: number; share: number }[],
    cap: number
): string[][] {
    const shown = authors.slice(0, cap);
    // Tier 0 = sole headliner. Tiers grow wider as we descend the bill.
    const tierSizes = [1, 2, 3, 4, 6, 8];
    const rows: string[][] = [];
    let idx = 0;
    let tier = 0;
    while (idx < shown.length) {
        const size = tierSizes[Math.min(tier, tierSizes.length - 1)];
        rows.push(shown.slice(idx, idx + size).map((a) => a.name.toUpperCase()));
        idx += size;
        tier++;
    }
    return rows;
}

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, rng } = ctx;
    const margin = Math.round(width * 0.075);
    const texts: SceneText[] = [];
    const scale = typeScale(width * 0.05, 1.3);

    // --- KEY ART: a thin band of graph dots, edges off, type stays the hero ---
    const bandY = height * 0.205;
    const artBox: Box = {
        x: margin,
        y: bandY,
        w: width - margin * 2,
        h: height * 0.05,
    };
    const { nodes: artNodes } = buildGraphScene(ctx, {
        layout: 'horizontal',
        box: artBox,
        baseRadius: Math.max(2, width / 220),
        fitPadding: 0,
        edges: false,
    });
    // Flatten the band into a single subtle dotted rule so it reads as key-art,
    // not a chart: project every dot to the band's vertical center.
    const bandCy = bandY + artBox.h / 2;
    const sceneNodes: SceneNode[] = artNodes.map((n) => ({
        ...n,
        y: bandCy,
        r: Math.max(1.5, n.r * 0.7),
        opacity: 0.7,
        glow: 0,
        shape: 'circle',
    }));

    // --- HEADER: festival name + date range ---
    const festivalName = (options.title || options.repoName || 'GIT FEST').toString().toUpperCase();
    // Single expressive line; shrink if the name is long so it always fits.
    const nameSize = scale(festivalName.length > 14 ? 0.7 : festivalName.length > 9 ? 1.2 : 1.7);
    texts.push(text(festivalName, width / 2, margin + nameSize * 0.85, {
        font: fontStack(TITLE_FONT), size: nameSize, weight: 700,
        color: palette.fg, align: 'middle', spacing: width * 0.001,
    }));

    // Date range as the festival dates (graceful when span is zero/unknown).
    const dates = signals.timeSpanMs > 0
        ? `${formatDate(signals.firstCommitMs)} — ${formatDate(signals.lastCommitMs)}`.toUpperCase()
        : (options.subtitle || 'A REPOSITORY IN CONCERT').toUpperCase();
    texts.push(text(dates, width / 2, margin + nameSize * 1.5, {
        font: fontStack(META_FONT), size: scale(-1.8), weight: 600,
        color: palette.accent, align: 'middle', spacing: width * 0.01,
    }));

    // --- LINEUP: tiered author names cascading down the central body ---
    const ranked = signals.rankedAuthors.length
        ? signals.rankedAuthors
        : [{ name: options.repoName || 'SOLO ARTIST', count: signals.commitCount, share: 1 }];
    const cap = 12;
    const capped = ranked.slice(0, cap);
    const tierRows = buildTiers(capped, cap);

    // Vertical space available for the lineup (below header, above footer).
    const lineupTop = height * 0.3;
    const lineupBottom = height * 0.86;
    const lineupH = lineupBottom - lineupTop;
    // Headliner gets the most vertical weight; weights decay per tier.
    const rowWeights = tierRows.map((_, i) => 1 / (i * 0.55 + 1));
    const weightSum = rowWeights.reduce((a, b) => a + b, 0);

    let cursorY = lineupTop;
    tierRows.forEach((names, ti) => {
        const slotH = (lineupH * rowWeights[ti]) / weightSum;
        const cy = cursorY + slotH * 0.5;
        // Headliner is biggest & accent; lower tiers shrink and fade.
        const tierSize = scale(1.6 - ti * 0.62);
        let size = Math.max(scale(-2.2), tierSize);
        const color = ti === 0 ? palette.accent : palette.fg;
        const opacity = ti === 0 ? 1 : Math.max(0.4, 1 - ti * 0.16);
        const joined = names.join('  ·  ');
        // Shrink the row so long real names don't overrun the frame (no canvas
        // text metrics here — estimate width from condensed-glyph average ~0.46em).
        const usable = width - margin * 2;
        const tracking = width * (ti === 0 ? 0.002 : 0.004);
        const estWidth = joined.length * size * 0.46 + (joined.length - 1) * tracking;
        if (estWidth > usable) size = Math.max(scale(-3), size * (usable / estWidth));
        texts.push(text(joined, width / 2, cy + size * 0.32, {
            font: fontStack(NAME_FONT), size, weight: ti === 0 ? 700 : 600,
            color, align: 'middle', spacing: tracking, opacity,
        }));

        // Thin middot separator rule between tiers (skip after the last row).
        if (ti < tierRows.length - 1) {
            const ruleY = cursorY + slotH;
            const dots = 5 + Math.floor(rng() * 3); // deterministic 5..7 dots
            const span = width * 0.32;
            const dotStr = Array.from({ length: dots }, () => '·').join('   ');
            texts.push(text(dotStr, width / 2, ruleY, {
                font: fontStack(NAME_FONT), size: scale(-2.6), weight: 600,
                color: withAlpha(palette.fgMuted, 0.55), align: 'middle', spacing: span / Math.max(1, dots),
            }));
        }
        cursorY += slotH;
    });

    // "+N more" when the lineup overflows the cap.
    if (ranked.length > cap) {
        texts.push(text(`+ ${ranked.length - cap} MORE`, width / 2, lineupBottom + scale(-2.6), {
            font: fontStack(META_FONT), size: scale(-2.4), weight: 500,
            color: withAlpha(palette.fg, 0.55), align: 'middle', spacing: width * 0.006,
        }));
    }

    // --- FOOTER: stats line + watermark ---
    const footerY = height - margin;
    const statBits = [
        `${signals.commitCount} COMMITS`,
        `${signals.authorCount} ${signals.authorCount === 1 ? 'ARTIST' : 'ARTISTS'}`,
        `${signals.mergeCount} MERGES`,
        `${signals.branchCount} ${signals.branchCount === 1 ? 'STAGE' : 'STAGES'}`,
    ];
    texts.push(text(statBits.join('   ·   '), width / 2, footerY - scale(-2.2), {
        font: fontStack(META_FONT), size: scale(-2.6), weight: 600,
        color: withAlpha(palette.fg, 0.8), align: 'middle', spacing: width * 0.004,
    }));

    if (options.showWatermark) {
        texts.push(text('PRESENTED BY GITSONAR.COM', width / 2, footerY, {
            font: fontStack(META_FONT), size: scale(-3.2), weight: 500,
            color: withAlpha(palette.fgMuted, 0.7), align: 'middle', spacing: width * 0.008,
        }));
    }
    if (options.showSignature && options.dateLabel) {
        texts.push(text(options.dateLabel.toUpperCase(), margin, margin * 0.7, {
            font: fontStack(META_FONT), size: scale(-3.4), weight: 500,
            color: withAlpha(palette.fgMuted, 0.6), align: 'start', spacing: width * 0.004,
        }));
    }

    return {
        width,
        height,
        background: {
            kind: 'gradient',
            color: palette.bg,
            color2: palette.bgAlt,
            angle: 180,
            vignette: 0.35,
            grain: 0.05,
        },
        strokes: [],
        edges: [],
        nodes: sceneNodes,
        texts,
        frame: { color: withAlpha(palette.accent, 0.25), width: Math.max(1, width * 0.0016), inset: margin * 0.5 },
        fontsUsed: [TITLE_FONT, NAME_FONT, META_FONT],
    };
}

function text(
    str: string,
    x: number,
    y: number,
    o: { font: string; size: number; weight: number; color: string; align: 'start' | 'middle' | 'end'; spacing?: number; opacity?: number }
): SceneText {
    return {
        id: `t-${Math.round(x)}-${Math.round(y)}-${str.slice(0, 6)}`,
        x, y, text: str,
        fontFamily: o.font, fontSize: o.size, fontWeight: o.weight, color: o.color, align: o.align,
        letterSpacing: o.spacing, opacity: o.opacity,
    };
}

export const festivalTemplate: PosterTemplate = {
    id: 'festival',
    name: 'Festival Lineup',
    group: 'cinematic',
    description: 'Contributors as a tiered festival bill — headliner top, supporting acts cascading down.',
    defaultAspect: 24 / 36,
    recommendedLayout: 'vertical',
    fonts: [TITLE_FONT, NAME_FONT, META_FONT],
    build,
};
