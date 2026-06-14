/**
 * Scene → SVG. This is the canonical poster output and the single source of
 * truth: the PNG/PDF paths rasterize/convert this exact SVG so vector == raster
 * == preview.
 */

import type { Scene, SceneEdge, SceneNode, SceneStroke, SceneText, Vec2 } from './scene';
import { withAlpha } from './palette';

export interface SvgRenderOptions {
    /**
     * Pre-built `@font-face` CSS (base64 TTF) to inline so the standalone SVG
     * renders with real type off-machine. Built async via
     * `fonts.ts embeddedFontFaceCss` and passed by the export paths.
     */
    fontFaceCss?: string;
    /** Physical size attributes, e.g. "24in" — enables print sizing. */
    widthAttr?: string;
    heightAttr?: string;
    /** Accessible name for the poster (WCAG 1.1.1) — rendered as <title>. */
    title?: string;
    /** Longer accessible description — rendered as <desc>. */
    desc?: string;
    /**
     * Emit an animated, embeddable SVG: nodes reveal in commit order, strokes
     * draw on, and text fades in, then everything freezes. Pure SMIL — no JS —
     * so it animates inline in a GitHub README. Total reveal ~`animateDuration`s.
     */
    animate?: boolean;
    /** Total reveal duration in seconds (default 3.5). */
    animateDuration?: number;
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function num(n: number): string {
    return (Math.round(n * 100) / 100).toString();
}

/** Build a path `d` from a polyline with the requested interpolation. */
function pathD(points: Vec2[], curve: SceneEdge['curve'] | 'smooth-stroke', closed = false): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${num(points[0].x)} ${num(points[0].y)}`;

    if (curve === 'bezierV' && points.length === 2) {
        const [a, b] = points;
        const midY = (a.y + b.y) / 2;
        return `M ${num(a.x)} ${num(a.y)} C ${num(a.x)} ${num(midY)}, ${num(b.x)} ${num(midY)}, ${num(b.x)} ${num(b.y)}`;
    }
    if (curve === 'bezierH' && points.length === 2) {
        const [a, b] = points;
        const midX = (a.x + b.x) / 2;
        return `M ${num(a.x)} ${num(a.y)} C ${num(midX)} ${num(a.y)}, ${num(midX)} ${num(b.y)}, ${num(b.x)} ${num(b.y)}`;
    }
    if (curve === 'smooth' || curve === 'smooth-stroke') {
        // Catmull-Rom → cubic bezier.
        let d = `M ${num(points[0].x)} ${num(points[0].y)}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i === 0 ? 0 : i - 1];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[i + 2 < points.length ? i + 2 : points.length - 1];
            const c1x = p1.x + (p2.x - p0.x) / 6;
            const c1y = p1.y + (p2.y - p0.y) / 6;
            const c2x = p2.x - (p3.x - p1.x) / 6;
            const c2y = p2.y - (p3.y - p1.y) / 6;
            d += ` C ${num(c1x)} ${num(c1y)}, ${num(c2x)} ${num(c2y)}, ${num(p2.x)} ${num(p2.y)}`;
        }
        return closed ? d + ' Z' : d;
    }
    // straight polyline
    let d = `M ${num(points[0].x)} ${num(points[0].y)}`;
    for (let i = 1; i < points.length; i++) d += ` L ${num(points[i].x)} ${num(points[i].y)}`;
    return closed ? d + ' Z' : d;
}

function glyphSvg(n: SceneNode): string {
    const { x, y, r, shape } = n;
    const fill = n.fill;
    const stroke = n.stroke ? ` stroke="${n.stroke}" stroke-width="${num(n.strokeWidth ?? 1)}"` : '';
    const data = n.sha ? ` data-sha="${esc(n.sha)}"${n.kind ? ` data-type="${n.kind}"` : ''}` : '';
    const op = n.opacity !== 1 ? ` opacity="${num(n.opacity)}"` : '';

    switch (shape) {
        case 'diamond':
            return `<polygon points="${num(x)},${num(y - r)} ${num(x + r)},${num(y)} ${num(x)},${num(y + r)} ${num(x - r)},${num(y)}" fill="${fill}"${stroke}${op}${data}/>`;
        case 'square':
            return `<rect x="${num(x - r)}" y="${num(y - r)}" width="${num(r * 2)}" height="${num(r * 2)}" fill="${fill}"${stroke}${op}${data}/>`;
        case 'triangle': {
            const h = r * 1.15;
            return `<polygon points="${num(x)},${num(y - h)} ${num(x + r)},${num(y + h * 0.7)} ${num(x - r)},${num(y + h * 0.7)}" fill="${fill}"${stroke}${op}${data}/>`;
        }
        case 'hexagon': {
            const pts: string[] = [];
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i - Math.PI / 6;
                pts.push(`${num(x + r * Math.cos(a))},${num(y + r * Math.sin(a))}`);
            }
            return `<polygon points="${pts.join(' ')}" fill="${fill}"${stroke}${op}${data}/>`;
        }
        case 'star': {
            const pts: string[] = [];
            for (let i = 0; i < 10; i++) {
                const rad = i % 2 === 0 ? r : r * 0.45;
                const a = (Math.PI / 5) * i - Math.PI / 2;
                pts.push(`${num(x + rad * Math.cos(a))},${num(y + rad * Math.sin(a))}`);
            }
            return `<polygon points="${pts.join(' ')}" fill="${fill}"${stroke}${op}${data}/>`;
        }
        case 'ring':
            return `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="none" stroke="${fill}" stroke-width="${num(Math.max(1, r * 0.4))}"${op}${data}/>`;
        case 'plus': {
            const t = r * 0.4;
            return `<path d="M ${num(x - t)} ${num(y - r)} h ${num(2 * t)} v ${num(r - t)} h ${num(r - t)} v ${num(2 * t)} h ${num(-(r - t))} v ${num(r - t)} h ${num(-2 * t)} v ${num(-(r - t))} h ${num(-(r - t))} v ${num(-2 * t)} h ${num(r - t)} Z" fill="${fill}"${stroke}${op}${data}/>`;
        }
        case 'none':
            return '';
        case 'circle':
        default:
            return `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="${fill}"${stroke}${op}${data}/>`;
    }
}

