/**
 * Album cover + tracklist.
 *
 * A square record sleeve: the top ~62% is a generative "cover mark" — the commit
 * graph rendered radially as a vinyl/sunburst inside a square key-art box, backed
 * by a couple of faint concentric rings and with the largest node promoted to an
 * accent "hero". The bottom ~38% is a numbered, mono-set TRACKLIST derived from
 * the commit log ("NN  TITLE ........ M:SS"), under an artist + album title block.
 * Restrained duotone feel; degrades cleanly for tiny / single-author repos.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneText, SceneStroke, Vec2 } from '../scene';
import { buildGraphScene, trackList, truncate, type Box } from '../compose';
import { fontStack } from '../fonts';
import { withAlpha } from '../palette';

const ARTIST_FONT = 'Unbounded'; // album "artist" / title display face
const ALBUM_FONT = 'Syne'; // secondary display
const MONO_FONT = 'JetBrainsMono'; // tracklist + meta

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, rng } = ctx;
    const texts: SceneText[] = [];
    const strokes: SceneStroke[] = [];
    const margin = Math.round(width * 0.07);

    // Square cover mark in the top band, tracklist in the bottom band.
    const coverFraction = 0.62;
    const coverBottom = height * coverFraction;
    const cover: Box = {
        x: margin,
        y: margin,
        w: width - margin * 2,
        h: coverBottom - margin * 1.5,
    };
    // Keep the mark itself square and centered horizontally within the band.
    const side = Math.min(cover.w, cover.h);
    const center: Vec2 = { x: cover.x + cover.w / 2, y: cover.y + cover.h / 2 };
    const square: Box = { x: center.x - side / 2, y: center.y - side / 2, w: side, h: side };

    // Faint concentric rings behind the mark for an "album / vinyl" feel.
    const ringColor = withAlpha(palette.fg, palette.variant === 'dark' ? 0.16 : 0.22);
    const ringCount = 2 + Math.round(rng()); // 2 or 3, deterministic
    for (let i = 0; i < ringCount; i++) {
        const r = (side / 2) * (0.96 - i * 0.16);
        strokes.push(ring(center, r, `ring-${i}`, ringColor, Math.max(1, width * 0.0016)));
    }
    // A single accent ring near the label edge keeps the duotone reading.
    strokes.push(ring(center, side * 0.2, 'ring-label', withAlpha(palette.accent, 0.5), Math.max(1, width * 0.002)));

    // KEY-ART: radial commit graph fit into the square (the sunburst).
    const { nodes, edges } = buildGraphScene(ctx, {
        layout: 'radial',
        box: square,
        fitPadding: side * 0.06,
    });

    // Promote the largest node as an accent hero — the "label" at the spindle.
    if (nodes.length) {
        const hero = nodes.reduce((a, b) => (b.r > a.r ? b : a), nodes[0]);
        hero.fill = palette.accent2;
        hero.r *= 1.6;
        hero.glow = 1;
    }

    // ARTIST line: top contributor, or repo name when authorship is flat.
    const topAuthor = signals.rankedAuthors[0]?.name;
    const artist = (topAuthor || options.repoName || 'Various Artists').toString();
    const albumTitle = (options.title || options.repoName || 'Untitled').toString();

    // Type block sits just below the cover band.
    const textTop = coverBottom + height * 0.012;
    const artistSize = width * 0.028;
    texts.push(text(truncate(artist, 32).toUpperCase(), margin, textTop, {
        font: fontStack(ALBUM_FONT), size: artistSize, weight: 600,
        color: palette.accent, align: 'start', spacing: width * 0.004,
    }));
    const albumSize = width * 0.062;
    texts.push(text(truncate(albumTitle, 24), margin, textTop + albumSize, {
        font: fontStack(ARTIST_FONT), size: albumSize, weight: 700,
        color: palette.fg, align: 'start',
    }));

    // Side label (A-SIDE) + commit count, right-aligned, aligned to album baseline.
    texts.push(text('SIDE A', width - margin, textTop, {
        font: fontStack(MONO_FONT), size: width * 0.016, weight: 600,
        color: palette.fgMuted, align: 'end', spacing: width * 0.004,
    }));

    // TRACKLIST: numbered rows in a mono face, right-aligned durations.
    const tracks = trackList(ctx, 10);
    const listTop = textTop + albumSize + height * 0.045;
    const listBottom = height - margin - height * 0.03; // leave room for footer
    const available = Math.max(1, listBottom - listTop);
    // Fit row height to the number of tracks so they never overflow the band.
    const rowH = Math.min(height * 0.034, available / Math.max(1, tracks.length));
    const trackSize = Math.min(width * 0.02, rowH * 0.62);
    const leaderColor = withAlpha(palette.fgMuted, 0.45);

    tracks.forEach((t, i) => {
        const y = listTop + rowH * (i + 0.5);
        const nn = t.index.toString().padStart(2, '0');
        // Track number — accent.
        texts.push(text(nn, margin, y, {
            font: fontStack(MONO_FONT), size: trackSize, weight: 600,
            color: palette.accent, align: 'start',
        }));
        // Title — fg.
        texts.push(text(truncate(t.title, 34), margin + width * 0.07, y, {
            font: fontStack(MONO_FONT), size: trackSize, weight: 400,
            color: palette.fg, align: 'start',
        }));
        // Duration — muted, right-aligned.
        texts.push(text(t.duration, width - margin, y, {
            font: fontStack(MONO_FONT), size: trackSize, weight: 400,
            color: palette.fgMuted, align: 'end',
        }));
        // Thin baseline rule separating tracks (the "....." leader as a line).
        if (i < tracks.length - 1) {
            strokes.push({
                id: `rule-${i}`,
                points: [
                    { x: margin, y: y + rowH * 0.42 },
                    { x: width - margin, y: y + rowH * 0.42 },
                ],
                color: leaderColor,
                width: Math.max(0.5, width * 0.0008),
                opacity: 1,
            });
        }
    });

    // Footer: date span / label-style credit, mono. When the repo has more
    // commits than the listed tracks, say "10 OF 247" so the count is honest.
    const footerY = height - margin + height * 0.005;
    const trackLabel = signals.commitCount > tracks.length
        ? `${tracks.length} OF ${signals.commitCount} TRACKS`
        : `${signals.commitCount} TRACKS`;
    const spanLabel = signals.firstYear
        ? `${signals.firstYear} – ${signals.lastYear} · ${trackLabel}`
        : trackLabel;
    texts.push(text(spanLabel, margin, footerY, {
        font: fontStack(MONO_FONT), size: width * 0.013, weight: 400,
        color: palette.fgMuted, align: 'start', spacing: width * 0.002,
    }));

    // Watermark — bottom-right, restrained.
    if (options.showWatermark) {
        texts.push(text('GITSONAR.COM · RECORDS', width - margin, footerY, {
            font: fontStack(MONO_FONT), size: width * 0.013, weight: 600,
            color: withAlpha(palette.fg, 0.5), align: 'end', spacing: width * 0.003,
        }));
    }

    return {
        width,
        height,
        background: { kind: 'solid', color: palette.bg },
        strokes,
        edges,
        nodes,
        texts,
        frame: { color: withAlpha(palette.fg, 0.12), width: Math.max(1, width * 0.0014), inset: margin * 0.45 },
        fontsUsed: [ARTIST_FONT, ALBUM_FONT, MONO_FONT],
    };
}

/** A closed-circle SceneStroke approximated as a finite polygon (renderer-safe). */
function ring(center: Vec2, radius: number, id: string, color: string, w: number): SceneStroke {
    const r = Math.max(0, radius);
    const segments = 64;
    const points: Vec2[] = [];
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        points.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
    }
    return { id, points, color, width: w, opacity: 1, closed: true, smooth: true };
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

export const albumTracklistTemplate: PosterTemplate = {
    id: 'album-tracklist',
    name: 'Album Tracklist',
    group: 'music',
    description: 'Square record sleeve: a radial commit-graph cover mark over a numbered, mono-set tracklist.',
    defaultAspect: 1,
    recommendedLayout: 'radial',
    fonts: [ARTIST_FONT, ALBUM_FONT, MONO_FONT],
    build,
};
