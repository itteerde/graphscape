import { GraphBuilder, toBool, toNumber } from './builder';
import type { EdgeData, GraphData, ImportResult, NodeData, NodeShape, PropValue } from '../types';
import { NODE_SHAPES } from '../types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : String(v));

const RESERVED = new Set(['id', 'name', 'key', 'index', 'vx', 'vy', 'vz', 'fx', 'fy', 'fz', 'source', 'target', 'from', 'to', 'value', 'w']);

function extraProps(o: Obj, known: Set<string>): Record<string, PropValue> | undefined {
  const props: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(o)) {
    if (known.has(k) || RESERVED.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') props[k] = v;
  }
  return Object.keys(props).length ? props : undefined;
}

const NODE_KEYS = new Set(['label', 'x', 'y', 'z', 'group', 'tags', 'url', 'color', 'shape', 'size', 'body', 'pinned', 'props']);
const EDGE_KEYS = new Set(['weight', 'directed', 'label', 'url', 'color', 'width', 'dashed', 'group', 'props']);

function nodePatch(o: Obj): Partial<NodeData> {
  const shape = str(o.shape) as NodeShape | undefined;
  return {
    label: str(o.label ?? o.name),
    x: toNumber(o.x),
    y: toNumber(o.y),
    z: toNumber(o.z),
    group: str(o.group),
    tags: Array.isArray(o.tags) ? o.tags.map(String) : undefined,
    url: str(o.url),
    color: str(o.color),
    shape: shape && NODE_SHAPES.includes(shape) ? shape : undefined,
    size: toNumber(o.size),
    body: Array.isArray(o.body) ? o.body.map(String) : undefined,
    pinned: toBool(o.pinned),
    props: isObj(o.props) ? (o.props as Record<string, PropValue>) : extraProps(o, NODE_KEYS),
  };
}

function edgePatch(o: Obj): Partial<EdgeData> {
  return {
    id: str(o.id),
    weight: toNumber(o.weight ?? o.value ?? o.w),
    directed: toBool(o.directed),
    label: str(o.label),
    url: str(o.url),
    color: str(o.color),
    width: toNumber(o.width),
    dashed: toBool(o.dashed),
    group: str(o.group),
    props: isObj(o.props) ? (o.props as Record<string, PropValue>) : extraProps(o, EDGE_KEYS),
  };
}

/**
 * Accepts the native Graphscape format, D3 node-link JSON ({nodes, links}) and
 * Cytoscape.js elements ({elements: {nodes: [{data}], edges: [{data}]}}).
 */
export function parseJson(text: string): ImportResult {
  const raw: unknown = JSON.parse(text);
  if (!isObj(raw)) throw new Error('JSON graph must be an object');
  const b = new GraphBuilder();
  let rawNodes: unknown[] = [];
  let rawEdges: unknown[] = [];
  if (isObj(raw.elements)) {
    const unwrap = (a: unknown): unknown[] => (Array.isArray(a) ? a.map((x) => (isObj(x) && isObj(x.data) ? x.data : x)) : []);
    rawNodes = unwrap(raw.elements.nodes);
    rawEdges = unwrap(raw.elements.edges);
  } else {
    rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    rawEdges = Array.isArray(raw.edges) ? raw.edges : Array.isArray(raw.links) ? raw.links : [];
  }
  b.directed = toBool(raw.directed) ?? false;
  if (isObj(raw.meta)) {
    const d = str(raw.meta.dimension);
    b.meta = { title: str(raw.meta.title), description: str(raw.meta.description), dimension: d === '3d' ? '3d' : d === '2d' ? '2d' : undefined };
  }
  const order: string[] = [];
  rawNodes.forEach((rn, i) => {
    const o: Obj = isObj(rn) ? rn : { id: rn };
    const id = str(o.id ?? o.name ?? o.key) ?? `n${i + 1}`;
    order.push(id);
    b.addNode(id, nodePatch(o));
  });
  const endpoint = (v: unknown): string | undefined => {
    if (isObj(v)) return str(v.id ?? v.name ?? v.key);
    if (typeof v === 'number' && !b.hasNode(String(v)) && order[v] !== undefined) return order[v]; // d3 index
    return str(v);
  };
  for (const re of rawEdges) {
    if (!isObj(re)) continue;
    const s = endpoint(re.source ?? re.from);
    const t = endpoint(re.target ?? re.to);
    if (s === undefined || t === undefined) {
      b.warnings.push('Skipped an edge without source or target');
      continue;
    }
    if (!b.hasNode(s) || !b.hasNode(t)) b.warnings.push(`Edge ${s} -> ${t} referenced unknown nodes; they were created`);
    b.addEdge(s, t, edgePatch(re));
  }
  return { graph: b.build(), warnings: b.warnings, format: 'json' };
}

export function serializeJson(data: GraphData): string {
  return JSON.stringify({ format: 'graphscape', version: 1, ...data }, null, 2);
}
