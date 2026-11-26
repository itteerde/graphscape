import type { Graph } from '../graph';
import { mulberry32 } from '../random';
import type { Vec3 } from '../types';

/** Nodes sorted by group then id so groups end up next to each other. */
function ordered(graph: Graph): string[] {
  const groups = new Map<string, number>();
  for (const n of graph.nodes) if (n.group !== undefined && !groups.has(n.group)) groups.set(n.group, groups.size);
  return [...graph.nodes]
    .map((n, i) => ({ id: n.id, g: n.group === undefined ? -1 : groups.get(n.group)!, i }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map((x) => x.id);
}

export function circleLayout(graph: Graph, spacing: number): Map<string, Vec3> {
  const ids = ordered(graph);
  const n = ids.length;
  const r = Math.max(spacing, (spacing * n) / (2 * Math.PI));
  const out = new Map<string, Vec3>();
  ids.forEach((id, i) => {
    const a = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    out.set(id, [r * Math.cos(a), r * Math.sin(a), 0]);
  });
  return out;
}

export function gridLayout(graph: Graph, spacing: number, dim3: boolean): Map<string, Vec3> {
  const ids = ordered(graph);
  const n = ids.length;
  const side = Math.max(1, Math.ceil(dim3 ? Math.cbrt(n) : Math.sqrt(n)));
  const out = new Map<string, Vec3>();
  ids.forEach((id, i) => {
    const x = i % side;
    const y = Math.floor(i / side) % side;
    const z = dim3 ? Math.floor(i / (side * side)) : 0;
    const off = ((side - 1) * spacing) / 2;
    out.set(id, [x * spacing - off, off - y * spacing, dim3 ? z * spacing - off : 0]);
  });
  return out;
}

/** Fibonacci sphere. */
export function sphereLayout(graph: Graph, spacing: number): Map<string, Vec3> {
  const ids = ordered(graph);
  const n = ids.length;
  const r = Math.max(spacing, spacing * Math.sqrt(n / (4 * Math.PI)));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out = new Map<string, Vec3>();
  ids.forEach((id, i) => {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const t = golden * i;
    out.set(id, [Math.cos(t) * rad * r, y * r, Math.sin(t) * rad * r]);
  });
  return out;
}

export function randomLayout(graph: Graph, spacing: number, dim3: boolean, seed: number): Map<string, Vec3> {
  const rnd = mulberry32(seed);
  const n = graph.nodes.length;
  const r = spacing * Math.sqrt(Math.max(n, 1));
  const out = new Map<string, Vec3>();
  for (const nd of graph.nodes) out.set(nd.id, [(rnd() * 2 - 1) * r, (rnd() * 2 - 1) * r, dim3 ? (rnd() * 2 - 1) * r : 0]);
  return out;
}
