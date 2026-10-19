/**
 * Canvas renderer with viewport culling and a hit-test grid. Only sprites intersecting
 * the visible scroll window are drawn each frame, so the world can grow unbounded.
 */
import { CELL, type Layout, type Sprite } from './layout.js';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private layout: Layout = { width: 0, height: 0, sprites: [], panels: [] };
  private grid = new Map<string, Sprite[]>();
  private readonly G = 256;
  private dpr = 1;
  highlightId?: string;

  constructor(private canvas: HTMLCanvasElement, private scroller: HTMLElement, private sizer: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize(); addEventListener('resize', () => this.resize());
  }

  setLayout(l: Layout) {
    this.layout = l;
    this.sizer.style.width = `${l.width}px`; this.sizer.style.height = `${l.height}px`;
    this.grid.clear();
    for (const s of l.sprites) {
      if (s.move) continue; // moving sprites are hit-tested linearly
      const k = `${Math.floor(s.x / this.G)},${Math.floor(s.y / this.G)}`;
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(s);
    }
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * this.dpr; this.canvas.height = innerHeight * this.dpr;
  }

  private pos(s: Sprite, t: number) {
    if (!s.move) return s.x;
    return s.move.base + ((s.x - s.move.base + t * s.move.speed) % s.move.span + s.move.span) % s.move.span;
  }

  frame(t: number) {
    const { ctx } = this; const sx = this.scroller.scrollLeft, sy = this.scroller.scrollTop;
    const vw = innerWidth, vh = innerHeight;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, -sx * this.dpr, -sy * this.dpr);
    ctx.fillStyle = '#0b0d1a'; ctx.fillRect(sx, sy, vw, vh);
    for (const p of this.layout.panels) {
      if (p.x > sx + vw || p.x + p.w < sx || p.y > sy + vh || p.y + p.h < sy) continue;
      ctx.fillStyle = p.fill; ctx.fillRect(p.x, p.y, p.w, p.h);
      if (p.label) { ctx.fillStyle = '#ffffff55'; ctx.font = '600 14px system-ui'; ctx.fillText(p.label, p.x + 12, p.y + 20); }
    }
    ctx.textBaseline = 'bottom';
    for (const s of this.layout.sprites) {
      const x = this.pos(s, t);
      if (x > sx + vw || x + s.size < sx || s.y - s.size > sy + vh || s.y < sy) continue;
      ctx.globalAlpha = s.dim ? 0.45 : 1;
      ctx.font = `${s.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.fillText(s.g, x, s.y);
      if (this.highlightId && (s.ref.id === this.highlightId || s.ref.parentId === this.highlightId)) {
        ctx.globalAlpha = 1; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.strokeRect(x - 1, s.y - s.size - 1, s.size + 2, s.size + 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** World-space hit test at client coords. */
  hit(clientX: number, clientY: number, t: number): Sprite | undefined {
    const wx = clientX + this.scroller.scrollLeft, wy = clientY + this.scroller.scrollTop;
    const inside = (s: Sprite) => { const x = this.pos(s, t); return wx >= x && wx <= x + s.size && wy <= s.y && wy >= s.y - s.size; };
    for (let gx = -1; gx <= 0; gx++) for (let gy = 0; gy <= 1; gy++) {
      const list = this.grid.get(`${Math.floor(wx / this.G) + gx},${Math.floor(wy / this.G) + gy}`);
      const found = list?.slice().reverse().find(inside); if (found) return found;
    }
    return this.layout.sprites.filter((s) => s.move).find(inside);
  }

  centerOn(id: string) {
    const s = this.layout.sprites.find((x) => x.ref.id === id); if (!s) return;
    this.scroller.scrollTo({ left: s.x - innerWidth / 2, top: s.y - innerHeight / 2, behavior: 'smooth' });
  }

  get cell() { return CELL; }
}
