/** Tiny dependency-free XML parser (elements, attributes, text, CDATA). Enough for GraphML/yEd. */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const tagRe = /<(\/?)([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
  const attrRe = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const n = src.length;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < n) {
    const cur = stack[stack.length - 1];
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      cur.text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) cur.text += decodeEntities(src.slice(i, lt));
    i = lt;
    if (src.startsWith('<!--', i)) {
      const e = src.indexOf('-->', i + 4);
      if (e < 0) throw new Error('Unterminated XML comment');
      i = e + 3;
    } else if (src.startsWith('<![CDATA[', i)) {
      const e = src.indexOf(']]>', i);
      if (e < 0) throw new Error('Unterminated CDATA section');
      cur.text += src.slice(i + 9, e);
      i = e + 3;
    } else if (src.startsWith('<?', i)) {
      const e = src.indexOf('?>', i);
      if (e < 0) throw new Error('Unterminated processing instruction');
      i = e + 2;
    } else if (src.startsWith('<!', i)) {
      // DOCTYPE, possibly with an internal subset in [...]
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      i = j + 1;
    } else {
      tagRe.lastIndex = i;
      const m = tagRe.exec(src);
      if (!m) throw new Error(`Malformed XML near offset ${i}`);
      i = tagRe.lastIndex;
      if (m[1]) {
        if (stack.length < 2 || stack[stack.length - 1].name !== m[2]) throw new Error(`Unexpected closing tag </${m[2]}>`);
        stack.pop();
      } else {
        const attrs: Record<string, string> = {};
        attrRe.lastIndex = 0;
        let a: RegExpExecArray | null;
        while ((a = attrRe.exec(m[3])) !== null) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
        const node: XmlNode = { name: m[2], attrs, children: [], text: '' };
        cur.children.push(node);
        if (!m[4]) stack.push(node);
      }
    }
  }
  if (stack.length !== 1) throw new Error(`Unclosed XML element <${stack[stack.length - 1].name}>`);
  if (root.children.length === 0) throw new Error('Empty XML document');
  return root.children[0];
}

/** Element name without namespace prefix. */
export const localName = (n: XmlNode): string => n.name.slice(n.name.indexOf(':') + 1);

export function childrenNamed(n: XmlNode, name: string): XmlNode[] {
  return n.children.filter((c) => localName(c) === name);
}

export function findFirst(n: XmlNode, pred: (c: XmlNode) => boolean): XmlNode | undefined {
  for (const c of n.children) {
    if (pred(c)) return c;
    const d = findFirst(c, pred);
    if (d) return d;
  }
  return undefined;
}

export function findAll(n: XmlNode, pred: (c: XmlNode) => boolean, out: XmlNode[] = []): XmlNode[] {
  for (const c of n.children) {
    if (pred(c)) out.push(c);
    findAll(c, pred, out);
  }
  return out;
}
