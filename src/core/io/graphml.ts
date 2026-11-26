import { GraphBuilder, toBool, toHex6, toNumber } from './builder';
import { childrenNamed, escapeXml, findFirst, localName, parseXml, type XmlNode } from './xml';
import type { EdgeData, GraphData, ImportResult, NodeData, NodeShape, PropValue } from '../types';
import { NODE_SHAPES } from '../types';

export interface GraphMLImportOptions {
  /** Multiplier applied to yEd pixel coordinates and sizes. Default 0.5. */
  scale?: number;
  /** Treat purely numeric edge labels (common in yEd) as weights. Default false. */
  numericLabelsAsWeights?: boolean;
}

interface KeyDef {
  id: string;
  name: string;
  type: string;
  target: string;
  yType?: string;
}

const NODE_GFX = new Set(['ShapeNode', 'GenericNode', 'ImageNode', 'SVGNode', 'UMLClassNode', 'GroupNode', 'GenericGroupNode', 'TableNode']);
const EDGE_GFX = new Set(['PolyLineEdge', 'ArcEdge', 'QuadCurveEdge', 'SplineEdge', 'BezierEdge', 'GenericEdge', 'ImageEdge']);
const GROUP_GFX = new Set(['GroupNode', 'GenericGroupNode']);

const YED_SHAPES: Record<string, NodeShape> = {
  rectangle: 'rectangle', rectangle3d: 'rectangle', roundrectangle: 'rectangle', parallelogram: 'rectangle',
  ellipse: 'circle', diamond: 'diamond', hexagon: 'hexagon', octagon: 'hexagon',
  triangle: 'triangle', trapezoid: 'triangle', trapezoid2: 'triangle', fatarrow: 'triangle', fatarrow2: 'triangle',
};

const textOf = (n: XmlNode | undefined): string => (n ? (n.text + n.children.map((c) => textOf(c)).join('')).trim() : '');
const named = (name: string) => (n: XmlNode) => localName(n) === name;

