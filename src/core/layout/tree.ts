import type { Graph } from '../graph';
import type { Vec3 } from '../types';
import { boxOf, type PlaceOptions } from './boxes';

export interface TreeOptions extends PlaceOptions {
  direction: 'TB' | 'LR';
}

/**
 * Clean tidy tree for (mostly) hierarchical graphs.
 * Roots are the nodes without incoming edges (for undirected graphs the best connected node of each component);
 * every other node hangs below the first parent that reaches it, so extra links (DAG edges, cycles) are simply drawn
 * across. Each parent is centered over its children, subtrees never overlap and siblings keep the node boxes apart.
 */
export function treeLayout(graph: Graph, o: TreeOptions): Map<string, Vec3> {
  const ids = graph.nodes.map((n) => n.id);
  const n = ids.length;
  const res = new Map<string, Vec3>();
  if (n === 0) return res;
  const idx = new Map(ids.map((id, i) => [id, i]));
  const out: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n);
  const degree = new Int32Array(n);
  for (const e of graph.edges) {
    const a = idx.get(e.source)!;
    const b = idx.get(e.target)!;
    if (a === b) continue;
    degree[a]++;
    degree[b]++;
    out[a].push(b);
    if (graph.isDirected(e)) indeg[b]++;
    else out[b].push(a);
  }

  // spanning forest by BFS from the roots
  const parent = new Int32Array(n).fill(-1);
  const level = new Int32Array(n).fill(-1);
  const children: number[][] = Array.from({ length: n }, () => []);
  const roots: number[] = [];
  const bfs = (root: number): void => {
    roots.push(root);
    level[root] = 0;
    const q = [root];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of out[u]) {
        if (level[v] !== -1) continue;
        level[v] = level[u] + 1;
        parent[v] = u;
        children[u].push(v);
        q.push(v);
      }
    }
  };
  const candidates = [...Array(n).keys()].filter((u) => indeg[u] === 0);
  // purely undirected graphs have no natural root: start at the best connected node of each component
  if (!indeg.some((v) => v > 0)) candidates.sort((a, b) => degree[b] - degree[a] || a - b);
  for (const u of candidates) if (level[u] === -1) bfs(u);
  // What is left: cycles without an entry point or undirected components. Try the best connected nodes and take the one
  // that reaches the most unvisited nodes with the lowest tree.
  const probe = (start: number): { reach: number; height: number } => {
    const seen = new Map<number, number>([[start, 0]]);
    const q = [start];
    let height = 0;
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of out[u]) {
        if (level[v] !== -1 || seen.has(v)) continue;
        seen.set(v, seen.get(u)! + 1);
        height = Math.max(height, seen.get(v)!);
        q.push(v);
      }
    }
    return { reach: q.length, height };
  };
  for (;;) {
    const rest = [...Array(n).keys()].filter((u) => level[u] === -1).sort((a, b) => degree[b] - degree[a] || a - b);
    if (!rest.length) break;
    let best = rest[0];
    let bestScore = { reach: -1, height: 0 };
    for (const u of rest.slice(0, 8)) {
      const sc = probe(u);
      if (sc.reach > bestScore.reach || (sc.reach === bestScore.reach && sc.height < bestScore.height)) {
        best = u;
        bestScore = sc;
      }
    }
    bfs(best);
  }

  const tb = o.direction === 'TB';
  const alongOf = (u: number): number => (tb ? boxOf(o, ids[u]).w : boxOf(o, ids[u]).h);
  const acrossOf = (u: number): number => (tb ? boxOf(o, ids[u]).h : boxOf(o, ids[u]).w);

  // preorder (parents before children)
  const pre: number[] = [];
  for (const r of roots) {
    const stack = [r];
    while (stack.length) {
      const u = stack.pop()!;
      pre.push(u);
      for (let i = children[u].length - 1; i >= 0; i--) stack.push(children[u][i]);
    }
  }
  // subtree widths, children before parents
  const span = new Float64Array(n);
  for (let i = pre.length - 1; i >= 0; i--) {
    const u = pre[i];
    const kids = children[u];
    const kidsTotal = kids.reduce((s, v) => s + span[v], 0) + o.gap * Math.max(0, kids.length - 1);
    span[u] = Math.max(alongOf(u), kidsTotal);
  }
  // left edges top-down, centers bottom-up
  const left = new Float64Array(n);
  let cursor = 0;
  for (const r of roots) {
    left[r] = cursor;
    cursor += span[r] + o.gap * 2;
  }
  const total = cursor - o.gap * 2;
  for (const u of pre) {
    const kids = children[u];
    if (!kids.length) continue;
    const kidsTotal = kids.reduce((s, v) => s + span[v], 0) + o.gap * (kids.length - 1);
    let x = left[u] + (span[u] - kidsTotal) / 2;
    for (const v of kids) {
      left[v] = x;
      x += span[v] + o.gap;
    }
  }
  const center = new Float64Array(n);
  for (let i = pre.length - 1; i >= 0; i--) {
    const u = pre[i];
    const kids = children[u];
    center[u] = kids.length ? (center[kids[0]] + center[kids[kids.length - 1]]) / 2 : left[u] + span[u] / 2;
  }
  // level positions from the thickest node of every level
  const maxLevel = Math.max(...Array.from(level));
  const thick = new Float64Array(maxLevel + 1);
  for (let u = 0; u < n; u++) thick[level[u]] = Math.max(thick[level[u]], acrossOf(u));
  const depthAt = new Float64Array(maxLevel + 1);
  let d = 0;
  for (let l = 0; l <= maxLevel; l++) {
    d += l === 0 ? thick[0] / 2 : thick[l - 1] / 2 + o.gap * 2.2 + thick[l] / 2;
    depthAt[l] = d;
  }
  for (let u = 0; u < n; u++) {
    const a = center[u] - total / 2;
    res.set(ids[u], tb ? [a, -depthAt[level[u]], 0] : [depthAt[level[u]], -a, 0]);
  }
  return res;
}
