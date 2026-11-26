import * as THREE from 'three';
import type { GraphscapeConfig, NodeData, NodeStyle } from '../core/index';

/** Text rendered to a texture. `w`/`h` are in label units (texture pixels / resolution). */
export interface TextImage {
  texture: THREE.CanvasTexture;
  w: number;
  h: number;
}

export interface TextStyle {
  font: string;
  size: number;
  color: string;
  background: string | null;
  padding: number;
  maxChars: number;
}

const MAX_TEXTURE = 4096;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Caches canvas textures for labels and cards. */
export class TextureCache {
  private map = new Map<string, TextImage>();

  constructor(public resolution = 4) {}

  clear(): void {
    for (const t of this.map.values()) t.texture.dispose();
    this.map.clear();
  }

  private make(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  text(text: string, s: TextStyle): TextImage {
    const key = JSON.stringify(['t', text, s, this.resolution]);
    const hit = this.map.get(key);
    if (hit) return hit;
    const res = this.resolution;
    const px = s.size * res;
    const lineH = px * 1.25;
    const pad = s.padding * res;
    const lines = text.split('\n').map((l) => (l.length > s.maxChars ? l.slice(0, Math.max(1, s.maxChars - 1)) + '…' : l));
    const font = `${px}px ${s.font}`;
    const c = document.createElement('canvas');
    let ctx = c.getContext('2d')!;
    ctx.font = font;
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
    c.width = Math.min(MAX_TEXTURE, Math.max(2, Math.ceil(width + pad * 2)));
    c.height = Math.min(MAX_TEXTURE, Math.max(2, Math.ceil(lines.length * lineH + pad * 2)));
    ctx = c.getContext('2d')!;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (s.background) {
      ctx.fillStyle = s.background;
      roundRect(ctx, 0, 0, c.width, c.height, px * 0.25);
      ctx.fill();
    }
    ctx.fillStyle = s.color;
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, pad + lineH * (i + 0.5)));
    const img: TextImage = { texture: this.make(c), w: c.width / res, h: c.height / res };
    this.map.set(key, img);
    return img;
  }

  /** UML-like card: title in a header band, body lines below; a line `---` draws a separator. */
  card(node: NodeData, style: NodeStyle, cfg: GraphscapeConfig): TextImage {
    const k = cfg.card;
    const title = node.label ?? node.id;
    const body = node.body ?? [];
    const key = JSON.stringify(['c', title, body, style.color, k, this.resolution]);
    const hit = this.map.get(key);
    if (hit) return hit;
    const res = this.resolution;
    const px = k.size * res;
    const lineH = px * 1.4;
    const pad = k.padding * res;
    const measure = document.createElement('canvas').getContext('2d')!;
    const titleLines = title.split('\n');
    measure.font = `bold ${px}px ${k.font}`;
    const titleW = Math.max(...titleLines.map((l) => measure.measureText(l).width));
    measure.font = `${px}px ${k.font}`;
    const bodyW = body.length ? Math.max(...body.map((l) => (l === '---' ? 0 : measure.measureText(l).width))) : 0;
    const w = Math.min(MAX_TEXTURE, Math.ceil(Math.max(titleW, bodyW) + pad * 3));
    const headerH = titleLines.length * lineH + pad * 1.5;
    const bodyH = body.length ? body.length * lineH + pad * 1.5 : 0;
    const h = Math.min(MAX_TEXTURE, Math.ceil(headerH + bodyH));
    const c = document.createElement('canvas');
    c.width = Math.max(2, w);
    c.height = Math.max(2, h);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = k.background;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = k.headerBackground ?? style.color;
    ctx.fillRect(0, 0, c.width, headerH);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `bold ${px}px ${k.font}`;
    ctx.fillStyle = k.headerColor;
    titleLines.forEach((l, i) => ctx.fillText(l, c.width / 2, pad * 0.75 + lineH * (i + 0.5)));
    ctx.textAlign = 'left';
    ctx.font = `${px}px ${k.font}`;
    body.forEach((l, i) => {
      const y = headerH + pad * 0.75 + lineH * (i + 0.5);
      if (l === '---') {
        ctx.strokeStyle = k.border;
        ctx.lineWidth = Math.max(1, res * 0.3);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(c.width, y);
        ctx.stroke();
      } else {
        ctx.fillStyle = k.textColor;
        ctx.fillText(l, pad * 1.5, y);
      }
    });
    ctx.strokeStyle = k.border;
    ctx.lineWidth = Math.max(2, res * 0.5);
    ctx.strokeRect(0, 0, c.width, c.height);
    const img: TextImage = { texture: this.make(c), w: c.width / res, h: c.height / res };
    this.map.set(key, img);
    return img;
  }
}
