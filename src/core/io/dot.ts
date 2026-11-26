import { GraphBuilder, toNumber } from './builder';
import type { EdgeData, GraphData, ImportResult, NodeData, NodeShape } from '../types';

interface Tok {
  t: 'id' | 'str' | 'sym';
  v: string;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const numRe = /-?(?:\d+\.?\d*|\.\d+)/y;
  const idRe = /[A-Za-z_\u0080-\uffff][A-Za-z_0-9\u0080-\uffff]*/y;
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i);
      i = e < 0 ? n : e + 1;
    } else if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
    } else if (c === '#' && (i === 0 || src[i - 1] === '\n')) {
      const e = src.indexOf('\n', i);
      i = e < 0 ? n : e + 1;
    } else if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\' && src[j + 1] === '"') {
          s += '"';
          j += 2;
        } else if (src[j] === '\\' && src[j + 1] === '\n') j += 2;
        else s += src[j++];
      }
      out.push({ t: 'str', v: s });
      i = j + 1;
    } else if (c === '<') {
      let depth = 0;
      let j = i;
      for (; j < n; j++) {
        if (src[j] === '<') depth++;
        else if (src[j] === '>' && --depth === 0) break;
      }
      const inner = src.slice(i + 1, j).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
      out.push({ t: 'str', v: inner.trim() });
      i = j + 1;
    } else if (c === '-' && (src[i + 1] === '>' || src[i + 1] === '-')) {
      out.push({ t: 'sym', v: src.slice(i, i + 2) });
      i += 2;
    } else {
      numRe.lastIndex = i;
      idRe.lastIndex = i;
      const num = numRe.exec(src);
      const id = idRe.exec(src);
      if (num) {
        out.push({ t: 'id', v: num[0] });
        i += num[0].length;
      } else if (id) {
        out.push({ t: 'id', v: id[0] });
        i += id[0].length;
      } else {
        out.push({ t: 'sym', v: c });
        i++;
      }
    }
  }
  return out;
}

type Attrs = Record<string, string>;
interface Ctx {
  nodeDef: Attrs;
  edgeDef: Attrs;
  label?: string;
}

const SHAPES: Record<string, NodeShape> = {
  box: 'rectangle', rect: 'rectangle', rectangle: 'rectangle', plaintext: 'rectangle', plain: 'rectangle', none: 'rectangle', square: 'square',
  ellipse: 'circle', oval: 'circle', circle: 'circle', doublecircle: 'circle', point: 'circle',
  diamond: 'diamond', hexagon: 'hexagon', octagon: 'hexagon', triangle: 'triangle', record: 'card', mrecord: 'card',
};

const unescapeLabel = (s: string): string => s.replace(/\\n|\\l|\\r/g, '\n');