function textSvg(t: SceneText): string {
    const anchor = t.align;
    const ls = t.letterSpacing ? ` letter-spacing="${num(t.letterSpacing)}"` : '';
    const op = t.opacity != null && t.opacity !== 1 ? ` opacity="${num(t.opacity)}"` : '';
    const rotate = t.rotate ? ` transform="rotate(${num(t.rotate)} ${num(t.x)} ${num(t.y)})"` : '';
    return `<text x="${num(t.x)}" y="${num(t.y)}" text-anchor="${anchor}" font-family="${esc(t.fontFamily)}" font-size="${num(t.fontSize)}" font-weight="${t.fontWeight}" fill="${t.color}"${ls}${op}${rotate}>${esc(t.text)}</text>`;
}

export function sceneToSVG(scene: Scene, opts: SvgRenderOptions = {}): string {
    const { width, height, background } = scene;
    const parts: string[] = [];
    const widthAttr = opts.widthAttr ?? `${width}`;
    const heightAttr = opts.heightAttr ?? `${height}`;
    const a11yTitle = opts.title?.trim() || 'Git Sonar poster';
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" height="${heightAttr}" viewBox="0 0 ${num(width)} ${num(height)}" role="img" xml:lang="en" aria-label="${esc(a11yTitle)}">`
    );
    // Accessible name/description (WCAG 1.1.1) for the most-shared artifact.
    parts.push(`<title>${esc(a11yTitle)}</title>`);
    if (opts.desc) parts.push(`<desc>${esc(opts.desc)}</desc>`);

    // defs
    parts.push('<defs>');
    if (background.kind === 'gradient') {
        const angle = ((background.angle ?? 135) * Math.PI) / 180;
        const cx = width / 2, cy = height / 2;
        const half = Math.max(width, height) / 2;
        const x0 = cx + Math.cos(angle + Math.PI) * half;
        const y0 = cy + Math.sin(angle + Math.PI) * half;
        const x1 = cx + Math.cos(angle) * half;
        const y1 = cy + Math.sin(angle) * half;
        parts.push(
            `<linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="${num(x0)}" y1="${num(y0)}" x2="${num(x1)}" y2="${num(y1)}"><stop offset="0%" stop-color="${background.color ?? '#000'}"/><stop offset="100%" stop-color="${background.color2 ?? '#111'}"/></linearGradient>`
        );
    }
    if (background.kind === 'grid') {
        const gs = background.gridSize ?? 80;
        parts.push(
            `<pattern id="grid" width="${gs}" height="${gs}" patternUnits="userSpaceOnUse"><path d="M ${gs} 0 L 0 0 0 ${gs}" fill="none" stroke="${background.gridColor ?? withAlpha(background.color ?? '#fff', 0.08)}" stroke-width="1"/></pattern>`
        );
    }
    if (background.vignette) {
        parts.push(
            `<radialGradient id="vig" cx="50%" cy="46%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="${num(background.vignette)}"/></radialGradient>`
        );
    }
    if (background.grain) {
        parts.push(
            `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="${num(background.grain)}"/></feComponentTransfer><feComposite operator="over" in2="SourceGraphic"/></filter>`
        );
    }
    // soft glow for halos
    parts.push('<filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>');
    const styleBits: string[] = [];
    // Inline the real faces (base64 TTF) so a downloaded SVG keeps its type on
    // any machine. `fontFaceCss` is built async by the export path.
    if (opts.fontFaceCss) styleBits.push(opts.fontFaceCss);
    if (opts.animate) {
        // CSS-based reveal (not SMIL): the STATIC fallback is fully visible, so a
        // reduced-motion viewer or a context without CSS animation sees the whole
        // poster. Motion only runs under prefers-reduced-motion: no-preference.
        styleBits.push(
            '@keyframes gsfade{from{opacity:0}to{opacity:1}}' +
            '@keyframes gsdraw{to{stroke-dashoffset:0}}' +
            '.ga{opacity:1}.gd{stroke-dashoffset:0}' +
            '@media (prefers-reduced-motion: no-preference){' +
            '.ga{opacity:0;animation:gsfade .5s ease forwards}' +
            '.gd{stroke-dashoffset:var(--l);animation:gsdraw .9s ease forwards}}'
        );
    }
    if (styleBits.length) parts.push(`<style>${styleBits.join('')}</style>`);
    parts.push('</defs>');

    // background
    if (background.kind === 'solid' || background.kind === 'grid') {
        parts.push(`<rect width="100%" height="100%" fill="${background.color ?? '#000'}"/>`);
    } else if (background.kind === 'gradient') {
        parts.push(`<rect width="100%" height="100%" fill="url(#bg)"/>`);
    }
    if (background.kind === 'grid') {
        parts.push(`<rect width="100%" height="100%" fill="url(#grid)"/>`);
    }

    const anim = opts.animate ? (opts.animateDuration ?? 3.5) : 0;

    // generative under-layer strokes
    if (scene.strokes.length) {
        parts.push('<g fill="none" stroke-linecap="round" stroke-linejoin="round">');
        scene.strokes.forEach((s, i) => {
            const delay = anim ? (i / scene.strokes.length) * anim * 0.8 : -1;
            parts.push(strokeSvg(s, delay));
        });
        parts.push('</g>');
    }

    // edges (drawn under nodes) with a subtle dark casing for legibility
    if (scene.edges.length) {
        parts.push('<g fill="none" stroke-linecap="round" stroke-linejoin="round">');
        for (const e of scene.edges) {
            const d = pathD(e.points, e.curve ?? 'line');
            parts.push(`<path d="${d}" stroke="${e.color}" stroke-width="${num(e.width)}" opacity="${num(e.opacity)}"/>`);
        }
        parts.push('</g>');
    }

    // node halos
    const glowing = scene.nodes.filter((n) => (n.glow ?? 0) > 0.01);
    if (glowing.length) {
        parts.push('<g>');
        for (const n of glowing) {
            parts.push(
                `<circle cx="${num(n.x)}" cy="${num(n.y)}" r="${num(n.r * 2.4)}" fill="${withAlpha(n.fill, 0.16 * (n.glow ?? 0))}"/>`
            );
        }
        parts.push('</g>');
    }

    // nodes (reveal in commit order when animating; static fallback fully visible)
    if (scene.nodes.length) {
        parts.push('<g>');
        scene.nodes.forEach((n, i) => {
            const glyph = glyphSvg(n);
            if (anim) {
                const delay = (i / scene.nodes.length) * anim * 0.7;
                parts.push(`<g class="ga" style="animation-delay:${num(delay)}s">${glyph}</g>`);
            } else {
                parts.push(glyph);
            }
        });
        parts.push('</g>');
    }

    // texts (fade in last)
    if (scene.texts.length) {
        parts.push('<g>');
        for (const t of scene.texts) {
            const txt = textSvg(t);
            parts.push(anim ? `<g class="ga" style="animation-delay:${num(anim * 0.78)}s">${txt}</g>` : txt);
        }
        parts.push('</g>');
    }

    // frame
    if (scene.frame) {
        const f = scene.frame;
        parts.push(
            `<rect x="${num(f.inset)}" y="${num(f.inset)}" width="${num(width - f.inset * 2)}" height="${num(height - f.inset * 2)}" rx="${num(f.radius ?? 0)}" fill="none" stroke="${f.color}" stroke-width="${num(f.width)}"/>`
        );
    }

    // overlays
    if (background.vignette) parts.push(`<rect width="100%" height="100%" fill="url(#vig)"/>`);
    if (background.grain) parts.push(`<rect width="100%" height="100%" filter="url(#grain)" opacity="0.5"/>`);

    parts.push('</svg>');
    return parts.join('');
}

function strokeSvg(s: SceneStroke, animDelay = -1): string {
    const d = pathD(s.points, s.smooth ? 'smooth' : 'line', s.closed);
    const fill = s.fill ? `fill="${s.fill}"` : 'fill="none"';
    if (animDelay >= 0) {
        // Approximate path length and "draw" it via a CSS dashoffset animation.
        // The static fallback (.gd default) has dashoffset 0 — fully drawn — so
        // reduced-motion / no-CSS viewers see the complete stroke.
        let len = 0;
        for (let i = 1; i < s.points.length; i++) {
            len += Math.hypot(s.points[i].x - s.points[i - 1].x, s.points[i].y - s.points[i - 1].y);
        }
        len = Math.max(1, Math.round(len));
        return `<path class="gd" style="--l:${len};animation-delay:${num(animDelay)}s" d="${d}" ${fill} stroke="${s.color}" stroke-width="${num(s.width)}" opacity="${num(s.opacity)}" stroke-dasharray="${len}"/>`;
    }
    return `<path d="${d}" ${fill} stroke="${s.color}" stroke-width="${num(s.width)}" opacity="${num(s.opacity)}"/>`;
}
