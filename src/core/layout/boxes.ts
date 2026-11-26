import { nodeExtents } from '../geometry';
import type { GraphscapeConfig } from '../config';
import type { Graph } from '../graph';
import { buildGroupIndex, resolveNodeStyle } from '../style';

/** Footprint of a node including its label, in world units. */
export interface Box {
  w: number;
  h: number;
}

/** Shared by all placement layouts. */
export interface PlaceOptions {
  /** Fallback box size and minimum distance when no boxes are given. */
  spacing: number;
  /** Free space kept between boxes. */
  gap: number;
  boxes?: Map<string, Box>;
  dim3?: boolean;
  seed?: number;
}

const CHAR_WIDTH = 0.58; // average glyph width relative to the font size
const LINE_HEIGHT = 1.25;

export function estimateTextBox(text: string, size: number, maxChars: number): Box {
  const lines = text.split('\n').map((l) => Math.min(l.length, maxChars));
  return { w: Math.max(0, ...lines) * size * CHAR_WIDTH, h: lines.length * size * LINE_HEIGHT };
}

export function boxOf(o: PlaceOptions, id: string): Box {
  return o.boxes?.get(id) ?? { w: o.spacing, h: o.spacing };
}

/** Size of the box the placement layouts should reserve for a node (node body + label + sublabel, or the whole card). */
export function nodeBoxes(graph: Graph, cfg: GraphscapeConfig, dim3 = false): Map<string, Box> {
  const groups = buildGroupIndex(graph);
  const labels = cfg.label.show && graph.nodes.length <= cfg.label.maxCount;
  const out = new Map<string, Box>();
  for (const n of graph.nodes) {
    const style = resolveNodeStyle(n, cfg, groups);
    if (style.shape === 'card') {
      const title = estimateTextBox(n.label ?? n.id, cfg.card.size, 80);
      const body = estimateTextBox((n.body ?? []).join('\n'), cfg.card.size, 80);
      const pad = cfg.card.padding;
      out.set(n.id, { w: Math.max(title.w, body.w) + pad * 3, h: (title.h + body.h) * 1.12 + pad * 3 });
      continue;
    }
    const e = nodeExtents(style.shape, style.size, cfg.node.aspect, dim3);
    let w = e.hw * 2;
    let h = e.hh * 2;
    if (labels) {
      const main = estimateTextBox(n.label ?? n.id, cfg.label.size, cfg.label.maxChars);
      const sub = n.sublabel ? estimateTextBox(n.sublabel, cfg.label.subSize, cfg.label.maxChars) : { w: 0, h: 0 };
      w = Math.max(w, main.w, sub.w);
      h += cfg.label.gap + main.h + sub.h;
    }
    out.set(n.id, { w, h });
  }
  return out;
}
