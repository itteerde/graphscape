import { parseGraph, createConfig, type DeepPartial, type GraphscapeConfig } from '../core/index';
import { GraphView } from './view';

export * from './index';

const instances = new WeakMap<Element, GraphView>();

/** The view created by `autoInit` for an element, if any. */
export function getInstance(el: Element): GraphView | undefined {
  return instances.get(el);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/**
 * Turns every `<div data-graphscape data-src="graph.graphml">` into a view.
 * Optional attributes: `data-config` (JSON file), `data-theme`, `data-dimension`, `data-directed` (CSV only).
 * Paths are relative to the page.
 */
export async function autoInit(root: ParentNode = document): Promise<GraphView[]> {
  const out: GraphView[] = [];
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-graphscape]'));
  await Promise.all(
    els.map(async (el) => {
      if (instances.has(el)) return;
      try {
        let cfg: DeepPartial<GraphscapeConfig> = {};
        if (el.dataset.config) cfg = JSON.parse(await fetchText(el.dataset.config)) as DeepPartial<GraphscapeConfig>;
        if (el.dataset.theme) cfg = { ...cfg, theme: el.dataset.theme };
        if (el.dataset.dimension === '2d' || el.dataset.dimension === '3d') cfg = { ...cfg, dimension: el.dataset.dimension };
        createConfig(cfg);
        const view = new GraphView(el, cfg);
        instances.set(el, view);
        if (el.dataset.src) {
          const text = await fetchText(el.dataset.src);
          const { graph } = parseGraph(text, { filename: el.dataset.src, directed: el.dataset.directed === 'true' });
          view.load(graph);
        }
        out.push(view);
      } catch (err) {
        const msg = document.createElement('div');
        msg.className = 'gs-error';
        msg.textContent = `Graphscape: ${(err as Error).message}`;
        el.appendChild(msg);
      }
    }),
  );
  return out;
}

if (typeof document !== 'undefined') {
  const run = (): void => void autoInit();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}