function typed(value: string, type: string): PropValue {
  if (type === 'boolean') return value.trim().toLowerCase() === 'true';
  if (['int', 'long', 'float', 'double'].includes(type)) return toNumber(value) ?? value;
  return value;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Reads GraphML including yEd (yFiles) extensions: shapes, colors, positions, arrows, UML class nodes, groups. */
export function parseGraphML(text: string, opts: GraphMLImportOptions = {}): ImportResult {
  const root = parseXml(text);
  if (localName(root) !== 'graphml') throw new Error('Not a GraphML document (missing <graphml> root)');
  const scale = opts.scale ?? 0.5;
  const keys = new Map<string, KeyDef>();
  for (const k of childrenNamed(root, 'key')) {
    keys.set(k.attrs.id, {
      id: k.attrs.id,
      name: k.attrs['attr.name'] ?? '',
      type: k.attrs['attr.type'] ?? 'string',
      target: k.attrs.for ?? 'all',
      yType: k.attrs['yfiles.type'],
    });
  }
  const graphEl = childrenNamed(root, 'graph')[0];
  if (!graphEl) throw new Error('GraphML document contains no <graph>');

  const b = new GraphBuilder();
  b.directed = graphEl.attrs.edgedefault === 'directed';
  const pending: XmlNode[] = [];

  const walk = (g: XmlNode, group?: string): void => {
    for (const c of g.children) {
      const kind = localName(c);
      if (kind === 'node') {
        const node = b.addNode(c.attrs.id, { group });
        readNode(c, node);
        const sub = childrenNamed(c, 'graph')[0];
        if (sub) {
          const gname = node.label?.split('\n')[0] || node.id;
          if (!node.tags?.includes('group')) node.tags = [...(node.tags ?? []), 'group'];
          walk(sub, gname);
        }
      } else if (kind === 'edge') pending.push(c);
      else if (kind === 'hyperedge') b.warnings.push('Hyperedges are not supported and were skipped');
    }
  };

  const assign = (target: NodeData | EdgeData, kd: KeyDef, raw: string, isNode: boolean): void => {
    const name = kd.name.toLowerCase();
    const value = raw.trim();
    const t = target as unknown as Record<string, unknown>;
    switch (name) {
      case 'label': if (t.label === undefined && value) t.label = value; return;
      case 'url': case 'href': case 'link': if (value) t.url = value; return;
      case 'color': if (value) t.color = value; return;
      case 'group': if (value) t.group = value; return;
      case 'sublabel': if (isNode && value) t.sublabel = value; return;
      case 'weight': case 'value': if (!isNode) t.weight = toNumber(value); return;
      case 'x': case 'y': case 'z': case 'size': { const n = toNumber(value); if (isNode && n !== undefined) t[name] = n; return; }
      case 'shape': if (isNode && NODE_SHAPES.includes(value as NodeShape)) t.shape = value; return;
      case 'directed': if (!isNode) t.directed = toBool(value); return;
      default:
        if (kd.name && value !== '') (target.props ??= {})[kd.name] = typed(value, kd.type);
    }
  };

  const readNode = (el: XmlNode, node: NodeData): void => {
    for (const d of childrenNamed(el, 'data')) {
      const kd = keys.get(d.attrs.key);
      if (!kd) continue;
      if (kd.yType === 'nodegraphics') readNodeGraphics(d, node);
      else assign(node, kd, textOf(d), true);
    }
  };

  const readNodeGraphics = (d: XmlNode, node: NodeData): void => {
    const g = findFirst(d, (c) => NODE_GFX.has(localName(c)));
    if (!g) return;
    const gname = localName(g);
    const geo = findFirst(g, named('Geometry'));
    let shape: NodeShape = 'rectangle';
    if (geo) {
      const w = toNumber(geo.attrs.width) ?? 30;
      const h = toNumber(geo.attrs.height) ?? 30;
      const x = toNumber(geo.attrs.x) ?? 0;
      const y = toNumber(geo.attrs.y) ?? 0;
      node.x = round((x + w / 2) * scale);
      node.y = round(-(y + h / 2) * scale);
      if (!GROUP_GFX.has(gname)) node.size = round(Math.max(Math.min(w, h), 1) * scale);
    }
    const fill = findFirst(g, named('Fill'));
    if (fill && fill.attrs.transparent !== 'true') {
      const c = toHex6(fill.attrs.color);
      if (c) node.color = c;
    }
    const shp = findFirst(g, named('Shape'));
    if (shp?.attrs.type) shape = YED_SHAPES[shp.attrs.type.toLowerCase()] ?? shape;
    node.shape = shape;
    const label = textOf(findFirst(g, named('NodeLabel')));
    if (label) node.label = label;
    if (gname === 'UMLClassNode') {
      node.shape = 'card';
      const attrs = textOf(findFirst(g, named('AttributeLabel')));
      const methods = textOf(findFirst(g, named('MethodLabel')));
      const body: string[] = [];
      if (attrs) body.push(...attrs.split(/\r?\n/));
      if (attrs || methods) body.push('---');
      if (methods) body.push(...methods.split(/\r?\n/));
      node.body = body;
    } else if (GROUP_GFX.has(gname)) {
      node.shape = 'rectangle';
      node.tags = [...(node.tags ?? []), 'group'];
    }
  };

  const readEdge = (el: XmlNode): void => {
    let source = el.attrs.source;
    let target = el.attrs.target;
    if (!b.hasNode(source) || !b.hasNode(target)) b.warnings.push(`Edge ${source} -> ${target} references an undeclared node; it was created`);
    const patch: Partial<EdgeData> = { id: el.attrs.id };
    const directedAttr = toBool(el.attrs.directed);
    let directed: boolean | undefined = directedAttr;
    const tmp: EdgeData = { id: '', source, target };
    for (const d of childrenNamed(el, 'data')) {
      const kd = keys.get(d.attrs.key);
      if (!kd) continue;
      if (kd.yType === 'edgegraphics') {
        const g = findFirst(d, (c) => EDGE_GFX.has(localName(c)));
        if (!g) continue;
        const arrows = findFirst(g, named('Arrows'));
        if (arrows) {
          const s = (arrows.attrs.source ?? 'none') !== 'none';
          const t = (arrows.attrs.target ?? 'none') !== 'none';
          if (s && !t) {
            [source, target] = [target, source];
            directed = true;
          } else directed = t && !s;
        }
        const ls = findFirst(g, named('LineStyle'));
        if (ls) {
          const c = toHex6(ls.attrs.color);
          if (c && c !== '#000000') tmp.color = c;
          if (/dash|dot/i.test(ls.attrs.type ?? '')) tmp.dashed = true;
          const w = toNumber(ls.attrs.width);
          if (w !== undefined && Math.abs(w - 1) > 0.01) tmp.width = Math.min(8, Math.max(0.5, w));
        }
        const lbl = textOf(findFirst(g, named('EdgeLabel')));
        if (lbl) tmp.label = lbl;
      } else assign(tmp, kd, textOf(d), false);
    }
    if (opts.numericLabelsAsWeights && tmp.label !== undefined && tmp.weight === undefined && /^-?\d+(\.\d+)?$/.test(tmp.label)) {
      tmp.weight = Number(tmp.label);
      delete tmp.label;
    }
    const edge = b.addEdge(source, target, { ...tmp, id: patch.id, directed: undefined });
    const eff = directed ?? b.directed;
    if (eff !== b.directed) edge.directed = eff;
  };

  walk(graphEl);
  for (const e of pending) readEdge(e);
  return { graph: b.build(), warnings: b.warnings, format: 'graphml' };
}

// ---------------------------------------------------------------- export

export interface GraphMLExportOptions {
  /** Inverse of the import scale. Default 0.5. */
  scale?: number;
  /** Node diameter used when a node has no size. Default 14. */
  defaultSize?: number;
}

const SHAPE_OUT: Record<NodeShape, string> = {
  circle: 'ellipse', square: 'rectangle', rectangle: 'rectangle', diamond: 'diamond', hexagon: 'hexagon', triangle: 'triangle', card: 'rectangle',
};

/** Writes GraphML that opens in yEd (graphics included) and keeps URLs, weights, groups and extra props as data keys. */
export function serializeGraphML(g: GraphData, opts: GraphMLExportOptions = {}): string {
  const scale = opts.scale ?? 0.5;
  const defSize = opts.defaultSize ?? 14;
  const keyDefs: { id: string; target: 'node' | 'edge'; name: string; type: string }[] = [];
  const keyId = (target: 'node' | 'edge', name: string, type: string): string => {
    let k = keyDefs.find((d) => d.target === target && d.name === name);
    if (!k) {
      k = { id: `k${keyDefs.length + 2}`, target, name, type };
      keyDefs.push(k);
    }
    return k.id;
  };
  const attrType = (v: PropValue): string => (typeof v === 'number' ? 'double' : typeof v === 'boolean' ? 'boolean' : 'string');

  const nodes: string[] = [];
  for (const n of g.nodes) {
    const size = n.size ?? defSize;
    const shape = n.shape ?? 'circle';
    const w = (shape === 'rectangle' ? size * 1.6 : shape === 'card' ? Math.max(size * 3, 60) : size) / scale;
    const h = (shape === 'card' ? Math.max(size * 3, 40) : size) / scale;
    const x = (n.x ?? 0) / scale - w / 2;
    const y = -(n.y ?? 0) / scale - h / 2;
    const fill = toHex6(n.color) ?? '#CCCCFF';
    const label = escapeXml(n.label ?? n.id);
    let gfx: string;
    if (shape === 'card') {
      const sep = (n.body ?? []).indexOf('---');
      const attrs = (sep < 0 ? n.body ?? [] : (n.body ?? []).slice(0, sep)).join('\n');
      const methods = sep < 0 ? '' : (n.body ?? []).slice(sep + 1).join('\n');
      gfx = `<y:UMLClassNode><y:Geometry height="${h}" width="${w}" x="${x}" y="${y}"/><y:Fill color="${fill}" transparent="false"/><y:BorderStyle color="#000000" type="line" width="1.0"/><y:NodeLabel>${label}</y:NodeLabel><y:UML clipContent="true" omitDetails="false" stereotype="" use3DEffect="false"><y:AttributeLabel>${escapeXml(attrs)}</y:AttributeLabel><y:MethodLabel>${escapeXml(methods)}</y:MethodLabel></y:UML></y:UMLClassNode>`;
    } else {
      gfx = `<y:ShapeNode><y:Geometry height="${h}" width="${w}" x="${x}" y="${y}"/><y:Fill color="${fill}" transparent="false"/><y:BorderStyle color="#000000" type="line" width="1.0"/><y:NodeLabel>${label}</y:NodeLabel><y:Shape type="${SHAPE_OUT[shape]}"/></y:ShapeNode>`;
    }
    const data: string[] = [`<data key="d0">${gfx}</data>`];
    if (n.url) data.push(`<data key="${keyId('node', 'url', 'string')}">${escapeXml(n.url)}</data>`);
    if (n.group) data.push(`<data key="${keyId('node', 'group', 'string')}">${escapeXml(n.group)}</data>`);
    if (n.sublabel) data.push(`<data key="${keyId('node', 'sublabel', 'string')}">${escapeXml(n.sublabel)}</data>`);
    if (n.z !== undefined) data.push(`<data key="${keyId('node', 'z', 'double')}">${n.z}</data>`);
    if (n.color && !toHex6(n.color)) data.push(`<data key="${keyId('node', 'color', 'string')}">${escapeXml(n.color)}</data>`);
    for (const [k, v] of Object.entries(n.props ?? {})) data.push(`<data key="${keyId('node', k, attrType(v))}">${escapeXml(String(v))}</data>`);
    nodes.push(`    <node id="${escapeXml(n.id)}">\n      ${data.join('\n      ')}\n    </node>`);
  }

  const edges: string[] = [];
  for (const e of g.edges) {
    const directed = e.directed ?? g.directed;
    const color = toHex6(e.color) ?? '#000000';
    const lbl = e.label ? `<y:EdgeLabel>${escapeXml(e.label)}</y:EdgeLabel>` : '';
    const gfx = `<y:PolyLineEdge><y:Path sx="0.0" sy="0.0" tx="0.0" ty="0.0"/><y:LineStyle color="${color}" type="${e.dashed ? 'dashed' : 'line'}" width="${e.width ?? 1}"/><y:Arrows source="none" target="${directed ? 'standard' : 'none'}"/>${lbl}</y:PolyLineEdge>`;
    const data: string[] = [`<data key="d1">${gfx}</data>`];
    if (e.weight !== undefined) data.push(`<data key="${keyId('edge', 'weight', 'double')}">${e.weight}</data>`);
    if (e.url) data.push(`<data key="${keyId('edge', 'url', 'string')}">${escapeXml(e.url)}</data>`);
    if (e.group) data.push(`<data key="${keyId('edge', 'group', 'string')}">${escapeXml(e.group)}</data>`);
    for (const [k, v] of Object.entries(e.props ?? {})) data.push(`<data key="${keyId('edge', k, attrType(v))}">${escapeXml(String(v))}</data>`);
    edges.push(`    <edge id="${escapeXml(e.id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">\n      ${data.join('\n      ')}\n    </edge>`);
  }

  const keyXml = [
    '  <key for="node" id="d0" yfiles.type="nodegraphics"/>',
    '  <key for="edge" id="d1" yfiles.type="edgegraphics"/>',
    ...keyDefs.map((k) => `  <key attr.name="${escapeXml(k.name)}" attr.type="${k.type}" for="${k.target}" id="${k.id}"/>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:y="http://www.yworks.com/xml/graphml" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml/1.1/ygraphml.xsd">
${keyXml.join('\n')}
  <graph id="G" edgedefault="${g.directed ? 'directed' : 'undirected'}">
${nodes.join('\n')}
${edges.join('\n')}
  </graph>
</graphml>
`;
}

