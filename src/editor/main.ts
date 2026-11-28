import './editor.css';
import {
  FORMATS, Graph, GraphView, LAYOUT_NAMES, NODE_SHAPES, configToJsonc, createConfig, detectFormat, diffConfig, findUnknownKeys,
  generateClustered, parseGraph, parseJsonc, serializeGraph, themes,
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
  get current(): string | null { return this.stack[this.i] ?? null; }
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

// ------------------------------------------------------------------ file state (Open, Save, Save as)

interface FsWritable { write(data: string): Promise<void>; close(): Promise<void> }
interface FsFileHandle { name: string; getFile(): Promise<File>; createWritable(): Promise<FsWritable> }
interface FsPicker {
  showOpenFilePicker?: (options?: object) => Promise<FsFileHandle[]>;
  showSaveFilePicker?: (options?: object) => Promise<FsFileHandle>;
}
const fsApi = window as unknown as FsPicker;
/** Chrome, Edge and Opera can open and overwrite files; other browsers can only download copies. */
const canOverwrite = typeof fsApi.showOpenFilePicker === 'function' && typeof fsApi.showSaveFilePicker === 'function';

interface OpenFile {
  name: string;
  format: GraphFormat;
  /** Present when the browser allows writing back to the file. */
  handle?: FsFileHandle;
  /** Opened from disk (not created by Save as in this session). */
  fromDisk: boolean;
  /** The user already agreed to overwrite this file in this session. */
  confirmed: boolean;
}
let currentFile: OpenFile | null = null;
let savedSnapshot: string | null = null;
const isDirty = (): boolean => history.current !== savedSnapshot;
const fileName = (): string => currentFile?.name ?? 'Untitled graph';
const baseConfig: DeepPartial<GraphscapeConfig> = {
  theme: savedTheme(),
  interaction: { openLinks: 'ctrl-click', gizmo: true },
  links: { target: 'blank', allowAbsolute: true },
  ui: { fullscreen: false }, // full screen would hide the editor toolbar and inspector
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

function loadGraphData(data: GraphData, note = '', file: OpenFile | null = null): void {
  history.reset();
  view.load(data);
  warning = '';
  message = note;
  currentFile = file;
  commit();
  savedSnapshot = history.current;
  refreshChrome();
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
const fileLabel = h('span', { class: 'ed-file' });
const formatSel = h('select', { title: 'File format for new files' + (canOverwrite ? ' (you can also pick it in the Save as dialog)' : ' and downloads'), 'aria-label': 'File format' }, ...FORMATS.map((f) => h('option', { value: f.id, textContent: f.label })));
const sampleSel = h('select', { title: 'Load a sample', 'aria-label': 'Samples', onchange: () => {
  const file = sampleSel.value;
  sampleSel.value = '';
  if (file) void loadSample(file);
} }, h('option', { value: '', textContent: 'Samples\u2026' }), ...SAMPLES.map(([l, f]) => h('option', { value: f, textContent: l })));

$('top').append(
  h('span', { class: 'ed-brand', textContent: 'Graphscape' }),
  h('div', { class: 'ed-group' },
    h('button', { textContent: 'New', title: 'New empty graph', onclick: () => void newGraph() }),
    h('button', { textContent: 'Open\u2026', title: 'Open a graph file (Ctrl+O)', onclick: () => void openFile() }),
    sampleSel,
    h('button', { textContent: 'Generate\u2026', title: 'Random clustered graph', onclick: () => void generate() }),
  ),
  h('div', { class: 'ed-group' },
    h('button', { textContent: 'Save', title: 'Save to the open file (Ctrl+S)', onclick: () => void saveFile() }),
    h('button', { textContent: 'Save as\u2026', title: 'Save under a new name (Ctrl+Shift+S)', onclick: () => void saveFileAs() }),
    formatSel,
    h('button', { textContent: 'PNG', title: 'Export the current view as image', onclick: () => {
      const a = h('a', { href: view.exportImage(), download: `${graph.meta.title || 'graph'}.png` });
      a.click();
    } }),
    fileLabel,
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
  const dirty = isDirty();
  fileLabel.textContent = `${fileName()}${dirty ? ' \u2022' : ''}`;
  fileLabel.title = dirty ? 'Unsaved changes' : currentFile?.handle ? 'Saved; Save overwrites this file' : 'No unsaved changes';
  document.title = `${dirty ? '\u2022 ' : ''}${fileName()} \u2013 Graphscape`;
  const sel = view.getSelection();
  $('status').replaceChildren(
    h('span', { textContent: `${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.directed ? 'directed' : 'undirected'}, ${view.getDimension().toUpperCase()}` }),
    h('span', { textContent: sel.nodes.length + sel.edges.length ? `${sel.nodes.length} nodes and ${sel.edges.length} edges selected` : '' }),
    h('span', { textContent: message || TOOL_HINT[tool] }),
    h('span', { class: 'warn', textContent: warning }),
  );
}

// ------------------------------------------------------------------ files

const LOSSY: Record<GraphFormat, string> = {
  json: '',
  graphml: 'Graphscape writes its own GraphML. Positions, colors, shapes, labels, URLs and weights are kept, but anything it does not model is lost, for example yEd bend points, ports, nested group containers, table nodes and custom node graphics.',
  gml: 'Graphscape writes its own GML. Attributes it does not model are lost.',
  dot: 'Graphscape writes its own DOT. Graphviz attributes it does not model (ranks, ports, most styles) are lost.',
  csv: 'A CSV edge list only stores edges: node colors, shapes, groups, positions and other node details are not saved.',
};

/** Small modal question with custom buttons; Esc and the backdrop answer "cancel". */
function ask(title: string, body: string, buttons: { label: string; value: string; primary?: boolean }[]): Promise<string> {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'ed-dialog ed-small', 'aria-label': title });
    const row = h('div', { class: 'ed-actions' }, ...buttons.map((b) => h('button', { class: b.primary ? 'primary' : '', textContent: b.label, onclick: () => dlg.close(b.value) })));
    dlg.append(h('div', { class: 'ed-dialog-body' }, h('h2', { class: 'ed-title', textContent: title }), h('p', { class: 'ed-pre', textContent: body }), row));
    dlg.addEventListener('close', () => {
      const v = dlg.returnValue || 'cancel';
      dlg.remove();
      resolve(v);
    });
    document.body.append(dlg);
    dlg.showModal();
    row.querySelector<HTMLElement>('button.primary')?.focus();
  });
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';
const formatOf = (name: string): GraphFormat | undefined => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FORMATS.find((f) => f.extensions.includes(ext))?.id;
};
const pickerTypes = (first?: GraphFormat): { description: string; accept: Record<string, string[]> }[] =>
  [...FORMATS].sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0)).map((f) => ({ description: f.label, accept: { [f.mime]: f.extensions.map((e) => `.${e}`) } }));

