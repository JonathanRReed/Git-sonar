/**
 * Poster Studio: the framing bench.
 *
 * Shown when viewMode === 'poster'. A rail of style thumbnails drawn from the
 * loaded repo, the poster on a neutral viewing-booth stage (or hung on a wall at
 * true scale), a tray of shuffled variations, and a panel of one-tap controls in
 * plain words. All poster state lives in the store's structured `posterConfig`,
 * so posters stay reproducible and shareable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatMomentDate, useGraphStore } from '@lib/store/graph-store';
import { renderPoster } from '@lib/art/poster-renderer';
import { renderSceneToCanvas } from '@lib/art/render-canvas';
import { TEMPLATE_LIST, getTemplateOrDefault } from '@lib/art/templates';
import type { ControlKey, PosterTemplate } from '@lib/art/template';
import { loadFonts } from '@lib/art/fonts';
import { POSTER_SIZES, type PosterSizeId, type Orientation } from '@lib/art/sizes';
import type { PaletteMood } from '@lib/art/palette';
import type { LayoutMode } from '@lib/art/layout';
import type { EncodingConfig, HueSignal, SizeSignal } from '@lib/art/encoding';
import { decodePosterConfig, makePosterConfig, type PosterConfig } from '@lib/art/poster-config';
import { THEMES, type ThemeId } from '@lib/themes';
import { repoDisplayName } from '@lib/utils/repo-name';
import type { RepoGraph } from '@lib/git/types';
import {
    downloadPosterSVG,
    downloadPosterPNG,
    downloadPosterPDF,
    downloadPosterAnimatedSVG,
    copyPosterImage,
    sharePoster,
    posterPermalink,
} from '@lib/art/export';

type ExportKind = 'png' | 'copy' | 'svg' | 'pdf' | 'embed' | 'share' | 'link';

const THEME_LIST = Object.values(THEMES);
const MOODS: { id: PaletteMood; label: string }[] = [
    { id: 'theme', label: 'Full' },
    { id: 'duotone', label: 'Two-tone' },
    { id: 'mono', label: 'One ink' },
    { id: 'vivid', label: 'Vivid' },
];
const LAYOUTS: { id: LayoutMode; label: string }[] = [
    { id: 'vertical', label: 'Vertical' },
    { id: 'horizontal', label: 'Horizontal' },
    { id: 'radial', label: 'Radial' },
];
const HUES: { id: HueSignal; label: string }[] = [
    { id: 'author', label: 'Author' },
    { id: 'lane', label: 'Branch' },
    { id: 'time', label: 'Time' },
    { id: 'churn', label: 'Lines changed' },
];
const SIZES: { id: SizeSignal; label: string }[] = [
    { id: 'churn', label: 'Lines changed' },
    { id: 'recency', label: 'Recency' },
    { id: 'merge', label: 'Merges' },
    { id: 'uniform', label: 'All equal' },
];
type SliderKey = 'sizeScale' | 'weightScale' | 'turbulence' | 'densityAmount' | 'glow';
const SLIDERS: { key: SliderKey; label: string; min: number; max: number }[] = [
    { key: 'sizeScale', label: 'Dot size', min: 0.4, max: 2.5 },
    { key: 'weightScale', label: 'Line weight', min: 0.4, max: 2.5 },
    { key: 'turbulence', label: 'Swirl', min: 0, max: 1 },
    { key: 'densityAmount', label: 'Density', min: 0.05, max: 1 },
    { key: 'glow', label: 'Glow', min: 0, max: 1 },
];
const SIZE_GROUPS: { label: string; ids: PosterSizeId[] }[] = [
    { label: 'Fit the style', ids: ['native'] },
    { label: 'Paper', ids: ['A4', 'A3', 'A2', 'A1', '12x18', '18x24', '24x36', 'square'] },
    { label: 'Screens', ids: ['social-square', 'social-story', 'social-wide', 'og'] },
];

/** "On a wall" is a gallery elevation drawn to scale. All measures in inches. */
const WALL = {
    /** Galleries hang work with its centre this far above the floor. */
    centre: 57,
    bench: { w: 60, h: 18 },
    /** Visible strip of floor under the bench, in px. */
    floorPx: 34,
};
type FrameStyle = 'none' | 'black' | 'oak' | 'white';
const FRAMES: { id: FrameStyle; label: string; color: string }[] = [
    { id: 'black', label: 'Black', color: '#1a1b1c' },
    { id: 'oak', label: 'Oak', color: '#b58a5a' },
    { id: 'white', label: 'White', color: '#f6f6f3' },
    { id: 'none', label: 'Bare', color: 'transparent' },
];
const THUMB_W = 132;
/** Height of the shuffle tray along the bottom of the stage, in px (5.5rem). */
const TRAY_H = 88;
/** Strip along the top of the stage kept clear for the bench/wall switch, in px. */
const STAGE_TOP = 56;
const MAX_VARIATIONS = 5;

/**
 * Where a sheet hangs in the "On a wall" elevation, in stage px. The sheet's
 * centre sits 57 in above the floor; everything is drawn at one scale (ppi).
 */
