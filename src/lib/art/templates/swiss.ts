/**
 * Swiss / International Typographic poster.
 *
 * Strict grid, flush-left sans, generous negative space, the graph in an
 * asymmetric off-center module. The lowest-effort/highest-payoff template and
 * the one that validates the slot+type system; degrades gracefully for any repo.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneText } from '../scene';
import { buildGraphScene, typeScale, formatDate, formatCompact, wrapText, type Box } from '../compose';
import { fontStack } from '../fonts';
import { withAlpha } from '../palette';

const TITLE_FONT = 'SpaceGrotesk';
const BODY_FONT = 'Inter';
const MONO_FONT = 'JetBrainsMono';

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options } = ctx;
    const margin = Math.round(width * 0.075);
    const texts: SceneText[] = [];
    const scale = typeScale(width * 0.05, 1.25);

    // Asymmetric key-art module: right ~58%, lower ~70% — leaves an empty
    // top-left quadrant for the title (intentional negative space).
    const artBox: Box = {
        x: width * 0.4,
        y: height * 0.26,
        w: width * 0.6 - margin,
        h: height * 0.68,
    };
    const { nodes, edges, sampledFrom } = buildGraphScene(ctx, {
        layout: ctx.layout,
        box: artBox,
        fitPadding: width * 0.01,
    });

    // Eyebrow (notes downsampling so the dot count isn't read as the full repo)
    const eyebrow = sampledFrom > 0
        ? `${signals.commitCount} COMMITS · ${signals.authorCount} AUTHORS · SHOWING ${nodes.length}`
        : `${signals.commitCount} COMMITS · ${signals.authorCount} AUTHORS`;
    texts.push(text(eyebrow, margin, margin + scale(-1), {
        font: fontStack(MONO_FONT), size: scale(-2.4), weight: 500, color: palette.accent, align: 'start', spacing: width * 0.004,
    }));

    // Repo name — large flush-left, wrapped
    const title = (options.title || options.repoName || 'repository').toString();
    const titleLines = wrapText(title, 12, 3);
    const titleSize = scale(1.2);
    titleLines.forEach((line, i) => {
        texts.push(text(line.toUpperCase(), margin, margin + scale(0.6) + titleSize * (i + 1) * 0.98, {
            font: fontStack(TITLE_FONT), size: titleSize, weight: 700, color: palette.fg, align: 'start',
        }));
    });

    // Subtitle
    if (options.subtitle) {
        const sy = margin + scale(0.6) + titleSize * (titleLines.length + 0.7);
        texts.push(text(options.subtitle, margin, sy, {
            font: fontStack(BODY_FONT), size: scale(-1), weight: 400, color: palette.fgMuted, align: 'start',
        }));
    }

    // Stats block bottom-left (data-print foregrounds the numbers)
    const stats: [string, string][] = [
        ['COMMITS', `${signals.commitCount}`],
        ['AUTHORS', `${signals.authorCount}`],
        ['MERGES', `${signals.mergeCount}`],
        ['BRANCHES', `${signals.branchCount}`],
    ];
    if (signals.hasChurn) stats.push(['NET LINES', `+${formatCompact(signals.totalAdditions)} −${formatCompact(signals.totalDeletions)}`]);
    const blockTop = height - margin - stats.length * scale(-0.2) * 2.1;
    stats.forEach((row, i) => {
        const y = blockTop + i * scale(-0.2) * 2.1;
        texts.push(text(row[0], margin, y, { font: fontStack(MONO_FONT), size: scale(-3), weight: 500, color: palette.fgMuted, align: 'start', spacing: width * 0.003 }));
        texts.push(text(row[1], margin, y + scale(-1), { font: fontStack(TITLE_FONT), size: scale(-0.6), weight: 700, color: palette.fg, align: 'start' }));
    });

    // Date range footer
    if (signals.timeSpanMs > 0) {
        texts.push(text(`${formatDate(signals.firstCommitMs)} — ${formatDate(signals.lastCommitMs)}`.toUpperCase(), width - margin, height - margin, {
            font: fontStack(MONO_FONT), size: scale(-3), weight: 500, color: palette.fgMuted, align: 'end', spacing: width * 0.002,
        }));
    }

    if (options.showWatermark) {
        texts.push(text('GITSONAR.COM', width - margin, margin, { font: fontStack(MONO_FONT), size: scale(-3.2), weight: 600, color: withAlpha(palette.fg, 0.5), align: 'end', spacing: width * 0.005 }));
    }

    return {
        width,
        height,
        background: { kind: 'solid', color: palette.bg },
        strokes: [],
        edges,
        nodes,
        texts,
        fontsUsed: [TITLE_FONT, BODY_FONT, MONO_FONT],
    };
}

function text(
    str: string,
    x: number,
    y: number,
    o: { font: string; size: number; weight: number; color: string; align: 'start' | 'middle' | 'end'; spacing?: number }
): SceneText {
    return {
        id: `t-${x}-${y}-${str.slice(0, 6)}`,
        x, y, text: str,
        fontFamily: o.font, fontSize: o.size, fontWeight: o.weight, color: o.color, align: o.align,
        letterSpacing: o.spacing,
    };
}

export const swissTemplate: PosterTemplate = {
    id: 'swiss',
    name: 'Swiss Grid',
    group: 'data',
    description: 'Strict-grid minimalist typographic print foregrounding the repo stats.',
    defaultAspect: 18 / 24,
    recommendedLayout: 'vertical',
    fonts: [TITLE_FONT, BODY_FONT, MONO_FONT],
    build,
};
