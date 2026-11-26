import { Emitter } from './events';
import { DEFAULT_WEIGHT, type EdgeData, type GraphData, type GraphMeta, type NodeData, type Vec3 } from './types';

export type ChangeKind = 'structure' | 'position';
export interface GraphEvents {
  change: { kind: ChangeKind };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * In-memory graph model: directed or undirected, weighted (default weight 1),
 * with multi edges and self loops. Emits `change` events for views and editors.
 */
export class Graph {
  directed = false;
  meta: GraphMeta = {};
  readonly events = new Emitter<GraphEvents>();

  private nodeMap = new Map<string, NodeData>();
  private edgeMap = new Map<string, EdgeData>();
  private seq = 0;
  private nodeList: NodeData[] | null = null;
  private edgeList: EdgeData[] | null = null;

  constructor(data?: Partial<GraphData>) {
    if (data) this.load(data, false);
  }

  get nodes(): NodeData[] {
    return (this.nodeList ??= [...this.nodeMap.values()]);
  }

  get edges(): EdgeData[] {
    return (this.edgeList ??= [...this.edgeMap.values()]);
  }

  hasNode(id: string): boolean {
    return this.nodeMap.has(id);
  }

  getNode(id: string): NodeData | undefined {
    return this.nodeMap.get(id);
  }

  getEdge(id: string): EdgeData | undefined {
    return this.edgeMap.get(id);
  }

  /** Replace the whole content. Throws if an edge references an unknown node. */
  load(data: Partial<GraphData>, emit = true): void {
    this.nodeMap.clear();
    this.edgeMap.clear();
    this.invalidate();
    this.directed = !!data.directed;
    this.meta = clone(data.meta ?? {});
    for (const n of data.nodes ?? []) {
      const c = clone(n);
      c.id = String(c.id);
      this.nodeMap.set(c.id, c);
    }
    for (const e of data.edges ?? []) {
      const c = clone(e);
      c.source = String(c.source);
      c.target = String(c.target);
      c.id = c.id ? String(c.id) : this.freeId('e', this.edgeMap);
      if (!this.nodeMap.has(c.source) || !this.nodeMap.has(c.target)) {
        throw new Error(`Edge "${c.id}" references an unknown node`);
      }
      this.edgeMap.set(c.id, c);
    }
    if (emit) this.emit('structure');
  }

  clear(): void {
    this.load({ directed: this.directed, nodes: [], edges: [] });
  }

  addNode(partial: Partial<NodeData> = {}): NodeData {
    const id = partial.id !== undefined ? String(partial.id) : this.freeId('n', this.nodeMap);
    if (this.nodeMap.has(id)) throw new Error(`Node "${id}" already exists`);
    const node: NodeData = { ...clone(partial), id };
    this.nodeMap.set(id, node);
    this.emit('structure');
    return node;
  }

  /** Patch a node. A value of `undefined` removes the field. */
  updateNode(id: string, patch: Partial<Omit<NodeData, 'id'>>): NodeData {
    const node = this.nodeMap.get(id);
    if (!node) throw new Error(`Unknown node "${id}"`);
    patchObject(node, patch);
    this.emit('structure');
    return node;
  }

  /** Removes a node and all incident edges. Returns the ids of the removed edges. */
  removeNode(id: string): string[] {
    if (!this.nodeMap.delete(id)) return [];
    const removed: string[] = [];
    for (const e of this.edgeMap.values()) {
      if (e.source === id || e.target === id) removed.push(e.id);
    }
    for (const eid of removed) this.edgeMap.delete(eid);
    this.emit('structure');
    return removed;
  }

  addEdge(partial: Partial<EdgeData> & { source: string; target: string }): EdgeData {
    const source = String(partial.source);
    const target = String(partial.target);
    if (!this.nodeMap.has(source) || !this.nodeMap.has(target)) throw new Error('Edge endpoints must be existing nodes');
    const id = partial.id !== undefined ? String(partial.id) : this.freeId('e', this.edgeMap);
    if (this.edgeMap.has(id)) throw new Error(`Edge "${id}" already exists`);
    const edge: EdgeData = { ...clone(partial), id, source, target };
    this.edgeMap.set(id, edge);
    this.emit('structure');
    return edge;
  }

  updateEdge(id: string, patch: Partial<Omit<EdgeData, 'id'>>): EdgeData {
    const edge = this.edgeMap.get(id);
    if (!edge) throw new Error(`Unknown edge "${id}"`);
    if (patch.source !== undefined && !this.nodeMap.has(patch.source)) throw new Error('Unknown source node');
    if (patch.target !== undefined && !this.nodeMap.has(patch.target)) throw new Error('Unknown target node');
    patchObject(edge, patch);
    this.emit('structure');
    return edge;
  }

  removeEdge(id: string): boolean {
    const ok = this.edgeMap.delete(id);
    if (ok) this.emit('structure');
    return ok;
  }

  setDirected(directed: boolean): void {
    this.directed = directed;
    this.emit('structure');
  }

  edgesOf(nodeId: string): EdgeData[] {
    return this.edges.filter((e) => e.source === nodeId || e.target === nodeId);
  }

  degree(nodeId: string): number {
    let d = 0;
    for (const e of this.edges) {
      if (e.source === nodeId) d++;
      if (e.target === nodeId) d++;
    }
    return d;
  }

  weightOf(edge: EdgeData): number {
    return typeof edge.weight === 'number' && Number.isFinite(edge.weight) ? edge.weight : DEFAULT_WEIGHT;
  }

  isDirected(edge: EdgeData): boolean {
    return edge.directed ?? this.directed;
  }

  /** Sets positions of many nodes and emits a single `position` event. */
  setPositions(entries: Iterable<[string, Vec3]>): void {
    for (const [id, p] of entries) {
      const n = this.nodeMap.get(id);
      if (!n) continue;
      n.x = p[0];
      n.y = p[1];
      n.z = p[2];
    }
    this.events.emit('change', { kind: 'position' });
  }

  toData(): GraphData {
    return clone({ directed: this.directed, meta: this.meta, nodes: this.nodes, edges: this.edges });
  }

  private emit(kind: ChangeKind): void {
    this.invalidate();
    this.events.emit('change', { kind });
  }

  private invalidate(): void {
    this.nodeList = null;
    this.edgeList = null;
  }

  private freeId(prefix: string, map: Map<string, unknown>): string {
    let id: string;
    do {
      id = prefix + ++this.seq;
    } while (map.has(id));
    return id;
  }
}

function patchObject(target: object, patch: object): void {
  const t = target as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete t[k];
    else t[k] = v;
  }
}