function hang(
    stageW: number,
    stageH: number,
    aspect: number,
    sizeId: PosterSizeId,
    orientation: Orientation,
    frame: FrameStyle,
    mat: boolean
) {
    const spec = POSTER_SIZES[sizeId];
    const inches = spec.inches
        ? orientation === 'landscape' ? { w: spec.inches.h, h: spec.inches.w } : spec.inches
        : { w: 24 * aspect, h: 24 };
    const framed = frame !== 'none';
    const matIn = framed && mat ? Math.max(1.5, inches.w * 0.1) : 0;
    const frameIn = framed ? 0.9 : 0;
    const outer = { w: inches.w + (matIn + frameIn) * 2, h: inches.h + (matIn + frameIn) * 2 };
    const floorY = Math.max(1, stageH - TRAY_H - WALL.floorPx);
    const ppi = Math.max(0.1, Math.min(
        (floorY - 28) / (WALL.centre + outer.h / 2 + 3),
        (stageW * 0.84) / Math.max(WALL.bench.w, outer.w + 22)
    ));
    return { inches, matIn, frameIn, outer, floorY, ppi, centreY: floorY - WALL.centre * ppi, framed, spec };
}

interface Variation {
    seed: string;
    url: string;
}

/** Apply a style's own preset (its strongest look) on top of the current poster. */
function withPreset(cfg: PosterConfig, t: PosterTemplate): PosterConfig {
    return makePosterConfig({
        ...cfg,
        template: t.id,
        layout: t.recommendedLayout ?? cfg.layout,
        paletteMood: t.defaultMood ?? cfg.paletteMood,
        seed: t.heroSeed ?? cfg.seed,
        encoding: { ...cfg.encoding, ...(t.defaultEncoding ?? {}) },
    });
}

