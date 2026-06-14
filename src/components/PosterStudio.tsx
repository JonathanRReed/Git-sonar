/**
 * Poster Studio — the art editor surface.
 *
 * Shown when viewMode === 'poster'. Renders a live canvas preview of the current
 * poster (graph + posterConfig → Scene) alongside a control panel: template
 * gallery, palette/theme, layout, size/orientation/DPI, a few encoding sliders,
 * title/subtitle, seed + shuffle, and PNG/SVG/PDF/share/permalink export. All
 * state lives in the store's structured `posterConfig`, so posters are
 * reproducible and shareable.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useGraphStore } from '@lib/store/graph-store';
import { renderPoster } from '@lib/art/poster-renderer';
import { renderSceneToCanvas } from '@lib/art/render-canvas';
import { TEMPLATE_LIST, getTemplateOrDefault } from '@lib/art/templates';
import type { ControlKey, PosterTemplate } from '@lib/art/template';
import { loadFonts } from '@lib/art/fonts';
import { POSTER_SIZES, type PosterSizeId, type Orientation } from '@lib/art/sizes';
import type { PaletteMood } from '@lib/art/palette';
import type { LayoutMode } from '@lib/art/layout';
import type { HueSignal, SizeSignal } from '@lib/art/encoding';
import { decodePosterConfig } from '@lib/art/poster-config';
import {
    downloadPosterSVG,
    downloadPosterPNG,
    downloadPosterPDF,
    downloadPosterAnimatedSVG,
    copyPosterImage,
    sharePoster,
    posterPermalink,
} from '@lib/art/export';

const THEMES: { id: 'night' | 'dawn' | 'github' | 'nord' | 'dracula'; label: string }[] = [
    { id: 'night', label: 'Night' },
    { id: 'dawn', label: 'Dawn' },
    { id: 'github', label: 'GitHub' },
    { id: 'nord', label: 'Nord' },
    { id: 'dracula', label: 'Dracula' },
];
const MOODS: PaletteMood[] = ['theme', 'duotone', 'mono', 'vivid'];
const LAYOUTS: LayoutMode[] = ['vertical', 'horizontal', 'radial'];
const HUES: HueSignal[] = ['author', 'lane', 'time', 'churn'];
const SIZES_FIELD: SizeSignal[] = ['churn', 'uniform', 'recency', 'merge'];
const SIZE_IDS = Object.keys(POSTER_SIZES) as PosterSizeId[];

function repoNameFrom(path: string | null): string {
    if (!path) return 'repository';
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? path;
}

export function PosterStudio() {
    const graph = useGraphStore((s) => s.graph);
    const cfg = useGraphStore((s) => s.posterConfig);
    const themeId = useGraphStore((s) => s.themeId);
    const viewMode = useGraphStore((s) => s.viewMode);
    const repoPath = useGraphStore((s) => s.currentRepoPath);
    const repoProvider = useGraphStore((s) => s.currentRepoProvider);
    const currentDemo = useGraphStore((s) => s.currentDemo);
    const update = useGraphStore((s) => s.updatePosterConfig);
    const setPosterConfig = useGraphStore((s) => s.setPosterConfig);
    const resetPosterConfig = useGraphStore((s) => s.resetPosterConfig);
    const setTheme = useGraphStore((s) => s.setTheme);
    const setViewMode = useGraphStore((s) => s.setViewMode);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const repoName = useMemo(() => repoNameFrom(repoPath), [repoPath]);

    // Load all template fonts once so the preview/export render correctly.
    useEffect(() => {
        loadFonts(TEMPLATE_LIST.flatMap((t) => t.fonts));
    }, []);

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

    // Default the title to the repo name the first time the studio opens.
    useEffect(() => {
        if (viewMode === 'poster' && graph && !cfg.title) {
            update({ title: repoName });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, graph]);

    // Render the live preview (debounced) whenever the config or graph changes.
    const renderPreview = useCallback(() => {
        const canvas = canvasRef.current;
        const stage = stageRef.current;
        if (!canvas || !stage || !graph) return;
        let result;
        try {
            result = renderPoster(graph, cfg, repoName);
        } catch {
            return;
        }
        const { scene } = result;
        const stageW = stage.clientWidth - 32;
        const stageH = stage.clientHeight - 32;
        if (stageW <= 0 || stageH <= 0) return;
        const fit = Math.min(stageW / scene.width, stageH / scene.height);
        const cssW = Math.max(1, Math.round(scene.width * fit));
        const cssH = Math.max(1, Math.round(scene.height * fit));
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
    }, [graph, cfg, repoName]);

    useEffect(() => {
        if (viewMode !== 'poster') return;
        const id = window.setTimeout(renderPreview, 90);
        return () => window.clearTimeout(id);
    }, [renderPreview, viewMode]);

    useEffect(() => {
        if (viewMode !== 'poster') return;
        // Fonts may finish loading after first paint; re-render when ready.
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        fonts?.ready.then(() => renderPreview());
        const onResize = () => renderPreview();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [renderPreview, viewMode]);

    const flash = useCallback((msg: string) => {
        setStatus(msg);
        window.setTimeout(() => setStatus(''), 3500);
    }, []);

    const guardGraph = useCallback((): boolean => {
        if (!graph) {
            flash('Import a repository first.');
            return false;
        }
        return true;
    }, [graph, flash]);

    const onExport = useCallback(
        async (kind: 'png' | 'copy' | 'svg' | 'pdf' | 'animate' | 'embed' | 'share' | 'link') => {
            if (!graph || !guardGraph()) return;
            setBusy(true);
            try {
                const name = `${repoName}-${cfg.template}`;
                if (kind === 'svg') {
                    await downloadPosterSVG(graph, cfg, repoName, `${name}.svg`);
                    flash('SVG downloaded — vector with fonts embedded (falls back to system fonts only if a face couldn’t be fetched).');
                } else if (kind === 'png') {
                    const info = await downloadPosterPNG(graph, cfg, repoName, `${name}.png`);
                    flash(info.clamped ? `PNG downloaded (reduced to ${info.width}×${info.height}; use SVG/PDF for full print res).` : 'PNG downloaded.');
                } else if (kind === 'copy') {
                    const r = await copyPosterImage(graph, cfg, repoName);
                    flash(r === 'copied' ? 'Image copied — paste it anywhere.' : 'Downloaded (clipboard unavailable).');
                } else if (kind === 'pdf') {
                    await downloadPosterPDF(graph, cfg, repoName, `${name}.pdf`);
                    flash('Vector PDF downloaded — print-dimensioned, sRGB, fonts embedded.');
                } else if (kind === 'animate') {
                    await downloadPosterAnimatedSVG(graph, cfg, repoName, `${name}.animated.svg`);
                    flash('Animated SVG downloaded — it plays when opened directly.');
                } else if (kind === 'embed') {
                    const file = `${name}.animated.svg`;
                    await downloadPosterAnimatedSVG(graph, cfg, repoName, file);
                    const md = `![${repoName} — built with Git Sonar](./${file})`;
                    try {
                        await navigator.clipboard?.writeText(md);
                        flash('Animated SVG + README snippet copied. Commit the SVG; it plays when opened (GitHub shows the final frame).');
                    } catch {
                        flash(`Animated SVG downloaded. Commit it, then add: ${md}`);
                    }
                } else if (kind === 'share') {
                    const r = await sharePoster(graph, cfg, repoName);
                    flash(r === 'shared' ? 'Shared.' : 'Downloaded (sharing unavailable).');
                } else if (kind === 'link') {
                    const { url, reproducible } = posterPermalink(cfg, { provider: repoProvider, repoPath, demo: currentDemo });
                    history.replaceState(null, '', url);
                    const msg = reproducible
                        ? 'Shareable link copied — it reopens this exact poster.'
                        : 'Link copied — it restores these settings; open the same repo to reproduce the poster.';
                    try {
                        await navigator.clipboard?.writeText(url);
                        flash(msg);
                    } catch {
                        flash('Link set in the address bar — copy it to share.');
                    }
                }
            } catch (err) {
                flash(err instanceof Error ? `Export failed: ${err.message}` : 'Export failed.');
            } finally {
                setBusy(false);
            }
        },
        [graph, cfg, repoName, repoProvider, repoPath, currentDemo, guardGraph, flash]
    );

    const shuffle = useCallback(() => {
        update({ seed: Math.floor((performance.now() * 1000) % 1e9).toString(36) + (cfg.seed.length % 7) });
    }, [update, cfg.seed]);

    const enc = cfg.encoding;
    const activeTemplate = getTemplateOrDefault(cfg.template);
    const showCtl = (k: ControlKey): boolean =>
        !activeTemplate.relevantControls || activeTemplate.relevantControls.includes(k);
    const hasEncodingControls = (['hue', 'size', 'sizeScale', 'weightScale', 'turbulence', 'densityAmount', 'glow'] as ControlKey[]).some(showCtl);

    // Apply a template's hero preset (encoding/mood/seed/layout) on select.
    const applyTemplate = (t: PosterTemplate) =>
        update({
            template: t.id,
            layout: t.recommendedLayout ?? cfg.layout,
            paletteMood: t.defaultMood ?? cfg.paletteMood,
            seed: t.heroSeed ?? cfg.seed,
            encoding: { ...cfg.encoding, ...(t.defaultEncoding ?? {}) },
        });

    return (
        <div className="poster-studio" data-busy={busy}>
            <div className="ps-stage" ref={stageRef}>
                <h2 className="ps-sr-only">Poster Studio</h2>
                <div className="ps-modeswitch">
                    <button type="button" onClick={() => setViewMode('inspect')}>← Back to graph</button>
                    <span className="ps-mode-current" aria-hidden="true">Poster Studio</span>
                </div>
                {graph ? (
                    <canvas ref={canvasRef} className="ps-canvas" role="img" aria-label={`Live preview of the ${getTemplateOrDefault(cfg.template).name} poster for ${repoName}`} />
                ) : (
                    <div className="ps-empty">Import a repository to start designing a poster.</div>
                )}
                {status && <div className="ps-toast" role="status">{status}</div>}
            </div>

            <aside className="ps-panel" aria-label="Poster controls">
                <Section title="Template">
                    <div className="ps-gallery">
                        {TEMPLATE_LIST.map((t) => (
                            <button
                                key={t.id}
                                className={`ps-tpl ${cfg.template === t.id ? 'is-active' : ''}`}
                                onClick={() => applyTemplate(t)}
                                title={t.description}
                            >
                                <span className="ps-tpl__name">{t.name}</span>
                                <span className="ps-tpl__group">{t.group}</span>
                            </button>
                        ))}
                    </div>
                </Section>

                <Section title="Text">
                    <label className="ps-field">
                        <span>Title</span>
                        <input value={cfg.title} placeholder={repoName} onChange={(e) => update({ title: e.target.value })} />
                    </label>
                    <label className="ps-field">
                        <span>Subtitle</span>
                        <input value={cfg.subtitle} placeholder="optional tagline" onChange={(e) => update({ subtitle: e.target.value })} />
                    </label>
                </Section>

                <Section title="Look">
                    <Row label="Theme">
                        <select value={themeId} onChange={(e) => setTheme(e.target.value as typeof themeId)}>
                            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                    </Row>
                    <Row label="Palette">
                        <select value={cfg.paletteMood} onChange={(e) => update({ paletteMood: e.target.value as PaletteMood })}>
                            {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </Row>
                    {showCtl('layout') && (
                        <Row label="Layout">
                            <select value={cfg.layout} onChange={(e) => update({ layout: e.target.value as LayoutMode })}>
                                {LAYOUTS.map((l) => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </Row>
                    )}
                </Section>

                {hasEncodingControls && (
                    <Section title="Encoding">
                        {showCtl('hue') && (
                            <Row label="Color by">
                                <select value={enc.hue} onChange={(e) => update({ encoding: { ...enc, hue: e.target.value as HueSignal } })}>
                                    {HUES.map((h) => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </Row>
                        )}
                        {showCtl('size') && (
                            <Row label="Size by">
                                <select value={enc.size} onChange={(e) => update({ encoding: { ...enc, size: e.target.value as SizeSignal } })}>
                                    {SIZES_FIELD.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Row>
                        )}
                        {showCtl('sizeScale') && <Slider label="Node size" value={enc.sizeScale} min={0.4} max={2.5} step={0.05} onChange={(v) => update({ encoding: { ...enc, sizeScale: v } })} />}
                        {showCtl('weightScale') && <Slider label="Line weight" value={enc.weightScale} min={0.4} max={2.5} step={0.05} onChange={(v) => update({ encoding: { ...enc, weightScale: v } })} />}
                        {showCtl('turbulence') && <Slider label="Turbulence" value={enc.turbulence} min={0} max={1} step={0.02} onChange={(v) => update({ encoding: { ...enc, turbulence: v } })} />}
                        {showCtl('densityAmount') && <Slider label="Density" value={enc.densityAmount} min={0.05} max={1} step={0.02} onChange={(v) => update({ encoding: { ...enc, densityAmount: v } })} />}
                        {showCtl('glow') && <Slider label="Glow" value={enc.glow} min={0} max={1} step={0.02} onChange={(v) => update({ encoding: { ...enc, glow: v } })} />}
                    </Section>
                )}

                <Section title="Format">
                    <Row label="Size">
                        <select value={cfg.size} onChange={(e) => update({ size: e.target.value as PosterSizeId })}>
                            {SIZE_IDS.map((s) => <option key={s} value={s}>{POSTER_SIZES[s].name}</option>)}
                        </select>
                    </Row>
                    <Row label="Orientation">
                        <select value={cfg.orientation} onChange={(e) => update({ orientation: e.target.value as Orientation })}>
                            <option value="portrait">Portrait</option>
                            <option value="landscape">Landscape</option>
                        </select>
                    </Row>
                    <Row label="Quality">
                        <select value={cfg.dpi} onChange={(e) => update({ dpi: Number(e.target.value) as 1 | 2 | 4 })}>
                            <option value={1}>1× web</option>
                            <option value={2}>2× sharp</option>
                            <option value={4}>4× print</option>
                        </select>
                    </Row>
                    <div className="ps-checks">
                        <label><input type="checkbox" checked={cfg.showWatermark} onChange={(e) => update({ showWatermark: e.target.checked })} /> Watermark</label>
                        <label><input type="checkbox" checked={cfg.showSignature} onChange={(e) => update({ showSignature: e.target.checked })} /> Signature</label>
                        <label><input type="checkbox" checked={cfg.printSafe} onChange={(e) => update({ printSafe: e.target.checked })} /> Print-safe color</label>
                    </div>
                </Section>

                <Section title="Seed">
                    <div className="ps-seed">
                        <input value={cfg.seed} onChange={(e) => update({ seed: e.target.value })} aria-label="Seed" />
                        <button onClick={shuffle} title="Shuffle variant">⟳ Shuffle</button>
                    </div>
                </Section>

                <div className="ps-exports">
                    <button className="ps-btn ps-btn--primary" disabled={busy} onClick={() => onExport('png')}>Download PNG</button>
                    <button className="ps-btn" disabled={busy} onClick={() => onExport('copy')}>Copy image</button>
                    <button className="ps-btn" disabled={busy} onClick={() => onExport('svg')}>SVG</button>
                    <button className="ps-btn" disabled={busy} onClick={() => onExport('pdf')}>PDF</button>
                    <button className="ps-btn" disabled={busy} onClick={() => onExport('animate')}>Animated SVG</button>
                    <button className="ps-btn" disabled={busy} onClick={() => onExport('embed')}>README embed</button>
                    <button className="ps-btn" disabled={busy} onClick={() => onExport('share')}>Share</button>
                    <button className="ps-btn" disabled={busy} onClick={() => onExport('link')}>Copy link</button>
                    <button className="ps-btn ps-btn--ghost" onClick={resetPosterConfig}>Reset</button>
                </div>
            </aside>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="ps-section">
            <h3>{title}</h3>
            {children}
        </section>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="ps-row">
            <span>{label}</span>
            {children}
        </label>
    );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
    return (
        <label className="ps-slider">
            <span>{label}<em>{value.toFixed(2)}</em></span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        </label>
    );
}
