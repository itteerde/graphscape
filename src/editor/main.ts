import './editor.css';
import {
  FORMATS, Graph, GraphView, LAYOUT_NAMES, NODE_SHAPES, detectFormat, generateClustered, parseGraph, serializeGraph, themes,
  type DeepPartial, type EdgeData, type GraphData, type GraphFormat, type GraphscapeConfig, type LayoutName, type NodeData, type NodeShape,
} from '../lib/index';

// ------------------------------------------------------------------ tiny DOM helpers

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (typeof cls === 'string') el.className = cls;
  Object.assign(el, rest);
  el.append(...kids);
  return el;
}

const colorCtx = document.createElement('canvas').getContext('2d')!;
function cssToHex(c: string | undefined): string {
  if (!c) return '#888888';
  colorCtx.fillStyle = '#000000';
  colorCtx.fillStyle = c;
  return /^#[0-9a-f]{6}$/i.test(colorCtx.fillStyle) ? colorCtx.fillStyle : '#888888';
}

function download(name: string, text: string, mime: string): void {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ------------------------------------------------------------------ state

class History {
  private stack: string[] = [];
  private i = -1;
  push(s: string): void {
    if (this.stack[this.i] === s) return;
    this.stack.length = this.i + 1;
    this.stack.push(s);
    if (this.stack.length > 100) this.stack.shift();
    this.i = this.stack.length - 1;
  }
  reset(): void {
    this.stack = [];
    this.i = -1;
  }
  get canUndo(): boolean { return this.i > 0; }
  get canRedo(): boolean { return this.i < this.stack.length - 1; }
  undo(): string | null { return this.canUndo ? this.stack[--this.i] : null; }
  redo(): string | null { return this.canRedo ? this.stack[++this.i] : null; }
}

type EditorTool = 'select' | 'add' | 'connect';

const THEME_KEY = 'graphscape.theme';
function savedTheme(): string {
  try { return localStorage.getItem(THEME_KEY) ?? 'light'; } catch { return 'light'; }
}

const graph = new Graph();
const history = new History();
const baseConfig: DeepPartial<GraphscapeConfig> = {
  theme: savedTheme(),
  interaction: { openLinks: 'ctrl-click', gizmo: true },
  links: { target: 'blank', allowAbsolute: true },
};
const view = new GraphView($('stage'), baseConfig, graph);
let tool: EditorTool = 'select';
let message = '';
let warning = '';

const SAMPLES: [string, string][] = [
  ['Social network (JSON)', 'social.json'],
  ['Evolution, directed (JSON)', 'evolution.json'],
  ['Class diagram (yEd GraphML)', 'classes.graphml'],
];

// ------------------------------------------------------------------ editing actions

function commit(): void {
  graph.meta.dimension = view.getDimension();
  history.push(JSON.stringify(graph.toData()));
  refreshChrome();
}

function loadGraphData(data: GraphData, note = ''): void {
  history.reset();
  view.load(data);
  warning = '';
  message = note;
  commit();
  renderInspector();
}

function restore(json: string | null): void {
  if (!json) return;
  graph.load(JSON.parse(json) as GraphData);
  view.clearSelection();
  refreshChrome();
  renderInspector();
}

function addNodeAt(position: [number, number, number]): void {
  const n = graph.nodes.length + 1;
  const node = graph.addNode({ label: `Node ${n}`, x: position[0], y: position[1], z: view.getDimension() === '3d' ? position[2] : 0 });
  view.setSelection({ nodes: [node.id] });
  commit();
}

function deleteSelection(): void {
  const sel = view.getSelection();
  if (!sel.nodes.length && !sel.edges.length) return;
  for (const id of sel.edges) graph.removeEdge(id);
  for (const id of sel.nodes) graph.removeNode(id);
  view.clearSelection();
  commit();
  renderInspector();
}

function connect(source: string, target: string): void {
  const edge = graph.addEdge({ source, target });
  view.setSelection({ edges: [edge.id] });
  commit();
}

function setTool(t: EditorTool): void {
  tool = t;
  view.setTool(t === 'connect' ? 'connect' : 'select');
  for (const b of document.querySelectorAll<HTMLButtonElement>('button.tool[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  refreshChrome();
}

const TOOL_HINT: Record<EditorTool, string> = {
  select: 'Drag nodes freely, or use the gizmo of the selection: M move, R rotate, S scale (Ctrl snaps). Hold X, Y or Z while dragging to lock an axis. Shift selects several.',
  add: 'Click on the canvas to add a node.',
  connect: 'Drag from one node to another to add an edge. Release on the same node for a self loop.',
};

// ------------------------------------------------------------------ top bar and tools

const undoBtn = h('button', { textContent: 'Undo', title: 'Undo (Ctrl+Z)', onclick: () => restore(history.undo()) });
const redoBtn = h('button', { textContent: 'Redo', title: 'Redo (Ctrl+Y)', onclick: () => restore(history.redo()) });
const layoutSel = h('select', { title: 'Layout algorithm', 'aria-label': 'Layout algorithm' }, ...LAYOUT_NAMES.map((n) => h('option', { value: n, textContent: n })));
const stopBtn = h('button', { textContent: 'Stop', title: 'Stop the running layout', disabled: true, onclick: () => view.stopLayout() });
const dimBtn = h('button', { title: 'Switch between 2D and 3D', onclick: () => view.setDimension(view.getDimension() === '2d' ? '3d' : '2d') });
const themeSel = h('select', { title: 'Theme', 'aria-label': 'Theme', onchange: () => {
  view.setConfig({ theme: themeSel.value });
  try { localStorage.setItem(THEME_KEY, themeSel.value); } catch { /* ignore */ }
  refreshChrome();
  renderInspector();
} }, ...Object.keys(themes).map((n) => h('option', { value: n, textContent: n })));
themeSel.value = view.getConfig().theme;
const formatSel = h('select', { title: 'Export format', 'aria-label': 'Export format' }, ...FORMATS.map((f) => h('option', { value: f.id, textContent: f.label })));
const sampleSel = h('select', { title: 'Load a sample', 'aria-label': 'Samples', onchange: () => {
  const file = sampleSel.value;
  sampleSel.value = '';
  if (file) void loadSample(file);
} }, h('option', { value: '', textContent: 'Samples\u2026' }), ...SAMPLES.map(([l, f]) => h('option', { value: f, textContent: l })));

$('top').append(
  h('span', { class: 'ed-brand', textContent: 'Graphscape' }),
  h('div', { class: 'ed-group' },
    h('button', { textContent: 'New', onclick: () => { if (!graph.nodes.length || confirm('Discard the current graph?')) loadGraphData({ directed: false, nodes: [], edges: [] }); } }),
    h('button', { textContent: 'Open\u2026', onclick: () => $<HTMLInputElement>('file').click() }),
    sampleSel,
    h('button', { textContent: 'Generate\u2026', title: 'Random clustered graph', onclick: generate }),
  ),
  h('div', { class: 'ed-group' },
    formatSel,
    h('button', { textContent: 'Save', title: 'Download in the selected format (Ctrl+S)', onclick: save }),
    h('button', { textContent: 'PNG', title: 'Export the current view as image', onclick: () => {
      const a = h('a', { href: view.exportImage(), download: `${graph.meta.title || 'graph'}.png` });
      a.click();
    } }),
  ),
  h('div', { class: 'ed-group' }, undoBtn, redoBtn),
  h('div', { class: 'ed-group' },
    layoutSel,
    h('button', { textContent: 'Run layout', onclick: () => { void view.runLayout(layoutSel.value as LayoutName).then(commit); } }),
    stopBtn,
  ),
  h('div', { class: 'ed-group' }, dimBtn, h('button', { textContent: 'Fit', title: 'Fit graph to view (F)', onclick: () => view.fit() }), themeSel),
);

function toolButton(t: EditorTool, glyph: string, label: string, title: string): HTMLButtonElement {
  return h('button', { class: 'tool', title, 'aria-pressed': t === 'select', onclick: () => setTool(t) }, h('span', { class: 'glyph', textContent: glyph }), label) as HTMLButtonElement;
}
const toolBtns = [
  toolButton('select', '\u2196', 'Select', 'Select and move (V)'),
  toolButton('add', '\u25cb', 'Node', 'Add nodes (N)'),
  toolButton('connect', '\u2197', 'Edge', 'Connect nodes (E)'),
];
toolBtns.forEach((b, i) => (b.dataset.tool = (['select', 'add', 'connect'] as const)[i]));
const gizmoBtns = (['translate', 'rotate', 'scale'] as const).map((m) => {
  const glyph = { translate: '\u2725', rotate: '\u21bb', scale: '\u2922' }[m];
  const label = { translate: 'Move', rotate: 'Rotate', scale: 'Scale' }[m];
  const key = { translate: 'M', rotate: 'R', scale: 'S' }[m];
  const b = h('button', { class: 'tool', title: `${label} gizmo (${key}); Ctrl snaps. Rotate and scale need two or more selected nodes.`, 'aria-pressed': m === 'translate', onclick: () => view.setGizmoMode(m) }, h('span', { class: 'glyph', textContent: glyph }), label);
  b.dataset.gizmo = m;
  return b;
});
$('tools').append(...toolBtns, h('hr', { class: 'ed-sep' }), ...gizmoBtns, h('button', { class: 'tool danger', title: 'Delete selection (Del)', onclick: deleteSelection }, h('span', { class: 'glyph', textContent: '\u2715' }), 'Delete'));

function refreshChrome(): void {
  const vars = view.getConfig().ui.cssVars;
  const root = document.documentElement.style;
  root.setProperty('--ed-panel-bg', (vars['panel-bg'] ?? '#fff').replace(/rgba\(([^)]+),\s*[\d.]+\)/, 'rgb($1)'));
  root.setProperty('--ed-panel-fg', vars['panel-fg'] ?? '#1f2933');
  root.setProperty('--ed-panel-border', vars['panel-border'] ?? '#cfd6de');
  root.setProperty('--ed-accent', vars.accent ?? '#e8590c');
  dimBtn.textContent = view.getDimension() === '2d' ? 'Switch to 3D' : 'Switch to 2D';
  undoBtn.disabled = !history.canUndo;
  redoBtn.disabled = !history.canRedo;
  stopBtn.disabled = !view.isLayoutRunning;
  const sel = view.getSelection();
  $('status').replaceChildren(
    h('span', { textContent: `${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.directed ? 'directed' : 'undirected'}, ${view.getDimension().toUpperCase()}` }),
    h('span', { textContent: sel.nodes.length + sel.edges.length ? `${sel.nodes.length} nodes and ${sel.edges.length} edges selected` : '' }),
    h('span', { textContent: message || TOOL_HINT[tool] }),
    h('span', { class: 'warn', textContent: warning }),
  );
}

// ------------------------------------------------------------------ files

async function loadSample(file: string): Promise<void> {
  try {
    const res = await fetch(`samples/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { graph: data, warnings } = parseGraph(await res.text(), { filename: file });
    loadGraphData(data, `Loaded sample ${file}`);
    if (warnings.length) warning = `${warnings.length} import warning(s): ${warnings[0]}`;
    refreshChrome();
  } catch (err) {
    warning = `Could not load sample: ${(err as Error).message}`;
    refreshChrome();
  }
}

async function importFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    const format = detectFormat(text, file.name);
    const directed = format === 'csv' ? confirm('This is an edge list. Treat edges as directed?') : false;
    const result = parseGraph(text, { filename: file.name, directed });
    loadGraphData(result.graph, `Imported ${file.name} (${result.format})`);
    if (result.warnings.length) warning = `${result.warnings.length} import warning(s): ${result.warnings[0]}`;
    refreshChrome();
  } catch (err) {
    warning = `Import failed: ${(err as Error).message}`;
    refreshChrome();
  }
}

function save(): void {
  const format = formatSel.value as GraphFormat;
  const info = FORMATS.find((f) => f.id === format)!;
  const data = graph.toData();
  data.meta = { ...data.meta, dimension: view.getDimension() };
  download(`${graph.meta.title || 'graph'}.${info.extensions[0]}`, serializeGraph(data, format), info.mime);
  message = `Saved as ${info.label}`;
  refreshChrome();
}

function generate(): void {
  const n = Number(prompt('Number of nodes (1 to 10000)', '200'));
  if (!Number.isFinite(n) || n < 1) return;
  const nodes = Math.min(10000, Math.floor(n));
  loadGraphData(generateClustered({ nodes, clusters: Math.max(2, Math.round(Math.sqrt(nodes) / 3)), avgDegree: 4, seed: Date.now() % 1e6 }), `Generated ${nodes} nodes`);
}

$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (f) void importFile(f);
});
const stage = $('stage');
stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drop'); });
stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  stage.classList.remove('drop');
  const f = e.dataTransfer?.files[0];
  if (f) void importFile(f);
});

// ------------------------------------------------------------------ inspector

function field(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'ed-field' }, h('span', { textContent: label }), control);
}
function text(label: string, value: string | undefined, onChange: (v: string | undefined) => void, placeholder = ''): HTMLElement {
  const input = h('input', { type: 'text', value: value ?? '', placeholder, onchange: () => onChange(input.value === '' ? undefined : input.value) });
  return field(label, input);
}
function area(label: string, value: string | undefined, onChange: (v: string | undefined) => void, placeholder = '', rows = 2): HTMLElement {
  const ta = h('textarea', { value: value ?? '', placeholder, rows, onchange: () => onChange(ta.value === '' ? undefined : ta.value) });
  return field(label, ta);
}
function num(label: string, value: number | undefined, onChange: (v: number | undefined) => void, placeholder = ''): HTMLElement {
  const input = h('input', { type: 'number', value: value === undefined ? '' : String(value), placeholder, step: 'any', onchange: () => onChange(input.value === '' || !Number.isFinite(Number(input.value)) ? undefined : Number(input.value)) });
  return field(label, input);
}
function select(label: string, value: string, options: [string, string][], onChange: (v: string) => void): HTMLElement {
  const s = h('select', { onchange: () => onChange(s.value) }, ...options.map(([v, l]) => h('option', { value: v, textContent: l })));
  s.value = value;
  return field(label, s);
}
function check(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const i = h('input', { type: 'checkbox', checked: value, onchange: () => onChange(i.checked) });
  return field(label, i);
}
function color(label: string, value: string | undefined, shown: string | undefined, onChange: (v: string | undefined) => void): HTMLElement {
  const i = h('input', { type: 'color', value: cssToHex(value ?? shown), onchange: () => onChange(i.value) });
  const reset = h('button', { textContent: 'Default', title: 'Use the color from the theme', onclick: () => { onChange(undefined); i.value = cssToHex(shown); } });
  return field(label, h('div', { class: 'ed-row' }, i, reset));
}
const same = <T>(items: T[]): T | undefined => (items.every((v) => v === items[0]) ? items[0] : undefined);

function renderNodes(ids: string[]): void {
  const nodes = ids.map((id) => graph.getNode(id)).filter((n): n is NodeData => !!n);
  if (!nodes.length) return;
  const one = nodes.length === 1 ? nodes[0] : null;
  const apply = (patch: Partial<Omit<NodeData, 'id'>>): void => {
    for (const n of nodes) graph.updateNode(n.id, patch);
    commit();
  };
  const el = $('inspector');
  el.replaceChildren(h('h2', { class: 'ed-title', textContent: one ? `Node ${one.id}` : `${nodes.length} nodes` }));
  if (one) {
    el.append(
      area('Label', one.label, (v) => apply({ label: v }), one.id),
      area('Subline', one.sublabel, (v) => apply({ sublabel: v }), 'second, smaller line'),
      h('p', { class: 'ed-hint', textContent: 'Press Enter for a line break inside the label.' }),
    );
  }
  el.append(
    text('Group', same(nodes.map((n) => n.group)), (v) => apply({ group: v }), nodes.length > 1 ? 'mixed' : ''),
    text('URL', same(nodes.map((n) => n.url)), (v) => apply({ url: v }), 'relative path, e.g. pages/a.html'),
    color('Color', same(nodes.map((n) => n.color)), view.getNodeStyle(nodes[0].id)?.color, (v) => apply({ color: v })),
    select('Shape', same(nodes.map((n) => n.shape)) ?? '', [['', 'default'], ...NODE_SHAPES.map((s) => [s, s] as [string, string])], (v) => apply({ shape: (v || undefined) as NodeShape | undefined })),
    num('Size', same(nodes.map((n) => n.size)), (v) => apply({ size: v }), String(view.getConfig().node.size)),
    check('Pinned', nodes.every((n) => n.pinned), (v) => apply({ pinned: v || undefined })),
  );
  if (one && one.shape === 'card') {
    const ta = h('textarea', { rows: 6, value: (one.body ?? []).join('\n'), onchange: () => apply({ body: ta.value === '' ? undefined : ta.value.split('\n') }) });
    el.append(field('Body', ta), h('p', { class: 'ed-hint', textContent: 'One line per row. A row with --- draws a separator.' }));
  }
  if (one) el.append(h('p', { class: 'ed-muted', textContent: `${graph.degree(one.id)} edge ends, position ${Math.round(one.x ?? 0)}, ${Math.round(one.y ?? 0)}` }));
  el.append(h('div', { class: 'ed-actions' },
    ...(one?.url ? [h('button', { textContent: 'Open link', onclick: () => view.openLink('node', one.id) })] : []),
    ...(nodes.length === 2 ? [h('button', { textContent: 'Connect', onclick: () => connect(nodes[0].id, nodes[1].id) })] : []),
    h('button', { class: 'danger', textContent: 'Delete', onclick: deleteSelection }),
  ));
}

function renderEdges(ids: string[]): void {
  const edges = ids.map((id) => graph.getEdge(id)).filter((e): e is EdgeData => !!e);
  if (!edges.length) return;
  const one = edges.length === 1 ? edges[0] : null;
  const apply = (patch: Partial<Omit<EdgeData, 'id'>>): void => {
    for (const e of edges) graph.updateEdge(e.id, patch);
    commit();
  };
  const el = $('inspector');
  const name = (id: string): string => graph.getNode(id)?.label ?? id;
  el.replaceChildren(h('h2', { class: 'ed-title', textContent: one ? `Edge ${name(one.source)} ${graph.isDirected(one) ? '\u2192' : '\u2014'} ${name(one.target)}` : `${edges.length} edges` }));
  const dirValue = (e: EdgeData): string => (e.directed === undefined ? 'inherit' : e.directed ? 'yes' : 'no');
  el.append(
    num('Weight', same(edges.map((e) => e.weight)), (v) => apply({ weight: v }), '1 (default)'),
    text('Label', same(edges.map((e) => e.label)), (v) => apply({ label: v })),
    text('URL', same(edges.map((e) => e.url)), (v) => apply({ url: v }), 'relative path'),
    color('Color', same(edges.map((e) => e.color)), view.getEdgeStyle(edges[0].id)?.color, (v) => apply({ color: v })),
    select('Direction', same(edges.map(dirValue)) ?? 'inherit', [['inherit', `graph default (${graph.directed ? 'directed' : 'undirected'})`], ['yes', 'directed'], ['no', 'undirected']], (v) => apply({ directed: v === 'inherit' ? undefined : v === 'yes' })),
    check('Dashed', edges.every((e) => e.dashed), (v) => apply({ dashed: v || undefined })),
    num('Width', same(edges.map((e) => e.width)), (v) => apply({ width: v }), String(view.getConfig().edge.width)),
  );
  el.append(h('div', { class: 'ed-actions' },
    ...(one ? [h('button', { textContent: 'Reverse', title: 'Swap source and target', onclick: () => { apply({ source: one.target, target: one.source }); renderInspector(); } })] : []),
    ...(one?.url ? [h('button', { textContent: 'Open link', onclick: () => view.openLink('edge', one.id) })] : []),
    h('button', { class: 'danger', textContent: 'Delete', onclick: deleteSelection }),
  ));
}

function renderGraphPanel(): void {
  const el = $('inspector');
  const cfgBox = h('textarea', { class: 'ed-code', spellcheck: false, value: JSON.stringify(view.getUserConfig(), null, 2) });
  const cfgMsg = h('p', { class: 'ed-hint' });
  el.replaceChildren(
    h('h2', { class: 'ed-title', textContent: 'Graph' }),
    text('Title', graph.meta.title, (v) => { graph.meta.title = v; commit(); }, 'untitled'),
    check('Directed', graph.directed, (v) => { graph.setDirected(v); commit(); }),
    h('p', { class: 'ed-hint', textContent: 'Directed is the default for all edges; individual edges can override it.' }),
    select('3D rotation', view.getConfig().camera.rotation, [['orbit', 'Orbit (horizon stays level)'], ['free', 'Free (trackball)']], (v) => view.setConfig({ camera: { rotation: v as 'orbit' | 'free' } })),
    check('Weights', view.getConfig().weight.show !== 'never', (v) => { view.setConfig({ weight: { show: v ? 'auto' : 'never' } }); }),
    check('Width by weight', view.getConfig().edge.widthByWeight.enabled, (v) => { view.setConfig({ edge: { widthByWeight: { enabled: v } } }); }),
    h('h3', { class: 'ed-section', textContent: 'Skin (configuration JSON)' }),
    cfgBox,
    h('div', { class: 'ed-actions' },
      h('button', { textContent: 'Apply', onclick: () => {
        try {
          view.setConfig(JSON.parse(cfgBox.value) as DeepPartial<GraphscapeConfig>);
          cfgMsg.textContent = 'Applied.';
          themeSel.value = view.getConfig().theme;
          refreshChrome();
        } catch (err) { cfgMsg.textContent = `Invalid JSON: ${(err as Error).message}`; }
      } }),
      h('button', { textContent: 'Download', onclick: () => download('graphscape.config.json', JSON.stringify(view.getUserConfig(), null, 2), 'application/json') }),
      h('button', { textContent: 'Load file\u2026', onclick: () => $<HTMLInputElement>('cfgfile').click() }),
    ),
    cfgMsg,
    h('p', { class: 'ed-hint', textContent: 'Select a node or edge to edit it. See docs/CONFIGURATION.md for every option.' }),
  );
}

function renderInspector(): void {
  const sel = view.getSelection();
  if (sel.nodes.length) renderNodes(sel.nodes);
  else if (sel.edges.length) renderEdges(sel.edges);
  else renderGraphPanel();
  refreshChrome();
}

$<HTMLInputElement>('cfgfile').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  try {
    view.setConfig(JSON.parse(await f.text()) as DeepPartial<GraphscapeConfig>);
    themeSel.value = view.getConfig().theme;
    renderInspector();
  } catch (err) {
    warning = `Config not applied: ${(err as Error).message}`;
    refreshChrome();
  }
});

// ------------------------------------------------------------------ wiring

view.on('selection', renderInspector);
view.on('gizmomode', ({ mode }) => { for (const b of gizmoBtns) b.setAttribute('aria-pressed', String(b.dataset.gizmo === mode)); });
view.on('backgroundclick', ({ position }) => { if (tool === 'add') addNodeAt(position); });
view.on('backgrounddblclick', ({ position }) => addNodeAt(position));
view.on('connect', ({ source, target }) => connect(source, target));
view.on('nodedragend', commit);
view.on('layoutstart', () => { stopBtn.disabled = false; });
view.on('layoutend', () => { stopBtn.disabled = true; refreshChrome(); });
view.on('dimensionchange', ({ dimension }) => {
  if (dimension === '3d' && view.isFlat() && graph.nodes.length > 1) void view.runLayout('force').then(commit);
  commit();
});
graph.events.on('change', () => { message = ''; refreshChrome(); });

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches('input, textarea, select')) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') { e.preventDefault(); restore(e.shiftKey ? history.redo() : history.undo()); }
  else if (mod && key === 'y') { e.preventDefault(); restore(history.redo()); }
  else if (mod && key === 's') { e.preventDefault(); save(); }
  else if (mod && key === 'a') { e.preventDefault(); view.selectAll(); }
  else if (!mod && (key === 'delete' || key === 'backspace')) { e.preventDefault(); deleteSelection(); }
  else if (!mod && key === 'v') setTool('select');
  else if (!mod && key === 'm') view.setGizmoMode('translate');
  else if (!mod && key === 'r') view.setGizmoMode('rotate');
  else if (!mod && key === 's') view.setGizmoMode('scale');
  else if (!mod && key === 'n') setTool('add');
  else if (!mod && key === 'e') setTool('connect');
  else if (!mod && key === 'f') view.fit();
  else if (key === 'escape') { setTool('select'); view.clearSelection(); }
});

void loadSample('social.json');
setTool('select');
renderInspector();
