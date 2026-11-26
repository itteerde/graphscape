import type { EdgeStyle, GraphscapeConfig, NodeStyle, StyleRule } from './config';
import type { Graph } from './graph';
import type { EdgeData, NodeData } from './types';

function matches(rule: StyleRule, item: NodeData | EdgeData): boolean {
  const m = rule.match;
  if (typeof m === 'function') return m(item);
  if (m.id !== undefined && item.id !== m.id) return false;
  if (m.group !== undefined && (item as { group?: string }).group !== m.group) return false;
  if (m.tag !== undefined && !(item as NodeData).tags?.includes(m.tag)) return false;
  if (m.prop && item.props?.[m.prop[0]] !== m.prop[1]) return false;
  return true;
}

/** Order of first appearance of each node group; used to pick palette colors. */
export function buildGroupIndex(graph: Graph): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of graph.nodes) if (n.group !== undefined && !map.has(n.group)) map.set(n.group, map.size);
  return map;
}

/** defaults < group color < rules (in order) < values stored on the node itself */
export function resolveNodeStyle(node: NodeData, cfg: GraphscapeConfig, groups: Map<string, number>): NodeStyle {
  const { aspect: _aspect, opacity: _opacity, ...base } = cfg.node;
  void _aspect;
  void _opacity;
  const s: NodeStyle = { ...base };
  if (node.group !== undefined) {
    const pal = cfg.groups.palette;
    const c = cfg.groups.colors[node.group] ?? (pal.length ? pal[(groups.get(node.group) ?? 0) % pal.length] : undefined);
    if (c) s.color = c;
  }
  for (const r of cfg.rules) if (r.target === 'node' && matches(r, node)) Object.assign(s, r.style);
  if (node.color) s.color = node.color;
  if (node.shape) s.shape = node.shape;
  if (node.size && node.size > 0) s.size = node.size;
  return s;
}

export interface WeightRange {
  min: number;
  max: number;
}

export function resolveEdgeStyle(edge: EdgeData, weight: number, cfg: GraphscapeConfig, range: WeightRange): EdgeStyle {
  const { color, width, dashed } = cfg.edge;
  const s: EdgeStyle = { color, width, dashed };
  const w = cfg.edge.widthByWeight;
  if (w.enabled) {
    const t = range.max > range.min ? (weight - range.min) / (range.max - range.min) : 0;
    s.width = w.min + (w.max - w.min) * Math.max(0, Math.min(1, t));
  }
  for (const r of cfg.rules) if (r.target === 'edge' && matches(r, edge)) Object.assign(s, r.style);
  if (edge.color) s.color = edge.color;
  if (edge.width && edge.width > 0) s.width = edge.width;
  if (edge.dashed !== undefined) s.dashed = edge.dashed;
  s.width = Math.round(s.width * 2) / 2;
  return s;
}