function serializeCurrent(format: GraphFormat): string {
  const data = graph.toData();
  data.meta = { ...data.meta, dimension: view.getDimension() };
  return serializeGraph(data, format);
}

/** True when it is fine to replace the current graph: nothing unsaved, or the user saved or discarded it. */
async function guardDirty(): Promise<boolean> {
  if (!isDirty()) return true;
  const answer = await ask('Unsaved changes', `Do you want to save the changes to "${fileName()}" first?`, [
    { label: 'Save', value: 'save', primary: true },
    { label: "Don't save", value: 'discard' },
    { label: 'Cancel', value: 'cancel' },
  ]);
  if (answer === 'save') return saveFile();
  return answer === 'discard';
}

async function writeTo(file: OpenFile): Promise<boolean> {
  if (!file.handle) return false;
  try {
    const writable = await file.handle.createWritable();
    await writable.write(serializeCurrent(file.format));
    await writable.close();
    savedSnapshot = history.current;
    warning = '';
    message = `Saved ${file.name}`;
    refreshChrome();
    return true;
  } catch (err) {
    warning = `Could not save ${file.name}: ${(err as Error).message}`;
    refreshChrome();
    return false;
  }
}

/** Save: writes to the file that was opened or saved before, otherwise behaves like Save as. */
async function saveFile(): Promise<boolean> {
  const f = currentFile;
  if (!f?.handle) return saveFileAs();
  if (!isDirty()) {
    message = 'No changes to save.';
    refreshChrome();
    return true;
  }
  if (f.fromDisk && !f.confirmed) {
    const answer = await ask(`Overwrite ${f.name}?`, `${f.format === 'json' ? '' : LOSSY[f.format] + '\n\n'}This replaces the file on disk with the current graph. You will not be asked again for this file during this session.`, [
      { label: 'Overwrite', value: 'ok', primary: true },
      { label: 'Save as\u2026', value: 'as' },
      { label: 'Cancel', value: 'cancel' },
    ]);
    if (answer === 'as') return saveFileAs();
    if (answer !== 'ok') return false;
    f.confirmed = true;
  }
  return writeTo(f);
}

