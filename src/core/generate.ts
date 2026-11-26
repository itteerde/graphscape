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

export interface MixedNetworkOptions {
  nodes: number;
  seed?: number;
  directed?: boolean;
}

/**
 * Network with very different degrees of connectivity, for demos and stress tests:
 * dense cliques (3-9 nodes), a scale-free part with hubs, chains that end in rings, pendant leaves,
 * isolated nodes, a few bridges between the parts, parallel edges and self loops.
 * Groups: Cliques, Hubs, Chains, Leaves, Isolated.
 */
export function generateMixedNetwork(o: MixedNetworkOptions): GraphData {
  const total = Math.max(20, Math.floor(o.nodes));
  const rnd = mulberry32(o.seed ?? 1);
  const nodes: NodeData[] = [];
  const edges: EdgeData[] = [];
  const seen = new Set<string>();
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const node = (group: string, props?: NodeData['props']): string => {
    const id = `n${nodes.length + 1}`;
    nodes.push({ id, label: `${group[0]}${nodes.length + 1}`, group, props });
    return id;
  };
  const edge = (a: string, b: string, patch: Partial<EdgeData> = {}, force = false): void => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!force && (a === b || seen.has(key))) return;
    seen.add(key);
    const e: EdgeData = { id: `e${edges.length + 1}`, source: a, target: b, ...patch };
    if (!('weight' in patch) && rnd() < 0.25) e.weight = 1 + Math.floor(rnd() * 4);
    edges.push(e);
  };

  const quota = (share: number): number => Math.floor(total * share);
  const isolatedQ = quota(0.04);
  const cliquesQ = quota(0.3);
  const hubsQ = quota(0.32);
  const chainsQ = quota(0.14);

  // cliques
  const cliques: string[][] = [];
  while (nodes.length < cliquesQ) {
    const size = Math.min(3 + Math.floor(rnd() * 7), cliquesQ - nodes.length);
    if (size < 2) break;
    const members = Array.from({ length: size }, () => node('Cliques', { clique: cliques.length + 1 }));
    for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) edge(members[i], members[j]);
    cliques.push(members);
  }
  // scale-free part with preferential attachment
  const endpoints: string[] = [];
  const start = Math.min(5, hubsQ - nodes.length);
  const seedNodes = Array.from({ length: Math.max(start, 2) }, () => node('Hubs'));
  for (let i = 0; i < seedNodes.length; i++) for (let j = i + 1; j < seedNodes.length; j++) {
    edge(seedNodes[i], seedNodes[j]);
    endpoints.push(seedNodes[i], seedNodes[j]);
  }
  if (cliques.length) edge(seedNodes[0], pick(pick(cliques)));
  while (nodes.length < cliquesQ + hubsQ) {
    const id = node('Hubs');
    const m = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < m; k++) {
      const t = pick(endpoints);
      edge(id, t);
      endpoints.push(id, t);
    }
  }
  // chains, some closing into a ring
  while (nodes.length < cliquesQ + hubsQ + chainsQ) {
    const len = Math.min(3 + Math.floor(rnd() * 10), cliquesQ + hubsQ + chainsQ - nodes.length);
    const chain = Array.from({ length: len }, () => node('Chains'));
    edge(chain[0], pick(nodes.slice(0, nodes.length - len)).id);
    for (let i = 1; i < len; i++) edge(chain[i - 1], chain[i]);
    if (len > 4 && rnd() < 0.3) edge(chain[len - 1], chain[0]);
  }
  // leaves hanging on random nodes (half of them on hubs)
  while (nodes.length < total - isolatedQ) {
    const id = node('Leaves');
    edge(id, rnd() < 0.5 ? pick(endpoints) : pick(nodes.slice(0, nodes.length - 1)).id);
  }
  while (nodes.length < total) node('Isolated');
  // a few long range bridges, parallel edges and self loops
  for (let i = 0; i < Math.ceil(total / 80); i++) edge(pick(nodes.filter((n) => n.group !== 'Isolated')).id, pick(nodes.filter((n) => n.group !== 'Isolated')).id);
  for (let i = 0; i < 4 && edges.length; i++) {
    const e = pick(edges);
    edge(e.source, e.target, { weight: 2 + i, label: `parallel ${i + 1}` }, true);
  }
  for (let i = 0; i < 3; i++) {
    const id = pick(nodes.filter((n) => n.group !== 'Isolated')).id;
    edge(id, id, { label: 'self' }, true);
  }
  return { directed: !!o.directed, meta: { title: `Mixed network, ${total} nodes` }, nodes, edges };
}
