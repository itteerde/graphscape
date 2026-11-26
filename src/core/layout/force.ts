import type { Graph } from '../graph';
import { mulberry32 } from '../random';
import type { Dimension, Vec3 } from '../types';

export interface ForceOptions {
  dimension: Dimension;
  idealLength: number;
  gravity: number;
  weightMode: 'ignore' | 'strength';
  seed: number;
}

/**
 * Fruchterman–Reingold style simulation with a spatial grid for repulsion, so it stays usable
 * for several thousand nodes. Deterministic for a given seed. Works in 2D and 3D.
 */
export class ForceSimulation {
  readonly ids: string[];
  readonly pos: Float64Array;
  temperature: number;
  private readonly t0: number;
  private readonly n: number;
  private readonly k: number;
  private readonly dim3: boolean;
  private readonly disp: Float64Array;
  private readonly fixed: Uint8Array;
  private readonly ea: Int32Array;
  private readonly eb: Int32Array;
  private readonly es: Float64Array;
  private readonly index = new Map<string, number>();
  private readonly rnd: () => number;
  private readonly gravity: number;

  constructor(graph: Graph, o: ForceOptions) {
    const nodes = graph.nodes;
    this.n = nodes.length;
    this.k = o.idealLength;
    this.dim3 = o.dimension === '3d';
    this.gravity = o.gravity;
    this.rnd = mulberry32(o.seed);
    this.ids = nodes.map((nd) => nd.id);
    this.pos = new Float64Array(this.n * 3);
    this.disp = new Float64Array(this.n * 3);
    this.fixed = new Uint8Array(this.n);
    const radius = this.k * (this.dim3 ? Math.cbrt(this.n) : Math.sqrt(this.n)) * 0.6 + this.k;
    nodes.forEach((nd, i) => {
      this.index.set(nd.id, i);
      this.pos[3 * i] = nd.x ?? (this.rnd() * 2 - 1) * radius;
      this.pos[3 * i + 1] = nd.y ?? (this.rnd() * 2 - 1) * radius;
      this.pos[3 * i + 2] = this.dim3 ? nd.z ?? (this.rnd() * 2 - 1) * radius : nd.z ?? 0;
      if (nd.pinned) this.fixed[i] = 1;
    });
    const list = graph.edges.filter((e) => e.source !== e.target);
    this.ea = new Int32Array(list.length);
    this.eb = new Int32Array(list.length);
    this.es = new Float64Array(list.length);
    list.forEach((e, i) => {
      this.ea[i] = this.index.get(e.source)!;
      this.eb[i] = this.index.get(e.target)!;
      const w = graph.weightOf(e);
      this.es[i] = o.weightMode === 'strength' ? Math.min(4, Math.max(0.25, Math.sqrt(Math.max(w, 0)))) : 1;
    });
    this.t0 = this.k * 2;
    this.temperature = this.t0;
  }

  /** 1 at the start, approaching 0 when the layout has settled. */
  get alpha(): number {
    return this.temperature / this.t0;
  }

  /** Fix a node at a position (e.g. while the user drags it). */
  pin(id: string, p: Vec3): void {
    const i = this.index.get(id);
    if (i === undefined) return;
    this.pos[3 * i] = p[0];
    this.pos[3 * i + 1] = p[1];
    if (this.dim3) this.pos[3 * i + 2] = p[2];
    this.fixed[i] = 1;
  }

  unpin(id: string, keepPinned = false): void {
    const i = this.index.get(id);
    if (i !== undefined && !keepPinned) this.fixed[i] = 0;
  }

