/**
 * Poster export. SVG is the canonical vector output; PNG rasterizes the same
 * Scene via the canvas renderer (so page-loaded fonts render correctly), with a
 * runtime canvas-area clamp so true print sizes don't silently blank on Safari/
 * iOS. PDF is true vector via jsPDF + svg2pdf. All gated on font readiness.
 */

import type { RepoGraph } from '@lib/git/types';
import { renderPoster } from './poster-renderer';
import { sceneToSVG } from './render-svg';
import { renderSceneToCanvas } from './render-canvas';
import { ensureFontsReady, embeddedFontFaceCss, fontTtfBytes } from './fonts';
import { canvasAreaCap } from './sizes';
import { encodePosterConfig, type PosterConfig } from './poster-config';
import { getTemplateOrDefault } from './templates';

export interface ExportInfo {
    /** True if the requested raster size was clamped to fit the canvas cap. */
    clamped: boolean;
    /** Pixel size actually produced. */
    width: number;
    height: number;
    /** Human note about any clamping / routing decision. */
    note?: string;
}

function collectFonts(cfg: PosterConfig): string[] {
    return getTemplateOrDefault(cfg.template).fonts;
}

/** Accessible title/description derived from the config (WCAG 1.1.1). */
function a11y(cfg: PosterConfig, repoName?: string): { title: string; desc: string } {
    const name = cfg.title || repoName || 'repository';
    const tpl = getTemplateOrDefault(cfg.template).name;
    return {
        title: `${name} — ${tpl} poster`,
        desc: cfg.subtitle
            ? `${tpl} poster generated from the ${name} commit history. ${cfg.subtitle}`
            : `${tpl} poster generated from the ${name} commit history by Git Sonar.`,
    };
}

/** Build the canonical SVG string (vector; physical size for print presets). */
export async function posterToSVGString(graph: RepoGraph, cfg: PosterConfig, repoName?: string): Promise<string> {
    const { scene, target } = renderPoster(graph, cfg, repoName);
    const widthAttr = target.widthAttr ?? `${target.wPx}`;
    const heightAttr = target.heightAttr ?? `${target.hPx}`;
    const fontFaceCss = await embeddedFontFaceCss(collectFonts(cfg));
    return sceneToSVG(scene, { widthAttr, heightAttr, fontFaceCss, ...a11y(cfg, repoName) });
}

/** Render the poster to a PNG blob. Clamps area to the device canvas cap. */
export async function posterToPNGBlob(
    graph: RepoGraph,
    cfg: PosterConfig,
    repoName?: string
): Promise<{ blob: Blob; info: ExportInfo }> {
    await ensureFontsReady(collectFonts(cfg));
    const { scene, target } = renderPoster(graph, cfg, repoName);

    let scale = Math.max(target.wPx / scene.width, 1);
    let outW = Math.round(scene.width * scale);
    let outH = Math.round(scene.height * scale);
    let clamped = false;
    let note: string | undefined;

    const cap = canvasAreaCap();
    if (outW * outH > cap) {
        // Clamp to this browser's single-canvas cap, keeping aspect. Only Safari/
        // iOS actually hits this for true print sizes; Chrome/Firefox rarely do.
        const k = Math.sqrt((cap * 0.95) / (outW * outH));
        scale *= k;
        outW = Math.round(scene.width * scale);
        outH = Math.round(scene.height * scale);
        clamped = true;
        note = 'Raster size exceeded this browser’s canvas limit and was reduced. Use SVG or PDF for full-resolution print output.';
    }

    const canvas = makeCanvas(outW, outH);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Could not acquire 2D context for export');
    ctx.save();
    ctx.scale(outW / scene.width, outH / scene.height);
    renderSceneToCanvas(ctx, scene);
    ctx.restore();

    const blob = await canvasToBlob(canvas);
    return { blob, info: { clamped, width: outW, height: outH, note } };
}

/**
 * Build an animated, embeddable SVG (pure CSS, no JS): the poster "draws
 * itself" — nodes reveal in commit order, strokes draw on, text fades in — then
 * freezes. It plays when the SVG is opened directly; note that GitHub's README
 * image sanitizer strips CSS animation, so a README embed shows the final frame.
 */
