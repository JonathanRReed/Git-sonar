/**
 * Punch card: when the work actually happens. A card with a column per weekday
 * and a row per hour (UTC); a slot is punched wherever commits landed, wider
 * the more there were. The busiest slot is inked in the accent colour and the
 * footer says it in words.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneStroke, SceneText } from '../scene';
import { fontStack } from '../fonts';
import { withAlpha } from '../palette';
import { plural, poly, rect, text, titleOf } from './kit';
import { CREDIT } from '../../brand';

const TITLE_FONT = 'Oswald';
const MONO_FONT = 'JetBrainsMono';
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, graph, rng } = ctx;
    const margin = Math.round(width * 0.075);
    const strokes: SceneStroke[] = [];
    const texts: SceneText[] = [];

    // hour x weekday (Monday first), in UTC.
    const grid = Array.from({ length: 24 }, () => new Array<number>(7).fill(0));
    for (const c of graph.commits.values()) {
        if (!Number.isFinite(c.authoredAt)) continue;
        const d = new Date(c.authoredAt);
        grid[d.getUTCHours()][(d.getUTCDay() + 6) % 7]++;
    }
    let peak = 0;
    let peakHour = 0;
    let peakDay = 0;
    grid.forEach((row, h) => row.forEach((v, d) => {
        if (v > peak) {
            peak = v;
            peakHour = h;
            peakDay = d;
        }
    }));
    const weekend = grid.reduce((a, row) => a + row[5] + row[6], 0);

    // The card: ink-coloured stock with a clipped corner, like the real thing.
    const stock = palette.fg;
    const print = palette.bg;
    const cardX = margin;
    const cardY = height * 0.205;
    const cardW = width - margin * 2;
    const cardH = height * 0.615;
    const clip = cardW * 0.07;
    strokes.push(poly('card', [
        { x: cardX + clip, y: cardY },
        { x: cardX + cardW, y: cardY },
        { x: cardX + cardW, y: cardY + cardH },
        { x: cardX, y: cardY + cardH },
        { x: cardX, y: cardY + clip },
    ], stock));
    // A colour band along the top edge; the roll picks which side it hugs.
    const bandH = cardH * 0.018;
    strokes.push(rect('band', cardX + clip, cardY, cardW - clip, bandH, rng() < 0.5 ? palette.accent : palette.accent2));

    const padX = cardW * 0.11;
    const gridX = cardX + padX;
    const gridW = cardW - padX - cardW * 0.05;
    const headY = cardY + cardH * 0.075;
    const gridY = cardY + cardH * 0.1;
    const gridH = cardH - cardH * 0.1 - cardH * 0.035;
    const cw = gridW / 7;
    const ch = gridH / 24;
    const small = width * 0.0115;

    DAYS.forEach((d, i) => {
        texts.push(text(d, gridX + i * cw + cw / 2, headY, { font: fontStack(MONO_FONT), size: width * 0.0145, weight: 600, color: print, align: 'middle', spacing: width * 0.002 }));
    });

    for (let h = 0; h < 24; h++) {
        const y = gridY + h * ch;
        texts.push(text(String(h).padStart(2, '0'), gridX - cardW * 0.025, y + ch * 0.66, { font: fontStack(MONO_FONT), size: small, weight: 500, color: print, align: 'end' }));
        for (let d = 0; d < 7; d++) {
            const v = grid[h][d];
            const cx = gridX + d * cw + cw / 2;
            if (v === 0) {
                // Unpunched positions carry the printed row digit, as cards do.
                texts.push(text(String(h % 10), cx, y + ch * 0.66, { font: fontStack(MONO_FONT), size: small, weight: 400, color: print, align: 'middle', opacity: 0.28 }));
                continue;
            }
            const w = cw * (0.2 + 0.62 * Math.sqrt(v / peak));
            const isPeak = h === peakHour && d === peakDay;
            strokes.push(rect(`hole-${h}-${d}`, cx - w / 2, y + ch * 0.2, w, ch * 0.6, isPeak ? palette.accent : print));
        }
    }

    // Title block.
    const title = titleOf(ctx).toUpperCase();
    const titleSize = Math.min(width * 0.1, ((width - margin * 2) / Math.max(5, title.length)) * 2.1);
    texts.push(text(title, margin, margin + titleSize * 0.82, { font: fontStack(TITLE_FONT), size: titleSize, weight: 600, color: palette.fg, spacing: titleSize * 0.02 }));
    texts.push(text((options.subtitle || `When the work happens. ${plural(signals.commitCount, 'commit')}, by weekday and hour (UTC).`).toUpperCase(), margin, margin + titleSize * 0.82 + width * 0.034, {
        font: fontStack(MONO_FONT), size: width * 0.0152, weight: 500, color: palette.fgMuted, spacing: width * 0.0022,
    }));

    // The finding, in words.
    const footY = cardY + cardH + width * 0.055;
    const share = signals.commitCount > 0 ? Math.round((weekend / signals.commitCount) * 100) : 0;
    if (peak > 0) {
        texts.push(text(`Busiest slot: ${DAY_NAMES[peakDay]} at ${String(peakHour).padStart(2, '0')}:00`, margin, footY, {
            font: fontStack(TITLE_FONT), size: width * 0.034, weight: 500, color: palette.fg,
        }));
        texts.push(text(`${plural(peak, 'COMMIT')} LANDED THERE. ${share}% OF ALL COMMITS HAPPENED ON THE WEEKEND.`, margin, footY + width * 0.034, {
            font: fontStack(MONO_FONT), size: width * 0.014, weight: 500, color: palette.fgMuted, spacing: width * 0.0016,
        }));
    }
    if (options.showWatermark) {
        texts.push(text(CREDIT, width - margin, height - margin, {
            font: fontStack(MONO_FONT), size: width * 0.013, weight: 600, color: withAlpha(palette.fg, 0.5), align: 'end', spacing: width * 0.004,
        }));
    }

    return {
        width,
        height,
        background: { kind: 'solid', color: palette.bg },
        strokes,
        edges: [],
        nodes: [],
        texts,
        fontsUsed: [TITLE_FONT, MONO_FONT],
    };
}

export const punchCardTemplate: PosterTemplate = {
    id: 'punch-card',
    name: 'Punch card',
    group: 'data',
    description: 'A punched slot for every weekday and hour with commits.',
    defaultAspect: 24 / 36,
    fonts: [TITLE_FONT, MONO_FONT],
    build,
};
