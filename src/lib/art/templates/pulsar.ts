/**
 * Pulsar — the "Unknown Pleasures" joyplot.
 *
 * The signature git-as-art piece: ~40–70 stacked ridgeline rows on near-black,
 * each row a time bucket whose amplitude tracks commit activity. Rows overlap
 * vertically so peaks rise into the row above (the classic Joy Division look).
 * Every ridge is drawn as an opaque bg-filled polygon (the occluder) plus a
 * bright fg polyline on top; rows are pushed far-to-near so nearer ridges hide
 * the ones behind them. Mostly textless: a thin title + repo caption only.
 *
 * Degrades gracefully — a gentle baseline waveform keeps it stunning even with
 * one author, no churn, or a handful of commits. All randomness comes from
 * ctx.rng / ctx.noise2D so identical (graph, seed) yields identical output.
 */

import type { PosterTemplate, TemplateContext } from '../template';
import type { Scene, SceneStroke, SceneText, Vec2 } from '../scene';
import { typeScale, formatDate } from '../compose';
import { fontStack } from '../fonts';
import { withAlpha, readableInk } from '../palette';

const TITLE_FONT = 'SpaceGrotesk';
const MONO_FONT = 'JetBrainsMono';

/** Resample an arbitrary-length series into exactly `n` averaged buckets. */
function resample(src: number[], n: number): number[] {
    const out = new Array<number>(n).fill(0);
    if (!src.length) return out;
    for (let i = 0; i < n; i++) {
        const a = Math.floor((i * src.length) / n);
        const b = Math.max(a + 1, Math.floor(((i + 1) * src.length) / n));
        let sum = 0;
        for (let k = a; k < b && k < src.length; k++) sum += src[k];
        out[i] = sum / (b - a);
    }
    return out;
}