export async function posterToAnimatedSVGString(graph: RepoGraph, cfg: PosterConfig, repoName?: string): Promise<string> {
    const { scene, target } = renderPoster(graph, cfg, repoName);
    const widthAttr = target.widthAttr ?? `${Math.min(1200, target.wPx)}`;
    const heightAttr = target.heightAttr ?? `${Math.round((Math.min(1200, target.wPx) / scene.width) * scene.height)}`;
    const fontFaceCss = await embeddedFontFaceCss(collectFonts(cfg));
    return sceneToSVG(scene, { widthAttr, heightAttr, fontFaceCss, animate: true, ...a11y(cfg, repoName) });
}

export async function downloadPosterAnimatedSVG(graph: RepoGraph, cfg: PosterConfig, repoName?: string, filename = 'git-sonar-poster.animated.svg'): Promise<void> {
    const svg = await posterToAnimatedSVGString(graph, cfg, repoName);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

/** Render the poster to a print-ready vector PDF (true vector via svg2pdf). */
export async function posterToPDFBlob(graph: RepoGraph, cfg: PosterConfig, repoName?: string): Promise<Blob> {
    const fontKeys = collectFonts(cfg);
    await ensureFontsReady(fontKeys);
    const { scene, target } = renderPoster(graph, cfg, repoName);
    const meta = a11y(cfg, repoName);
    const fontFaceCss = await embeddedFontFaceCss(fontKeys);
    const svg = sceneToSVG(scene, { fontFaceCss, ...meta });

    const { jsPDF } = await import('jspdf');
    await import('svg2pdf.js');

    // Page size in points (72pt/in) from the print preset, else from px @72dpi.
    const inches = target.inches ?? { w: scene.width / 96, h: scene.height / 96 };
    const wPt = inches.w * 72;
    const hPt = inches.h * 72;

    const doc = new jsPDF({
        unit: 'pt',
        format: [wPt, hPt],
        orientation: wPt >= hPt ? 'landscape' : 'portrait',
        compress: true,
    });
    doc.setProperties({ title: meta.title, subject: meta.desc, creator: 'Git Sonar', author: 'Git Sonar' });

    // Register the real faces so svg2pdf renders true type instead of Helvetica.
    // svg2pdf (jsPDF 2.3+) requests a <text> by (family, STYLE) where jsPDF's
    // combineFontStyleAndFontWeight maps weight 400 -> 'normal', 700 -> 'bold',
    // else -> 'normal'+weight (e.g. 'normal500'). If that (family, style) isn't
    // registered jsPDF silently falls back to Helvetica. We register each face
    // by passing the BASE style 'normal' + the numeric weight, so jsPDF runs the
    // SAME combine once and stores exactly the key svg2pdf will look up. A
    // nearest-face fallback across the weight sweep covers any un-audited weight.
    // Best-effort: a registration failure degrades, it never breaks the export.
    try {
        const fonts = await fontTtfBytes(fontKeys);
        const reg = doc as unknown as {
            addFileToVFS: (name: string, b64: string) => void;
            addFont: (name: string, family: string, style: string, weight: number) => void;
        };
        const byFamily = new Map<string, { weight: number; vfs: string }[]>();
        for (const f of fonts) {
            const vfs = `${f.family.replace(/\s+/g, '')}-${f.weight}.ttf`;
            reg.addFileToVFS(vfs, f.base64);
            reg.addFont(vfs, f.family, 'normal', f.weight);
            const list = byFamily.get(f.family) ?? [];
            list.push({ weight: f.weight, vfs });
            byFamily.set(f.family, list);
        }
        // Map every common weight svg2pdf might request to the nearest embedded
        // weight of that family, so an un-audited weight still renders in the
        // correct typeface rather than Helvetica.
        for (const [family, faces] of byFamily) {
            const have = new Set(faces.map((f) => f.weight));
            for (const w of [300, 400, 500, 600, 700, 800, 900]) {
                if (have.has(w)) continue;
                const nearest = faces.reduce((a, b) => (Math.abs(b.weight - w) < Math.abs(a.weight - w) ? b : a));
                reg.addFont(nearest.vfs, family, 'normal', w);
            }
        }
    } catch {
        /* font registration is best-effort; the PDF still renders */
    }

    const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement as unknown as Element;
    // svg2pdf augments jsPDF instances with `.svg()`.
    await (doc as unknown as { svg: (el: Element, o: { x: number; y: number; width: number; height: number }) => Promise<unknown> })
        .svg(el, { x: 0, y: 0, width: wPt, height: hPt });
    return doc.output('blob');
}

/** Trigger a file download for a blob/string. */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadPosterSVG(graph: RepoGraph, cfg: PosterConfig, repoName?: string, filename = 'git-sonar-poster.svg'): Promise<void> {
    const svg = await posterToSVGString(graph, cfg, repoName);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function downloadPosterPNG(graph: RepoGraph, cfg: PosterConfig, repoName?: string, filename = 'git-sonar-poster.png'): Promise<ExportInfo> {
    const { blob, info } = await posterToPNGBlob(graph, cfg, repoName);
    downloadBlob(blob, filename);
    return info;
}

export async function downloadPosterPDF(graph: RepoGraph, cfg: PosterConfig, repoName?: string, filename = 'git-sonar-poster.pdf'): Promise<void> {
    const blob = await posterToPDFBlob(graph, cfg, repoName);
    downloadBlob(blob, filename);
}

/** Share via the Web Share API (mobile) with a PNG file, or fall back to download. */
export async function sharePoster(graph: RepoGraph, cfg: PosterConfig, repoName?: string): Promise<'shared' | 'downloaded'> {
    const { blob } = await posterToPNGBlob(graph, cfg, repoName);
    const file = new File([blob], 'git-sonar-poster.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: ShareData & { files?: File[] }) => Promise<void> };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: cfg.title || 'Git Sonar poster' });
        return 'shared';
    }
    downloadBlob(blob, 'git-sonar-poster.png');
    return 'downloaded';
}

/** Copy the poster PNG to the clipboard (the highest-frequency share action). */
export async function copyPosterImage(graph: RepoGraph, cfg: PosterConfig, repoName?: string): Promise<'copied' | 'downloaded'> {
    const { blob } = await posterToPNGBlob(graph, cfg, repoName);
    const clip = navigator as Navigator & { clipboard?: { write?: (items: ClipboardItem[]) => Promise<void> } };
    if (typeof ClipboardItem !== 'undefined' && clip.clipboard?.write) {
        try {
            await clip.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            return 'copied';
        } catch {
            /* fall through to download */
        }
    }
    downloadBlob(blob, 'git-sonar-poster.png');
    return 'downloaded';
}

/** Build a shareable permalink (#p=<encoded>) for the current poster config. */
/** What repo the poster was made from, so a shared link can reload it. */
export interface PermalinkSource {
    provider?: 'github' | 'gitlab' | 'bitbucket' | null;
    repoPath?: string | null;
    demo?: string | null;
}

/**
 * Build a permalink for the current poster. The config always rides in the
 * hash; when the poster came from a PUBLIC provider repo or a demo, the source
 * is encoded too so the link reproduces the poster for anyone who opens it.
 * For local/ZIP imports (private code) only the config is encoded — the link
 * restores the settings, and the recipient loads their own repo.
 */
export function posterPermalink(cfg: PosterConfig, source?: PermalinkSource, base?: string): { url: string; reproducible: boolean } {
    const encoded = encodePosterConfig(cfg);
    const origin = base ?? (typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '/app');
    const params = new URLSearchParams();
    let reproducible = false;
    if (source?.demo) {
        params.set('demo', source.demo);
        reproducible = true;
    } else if (source?.provider && source?.repoPath) {
        params.set(source.provider, source.repoPath);
        reproducible = true;
    }
    params.set('view', 'poster');
    return { url: `${origin}?${params.toString()}#p=${encoded}`, reproducible };
}

// ---- canvas helpers (OffscreenCanvas when available) ----
function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

async function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
    if ('convertToBlob' in canvas) {
        return canvas.convertToBlob({ type: 'image/png' });
    }
    return new Promise((resolve, reject) => {
        (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
}
