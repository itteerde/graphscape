import { parseCsv, serializeCsv } from './csv';
import { parseDot, serializeDot } from './dot';
import { parseGml, serializeGml } from './gml';
import { parseGraphML, serializeGraphML } from './graphml';
import { parseJson, serializeJson } from './json';
import type { GraphData, ImportResult } from '../types';

export type GraphFormat = 'json' | 'graphml' | 'gml' | 'dot' | 'csv';

export interface FormatInfo {
  id: GraphFormat;
  label: string;
  extensions: string[];
  mime: string;
}

export const FORMATS: FormatInfo[] = [
  { id: 'json', label: 'Graphscape JSON (also D3 / Cytoscape)', extensions: ['json'], mime: 'application/json' },
  { id: 'graphml', label: 'GraphML (yEd)', extensions: ['graphml', 'xml'], mime: 'application/xml' },
  { id: 'gml', label: 'GML', extensions: ['gml'], mime: 'text/plain' },
  { id: 'dot', label: 'Graphviz DOT', extensions: ['dot', 'gv'], mime: 'text/vnd.graphviz' },
  { id: 'csv', label: 'CSV edge list', extensions: ['csv', 'tsv', 'txt'], mime: 'text/csv' },
];

export interface ImportOptions {
  /** Skip auto detection. */
  format?: GraphFormat;
  /** File name or URL, used for format detection by extension. */
  filename?: string;
  /** Default direction for formats that do not carry it (CSV). */
  directed?: boolean;
  /** GraphML: multiplier for yEd pixel units (default 0.5). */
  scale?: number;
  /** GraphML: treat numeric edge labels as weights. */
  numericLabelsAsWeights?: boolean;
}

export function detectFormat(text: string, filename?: string): GraphFormat {
  const ext = filename?.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  if (ext) for (const f of FORMATS) if (f.id !== 'csv' && f.extensions.includes(ext)) return f.id;
  const head = text.replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  if (/^<\?xml|^<graphml/i.test(head) || /<graphml[\s>]/i.test(head.slice(0, 2000))) return 'graphml';
  if (/(^|\n)\s*graph\s*\[/.test(head.replace(/^\s*#.*$/gm, ''))) return 'gml';
  if (/^(strict\s+)?(di)?graph\b[^[{]*\{/i.test(head.replace(/^(\s*(\/\/.*|#.*|\/\*[\s\S]*?\*\/)\s*)+/, ''))) return 'dot';
  return 'csv';
}

export function parseGraph(text: string, opts: ImportOptions = {}): ImportResult {
  const format = opts.format ?? detectFormat(text, opts.filename);
  const src = text.replace(/^\uFEFF/, '');
  switch (format) {
    case 'json': return parseJson(src);
    case 'graphml': return parseGraphML(src, { scale: opts.scale, numericLabelsAsWeights: opts.numericLabelsAsWeights });
    case 'gml': return parseGml(src);
    case 'dot': return parseDot(src);
    case 'csv': return parseCsv(src, opts.directed ?? false);
  }
}

export function serializeGraph(data: GraphData, format: GraphFormat): string {
  switch (format) {
    case 'json': return serializeJson(data);
    case 'graphml': return serializeGraphML(data);
    case 'gml': return serializeGml(data);
    case 'dot': return serializeDot(data);
    case 'csv': return serializeCsv(data);
  }
}

export { parseCsv, serializeCsv, parseDot, serializeDot, parseGml, serializeGml, parseGraphML, serializeGraphML, parseJson, serializeJson };
