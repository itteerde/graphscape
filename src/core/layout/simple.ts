import type { Graph } from '../graph';
import { mulberry32 } from '../random';
import type { Vec3 } from '../types';
import { boxOf, type PlaceOptions } from './boxes';

/** Nodes sorted by group then input order so groups end up next to each other. */
function ordered(graph: Graph): string[] {
  const groups = new Map<string, number>();
  for (const n of graph.nodes) if (n.group !== undefined && !groups.has(n.group)) groups.set(n.group, groups.size);
  return graph.nodes
    .map((n, i) => ({ id: n.id, g: n.group === undefined ? -1 : groups.get(n.group)!, i }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map((x) => x.id);
}

/** Room a node needs on a ring or sphere: its box diagonal (a bit reduced) plus the gap. */
function extent(o: PlaceOptions, id: string): number {
  const b = boxOf(o, id);
  return Math.hypot(b.w, b.h) * 0.75 + o.gap;
}

/** Ring whose circumference fits all boxes; arcs are proportional to the node sizes. */
export function circleLayout(graph: Graph, o: PlaceOptions): Map<string, Vec3> {
  const ids = ordered(graph);
  const ext = ids.map((id) => extent(o, id));
  const total = ext.reduce((a, b) => a + b, 0) || 1;
  const r = Math.max(total / (2 * Math.PI), (Math.max(0, ...ext) * 0.5) || 1);
  const out = new Map<string, Vec3>();
  let cum = 0;
  ids.forEach((id, i) => {
    const a = ((cum + ext[i] / 2) / total) * Math.PI * 2 - Math.PI / 2;
    cum += ext[i];
    out.set(id, [r * Math.cos(a), r * Math.sin(a), 0]);
  });
  return out;
}

/** Regular grid with cells large enough for the biggest box; roughly square overall. */
export function gridLayout(graph: Graph, o: PlaceOptions): Map<string, Vec3> {
  const ids = ordered(graph);
  const n = ids.length;
  let cw = 0;
  let ch = 0;
  for (const id of ids) {
    const b = boxOf(o, id);
    cw = Math.max(cw, b.w);
    ch = Math.max(ch, b.h);
  }
  cw += o.gap;
  ch += o.gap;
  const dim3 = !!o.dim3;
  const cols = dim3 ? Math.max(1, Math.ceil(Math.cbrt(n))) : Math.max(1, Math.round(Math.sqrt((n * ch) / cw)));
  const rows = dim3 ? cols : Math.ceil(n / cols);
  const layers = dim3 ? Math.ceil(n / (cols * rows)) : 1;
  const depth = Math.max(cw, ch);
  const out = new Map<string, Vec3>();
  ids.forEach((id, i) => {
    const x = i % cols;
    const y = Math.floor(i / cols) % rows;
    const z = dim3 ? Math.floor(i / (cols * rows)) : 0;
    out.set(id, [(x - (cols - 1) / 2) * cw, ((rows - 1) / 2 - y) * ch, dim3 ? (z - (layers - 1) / 2) * depth : 0]);
  });
  return out;
}

/** Fibonacci sphere with the radius chosen so every node gets about its own square of surface. */
export function sphereLayout(graph: Graph, o: PlaceOptions): Map<string, Vec3> {
  const ids = ordered(graph);
  const n = ids.length;
  const avg = ids.reduce((s, id) => s + extent(o, id), 0) / Math.max(n, 1) || 1;
  const r = Math.max(avg, avg * Math.sqrt(n / (4 * Math.PI)) * 1.1);
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

export function randomLayout(graph: Graph, o: PlaceOptions): Map<string, Vec3> {
  const rnd = mulberry32(o.seed ?? 1);
  const ids = graph.nodes.map((n) => n.id);
  const avg = ids.reduce((s, id) => s + extent(o, id), 0) / Math.max(ids.length, 1) || 1;
  const r = avg * Math.sqrt(ids.length) * 0.9;
  const out = new Map<string, Vec3>();
  for (const id of ids) out.set(id, [(rnd() * 2 - 1) * r, (rnd() * 2 - 1) * r, o.dim3 ? (rnd() * 2 - 1) * r : 0]);
  return out;
}