/** Save as: the system dialog chooses folder, name and format and asks before replacing an existing file. */
async function saveFileAs(): Promise<boolean> {
  const preferred = currentFile?.format ?? (formatSel.value as GraphFormat);
  if (canOverwrite && fsApi.showSaveFilePicker) {
    try {
      const ext = FORMATS.find((f) => f.id === preferred)!.extensions[0];
      const handle = await fsApi.showSaveFilePicker({ suggestedName: currentFile?.name ?? `${graph.meta.title || 'graph'}.${ext}`, types: pickerTypes(preferred) });
      const file: OpenFile = { name: handle.name, format: formatOf(handle.name) ?? preferred, handle, fromDisk: false, confirmed: true };
      currentFile = file;
      return writeTo(file);
    } catch (err) {
      if (!isAbort(err)) {
        warning = `Could not save: ${(err as Error).message}`;
        refreshChrome();
      }
      return false;
    }
  }
  // no file access in this browser: hand out a copy
  const info = FORMATS.find((f) => f.id === preferred)!;
  const name = currentFile?.name ?? `${graph.meta.title || 'graph'}.${info.extensions[0]}`;
  download(name, serializeCurrent(preferred), info.mime);
  currentFile = { name, format: preferred, fromDisk: false, confirmed: true };
  savedSnapshot = history.current;
  message = `Downloaded ${name}. This browser cannot overwrite files; Chrome and Edge can.`;
  refreshChrome();
  return true;
}

async function newGraph(): Promise<void> {
  if (!(await guardDirty())) return;
  loadGraphData({ directed: false, nodes: [], edges: [] });
}

async function openFile(): Promise<void> {
  if (canOverwrite && fsApi.showOpenFilePicker) {
    try {
      const [handle] = await fsApi.showOpenFilePicker({ multiple: false, mode: 'readwrite', types: pickerTypes() });
      await importFile(await handle.getFile(), handle);
    } catch (err) {
      if (!isAbort(err)) {
        warning = `Could not open: ${(err as Error).message}`;
        refreshChrome();
      }
    }
  } else $<HTMLInputElement>('file').click();
}

