import type { Graph } from '../graph';
import type { Vec3 } from '../types';

export interface LayeredOptions {
  /** Distance between nodes within a layer. */
  spacing: number;
  /** Distance between layers. */
  layerGap: number;
  /** TB: top to bottom, LR: left to right. */
  direction: 'TB' | 'LR';
}

/**
 * Hierarchical layout for class diagrams, evolution trees and flow charts:
 * cycle removal (DFS), longest-path layering, barycenter ordering, centered placement.
 */
export function layeredLayout(graph: Graph, o: LayeredOptions): Map<string, Vec3> {
  const ids = graph.nodes.map((n) => n.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const e of graph.edges) {
    const a = idx.get(e.source)!;
    const b = idx.get(e.target)!;
    if (a !== b) out[a].push(b);
  }

  // 1. break cycles: edges to nodes on the DFS stack are reversed
  const color = new Uint8Array(n);
  const dag: number[][] = Array.from({ length: n }, () => []);
  const dfsOrder: number[] = [];
  for (let s = 0; s < n; s++) {
    if (color[s]) continue;
    const stack: [number, number][] = [[s, 0]];
    color[s] = 1;
    dfsOrder.push(s);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const u = top[0];
      if (top[1] < out[u].length) {
        const v = out[u][top[1]++];
        if (color[v] === 0) {
          color[v] = 1;
          dfsOrder.push(v);
          dag[u].push(v);
          stack.push([v, 0]);
        } else if (color[v] === 1) dag[v].push(u); // back edge -> reverse
        else dag[u].push(v);
      } else {
        color[u] = 2;
        stack.pop();
      }
    }
  }

  // 2. longest-path layering via Kahn
  const indeg = new Int32Array(n);
  for (let u = 0; u < n; u++) for (const v of dag[u]) indeg[v]++;
  const layer = new Int32Array(n);
  const queue: number[] = [];
  for (let u = 0; u < n; u++) if (indeg[u] === 0) queue.push(u);
  for (let h = 0; h < queue.length; h++) {
    const u = queue[h];
    for (const v of dag[u]) {
      layer[v] = Math.max(layer[v], layer[u] + 1);
      if (--indeg[v] === 0) queue.push(v);
    }
  }

  const layers: number[][] = [];
  for (const u of dfsOrder) (layers[layer[u]] ??= []).push(u);
  const up: number[][] = Array.from({ length: n }, () => []);
  for (let u = 0; u < n; u++) for (const v of dag[u]) up[v].push(u);

  // 3. barycenter ordering
  const order = new Float64Array(n);
  const refresh = (): void => layers.forEach((l) => l.forEach((u, i) => (order[u] = i)));
  refresh();
  for (let pass = 0; pass < 8; pass++) {
    const down = pass % 2 === 0;
    const seq = down ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).reverse().slice(1);
    for (const li of seq) {
      const l = layers[li];
      if (!l) continue;
      const bary = new Map<number, number>();
      for (const u of l) {
        const nb = down ? up[u] : dag[u];
        bary.set(u, nb.length ? nb.reduce((s, v) => s + order[v], 0) / nb.length : order[u]);
      }
      l.sort((a, b) => bary.get(a)! - bary.get(b)!);
      l.forEach((u, i) => (order[u] = i));
    }
  }

  // 4. coordinates
  const res = new Map<string, Vec3>();
  layers.forEach((l, li) => {
    if (!l) return;
    l.forEach((u, i) => {
      const along = (i - (l.length - 1) / 2) * o.spacing;
      const depth = li * o.layerGap;
      res.set(ids[u], o.direction === 'TB' ? [along, -depth, 0] : [depth, -along, 0]);
    });
  });
  return res;
}