/** Draw a poster into a small offscreen canvas and return it as a data URL. */
function renderThumb(graph: RepoGraph, cfg: PosterConfig, repoName: string, width = THUMB_W): string | null {
    try {
        const { scene } = renderPoster(graph, cfg, repoName);
        const canvas = document.createElement('canvas');
        const scale = (width * 2) / scene.width;
        canvas.width = Math.round(scene.width * scale);
        canvas.height = Math.round(scene.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.scale(scale, scale);
        renderSceneToCanvas(ctx, scene);
        return canvas.toDataURL('image/jpeg', 0.78);
    } catch {
        return null;
    }
}

/** Commits per week across the repo's life, squeezed to at most `max` steps. */
function weeklyCounts(graph: RepoGraph, max = 64): number[] {
    let first = Infinity;
    let last = -Infinity;
    for (const c of graph.commits.values()) {
        if (!Number.isFinite(c.authoredAt)) continue;
        if (c.authoredAt < first) first = c.authoredAt;
        if (c.authoredAt > last) last = c.authoredAt;
    }
    if (!Number.isFinite(first)) return [];
    const week = 7 * 86_400_000;
    const steps = Math.max(8, Math.min(max, Math.ceil((last - first) / week) + 1));
    const size = Math.max(week, (last - first + 1) / steps);
    const counts = new Array<number>(steps).fill(0);
    for (const c of graph.commits.values()) {
        if (!Number.isFinite(c.authoredAt)) continue;
        counts[Math.min(steps - 1, Math.floor((c.authoredAt - first) / size))]++;
    }
    return counts;
}

/** A minor pentatonic ladder, in semitones above the root. */
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const NOTE_MS = 150;

function newSeed(previous: string): string {
    return Math.floor((performance.now() * 1000) % 1e9).toString(36) + (previous.length % 7);
}

export function PosterStudio() {
    const graph = useGraphStore((s) => s.graph);
    const cfg = useGraphStore((s) => s.posterConfig);
    const themeId = useGraphStore((s) => s.themeId);
    const viewMode = useGraphStore((s) => s.viewMode);
    const repoPath = useGraphStore((s) => s.currentRepoPath);
    const repoProvider = useGraphStore((s) => s.currentRepoProvider);
    const currentDemo = useGraphStore((s) => s.currentDemo);
    const sourceName = useGraphStore((s) => s.currentSourceName);
    const hasMoreCommits = useGraphStore((s) => s.hasMoreCommits);
    const moment = useGraphStore((s) => s.moment);
    const reducedMotion = useGraphStore((s) => s.reducedMotion);
    const update = useGraphStore((s) => s.updatePosterConfig);
    const setPosterConfig = useGraphStore((s) => s.setPosterConfig);
    const resetPosterConfig = useGraphStore((s) => s.resetPosterConfig);
    const setTheme = useGraphStore((s) => s.setTheme);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const lastChangeAt = useRef(0);

    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [onWall, setOnWall] = useState(false);
    const [playing, setPlaying] = useState(-1);
    const [stamped, setStamped] = useState(0);
    const audioRef = useRef<{ ctx: AudioContext; timer: number } | null>(null);
    const [frame, setFrame] = useState<FrameStyle>('black');
    const [mat, setMat] = useState(true);
    const [popOpen, setPopOpen] = useState(false);
    const [rolling, setRolling] = useState(0);
    const [thumbs, setThumbs] = useState<Record<string, string>>({});
    const [variations, setVariations] = useState<Record<string, Variation[]>>({});
    const [history, setHistory] = useState<{ past: PosterConfig[]; future: PosterConfig[] }>({ past: [], future: [] });
    const [fit, setFit] = useState({ aspect: 2 / 3, stageW: 0, stageH: 0 });
    const [fontsReady, setFontsReady] = useState(0);

    const repoName = useMemo(() => repoDisplayName(repoPath, currentDemo, sourceName), [repoPath, currentDemo, sourceName]);
    // An empty title means "use the repo's name"; resolved here so the preview,
    // the thumbnails and every export agree.
    // When an earlier moment is being captured, it is the poster's tagline
    // unless the user writes their own.
    const momentTagline = moment
        ? moment.label ? `${moment.label}, ${formatMomentDate(moment)}` : `As it stood on ${formatMomentDate(moment)}`
        : '';
    const poster = useMemo(
        () => (cfg.title && (cfg.subtitle || !momentTagline)
            ? cfg
            : { ...cfg, title: cfg.title || repoName, subtitle: cfg.subtitle || momentTagline }),
        [cfg, repoName, momentTagline]
    );
    const activeTemplate = getTemplateOrDefault(cfg.template);
    const enc = cfg.encoding;
    const hasLineCounts = Boolean(graph && graph.metrics.totalAdditions + graph.metrics.totalDeletions > 0);

    // Load all template fonts once so the preview/export render correctly.
    useEffect(() => {
        loadFonts(TEMPLATE_LIST.flatMap((t) => t.fonts));
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        fonts?.ready.then(() => setFontsReady((n) => n + 1));
    }, []);

    // A new repo's poster starts titled with the repo's name, as a real value
    // in the Title field rather than a suggestion.
    useEffect(() => {
        if (graph && !useGraphStore.getState().posterConfig.title) update({ title: repoName });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [graph]);

    // Hydrate from a #p=<config> permalink on first mount.
    useEffect(() => {
        if (typeof location === 'undefined') return;
        const m = location.hash.match(/[#&]p=([^&]+)/);
        if (m) {
            const decoded = decodePosterConfig(m[1]);
            if (decoded) {
                setPosterConfig(decoded);
                if (decoded.themeId !== themeId) setTheme(decoded.themeId);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- change tracking (undo / redo) -----------------------------------
    const remember = useCallback(() => {
        const now = Date.now();
        // Coalesce a drag or a burst of typing into one undo step.
        if (now - lastChangeAt.current > 600) {
            setHistory((h) => ({ past: [...h.past, cfg].slice(-60), future: [] }));
        }
        lastChangeAt.current = now;
    }, [cfg]);

    const change = useCallback(
        (patch: Partial<PosterConfig>) => {
            remember();
            update(patch);
        },
        [remember, update]
    );

    const changeEncoding = useCallback(
        (patch: Partial<EncodingConfig>) => change({ encoding: { ...enc, ...patch } }),
        [change, enc]
    );

    const changeTheme = useCallback(
        (id: ThemeId) => {
            remember();
            setTheme(id);
        },
        [remember, setTheme]
    );

    const restore = useCallback(
        (target: PosterConfig) => {
            if (target.themeId !== themeId) setTheme(target.themeId);
            setPosterConfig(target);
            lastChangeAt.current = 0;
        },
        [themeId, setTheme, setPosterConfig]
    );

    const undo = useCallback(() => {
        const prev = history.past[history.past.length - 1];
        if (!prev) return;
        setHistory({ past: history.past.slice(0, -1), future: [cfg, ...history.future] });
        restore(prev);
    }, [history, cfg, restore]);

    const redo = useCallback(() => {
        const next = history.future[0];
        if (!next) return;
        setHistory({ past: [...history.past, cfg], future: history.future.slice(1) });
        restore(next);
    }, [history, cfg, restore]);

    const applyTemplate = useCallback(
        (t: PosterTemplate) => {
            if (t.id === cfg.template) return;
            remember();
            setPosterConfig(withPreset(cfg, t));
        },
        [cfg, remember, setPosterConfig]
    );

    const shuffle = useCallback(() => {
        setRolling((n) => n + 1);
        change({ seed: newSeed(cfg.seed) });
    }, [change, cfg.seed]);

    // ---- listen: the history as sound, one note per week ------------------
    const stopListening = useCallback(() => {
        const audio = audioRef.current;
        if (audio) {
            window.clearInterval(audio.timer);
            void audio.ctx.close().catch(() => undefined);
            audioRef.current = null;
        }
        setPlaying(-1);
    }, []);

    const listen = useCallback(() => {
        if (audioRef.current) {
            stopListening();
            return;
        }
        if (!graph) return;
        const counts = weeklyCounts(graph);
        const peak = Math.max(1, ...counts);
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx || counts.length === 0) return;
        const ctx = new Ctx();
        const out = ctx.createGain();
        out.gain.value = 0.5;
        out.connect(ctx.destination);
        let step = 0;
        const tick = () => {
            if (step >= counts.length) {
                stopListening();
                return;
            }
            const count = counts[step];
            setPlaying(step / counts.length);
            // Quiet weeks rest; busy weeks climb the scale and ring longer.
            if (count > 0) {
                const heat = Math.sqrt(count / peak);
                const t = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = 174.6 * Math.pow(2, SCALE[Math.min(SCALE.length - 1, Math.round(heat * (SCALE.length - 1)))] / 12);
                gain.gain.setValueAtTime(0.0001, t);
                gain.gain.exponentialRampToValueAtTime(0.1 + 0.22 * heat, t + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28 + 0.5 * heat);
                osc.connect(gain);
                gain.connect(out);
                osc.start(t);
                osc.stop(t + 0.85);
            }
            step++;
        };
        audioRef.current = { ctx, timer: window.setInterval(tick, NOTE_MS) };
        tick();
    }, [graph, stopListening]);

    // Stop the sound when the repo changes or the studio goes away.
    useEffect(() => stopListening, [graph, viewMode, stopListening]);

    // ---- live preview ------------------------------------------------------
    const renderPreview = useCallback(() => {
        const canvas = canvasRef.current;
        const stage = stageRef.current;
        if (!canvas || !stage || !graph) return;
        let result;
        try {
            result = renderPoster(graph, poster, repoName);
        } catch {
            return;
        }
        const { scene } = result;
        // The easel is the stage minus the tray; leave air around the sheet.
        const stageW = stage.clientWidth - 56;
        const stageH = stage.clientHeight - TRAY_H - STAGE_TOP - 28;
        if (stageW <= 0 || stageH <= 0) return;
        const aspect = scene.width / scene.height;
        let scale = Math.min(stageW / scene.width, stageH / scene.height);
        if (onWall) {
            // Drawn at its true wall size (not scaled down in CSS), so fine
            // line work stays crisp instead of turning to moire.
            const h = hang(stage.clientWidth, stage.clientHeight, aspect, poster.size, poster.orientation, frame, mat);
            scale = (h.inches.h * h.ppi) / scene.height;
        }
        const cssW = Math.max(1, Math.round(scene.width * scale));
        const cssH = Math.max(1, Math.round(scene.height * scale));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale((cssW * dpr) / scene.width, (cssH * dpr) / scene.height);
        renderSceneToCanvas(ctx, scene);
        setFit({ aspect, stageW: stage.clientWidth, stageH: stage.clientHeight });

        // Keep this roll in the variations tray, with a snapshot of how it looks.
        const snap = document.createElement('canvas');
        snap.width = 120;
        snap.height = Math.round((120 * cssH) / cssW);
        snap.getContext('2d')?.drawImage(canvas, 0, 0, snap.width, snap.height);
        const url = snap.toDataURL('image/jpeg', 0.72);
        const { template, seed } = poster;
        setVariations((all) => {
            const list = all[template] ?? [];
            const existing = list.findIndex((v) => v.seed === seed);
            const next = existing === -1
                ? [...list, { seed, url }].slice(-MAX_VARIATIONS)
                : list.map((v, i) => (i === existing ? { seed, url } : v));
            return { ...all, [template]: next };
        });
    }, [graph, poster, repoName, onWall, frame, mat]);

    useEffect(() => {
        if (viewMode !== 'poster') return;
        const id = window.setTimeout(renderPreview, 90);
        return () => window.clearTimeout(id);
    }, [renderPreview, viewMode, fontsReady]);

    useEffect(() => {
        if (viewMode !== 'poster') return;
        const onResize = () => renderPreview();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [renderPreview, viewMode]);

    // The poster "develops" when a repo first arrives, and settles on each new
    // style or roll.
    useEffect(() => {
        if (reducedMotion || viewMode !== 'poster' || !graph) return;
        canvasRef.current?.animate?.(
            [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
            { duration: 1100, easing: 'cubic-bezier(0.6, 0.05, 0.2, 1)' }
        );
    }, [graph, viewMode, reducedMotion]);

    useEffect(() => {
        if (reducedMotion) return;
        canvasRef.current?.animate?.(
            [{ opacity: 0.35, transform: 'translateY(6px) scale(0.985)' }, { opacity: 1, transform: 'none' }],
            { duration: 360, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        );
    }, [cfg.template, cfg.seed, onWall, reducedMotion]);

    // A new repo starts with a clean bench.
    const [benchGraph, setBenchGraph] = useState(graph);
    if (benchGraph !== graph) {
        setBenchGraph(graph);
        setVariations({});
        setThumbs({});
        setHistory({ past: [], future: [] });
    }

    // ---- style rail: every style, drawn from this repo ---------------------
    const thumbBase = useMemo(
        () => makePosterConfig({ ...poster, size: 'native', orientation: 'portrait' }),
        // Only the things a thumbnail should react to; sliders and rolls are ignored.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [poster.title, poster.subtitle, poster.themeId, poster.showWatermark, poster.showSignature]
    );

    useEffect(() => {
        if (viewMode !== 'poster' || !graph) return;
        let cancelled = false;
        let index = 0;
        const next = () => {
            if (cancelled || index >= TEMPLATE_LIST.length) return;
            const t = TEMPLATE_LIST[index++];
            const url = renderThumb(graph, withPreset(thumbBase, t), repoName);
            if (url && !cancelled) setThumbs((all) => ({ ...all, [t.id]: url }));
            window.setTimeout(next, 30);
        };
        const id = window.setTimeout(next, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(id);
        };
    }, [graph, thumbBase, repoName, viewMode, fontsReady]);

    // ---- keyboard ----------------------------------------------------------
    useEffect(() => {
        if (viewMode !== 'poster' || !graph) return;
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
                return;
            }
            if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'Escape') {
                setPopOpen(false);
            } else if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                shuffle();
            } else if (e.key === 'w' || e.key === 'W') {
                e.preventDefault();
                setOnWall((v) => !v);
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                if (target?.closest('.g-seg, .ps-swatches')) return;
                e.preventDefault();
                const i = TEMPLATE_LIST.findIndex((t) => t.id === cfg.template);
                const step = e.key === 'ArrowRight' ? 1 : -1;
                applyTemplate(TEMPLATE_LIST[(i + step + TEMPLATE_LIST.length) % TEMPLATE_LIST.length]);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [viewMode, graph, cfg.template, undo, redo, shuffle, applyTemplate]);

    // Close the download sheet on an outside click.
    useEffect(() => {
        if (!popOpen) return;
        const onDown = (e: PointerEvent) => {
            if (!popRef.current?.contains(e.target as Node)) setPopOpen(false);
        };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
    }, [popOpen]);

    // ---- export ------------------------------------------------------------
    const flash = useCallback((msg: string) => {
        setStatus(msg);
        window.setTimeout(() => setStatus(''), 3600);
    }, []);

    const onExport = useCallback(
        async (kind: ExportKind) => {
            if (!graph) return;
            setPopOpen(false);
            setBusy(true);
            try {
                const slug = repoName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'poster';
                const name = `${slug}-${poster.template}`;
                if (kind === 'svg') {
                    await downloadPosterSVG(graph, poster, repoName, `${name}.svg`);
                    flash('SVG downloaded, with fonts built in.');
                } else if (kind === 'png') {
                    const info = await downloadPosterPNG(graph, poster, repoName, `${name}.png`);
                    flash(info.clamped ? `PNG downloaded at ${info.width} × ${info.height}. Use PDF or SVG for full print size.` : 'PNG downloaded.');
                } else if (kind === 'copy') {
                    const r = await copyPosterImage(graph, poster, repoName);
                    flash(r === 'copied' ? 'Image copied. Paste it anywhere.' : 'Clipboard unavailable, so the PNG was downloaded.');
                } else if (kind === 'pdf') {
                    await downloadPosterPDF(graph, poster, repoName, `${name}.pdf`);
                    flash('PDF downloaded at true print size, with fonts built in.');
                } else if (kind === 'embed') {
                    const file = `${name}.animated.svg`;
                    await downloadPosterAnimatedSVG(graph, poster, repoName, file);
                    const md = `![${repoName}, drawn by Git Sonar](./${file})`;
                    try {
                        await navigator.clipboard?.writeText(md);
                        flash('Animated SVG downloaded and the README line copied. Commit the SVG next to your README.');
                    } catch {
                        flash(`Animated SVG downloaded. Add this to your README: ${md}`);
                    }
                } else if (kind === 'share') {
                    const r = await sharePoster(graph, poster, repoName);
                    flash(r === 'shared' ? 'Shared.' : 'Sharing unavailable, so the PNG was downloaded.');
                } else if (kind === 'link') {
                    const { url, reproducible } = posterPermalink(poster, { provider: repoProvider, repoPath, demo: currentDemo, until: moment?.date, moment: moment?.label });
                    replaceAddress(url);
                    try {
                        await navigator.clipboard?.writeText(url);
                        flash(reproducible ? 'Link copied. It reopens this exact poster.' : 'Link copied. It restores these settings; open the same repo to see the same poster.');
                    } catch {
                        flash('The link is in the address bar. Copy it from there.');
                    }
                }
                if (kind === 'png' || kind === 'pdf' || kind === 'svg' || kind === 'embed') setStamped((n) => n + 1);
            } catch (err) {
                flash(err instanceof Error ? `That did not work: ${err.message}` : 'That did not work.');
            } finally {
                setBusy(false);
            }
        },
        [graph, poster, repoName, repoProvider, repoPath, currentDemo, moment, flash]
    );

    // ---- derived view state ------------------------------------------------
    const showCtl = (k: ControlKey): boolean =>
        !activeTemplate.relevantControls || activeTemplate.relevantControls.includes(k);
    const sliders = SLIDERS.filter((s) => showCtl(s.key));
    const showMarks = showCtl('hue') || showCtl('size');
    const tray = variations[cfg.template] ?? [];
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    // The wall label: what a gallery would print beside this piece.
    const facts = useMemo(() => {
        if (!graph) return null;
        let first = Infinity;
        let last = -Infinity;
        for (const c of graph.commits.values()) {
            if (!Number.isFinite(c.authoredAt)) continue;
            if (c.authoredAt < first) first = c.authoredAt;
            if (c.authoredAt > last) last = c.authoredAt;
        }
        const y0 = Number.isFinite(first) ? new Date(first).getUTCFullYear() : null;
        const y1 = Number.isFinite(last) ? new Date(last).getUTCFullYear() : null;
        const m = graph.metrics;
        return {
            years: y0 === null || y1 === null ? '' : y0 === y1 ? `${y0}` : `${y0} to ${y1}`,
            line: `${m.commitCount.toLocaleString()} ${m.commitCount === 1 ? 'commit' : 'commits'} by ${m.authorCount.toLocaleString()} ${m.authorCount === 1 ? 'author' : 'authors'}`,
            head: (graph.defaultHead || '').slice(0, 7),
        };
    }, [graph]);

    // Only show the label when there is bare stage beside the sheet for it.
    const benchW = Math.min(fit.stageW - 56, (fit.stageH - TRAY_H - STAGE_TOP - 28) * fit.aspect);
    const plaqueFits = (fit.stageW - benchW) / 2 >= 250;

    // "On a wall": a gallery elevation at true scale. The sheet hangs with its
    // centre 57 in above the floor, over a museum bench for a sense of size.
    const wall = hang(fit.stageW, fit.stageH, fit.aspect, cfg.size, cfg.orientation, frame, mat);
    const { inches, ppi, centreY, framed } = wall;
    const wallShift = centreY - (STAGE_TOP + (fit.stageH - TRAY_H - STAGE_TOP) / 2);
    const sizeLabel = wall.spec.inches ? wall.spec.name.replace('×', ' × ') : `${Math.round(inches.w)} × ${Math.round(inches.h)} in`;
    const fmtIn = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} in`;
    const frameColor = FRAMES.find((f) => f.id === frame)?.color ?? 'transparent';
    const half = { w: (wall.outer.w * ppi) / 2, h: (wall.outer.h * ppi) / 2 };
    const midX = fit.stageW / 2;
    const benchHalf = (WALL.bench.w * ppi) / 2;
    const stageVars = {
        '--wall-shift': `${wallShift}px`,
        '--ppi': ppi,
        '--mat': `${wall.matIn * ppi}px`,
        '--frame': `${wall.frameIn * ppi}px`,
        '--frame-color': frameColor,
        '--floor': `${WALL.floorPx}px`,
    } as React.CSSProperties;

    return (
        <div className={`poster-studio ${onWall ? 'is-wall' : ''} ${framed ? 'is-framed' : ''} ${frame === 'white' ? 'is-white-frame' : ''}`} data-busy={busy}>
            <h2 className="sr-only">Poster studio</h2>

            <nav className="ps-rail" aria-label="Poster style">
                <p className="ps-h">Style</p>
                <div className="ps-thumbs">
                    {TEMPLATE_LIST.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            className="ps-thumb"
                            aria-pressed={cfg.template === t.id}
                            onClick={() => applyTemplate(t)}
                            title={t.description}
                        >
                            <span className="ps-thumb__cell">
                                <span
                                    className="ps-thumb__art"
                                    style={t.defaultAspect >= 0.75
                                        ? { aspectRatio: String(t.defaultAspect), width: '100%' }
                                        : { aspectRatio: String(t.defaultAspect), height: '100%' }}
                                >
                                    {thumbs[t.id] && <img src={thumbs[t.id]} alt="" />}
                                </span>
                            </span>
                            <span className="ps-thumb__name">{t.name}</span>
                        </button>
                    ))}
                </div>
            </nav>

            <div className="ps-stage" ref={stageRef} style={stageVars}>
                <div className="ps-room" aria-hidden="true">
                    <div className="ps-floor" />
                    <div className="ps-bench"><i /><i /></div>
                    {fit.stageW > 0 && (
                        <>
                            <div className="ps-dim ps-dim--w" style={{ left: midX - half.w, width: half.w * 2, top: centreY + half.h + 14 }}>
                                <span>{fmtIn(inches.w)}</span>
                            </div>
                            <div className="ps-dim ps-dim--h" style={{ top: centreY - half.h, height: half.h * 2, left: midX + half.w + 14 }}>
                                <span>{fmtIn(inches.h)}</span>
                            </div>
                            <div className="ps-dim ps-dim--h ps-dim--centre" style={{ top: centreY, height: wall.floorY - centreY, left: midX - Math.max(half.w, benchHalf) - 30 }}>
                                <span>{WALL.centre} in to centre</span>
                            </div>
                            <div className="ps-dim ps-dim--leader" style={{ top: centreY, left: midX - Math.max(half.w, benchHalf) - 21, width: Math.max(0, Math.max(half.w, benchHalf) - half.w + 13) }} />
                        </>
                    )}
                </div>

                <div className="g-seg ps-where" role="group" aria-label="Where to view the poster">
                    <button type="button" aria-pressed={!onWall} onClick={() => setOnWall(false)}>On the bench</button>
                    <button type="button" aria-pressed={onWall} onClick={() => setOnWall(true)}>On a wall</button>
                </div>

                <div className="ps-easel">
                    {graph ? (
                        <canvas
                            ref={canvasRef}
                            className="ps-canvas"
                            role="img"
                            aria-label={`Live preview of the ${activeTemplate.name} poster for ${repoName}`}
                        />
                    ) : (
                        <p className="ps-empty">Load a repo to start a poster.</p>
                    )}
                </div>

                {facts && plaqueFits && (
                    <div className="g-label ps-plaque">
                        <b>{repoName}</b>
                        <i>{activeTemplate.name}{facts.years ? `, ${facts.years}` : ''}</i>
                        {facts.line}
                        {moment && <span className="ps-plaque__moment">As of {formatMomentDate(moment)}</span>}
                    </div>
                )}

                {stamped > 0 && facts && (
                    <svg key={stamped} className="ps-seal" viewBox="0 0 120 120" aria-hidden="true">
                        <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="3.5" />
                        <circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        <path id="ps-seal-arc" d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" fill="none" />
                        <text fontSize="10.4" fontWeight="700" letterSpacing="1.5" fill="currentColor">
                            <textPath href="#ps-seal-arc">PRINTED FROM HEAD ✶ ONE OF ONE ✶ PRINTED FROM HEAD ✶</textPath>
                        </text>
                        <text x="60" y="57" textAnchor="middle" fontSize="22" fontWeight="800" fill="currentColor">1 / 1</text>
                        <text x="60" y="74" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor">{facts.head}</text>
                    </svg>
                )}

                <div className="ps-framing" aria-hidden={!onWall}>
                    <div className="g-seg" role="group" aria-label="Frame">
                        {FRAMES.map((f) => (
                            <button key={f.id} type="button" tabIndex={onWall ? 0 : -1} aria-pressed={frame === f.id} onClick={() => setFrame(f.id)}>{f.label}</button>
                        ))}
                    </div>
                    <label className={framed ? '' : 'is-off'}>
                        <input type="checkbox" tabIndex={onWall ? 0 : -1} checked={mat} disabled={!framed} onChange={(e) => setMat(e.target.checked)} /> Mat
                    </label>
                </div>
                <p className="ps-wallnote" aria-hidden={!onWall}>{sizeLabel}, hung at gallery height</p>

                <div className="ps-tray">
                    {playing >= 0 && <div className="ps-playhead" style={{ width: `${playing * 100}%` }} />}
                    <button type="button" className="ps-dice" onClick={shuffle} aria-label="Shuffle the composition" disabled={!graph}>
                        <svg key={rolling} className={rolling ? 'is-rolling' : undefined} viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="3" y="3" width="18" height="18" rx="4" fill="#fff" />
                            <circle cx="8" cy="8" r="1.6" fill="#16181a" />
                            <circle cx="16" cy="8" r="1.6" fill="#16181a" />
                            <circle cx="12" cy="12" r="1.6" fill="#d92b25" />
                            <circle cx="8" cy="16" r="1.6" fill="#16181a" />
                            <circle cx="16" cy="16" r="1.6" fill="#16181a" />
                        </svg>
                    </button>
                    <p className="ps-tray__text">
                        <b>Shuffle</b>
                        <span>Same history, new roll. <kbd className="g-kbd">S</kbd></span>
                    </p>
                    <button type="button" className="ps-listen" onClick={listen} disabled={!graph} aria-pressed={playing >= 0} title="Hear the history: one note per week, higher when it was busier">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {playing >= 0
                                ? <path d="M7 6v12M17 6v12" />
                                : <><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></>}
                        </svg>
                        <span>{playing >= 0 ? 'Stop' : 'Listen'}</span>
                    </button>
                    {tray.length > 0 && <span className="ps-vars__label">Rolls</span>}
                    <div className="ps-vars" role="group" aria-label="Rolls so far">
                        {tray.map((v, i) => (
                            <button
                                key={v.seed}
                                type="button"
                                aria-pressed={v.seed === cfg.seed}
                                aria-label={`Roll ${i + 1}`}
                                onClick={() => v.seed !== cfg.seed && change({ seed: v.seed })}
                            >
                                <img src={v.url} alt="" />
                            </button>
                        ))}
                    </div>
                </div>

                {status && <div className="ps-toast" role="status">{status}</div>}
            </div>

            <aside className="ps-panel" aria-label="Poster controls">
                <div className="ps-actions" ref={popRef}>
                    <button type="button" className="g-btn g-btn--red ps-download" disabled={busy || !graph} aria-expanded={popOpen} aria-haspopup="true" onClick={() => setPopOpen((v) => !v)}>
                        {busy ? 'Working' : 'Download'}
                    </button>
                    <button type="button" className="ps-icon" onClick={undo} disabled={history.past.length === 0} aria-label="Undo" title="Undo (Cmd/Ctrl Z)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
                    </button>
                    <button type="button" className="ps-icon" onClick={redo} disabled={history.future.length === 0} aria-label="Redo" title="Redo (Shift Cmd/Ctrl Z)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>
                    </button>

                    <div className={`ps-pop ${popOpen ? 'is-open' : ''}`} role="group" aria-label="Download options" aria-hidden={!popOpen}>
                        <h3>What is it for?</h3>
                        <button type="button" data-export="png" tabIndex={popOpen ? 0 : -1} onClick={() => onExport('png')}>
                            <b>A screen</b><i>PNG</i>
                            <span>For posts, wallpapers and slides.</span>
                        </button>
                        <button type="button" data-export="pdf" tabIndex={popOpen ? 0 : -1} onClick={() => onExport('pdf')}>
                            <b>A print shop</b><i>PDF</i>
                            <span>True size, with the fonts built in.</span>
                        </button>
                        <button type="button" data-export="embed" tabIndex={popOpen ? 0 : -1} onClick={() => onExport('embed')}>
                            <b>A README</b><i>Animated SVG</i>
                            <span>Downloads the file and copies the Markdown line.</span>
                        </button>
                        <button type="button" data-export="svg" tabIndex={popOpen ? 0 : -1} onClick={() => onExport('svg')}>
                            <b>A designer</b><i>SVG</i>
                            <span>Editable vector, with the fonts built in.</span>
                        </button>
                        <button type="button" data-export="copy" tabIndex={popOpen ? 0 : -1} onClick={() => onExport('copy')}>
                            <b>A quick paste</b><i>Clipboard</i>
                            <span>Copies the image so you can paste it anywhere.</span>
                        </button>
                        <button type="button" data-export="link" tabIndex={popOpen ? 0 : -1} onClick={() => onExport('link')}>
                            <b>A link</b><i>URL</i>
                            <span>Reopens this exact poster. Nothing is stored on a server.</span>
                        </button>
                        {canShare && (
                            <button type="button" data-export="share" tabIndex={popOpen ? 0 : -1} onClick={() => onExport('share')}>
                                <b>Another app</b><i>Share</i>
                                <span>Opens your device's share sheet.</span>
                            </button>
                        )}
                        <div className="ps-pop__foot">
                            <span>PNG sharpness</span>
                            <div className="g-seg" role="group" aria-label="PNG sharpness">
                                {([1, 2, 4] as const).map((d) => (
                                    <button key={d} type="button" tabIndex={popOpen ? 0 : -1} aria-pressed={cfg.dpi === d} onClick={() => change({ dpi: d })}>{d}×</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <section className="ps-section">
                    <h3 className="ps-h">Words</h3>
                    <label className="ps-field">
                        <span>Title</span>
                        <input className="g-field" value={cfg.title} placeholder={repoName} onChange={(e) => change({ title: e.target.value })} />
                    </label>
                    <label className="ps-field">
                        <span>Tagline</span>
                        <input className="g-field" value={cfg.subtitle} placeholder={momentTagline || 'Written for you if left empty'} onChange={(e) => change({ subtitle: e.target.value })} />
                    </label>
                </section>

                <section className="ps-section">
                    <h3 className="ps-h">Colour</h3>
                    <div className="ps-swatches" role="group" aria-label="Colour theme">
                        {THEME_LIST.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                aria-pressed={themeId === t.id}
                                aria-label={t.name}
                                title={t.name}
                                onClick={() => themeId !== t.id && changeTheme(t.id as ThemeId)}
                                style={{ background: `conic-gradient(${t.colors.base} 0 50%, ${t.colors.foam} 0 75%, ${t.colors.gold} 0)` }}
                            />
                        ))}
                    </div>
                    <div className="g-seg" role="group" aria-label="Palette">
                        {MOODS.map((m) => (
                            <button key={m.id} type="button" aria-pressed={cfg.paletteMood === m.id} onClick={() => change({ paletteMood: m.id })}>{m.label}</button>
                        ))}
                    </div>
                </section>

                {showMarks && (
                    <section className="ps-section">
                        <h3 className="ps-h">What the marks mean</h3>
                        {showCtl('hue') && (
                            <div className="ps-choice">
                                <span id="ps-hue">Colour shows</span>
                                <div className="g-seg" role="group" aria-labelledby="ps-hue">
                                    {HUES.map((h) => (
                                        <button key={h.id} type="button" aria-pressed={enc.hue === h.id} disabled={h.id === 'churn' && !hasLineCounts} onClick={() => changeEncoding({ hue: h.id })}>{h.label}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {showCtl('size') && (
                            <div className="ps-choice">
                                <span id="ps-size">Size shows</span>
                                <div className="g-seg" role="group" aria-labelledby="ps-size">
                                    {SIZES.map((s) => (
                                        <button key={s.id} type="button" aria-pressed={enc.size === s.id} disabled={s.id === 'churn' && !hasLineCounts} onClick={() => changeEncoding({ size: s.id })}>{s.label}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {!hasLineCounts && (
                            <p className="ps-note">This repo was read without line counts, so "Lines changed" is not available.</p>
                        )}
                    </section>
                )}

                {(showCtl('layout') || sliders.length > 0) && (
                    <section className="ps-section">
                        <h3 className="ps-h">Fine tuning</h3>
                        {showCtl('layout') && (
                            <div className="ps-choice">
                                <span id="ps-layout">Direction</span>
                                <div className="g-seg" role="group" aria-labelledby="ps-layout">
                                    {LAYOUTS.map((l) => (
                                        <button key={l.id} type="button" aria-pressed={cfg.layout === l.id} onClick={() => change({ layout: l.id })}>{l.label}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {sliders.map((s) => (
                            <label key={s.key} className="ps-slider">
                                <span>{s.label}</span>
                                <input
                                    type="range"
                                    min={s.min}
                                    max={s.max}
                                    step={(s.max - s.min) / 50}
                                    value={enc[s.key]}
                                    onChange={(e) => changeEncoding({ [s.key]: Number(e.target.value) })}
                                />
                                <output>{Math.round(((enc[s.key] - s.min) / (s.max - s.min)) * 100)}</output>
                            </label>
                        ))}
                    </section>
                )}

                <section className="ps-section">
                    <h3 className="ps-h">Paper</h3>
                    <div className="ps-choice">
                        <span id="ps-orient">Shape</span>
                        <div className="g-seg" role="group" aria-labelledby="ps-orient">
                            {(['portrait', 'landscape'] as Orientation[]).map((o) => (
                                <button key={o} type="button" aria-pressed={cfg.orientation === o} onClick={() => change({ orientation: o })}>
                                    {o === 'portrait' ? 'Portrait' : 'Landscape'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <label className="ps-choice">
                        <span>Size</span>
                        <select className="g-field ps-select" aria-label="Paper size" value={cfg.size} onChange={(e) => change({ size: e.target.value as PosterSizeId })}>
                            {SIZE_GROUPS.map((g) => (
                                <optgroup key={g.label} label={g.label}>
                                    {g.ids.map((id) => (
                                        <option key={id} value={id}>{id === 'native' ? 'Best for this style' : POSTER_SIZES[id].name}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>
                    <div className="ps-checks">
                        <label><input type="checkbox" checked={cfg.showWatermark} onChange={(e) => change({ showWatermark: e.target.checked })} /> Git Sonar credit line</label>
                        <label><input type="checkbox" checked={cfg.showSignature} onChange={(e) => change({ showSignature: e.target.checked })} /> Date line</label>
                        <label><input type="checkbox" checked={cfg.printSafe} onChange={(e) => change({ printSafe: e.target.checked })} /> Print-safe colours</label>
                    </div>
                </section>

                {hasMoreCommits && (
                    <p className="ps-note">Showing the latest 1,000 commits of this repo.</p>
                )}

                <button type="button" className="ps-reset" onClick={() => { remember(); resetPosterConfig(); }}>
                    Start this poster over
                </button>
            </aside>
        </div>
    );
}

/** Put the permalink in the address bar without adding a history entry. */
function replaceAddress(url: string): void {
    try {
        window.history.replaceState(null, '', url);
    } catch {
        // Some embedded contexts forbid replaceState; the copied link still works.
    }
}