function dotColor(c: string): string {
  const s = c.replace(/^\/[a-z0-9]+\//i, '');
  return s.startsWith('#') ? s.slice(0, 7) : s.split(':')[0];
}

class Parser {
  private p = 0;
  readonly b = new GraphBuilder();
  private warnedBoth = false;
  constructor(private toks: Tok[]) {}

  private peek(o = 0): Tok | undefined {
    return this.toks[this.p + o];
  }
  private next(): Tok {
    const t = this.toks[this.p++];
    if (!t) throw new Error('Unexpected end of DOT input');
    return t;
  }
  private isSym(v: string, o = 0): boolean {
    const t = this.peek(o);
    return !!t && t.t === 'sym' && t.v === v;
  }

  parse(): void {
    if (this.peek()?.t === 'id' && this.peek()!.v.toLowerCase() === 'strict') this.next();
    const kw = this.next().v.toLowerCase();
    if (kw !== 'graph' && kw !== 'digraph') throw new Error('Expected "graph" or "digraph"');
    this.b.directed = kw === 'digraph';
    if (!this.isSym('{')) {
      const title = this.next().v;
      if (title) this.b.meta.title = title;
    }
    if (!this.isSym('{')) throw new Error('Expected "{"');
    this.next();
    const ctx: Ctx = { nodeDef: {}, edgeDef: {} };
    this.stmtList(ctx);
    if (ctx.label && !this.b.meta.title) this.b.meta.title = unescapeLabel(ctx.label);
  }

  private attrList(): Attrs {
    const attrs: Attrs = {};
    while (this.isSym('[')) {
      this.next();
      while (!this.isSym(']')) {
        const k = this.next();
        if (k.t === 'sym') continue; // stray , or ;
        let v = 'true';
        if (this.isSym('=')) {
          this.next();
          v = this.next().v;
        }
        attrs[k.v] = v;
      }
      this.next();
    }
    return attrs;
  }

  private stmtList(ctx: Ctx): Set<string> {
    const mentioned = new Set<string>();
    while (this.peek()) {
      const t = this.peek()!;
      if (t.t === 'sym' && (t.v === ';' || t.v === ',')) {
        this.next();
        continue;
      }
      if (t.t === 'sym' && t.v === '}') {
        this.next();
        return mentioned;
      }
      const low = t.v.toLowerCase();
      if (t.t === 'id' && (low === 'node' || low === 'edge' || low === 'graph') && this.isSym('[', 1)) {
        this.next();
        const attrs = this.attrList();
        if (low === 'node') Object.assign(ctx.nodeDef, attrs);
        else if (low === 'edge') Object.assign(ctx.edgeDef, attrs);
        else if (attrs.label) ctx.label = attrs.label;
        continue;
      }
      if ((t.t === 'id' || t.t === 'str') && this.isSym('=', 1)) {
        this.next();
        this.next();
        const v = this.next().v;
        if (t.v === 'label') ctx.label = v;
        continue;
      }
      const operands: string[][] = [this.operand(ctx, mentioned)];
      let isEdge = false;
      while (this.isSym('->') || this.isSym('--')) {
        this.next();
        isEdge = true;
        operands.push(this.operand(ctx, mentioned));
      }
      const attrs = this.attrList();
      if (!isEdge) {
        for (const id of operands[0]) this.applyNode(id, attrs);
      } else {
        for (let i = 0; i + 1 < operands.length; i++) {
          for (const a of operands[i]) for (const c of operands[i + 1]) this.addEdge(a, c, { ...ctx.edgeDef, ...attrs });
        }
      }
    }
    throw new Error('Unterminated DOT block (missing "}")');
  }

  private operand(ctx: Ctx, mentioned: Set<string>): string[] {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of DOT input');
    if ((t.t === 'id' && t.v.toLowerCase() === 'subgraph') || (t.t === 'sym' && t.v === '{')) {
      let name = '';
      if (t.t === 'id') {
        this.next();
        if (!this.isSym('{')) name = this.next().v;
      }
      if (!this.isSym('{')) return [];
      this.next();
      const sub: Ctx = { nodeDef: { ...ctx.nodeDef }, edgeDef: { ...ctx.edgeDef } };
      const ids = this.stmtList(sub);
      if (/^cluster/i.test(name)) {
        const group = sub.label ? unescapeLabel(sub.label) : name.replace(/^cluster_?/i, '') || name;
        for (const id of ids) {
          const n = this.b.node(id);
          if (n && n.group === undefined) n.group = group;
        }
      }
      ids.forEach((id) => mentioned.add(id));
      return [...ids];
    }
    const id = this.next().v;
    while (this.isSym(':')) {
      this.next();
      if (this.peek() && this.peek()!.t !== 'sym') this.next();
    }
    if (!this.b.hasNode(id)) {
      this.b.addNode(id);
      this.applyNode(id, ctx.nodeDef);
    }
    mentioned.add(id);
    return [id];
  }

  private applyNode(id: string, a: Attrs): void {
    const n = this.b.ensureNode(id);
    const patch: Partial<NodeData> = {};
    if (a.label !== undefined && a.label !== '\\N') patch.label = unescapeLabel(a.label);
    const fill = a.fillcolor ?? (a.style?.includes('filled') ? a.color : undefined) ?? a.color;
    if (fill) patch.color = dotColor(fill);
    const shape = a.shape ? SHAPES[a.shape.toLowerCase()] : undefined;
    if (shape) patch.shape = shape;
    const url = a.URL ?? a.href ?? a.url;
    if (url) patch.url = url;
    if (a.group) patch.group = a.group;
    const subl = a.sublabel ?? a.xlabel;
    if (subl) patch.sublabel = unescapeLabel(subl);
    Object.assign(n, patch);
    if (n.shape === 'card' && a.label !== undefined) {
      const fields = a.label.replace(/[{}]/g, '').split('|');
      n.label = unescapeLabel(fields[0]).trim() || id;
      const body: string[] = [];
      fields.slice(1).forEach((f, i) => {
        if (i > 0) body.push('---');
        body.push(...unescapeLabel(f).split('\n').map((s) => s.trim()).filter(Boolean));
      });
      n.body = body;
    }
  }

  private addEdge(s: string, t: string, a: Attrs): void {
    if (!this.b.hasNode(s)) this.b.addNode(s);
    if (!this.b.hasNode(t)) this.b.addNode(t);
    const dir = a.dir?.toLowerCase();
    let directed = this.b.directed;
    let src = s;
    let tgt = t;
    if (dir === 'none') directed = false;
    else if (dir === 'forward') directed = true;
    else if (dir === 'back') {
      directed = true;
      src = t;
      tgt = s;
    } else if (dir === 'both') {
      directed = false;
      if (!this.warnedBoth) {
        this.b.warnings.push('Edges with dir=both were imported as undirected');
        this.warnedBoth = true;
      }
    }
    const patch: Partial<EdgeData> = {
      weight: toNumber(a.weight),
      label: a.label ? unescapeLabel(a.label) : undefined,
      url: a.URL ?? a.href ?? a.url,
      color: a.color ? dotColor(a.color) : undefined,
      dashed: a.style && /dashed|dotted/.test(a.style) ? true : undefined,
      width: toNumber(a.penwidth),
    };
    const e = this.b.addEdge(src, tgt, patch);
    if (directed !== this.b.directed) e.directed = directed;
  }
}

/** Parses the commonly used DOT subset: nodes, edges (chains), attributes, defaults, subgraphs/clusters. */
export function parseDot(text: string): ImportResult {
  const p = new Parser(tokenize(text));
  p.parse();
  return { graph: p.b.build(), warnings: p.b.warnings, format: 'dot' };
}

const SHAPES_OUT: Record<NodeShape, string> = {
  circle: 'ellipse', square: 'square', rectangle: 'box', diamond: 'diamond', hexagon: 'hexagon', triangle: 'triangle', card: 'record',
};

const q = (s: string): string => `"${s.replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;

export function serializeDot(g: GraphData): string {
  const out: string[] = [`${g.directed ? 'digraph' : 'graph'} ${q(g.meta?.title ?? 'G')} {`];
  for (const n of g.nodes) {
    const a: string[] = [];
    if (n.shape === 'card') {
      const sep = n.body?.indexOf('---') ?? -1;
      const attrs = sep < 0 ? n.body ?? [] : (n.body ?? []).slice(0, sep);
      const methods = sep < 0 ? [] : (n.body ?? []).slice(sep + 1);
      const part = (l: string[]): string => l.join('\\l') + (l.length ? '\\l' : '');
      a.push(`label=${q(`{${n.label ?? n.id}|${part(attrs)}|${part(methods)}}`).replace(/\\\\l/g, '\\l')}`, 'shape=record');
    } else {
      if (n.label !== undefined) a.push(`label=${q(n.label)}`);
      if (n.shape) a.push(`shape=${SHAPES_OUT[n.shape]}`);
    }
    if (n.sublabel) a.push(`sublabel=${q(n.sublabel)}`);
    if (n.color) a.push(`fillcolor=${q(n.color)}`, 'style=filled');
    if (n.url) a.push(`URL=${q(n.url)}`);
    if (n.group) a.push(`group=${q(n.group)}`);
    out.push(`  ${q(n.id)}${a.length ? ` [${a.join(', ')}]` : ''};`);
  }
  const op = g.directed ? '->' : '--';
  for (const e of g.edges) {
    const a: string[] = [];
    if (e.weight !== undefined) a.push(`weight=${e.weight}`);
    if (e.label) a.push(`label=${q(e.label)}`);
    if (e.url) a.push(`URL=${q(e.url)}`);
    if (e.color) a.push(`color=${q(e.color)}`);
    if (e.dashed) a.push('style=dashed');
    if (e.width) a.push(`penwidth=${e.width}`);
    if (e.directed !== undefined && e.directed !== g.directed) a.push(`dir=${e.directed ? 'forward' : 'none'}`);
    out.push(`  ${q(e.source)} ${op} ${q(e.target)}${a.length ? ` [${a.join(', ')}]` : ''};`);
  }
  out.push('}');
  return out.join('\n') + '\n';
}