  step(): void {
    const { n, k, dim3, pos, disp } = this;
    const k2 = k * k;
    disp.fill(0);

    const repel = (i: number, j: number, cutoff2: number): void => {
      let dx = pos[3 * i] - pos[3 * j];
      let dy = pos[3 * i + 1] - pos[3 * j + 1];
      let dz = dim3 ? pos[3 * i + 2] - pos[3 * j + 2] : 0;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > cutoff2) return;
      if (d2 < 1e-6) {
        dx = (this.rnd() - 0.5) * 0.1;
        dy = (this.rnd() - 0.5) * 0.1;
        dz = dim3 ? (this.rnd() - 0.5) * 0.1 : 0;
        d2 = dx * dx + dy * dy + dz * dz + 1e-6;
      }
      const f = k2 / d2;
      disp[3 * i] += dx * f;
      disp[3 * i + 1] += dy * f;
      disp[3 * i + 2] += dz * f;
      disp[3 * j] -= dx * f;
      disp[3 * j + 1] -= dy * f;
      disp[3 * j + 2] -= dz * f;
    };

    if (n <= 400) {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) repel(i, j, Infinity);
    } else {
      const cell = k * 4;
      const cutoff2 = cell * cell;
      const clamp = (v: number): number => Math.max(-1000, Math.min(1000, Math.floor(v / cell)));
      const key = (x: number, y: number, z: number): number => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
      const grid = new Map<number, number[]>();
      const cx = new Int16Array(n);
      const cy = new Int16Array(n);
      const cz = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        cx[i] = clamp(pos[3 * i]);
        cy[i] = clamp(pos[3 * i + 1]);
        cz[i] = dim3 ? clamp(pos[3 * i + 2]) : 0;
        const kk = key(cx[i], cy[i], cz[i]);
        const l = grid.get(kk);
        if (l) l.push(i);
        else grid.set(kk, [i]);
      }
      const zr = dim3 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        for (let ox = -1; ox <= 1; ox++)
          for (let oy = -1; oy <= 1; oy++)
            for (let oz = -zr; oz <= zr; oz++) {
              const l = grid.get(key(cx[i] + ox, cy[i] + oy, cz[i] + oz));
              if (l) for (const j of l) if (j > i) repel(i, j, cutoff2);
            }
      }
    }

    for (let e = 0; e < this.ea.length; e++) {
      const a = this.ea[e];
      const b = this.eb[e];
      const dx = pos[3 * a] - pos[3 * b];
      const dy = pos[3 * a + 1] - pos[3 * b + 1];
      const dz = dim3 ? pos[3 * a + 2] - pos[3 * b + 2] : 0;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const f = (d / k) * this.es[e];
      disp[3 * a] -= dx * f;
      disp[3 * a + 1] -= dy * f;
      disp[3 * a + 2] -= dz * f;
      disp[3 * b] += dx * f;
      disp[3 * b + 1] += dy * f;
      disp[3 * b + 2] += dz * f;
    }

    const t = this.temperature;
    for (let i = 0; i < n; i++) {
      if (this.fixed[i]) continue;
      disp[3 * i] -= pos[3 * i] * this.gravity;
      disp[3 * i + 1] -= pos[3 * i + 1] * this.gravity;
      if (dim3) disp[3 * i + 2] -= pos[3 * i + 2] * this.gravity;
      const dz = dim3 ? disp[3 * i + 2] : 0;
      const len = Math.sqrt(disp[3 * i] ** 2 + disp[3 * i + 1] ** 2 + dz * dz);
      if (len < 1e-9) continue;
      const s = Math.min(len, t) / len;
      pos[3 * i] += disp[3 * i] * s;
      pos[3 * i + 1] += disp[3 * i + 1] * s;
      if (dim3) pos[3 * i + 2] += dz * s;
    }
    this.temperature = Math.max(this.temperature * 0.985, this.t0 * 0.002);
  }

  entries(): [string, Vec3][] {
    return this.ids.map((id, i) => [id, [this.pos[3 * i], this.pos[3 * i + 1], this.dim3 ? this.pos[3 * i + 2] : 0]]);
  }

  /** Writes the current positions into the graph (one `position` event). */
  commit(graph: Graph): void {
    graph.setPositions(this.entries());
  }
}
