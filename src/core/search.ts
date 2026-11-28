import type { Graph } from './graph';
import type { NodeData, SearchField } from './types';

const DEFAULT_FIELDS: SearchField[] = ['label', 'sublabel', 'id', 'group', 'tags', 'props'];

const ALIASES: Record<string, SearchField> = {
  label: 'label', name: 'label', sublabel: 'sublabel', sub: 'sublabel', id: 'id', group: 'group',
  tag: 'tags', tags: 'tags', url: 'url', prop: 'props', props: 'props',
};

export interface SearchTerm {
  /** Set for `field:term`, otherwise the term is looked up in all configured fields. */
  field?: SearchField;
  term: string;
}

/** `group:Sales ada "new york" tag:team` becomes four terms; all of them have to match. */
export function parseQuery(query: string): SearchTerm[] {
  const out: SearchTerm[] = [];
  const re = /(?:([A-Za-z]+):)?(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const field = m[1] ? ALIASES[m[1].toLowerCase()] : undefined;
    // an unknown prefix such as "http:" is just text
    const term = (field ? m[2] ?? m[3] ?? '' : m[0].replace(/^"|"$/g, '')).trim().toLowerCase();
    if (term) out.push({ field, term });
  }
  return out;
}

export interface SearchOptions {
  fields?: SearchField[];
  /** Terms shorter than this are ignored. Default 2. */
  minChars?: number;
}

export interface SearchResult {
  query: string;
  /** Matching node ids in graph order. */
  ids: string[];
  /** The query had text but every term was shorter than `minChars`. */
  tooShort: boolean;
}

interface Entry {
  id: string;
  text: Record<SearchField, string>;
}

/**
 * Substring search over the nodes of a graph. The lower-cased text of every node is prepared once, so each
 * keystroke is a plain `includes` scan: well below a millisecond per 1000 nodes. Rebuild after the graph changed.
 */
export class NodeSearchIndex {
  private entries: Entry[];

  constructor(graph: Graph) {
    this.entries = graph.nodes.map((n: NodeData) => ({
      id: n.id,
      text: {
        label: (n.label ?? '').toLowerCase(),
        sublabel: (n.sublabel ?? '').toLowerCase(),
        id: n.id.toLowerCase(),
        group: (n.group ?? '').toLowerCase(),
        tags: (n.tags ?? []).join('\n').toLowerCase(),
        url: (n.url ?? '').toLowerCase(),
        props: Object.values(n.props ?? {}).join('\n').toLowerCase(),
      },
    }));
  }

  search(query: string, opts: SearchOptions = {}): SearchResult {
    const min = opts.minChars ?? 2;
    const fields = opts.fields ?? DEFAULT_FIELDS;
    const all = parseQuery(query);
    const terms = all.filter((t) => t.term.length >= min);
    if (terms.length === 0) return { query, ids: [], tooShort: all.length > 0 };
    const ids: string[] = [];
    for (const e of this.entries) {
      let ok = true;
      for (const t of terms) {
        const hit = t.field ? e.text[t.field].includes(t.term) : fields.some((f) => e.text[f].includes(t.term));
        if (!hit) {
          ok = false;
          break;
        }
      }
      if (ok) ids.push(e.id);
    }
    return { query, ids, tooShort: false };
  }
}

export function searchNodes(graph: Graph, query: string, opts?: SearchOptions): SearchResult {
  return new NodeSearchIndex(graph).search(query, opts);
}
