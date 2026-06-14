/**
 * Scene → Canvas2D. Used for the live studio preview and (via OffscreenCanvas)
 * for raster export. Mirrors render-svg.ts so preview matches the vector output.
 *
 * Works with both CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D.
 */

import type { Scene, SceneNode, SceneStroke, SceneText, Vec2 } from './scene';
import { withAlpha } from './palette';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function pathFromPoints(ctx: Ctx2D, pts: Vec2[], curve: string, closed = false): void {
    if (pts.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2 && (curve === 'bezierV' || curve === 'bezierH')) {
        const [a, b] = pts;
        if (curve === 'bezierV') {
            const midY = (a.y + b.y) / 2;
            ctx.bezierCurveTo(a.x, midY, b.x, midY, b.x, b.y);
        } else {
            const midX = (a.x + b.x) / 2;
            ctx.bezierCurveTo(midX, a.y, midX, b.y, b.x, b.y);
        }
    } else if (curve === 'smooth' && pts.length > 2) {
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i === 0 ? 0 : i - 1];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
            ctx.bezierCurveTo(
                p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
                p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
                p2.x, p2.y
            );
        }
    } else {
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (closed) ctx.closePath();
}

function drawGlyph(ctx: Ctx2D, n: SceneNode): void {
    const { x, y, r, shape } = n;
    ctx.beginPath();
    switch (shape) {
        case 'diamond':
            ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
            break;
        case 'square':
            ctx.rect(x - r, y - r, r * 2, r * 2);
            break;
        case 'triangle': {
            const h = r * 1.15;
            ctx.moveTo(x, y - h); ctx.lineTo(x + r, y + h * 0.7); ctx.lineTo(x - r, y + h * 0.7); ctx.closePath();
            break;
        }
        case 'hexagon':
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i - Math.PI / 6;
                const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;
        case 'star':
            for (let i = 0; i < 10; i++) {
                const rad = i % 2 === 0 ? r : r * 0.45;
                const a = (Math.PI / 5) * i - Math.PI / 2;
                const px = x + rad * Math.cos(a), py = y + rad * Math.sin(a);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;
        case 'ring':
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.lineWidth = Math.max(1, r * 0.4);
            ctx.strokeStyle = n.fill;
            ctx.globalAlpha = n.opacity;
            ctx.stroke();
            ctx.globalAlpha = 1;
            return;
        case 'none':
            return;
        case 'circle':
        default:
            ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.globalAlpha = n.opacity;
    ctx.fillStyle = n.fill;
    ctx.fill();
    if (n.stroke && n.strokeWidth) {
        ctx.lineWidth = n.strokeWidth;
        ctx.strokeStyle = n.stroke;
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawText(ctx: Ctx2D, t: SceneText): void {
    ctx.save();
    ctx.globalAlpha = t.opacity ?? 1;
    ctx.fillStyle = t.color;
    ctx.font = `${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
    ctx.textAlign = t.align === 'middle' ? 'center' : t.align === 'end' ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if (t.letterSpacing != null && 'letterSpacing' in ctx) {
        c.letterSpacing = `${t.letterSpacing}px`;
    }
    if (t.rotate) {
        ctx.translate(t.x, t.y);
        ctx.rotate((t.rotate * Math.PI) / 180);
        ctx.fillText(t.text, 0, 0);
    } else {
        ctx.fillText(t.text, t.x, t.y);
    }
    if ('letterSpacing' in ctx) c.letterSpacing = '0px';
    ctx.restore();
}

function drawStroke(ctx: Ctx2D, s: SceneStroke): void {
    pathFromPoints(ctx, s.points, s.smooth ? 'smooth' : 'line', s.closed);
    ctx.globalAlpha = s.opacity;
    if (s.fill) {
        ctx.fillStyle = s.fill;
        ctx.fill();
    }
    ctx.lineWidth = s.width;
    ctx.strokeStyle = s.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
}

/** Paint a Scene to a 2D context (assumed already sized to scene dimensions). */
export function renderSceneToCanvas(ctx: Ctx2D, scene: Scene): void {
    const { width, height, background } = scene;

    // background
    if (background.kind === 'gradient') {
        const angle = ((background.angle ?? 135) * Math.PI) / 180;
        const cx = width / 2, cy = height / 2;
        const half = Math.max(width, height) / 2;
        const g = ctx.createLinearGradient(
            cx + Math.cos(angle + Math.PI) * half, cy + Math.sin(angle + Math.PI) * half,
            cx + Math.cos(angle) * half, cy + Math.sin(angle) * half
        );
        g.addColorStop(0, background.color ?? '#000');
        g.addColorStop(1, background.color2 ?? '#111');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
    } else if (background.kind !== 'none') {
        ctx.fillStyle = background.color ?? '#000';
        ctx.fillRect(0, 0, width, height);
    }
    if (background.kind === 'grid') {
        const gs = background.gridSize ?? 80;
        ctx.strokeStyle = background.gridColor ?? withAlpha(background.color ?? '#fff', 0.08);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= width; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = 0; y <= height; y += gs) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();
    }

    for (const s of scene.strokes) drawStroke(ctx, s);

    for (const e of scene.edges) {
        pathFromPoints(ctx, e.points, e.curve ?? 'line');
        ctx.globalAlpha = e.opacity;
        ctx.lineWidth = e.width;
        ctx.strokeStyle = e.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    for (const n of scene.nodes) {
        if ((n.glow ?? 0) > 0.01) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * 2.4, 0, Math.PI * 2);
            ctx.fillStyle = withAlpha(n.fill, 0.16 * (n.glow ?? 0));
            ctx.fill();
        }
    }
    for (const n of scene.nodes) drawGlyph(ctx, n);
    for (const t of scene.texts) drawText(ctx, t);

    if (scene.frame) {
        const f = scene.frame;
        ctx.lineWidth = f.width;
        ctx.strokeStyle = f.color;
        ctx.strokeRect(f.inset, f.inset, width - f.inset * 2, height - f.inset * 2);
    }

    if (background.vignette) {
        const g = ctx.createRadialGradient(width / 2, height * 0.46, Math.min(width, height) * 0.3, width / 2, height * 0.46, Math.max(width, height) * 0.75);
        g.addColorStop(0.55, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${background.vignette})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
    }
}
