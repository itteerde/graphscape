import type { EdgeData, GraphData, GraphMeta, NodeData } from '../types';

function defined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

/** Collects nodes/edges while importing; guarantees unique ids and existing endpoints. */
export class GraphBuilder {
  directed = false;
  meta: GraphMeta = {};
  warnings: string[] = [];
  private nodes = new Map<string, NodeData>();
  private edges: EdgeData[] = [];
  private edgeIds = new Set<string>();

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  node(id: string): NodeData | undefined {
    return this.nodes.get(id);
  }

  addNode(id: string, patch: Partial<NodeData> = {}): NodeData {
    const existing = this.nodes.get(id);
    if (existing) {
      Object.assign(existing, defined(patch), { id });
      return existing;
    }
    const node: NodeData = { ...defined(patch), id };
    this.nodes.set(id, node);
    return node;
  }

  ensureNode(id: string): NodeData {
    return this.nodes.get(id) ?? this.addNode(id);
  }

  addEdge(source: string, target: string, patch: Partial<EdgeData> = {}): EdgeData {
    this.ensureNode(source);
    this.ensureNode(target);
    let id = patch.id;
    if (!id || this.edgeIds.has(id)) {
      let k = this.edges.length + 1;
      while (this.edgeIds.has(`e${k}`)) k++;
      id = `e${k}`;
    }
    this.edgeIds.add(id);
    const edge: EdgeData = { ...defined(patch), id, source, target };
    this.edges.push(edge);
    return edge;
  }

  build(): GraphData {
    return { directed: this.directed, meta: this.meta, nodes: [...this.nodes.values()], edges: this.edges };
  }
}

export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(s)) return true;
    if (['false', '0', 'no'].includes(s)) return false;
  }
  return undefined;
}

/** `#rgb`/`#rrggbb`/`#rrggbbaa` -> `#RRGGBB`, anything else -> undefined. */
export function toHex6(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c.trim());
  if (!m) return undefined;
  let h = m[1];
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  return '#' + h.slice(0, 6).toUpperCase();
}