function build(ctx: TemplateContext): Scene {
    const { width, height, palette, signals, options, rng, noise2D, encoding } = ctx;
    const texts: SceneText[] = [];
    const strokes: SceneStroke[] = [];
    const scale = typeScale(width * 0.05, 1.25);

    // Near-black canvas — prefer pure black for the iconic deep field, but fall
    // back to the theme bg if it is already dark.
    const bg = palette.variant === 'dark' ? palette.bg : '#000000';
    // Derive ink from the actual (forced-black) field, not palette.fg — on a light
    // theme palette.fg is dark and would vanish on the black background.
    const ink = readableInk(bg);

    // Row count scales with how much history there is, clamped to the classic
    // 40–70 band so sparse repos still read as a dense, full plot.
    const rows = Math.max(40, Math.min(70, 28 + signals.commitCount));

    // Centered stack inside the middle ~64% width, wide top/bottom margins.
    const stackW = width * 0.64;
    const stackX = (width - stackW) / 2;
    const stackTop = height * 0.16;
    const stackH = height * 0.66;
    const samples = 220; // horizontal resolution of each ridge

    // Source activity profile (weekly cadence preferred, daily fallback). When
    // churn is the size encoding and present, fold it in; otherwise pure cadence.
    const source = signals.perWeek.length > 4 ? signals.perWeek : signals.perDay;
    const profile = resample(source, samples);
    const peak = Math.max(1, ...profile);

    // Vertical geometry: rows overlap so the max amplitude exceeds the row gap,
    // letting tall peaks push up into the neighbours above.
    const rowGap = stackH / rows;
    const maxAmp = rowGap * 4.2;
    const baseAmp = rowGap * 0.5; // gentle floor so quiet rows still wave

    // Each row offsets into the resampled profile so the activity "scrolls"
    // down the stack, giving every ridge a distinct silhouette.
    for (let r = 0; r < rows; r++) {
        const rowFrac = rows > 1 ? r / (rows - 1) : 0;
        const baseY = stackTop + r * rowGap + rowGap; // baseline of this ridge
        const phase = r * 7; // decorrelate noise per row

        const pts: Vec2[] = [];
        for (let s = 0; s <= samples; s++) {
            const u = s / samples; // 0..1 across width
            const x = stackX + u * stackW;

            // Bell window keeps ridge ends flat on the baseline (closed look).
            const window = Math.sin(Math.PI * u);

            // Activity value for this row: sample the profile with a per-row
            // offset so the wave migrates through the stack.
            const idx = Math.min(samples - 1, Math.floor((u + rowFrac * 0.35) % 1 * samples));
            const activity = profile[idx] / peak; // 0..1

            // Organic detail: layered simplex noise + a touch of seeded jitter.
            const n1 = noise2D(u * 3.5 + phase, rowFrac * 4.0);
            const n2 = noise2D(u * 9.0 - phase, rowFrac * 2.0 + 11);
            const wiggle = (n1 * 0.6 + n2 * 0.4) * (0.35 + encoding.turbulence * 0.5);
            const jitter = (rng() - 0.5) * 0.04;

            // Amplitude: guaranteed baseline + data-driven peak, all windowed.
            const amp = (baseAmp + (activity + Math.max(0, wiggle) + jitter) * maxAmp * 0.9) * window;
            const y = baseY - Math.max(0, amp);
            pts.push({ x, y: clamp(y, 0, height) });
        }

        // Polygon that closes back along the baseline — the opaque occluder.
        const fillPts: Vec2[] = [
            ...pts,
            { x: stackX + stackW, y: baseY },
            { x: stackX, y: baseY },
        ];

        // Fade the farthest rows slightly so the stack recedes into the dark.
        const lineAlpha = 0.45 + 0.55 * rowFrac;
        const lineW = (0.9 + 1.1 * rowFrac) * encoding.weightScale;

        // Push far-to-near: top rows (r small) first, so each later (lower)
        // ridge's opaque fill hides the lines of the ridges behind it.
        strokes.push({
            id: `ridge-fill-${r}`,
            points: fillPts,
            color: bg,
            width: 0,
            opacity: 1,
            closed: true,
            fill: bg,
            smooth: true,
        });
        strokes.push({
            id: `ridge-line-${r}`,
            points: pts,
            color: withAlpha(ink, lineAlpha),
            width: lineW,
            opacity: 1,
            closed: false,
            smooth: true,
        });
    }

    // --- Minimal type: thin title block top, repo caption bottom. ---------
    const title = (options.title || options.repoName || 'PULSAR').toString().toUpperCase();
    texts.push(text(title, width / 2, stackTop - scale(-1.4), {
        font: fontStack(TITLE_FONT), size: scale(-1.2), weight: 600,
        color: withAlpha(ink, 0.92), align: 'middle', spacing: width * 0.012,
    }));

    // Footer caption — repo + span, very small, the only "data" on the page.
    const spanLabel = signals.timeSpanMs > 0
        ? `${formatDate(signals.firstCommitMs)} — ${formatDate(signals.lastCommitMs)}`.toUpperCase()
        : `${signals.commitCount} COMMITS`;
    const repoLabel = (options.repoName || 'repository').toString().toUpperCase();
    texts.push(text(`${repoLabel}  ·  ${spanLabel}`, width / 2, height - height * 0.07, {
        font: fontStack(MONO_FONT), size: scale(-3.4), weight: 500,
        color: withAlpha(ink, 0.55), align: 'middle', spacing: width * 0.004,
    }));

    if (options.showWatermark) {
        texts.push(text('GITSONAR.COM', width / 2, height - height * 0.045, {
            font: fontStack(MONO_FONT), size: scale(-4), weight: 600,
            color: withAlpha(ink, 0.32), align: 'middle', spacing: width * 0.006,
        }));
    }

    return {
        width,
        height,
        background: { kind: 'solid', color: bg, vignette: 0.35 },
        strokes,
        edges: [],
        nodes: [],
        texts,
        fontsUsed: [TITLE_FONT, MONO_FONT],
    };
}

/** Clamp a coordinate into [lo, hi] (keeps every point finite + on-canvas). */
function clamp(n: number, lo: number, hi: number): number {
    if (!Number.isFinite(n)) return lo;
    return n < lo ? lo : n > hi ? hi : n;
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

export const pulsarTemplate: PosterTemplate = {
    id: 'pulsar',
    name: 'Pulsar',
    group: 'generative',
    description: 'Stacked ridgeline joyplot (Unknown Pleasures) of commit cadence on a deep black field.',
    defaultAspect: 24 / 30,
    recommendedLayout: 'vertical',
    fonts: [TITLE_FONT, MONO_FONT],
    build,
};