async function loadSample(file: string): Promise<void> {
  if (!(await guardDirty())) return;
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

async function importFile(file: File, handle?: FsFileHandle): Promise<void> {
  if (!(await guardDirty())) return;
  try {
    const text = await file.text();
    const format = detectFormat(text, file.name);
    const directed = format === 'csv' ? confirm('This is an edge list. Treat edges as directed?') : false;
    const result = parseGraph(text, { filename: file.name, directed });
    loadGraphData(result.graph, `Opened ${file.name} (${result.format})`, {
      name: file.name,
      format: result.format as GraphFormat,
      handle,
      fromDisk: true,
      confirmed: false,
    });
    if (result.warnings.length) warning = `${result.warnings.length} import warning(s): ${result.warnings[0]}`;
    refreshChrome();
  } catch (err) {
    warning = `Import failed: ${(err as Error).message}`;
    refreshChrome();
  }
}

async function generate(): Promise<void> {
  if (!(await guardDirty())) return;
  const n = Number(prompt('Number of nodes (1 to 10000)', '200'));
  if (!Number.isFinite(n) || n < 1) return;
  const nodes = Math.min(10000, Math.floor(n));
  loadGraphData(generateClustered({ nodes, clusters: Math.max(2, Math.round(Math.sqrt(nodes) / 3)), avgDegree: 4, seed: Date.now() % 1e6 }), `Generated ${nodes} nodes`);
}

window.addEventListener('beforeunload', (e) => {
  if (isDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

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
  if (!f) return;
  // Chrome and Edge hand out a file handle on drop; it must be requested during the event
  const item = e.dataTransfer?.items?.[0] as unknown as { getAsFileSystemHandle?: () => Promise<FsFileHandle | null> } | undefined;
  const pending = item?.getAsFileSystemHandle?.();
  void (async () => {
    let handle: FsFileHandle | undefined;
    try {
      const h2 = await pending;
      if (h2 && typeof h2.createWritable === 'function') handle = h2;
    } catch { /* no handle: opened read-only */ }
    await importFile(f, handle);
  })();
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
  el.replaceChildren(
    h('h2', { class: 'ed-title', textContent: 'Graph' }),
    text('Title', graph.meta.title, (v) => { graph.meta.title = v; commit(); }, 'untitled'),
    check('Directed', graph.directed, (v) => { graph.setDirected(v); commit(); }),
    h('p', { class: 'ed-hint', textContent: 'Directed is the default for all edges; individual edges can override it.' }),
    select('3D rotation', view.getConfig().camera.rotation, [['orbit', 'Orbit (horizon stays level)'], ['free', 'Free (trackball)']], (v) => view.setConfig({ camera: { rotation: v as 'orbit' | 'free' } })),
    select('Force weights', view.getConfig().layout.weightMode, [['ignore', 'Ignore weights'], ['closer', 'Heavier = shorter'], ['longer', 'Heavier = longer']], (v) => view.setConfig({ layout: { weightMode: v as 'ignore' | 'closer' | 'longer' } })),
    h('p', { class: 'ed-hint', textContent: 'Edge weights as lengths in the force layout: similarity (heavier = shorter) or distance (heavier = longer). Applies the next time the force layout runs.' }),
    check('Weights', view.getConfig().weight.show !== 'never', (v) => { view.setConfig({ weight: { show: v ? 'auto' : 'never' } }); }),
    check('Width by weight', view.getConfig().edge.widthByWeight.enabled, (v) => { view.setConfig({ edge: { widthByWeight: { enabled: v } } }); }),
    h('h3', { class: 'ed-section', textContent: 'Skin and configuration' }),
    h('p', { class: 'ed-hint', textContent: 'Every option with an explanation, as JSON with comments. Edit and apply it, or save it as the skin file of your website.' }),
    h('div', { class: 'ed-actions' },
      h('button', { textContent: 'Edit configuration\u2026', onclick: openConfigDialog }),
      h('button', { textContent: 'Load file\u2026', onclick: () => $<HTMLInputElement>('cfgfile').click() }),
    ),
    h('p', { class: 'ed-hint', textContent: 'Select a node or edge to edit it. The README lists every option as well.' }),
  );
}

// ------------------------------------------------------------------ configuration dialog (JSON with comments)

const cfgText = h('textarea', { class: 'ed-code ed-code-big', spellcheck: false, wrap: 'off', 'aria-label': 'Configuration' });
const cfgMsg = h('p', { class: 'ed-hint' });
const cfgAll = h('input', { type: 'checkbox', checked: true, onchange: () => { applyConfigText(cfgText.value, true); fillConfig(); } });
const cfgDialog = h('dialog', { class: 'ed-dialog', 'aria-label': 'Configuration' },
  h('div', { class: 'ed-dialog-body' },
    h('h2', { class: 'ed-title', textContent: 'Configuration' }),
    h('p', { class: 'ed-muted', textContent: 'JSON with comments: // and /* */ are allowed, so is a trailing comma. Only values that differ from the defaults and the theme are kept when you apply or save.' }),
    h('label', { class: 'ed-row' }, cfgAll, 'Show all options with explanations (otherwise only what you changed)'),
    cfgText,
    cfgMsg,
    h('div', { class: 'ed-actions' },
      h('button', { textContent: 'Apply', onclick: () => { cfgMsg.textContent = applyConfigText(cfgText.value); } }),
      h('button', { textContent: 'Reset to theme', title: 'Remove all your changes except the theme', onclick: () => { view.setUserConfig({ theme: view.getConfig().theme }); fillConfig(); cfgMsg.textContent = 'Reset.'; refreshChrome(); } }),
      h('button', { textContent: 'Download .json', onclick: () => download('graphscape.config.json', JSON.stringify(view.getUserConfig(), null, 2) + '\n', 'application/json') }),
      h('button', { textContent: 'Download .jsonc', title: 'With comments; data-config of the script-tag bundle reads it', onclick: () => download('graphscape.config.jsonc', configToJsonc(view.getUserConfig()), 'application/json') }),
      h('button', { textContent: 'Load file\u2026', onclick: () => $<HTMLInputElement>('cfgfile').click() }),
      h('button', { textContent: 'Close', onclick: () => cfgDialog.close() }),
    ),
  ),
);
document.body.append(cfgDialog);

function fillConfig(): void {
  cfgText.value = configToJsonc(cfgAll.checked ? view.getConfig() : view.getUserConfig());
}

/** Parses JSON with comments and applies it as the complete user configuration. Returns a message for the user. */
function applyConfigText(source: string, quiet = false): string {
  try {
    const parsed = parseJsonc(source) as DeepPartial<GraphscapeConfig>;
    const unknown = findUnknownKeys(parsed);
    const base = createConfig({ theme: parsed.theme });
    view.setUserConfig(diffConfig(base, parsed) as DeepPartial<GraphscapeConfig>);
    themeSel.value = view.getConfig().theme;
    refreshChrome();
    return unknown.length ? `Applied. Not an option, ignored: ${unknown.join(', ')}` : quiet ? '' : 'Applied.';
  } catch (err) {
    return `Not applied: ${(err as Error).message}`;
  }
}

function openConfigDialog(): void {
  fillConfig();
  cfgMsg.textContent = '';
  if (!cfgDialog.open) cfgDialog.showModal();
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
  const msg = applyConfigText(await f.text());
  if (cfgDialog.open) {
    fillConfig();
    cfgMsg.textContent = msg;
  } else {
    warning = msg.startsWith('Not applied') ? msg : '';
    renderInspector();
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
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && !e.altKey && key === 's') { e.preventDefault(); void (e.shiftKey ? saveFileAs() : saveFile()); return; }
  if (mod && !e.altKey && key === 'o') { e.preventDefault(); void openFile(); return; }
  if (mod && !e.altKey && key === 'f') { e.preventDefault(); view.focusSearch(); return; }
  if (t.matches('input, textarea, select')) return;
  if (mod && key === 'z') { e.preventDefault(); restore(e.shiftKey ? history.redo() : history.undo()); }
  else if (mod && key === 'y') { e.preventDefault(); restore(history.redo()); }
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
