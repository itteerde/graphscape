import { GraphBuilder, toNumber } from './builder';
import type { EdgeData, GraphData, ImportResult, NodeData, NodeShape } from '../types';
import { NODE_SHAPES } from '../types';

type GmlValue = string | number | GmlList;
type GmlList = Array<[string, GmlValue]>;

const unescape = (s: string): string => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function tokenize(text: string): string[] {
  const clean = text.replace(/^\s*#.*$/gm, '');
  const re = /\s*(\[|\]|"[^"]*"|[^\s[\]"]+)/y;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(clean)) !== null) out.push(m[1]);
  return out;
}

function parseList(tokens: string[], pos: { i: number }, top: boolean): GmlList {
  const out: GmlList = [];
  while (pos.i < tokens.length) {
    const key = tokens[pos.i++];
    if (key === ']') {
      if (top) throw new Error('Unexpected "]" in GML');
      return out;
    }
    const v = tokens[pos.i++];
    if (v === undefined) throw new Error('Unexpected end of GML');
    if (v === '[') out.push([key, parseList(tokens, pos, false)]);
    else if (v.startsWith('"')) out.push([key, unescape(v.slice(1, -1))]);
    else out.push([key, toNumber(v) ?? v]);
  }
  if (!top) throw new Error('Unterminated list in GML');
  return out;
}

const get = (l: GmlList, key: string): GmlValue | undefined => l.find(([k]) => k === key)?.[1];
const getStr = (l: GmlList, key: string): string | undefined => {
  const v = get(l, key);
  return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
};
const getNum = (l: GmlList, key: string): number | undefined => {
  const v = get(l, key);
  return typeof v === 'number' ? v : typeof v === 'string' ? toNumber(v) : undefined;
};
const getList = (l: GmlList, key: string): GmlList | undefined => {
  const v = get(l, key);
  return Array.isArray(v) ? v : undefined;
};

export function parseGml(text: string): ImportResult {
  const root = parseList(tokenize(text), { i: 0 }, true);
  const graph = getList(root, 'graph');
  if (!graph) throw new Error('GML document contains no graph [ ... ]');
  const b = new GraphBuilder();
  b.directed = getNum(graph, 'directed') === 1;
  const title = getStr(graph, 'label');
  if (title) b.meta.title = title;
  for (const [k, v] of graph) {
    if (k !== 'node' || !Array.isArray(v)) continue;
    const gs = getStr(v, 'gsId');
    const id = gs ?? getStr(v, 'id');
    if (id === undefined) {
      b.warnings.push('Skipped a node without id');
      continue;
    }
    const gfx = getList(v, 'graphics');
    const shape = getStr(v, 'shape') as NodeShape | undefined;
    const body = getStr(v, 'body');
    b.addNode(id, {
      label: getStr(v, 'label'),
      sublabel: getStr(v, 'sublabel'),
      x: gfx ? getNum(gfx, 'x') : undefined,
      y: gfx ? getNum(gfx, 'y') : undefined,
      z: gfx ? getNum(gfx, 'z') : undefined,
      group: getStr(v, 'group'),
      url: getStr(v, 'url'),
      color: getStr(v, 'color') ?? (gfx ? getStr(gfx, 'fill') : undefined),
      size: getNum(v, 'size'),
      shape: shape && NODE_SHAPES.includes(shape) ? shape : undefined,
      body: body ? body.split('\n') : undefined,
    });
    if (gs !== undefined) (b.node(id) as NodeData & { _gml?: string })._gml = getStr(v, 'id');
  }
  const byGmlId = new Map<string, string>();
  for (const n of b.build().nodes) {
    const g = (n as NodeData & { _gml?: string })._gml;
    if (g !== undefined) byGmlId.set(g, n.id);
    delete (n as NodeData & { _gml?: string })._gml;
  }
  const resolve = (v: string | undefined): string | undefined => (v === undefined ? undefined : byGmlId.get(v) ?? v);
  for (const [k, v] of graph) {
    if (k !== 'edge' || !Array.isArray(v)) continue;
    const s = resolve(getStr(v, 'source'));
    const t = resolve(getStr(v, 'target'));
    if (s === undefined || t === undefined) {
      b.warnings.push('Skipped an edge without source/target');
      continue;
    }
    const patch: Partial<EdgeData> = {
      weight: getNum(v, 'weight') ?? getNum(v, 'value'),
      label: getStr(v, 'label'),
      url: getStr(v, 'url'),
      color: getStr(v, 'color'),
    };
    const d = getNum(v, 'directed');
    if (d !== undefined && (d === 1) !== b.directed) patch.directed = d === 1;
    b.addEdge(s, t, patch);
  }
  return { graph: b.build(), warnings: b.warnings, format: 'gml' };
}

export function serializeGml(g: GraphData): string {
  const q = (s: string): string => `"${escape(s)}"`;
  const index = new Map<string, number>();
  g.nodes.forEach((n, i) => index.set(n.id, i));
  const out: string[] = ['graph [', `  directed ${g.directed ? 1 : 0}`];
  if (g.meta?.title) out.push(`  label ${q(g.meta.title)}`);
  for (const n of g.nodes) {
    out.push('  node [', `    id ${index.get(n.id)}`, `    gsId ${q(n.id)}`);
    if (n.label !== undefined) out.push(`    label ${q(n.label)}`);
    if (n.sublabel) out.push(`    sublabel ${q(n.sublabel)}`);
    if (n.x !== undefined || n.y !== undefined) out.push(`    graphics [ x ${n.x ?? 0} y ${n.y ?? 0}${n.z !== undefined ? ` z ${n.z}` : ''} ]`);
    if (n.group) out.push(`    group ${q(n.group)}`);
    if (n.url) out.push(`    url ${q(n.url)}`);
    if (n.color) out.push(`    color ${q(n.color)}`);
    if (n.shape) out.push(`    shape ${q(n.shape)}`);
    if (n.size !== undefined) out.push(`    size ${n.size}`);
    if (n.body?.length) out.push(`    body ${q(n.body.join('\n'))}`);
    out.push('  ]');
  }
  for (const e of g.edges) {
    out.push('  edge [', `    source ${index.get(e.source)}`, `    target ${index.get(e.target)}`);
    if (e.weight !== undefined) out.push(`    weight ${e.weight}`);
    if (e.label) out.push(`    label ${q(e.label)}`);
    if (e.url) out.push(`    url ${q(e.url)}`);
    if (e.color) out.push(`    color ${q(e.color)}`);
    if (e.directed !== undefined && e.directed !== g.directed) out.push(`    directed ${e.directed ? 1 : 0}`);
    out.push('  ]');
  }
  out.push(']');
  return out.join('\n') + '\n';
}
