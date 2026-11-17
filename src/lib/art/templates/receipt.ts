/**
 * Receipt: the repo, itemised. A till receipt with torn edges that lists who
 * did the work and what it came to, with a barcode cut from the head commit's
 * hash. The wacky one, and the one people tend to post.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneStroke, SceneText, Vec2 } from '../scene';
import { fontStack } from '../fonts';
import { adjustLightness, withAlpha } from '../palette';
import { formatCompact } from '../compose';
import { poly, rect, shortDate, text, titleOf } from './kit';
import { CREDIT } from '../../brand';

const MONO_FONT = 'JetBrainsMono';
/** Characters across the receipt. */
const COLS = 32;

type Row =
    | { kind: 'pair'; left: string; right: string; bold?: boolean }
    | { kind: 'center'; text: string; bold?: boolean; big?: boolean }
    | { kind: 'rule'; char: string }
    | { kind: 'gap' }
    | { kind: 'barcode' };

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, graph, rng } = ctx;
    const strokes: SceneStroke[] = [];
    const texts: SceneText[] = [];

    const dark = palette.variant === 'dark';
    const paper = dark ? adjustLightness(palette.fg, 0.04) : '#fffefa';
    const ink = dark ? palette.bg : palette.fg;
    const head = (graph.defaultHead || graph.topoOrder[graph.topoOrder.length - 1] || '0000000').toString();

    // ---- what is on the receipt --------------------------------------------
    const rows: Row[] = [];
    const title = titleOf(ctx).toUpperCase();
    rows.push({ kind: 'center', text: title.length > 18 ? `${title.slice(0, 17)}…` : title, bold: true, big: true });
    rows.push({ kind: 'center', text: (options.subtitle || 'COMMIT HISTORY, ITEMISED').toUpperCase().slice(0, COLS) });
    if (signals.timeSpanMs > 0) {
        rows.push({ kind: 'center', text: `${shortDate(signals.firstCommitMs)} TO ${shortDate(signals.lastCommitMs)}` });
    }
    rows.push({ kind: 'rule', char: '-' });
    rows.push({ kind: 'pair', left: 'QTY  AUTHOR', right: 'SHARE', bold: true });
    const listed = signals.rankedAuthors.slice(0, 8);
    for (const a of listed) {
        const name = a.name.toUpperCase();
        rows.push({
            kind: 'pair',
            left: `${String(a.count).padStart(3, ' ')}  ${name.length > 17 ? `${name.slice(0, 16)}…` : name}`,
            right: `${(a.share * 100).toFixed(1)}%`,
        });
    }
    const others = signals.rankedAuthors.length - listed.length;
    if (others > 0) {
        const rest = signals.rankedAuthors.slice(listed.length).reduce((n, a) => n + a.count, 0);
        rows.push({ kind: 'pair', left: `${String(rest).padStart(3, ' ')}  ${others} MORE`, right: `${((rest / Math.max(1, signals.commitCount)) * 100).toFixed(1)}%` });
    }
    rows.push({ kind: 'rule', char: '-' });
    rows.push({ kind: 'pair', left: 'MERGES', right: `${signals.mergeCount}` });
    rows.push({ kind: 'pair', left: 'BRANCHES', right: `${signals.branchCount}` });
    if (signals.hasChurn) {
        rows.push({ kind: 'pair', left: 'LINES ADDED', right: `+${formatCompact(signals.totalAdditions)}` });
        rows.push({ kind: 'pair', left: 'LINES REMOVED', right: `-${formatCompact(signals.totalDeletions)}` });
    }
    rows.push({ kind: 'pair', left: 'BUSIEST DAY', right: `${signals.peakDayCount} COMMITS` });
    rows.push({ kind: 'pair', left: 'LONGEST STREAK', right: `${signals.longestStreakDays} DAYS` });
    rows.push({ kind: 'pair', left: 'LONGEST BREAK', right: `${signals.longestGapDays} DAYS` });
    rows.push({ kind: 'rule', char: '=' });
    rows.push({ kind: 'pair', left: 'TOTAL COMMITS', right: signals.commitCount.toLocaleString('en-US'), bold: true });
    rows.push({ kind: 'rule', char: '=' });
    rows.push({ kind: 'gap' });
    rows.push({ kind: 'center', text: 'NO REFUNDS ON FORCE PUSHES' });
    rows.push({ kind: 'gap' });
    rows.push({ kind: 'barcode' });
    rows.push({ kind: 'center', text: head.slice(0, 7) });
    if (options.showWatermark) rows.push({ kind: 'center', text: CREDIT });

    // ---- the paper, sized to its contents -----------------------------------
    const units = rows.reduce((n, r) => n + (r.kind === 'barcode' ? 3 : r.kind === 'center' && r.big ? 1.9 : r.kind === 'gap' ? 0.6 : 1), 0);
    const maxPaperH = height * 0.9;
    let paperW = width * 0.62;
    let fs = (paperW * 0.84) / COLS / 0.6;
    let lh = fs * 1.55;
    let padY = fs * 2.4;
    let paperH = units * lh + padY * 2;
    if (paperH > maxPaperH) {
        const k = maxPaperH / paperH;
        paperW *= k;
        fs *= k;
        lh *= k;
        padY *= k;
        paperH = maxPaperH;
    }
    const px = (width - paperW) / 2;
    const py = (height - paperH) / 2;
    const tooth = paperW / 36;

    // Torn edges top and bottom; the roll decides how ragged.
    const edge = (y: number, dir: 1 | -1): Vec2[] => {
        const pts: Vec2[] = [];
        for (let i = 0; i <= 36; i++) {
            pts.push({ x: px + i * tooth, y: y + (i % 2 === 0 ? 0 : dir * tooth * (0.55 + rng() * 0.5)) });
        }
        return pts;
    };
    const outline = [...edge(py, -1), ...edge(py + paperH, 1).reverse()];
    const drop = width * 0.012;
    strokes.push(poly('shadow', outline.map((p) => ({ x: p.x + drop, y: p.y + drop * 1.4 })), withAlpha('#000000', dark ? 0.45 : 0.16)));
    strokes.push(poly('paper', outline, paper));

    // ---- print it ------------------------------------------------------------
    const left = px + paperW * 0.08;
    const right = px + paperW * 0.92;
    const mid = px + paperW / 2;
    const font = fontStack(MONO_FONT);
    let y = py + padY;
    for (const r of rows) {
        if (r.kind === 'gap') {
            y += lh * 0.6;
        } else if (r.kind === 'rule') {
            texts.push(text(r.char.repeat(COLS), mid, y + lh * 0.7, { font, size: fs, weight: 400, color: ink, align: 'middle', opacity: 0.7 }));
            y += lh;
        } else if (r.kind === 'center') {
            const size = r.big ? fs * 1.75 : fs;
            const h = r.big ? lh * 1.9 : lh;
            texts.push(text(r.text, mid, y + h * 0.72, { font, size, weight: r.bold ? 600 : 400, color: ink, align: 'middle', spacing: r.big ? size * 0.04 : fs * 0.06 }));
            y += h;
        } else if (r.kind === 'pair') {
            texts.push(text(r.left, left, y + lh * 0.7, { font, size: fs, weight: r.bold ? 600 : 400, color: ink }));
            texts.push(text(r.right, right, y + lh * 0.7, { font, size: fs, weight: r.bold ? 600 : 400, color: ink, align: 'end' }));
            y += lh;
        } else {
            // Barcode: bar and gap widths come from the head commit's hash.
            const barH = lh * 2.4;
            const digits = head.replace(/[^0-9a-f]/gi, '').padEnd(40, '0').slice(0, 40);
            const widths = [...digits].map((ch) => 1 + (parseInt(ch, 16) % 4));
            const totalUnits = widths.reduce((a, b) => a + b, 0);
            const unit = (paperW * 0.66) / totalUnits;
            let bx = mid - (totalUnits * unit) / 2;
            widths.forEach((w, i) => {
                if (i % 2 === 0) strokes.push(rect(`bar-${i}`, bx, y + lh * 0.2, w * unit, barH, ink));
                bx += w * unit;
            });
            y += lh * 3;
        }
    }

    return {
        width,
        height,
        background: { kind: 'solid', color: palette.bg, vignette: dark ? 0.25 : 0.08 },
        strokes,
        edges: [],
        nodes: [],
        texts,
        fontsUsed: [MONO_FONT],
    };
}

export const receiptTemplate: PosterTemplate = {
    id: 'receipt',
    name: 'Receipt',
    group: 'data',
    description: 'The repo, itemised: who did the work and what it came to, with a barcode from the head commit.',
    defaultAspect: 24 / 36,
    fonts: [MONO_FONT],
    build,
};
