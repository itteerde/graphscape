import { GraphBuilder, toBool, toNumber } from './builder';
import type { GraphData, ImportResult } from '../types';

function splitRows(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string> = {
  source: 'source', from: 'source', src: 'source',
  target: 'target', to: 'target', dst: 'target', dest: 'target',
  weight: 'weight', value: 'weight', w: 'weight',
  label: 'label', url: 'url', directed: 'directed', group: 'group',
};

/**
 * Edge list. With a header row (source,target,weight,label,url,directed) columns are
 * matched by name, otherwise by position (source, target, weight, label).
 * A row with an empty target declares an isolated node.
 */
export function parseCsv(text: string, directed = false): ImportResult {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows = splitRows(text, delim);
  const b = new GraphBuilder();
  b.directed = directed;
  if (rows.length === 0) return { graph: b.build(), warnings: ['Empty file'], format: 'csv' };
  const names = rows[0].map((h) => ALIASES[h.trim().toLowerCase()]);
  const hasHeader = names.includes('source') && names.includes('target');
  const cols = hasHeader ? names : ['source', 'target', 'weight', 'label'];
  for (const row of hasHeader ? rows.slice(1) : rows) {
    const rec: Record<string, string> = {};
    cols.forEach((c, i) => {
      if (c && row[i] !== undefined) rec[c] = row[i].trim();
    });
    if (!rec.source) continue;
    if (!rec.target) {
      b.addNode(rec.source, { label: rec.label || undefined, url: rec.url || undefined, group: rec.group || undefined });
      continue;
    }
    let weight = toNumber(rec.weight);
    let label = rec.label || undefined;
    if (!hasHeader && weight === undefined && rec.weight) {
      label = rec.weight; // third column is text, not a number
      weight = undefined;
    }
    b.addEdge(rec.source, rec.target, { weight, label, url: rec.url || undefined, directed: toBool(rec.directed) });
  }
  const g = b.build();
  // edges whose flag equals the default are redundant
  for (const e of g.edges) if (e.directed === g.directed) delete e.directed;
  return { graph: g, warnings: b.warnings, format: 'csv' };
}

const q = (s: string | number | boolean | undefined): string => {
  const v = s === undefined ? '' : String(s);
  return /[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function serializeCsv(g: GraphData): string {
  const lines = ['source,target,weight,label,url,directed'];
  const used = new Set<string>();
  for (const e of g.edges) {
    used.add(e.source);
    used.add(e.target);
    lines.push([e.source, e.target, e.weight ?? 1, e.label, e.url, e.directed ?? g.directed].map(q).join(','));
  }
  for (const n of g.nodes) if (!used.has(n.id)) lines.push([n.id, '', '', n.label, n.url, ''].map(q).join(','));
  return lines.join('\n') + '\n';
}
