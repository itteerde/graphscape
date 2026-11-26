import { mulberry32 } from './random';
import type { EdgeData, GraphData, NodeData } from './types';

export interface GenerateOptions {
  nodes: number;
  clusters?: number;
  /** Average number of edges per node. */
  avgDegree?: number;
  /** Fraction of edges that connect different clusters. */
  crossRatio?: number;
  directed?: boolean;
  weighted?: boolean;
  seed?: number;
}

/** Random clustered graph, e.g. for demos and performance tests. */
export function generateClustered(o: GenerateOptions): GraphData {
  const n = Math.max(1, Math.floor(o.nodes));
  const clusters = Math.max(1, Math.min(o.clusters ?? Math.ceil(Math.sqrt(n) / 2), n));
  const rnd = mulberry32(o.seed ?? 1);
  const nodes: NodeData[] = [];
  const members: number[][] = Array.from({ length: clusters }, () => []);
  for (let i = 0; i < n; i++) {
    const c = i % clusters;
    members[c].push(i);
    nodes.push({ id: `n${i + 1}`, label: `N${i + 1}`, group: `Group ${c + 1}` });
  }
  const target = Math.floor((n * (o.avgDegree ?? 4)) / 2);
  const cross = o.crossRatio ?? 0.08;
  const seen = new Set<string>();
  const edges: EdgeData[] = [];
  for (let attempts = 0; edges.length < target && attempts < target * 20; attempts++) {
    const a = Math.floor(rnd() * n);
    let b: number;
    if (rnd() < cross) b = Math.floor(rnd() * n);
    else {
      const m = members[a % clusters];
      b = m[Math.floor(rnd() * m.length)];
    }
    if (a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const e: EdgeData = { id: `e${edges.length + 1}`, source: nodes[a].id, target: nodes[b].id };
    if (o.weighted) e.weight = 1 + Math.floor(rnd() * 5);
    edges.push(e);
  }
  return { directed: !!o.directed, nodes, edges };
}
