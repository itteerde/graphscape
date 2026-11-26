import type { EdgeData, NodeData, NodeShape, PropValue } from './types';
import type { Dimension } from './types';

export type LayoutName = 'force' | 'tree' | 'layered' | 'circle' | 'grid' | 'sphere' | 'random';

/** Visual properties of a node after all rules were applied. */
export interface NodeStyle {
  color: string;
  shape: NodeShape;
  /** Diameter in world units. */
  size: number;
  borderColor: string;
  borderWidth: number;
  labelColor: string;
}

export interface EdgeStyle {
  color: string;
  /** Line width in CSS pixels. */
  width: number;
  dashed: boolean;
}

export type StyleRuleMatch =
  | { id?: string; group?: string; tag?: string; prop?: [string, PropValue] }
  | ((item: NodeData | EdgeData) => boolean);

/** Applies `style` to all nodes or edges that match. Later rules win over earlier ones. */
export interface StyleRule {
  target: 'node' | 'edge';
  match: StyleRuleMatch;
  style: Partial<NodeStyle> | Partial<EdgeStyle>;
}

export interface GraphscapeConfig {
  /** Name of a built-in or registered theme applied below all other settings. */
  theme: string;
  dimension: Dimension;
  background: { color: string; gradientTo: string | null; transparent: boolean };
  node: NodeStyle & { /** width/height ratio of the `rectangle` shape */ aspect: number; opacity: number };
  edge: EdgeStyle & {
    opacity: number;
    arrows: boolean;
    arrowSize: number;
    /** Distance between parallel edges of the same node pair. */
    curveSpacing: number;
    loopSize: number;
    dashSize: number;
    gapSize: number;
    widthByWeight: { enabled: boolean; min: number; max: number };
  };
  label: {
    show: boolean;
    font: string;
    size: number;
    color: string;
    background: string | null;
    padding: number;
    /** Size and color of `sublabel` (second line). */
    subSize: number;
    subColor: string;
    /** Labels are hidden above this node count (the tooltip still works). */
    maxCount: number;
    maxChars: number;
    /** `world`: label scales with zoom; `screen`: constant pixel size. */
    mode: 'world' | 'screen';
    /** Texture pixels per label unit; raise for crisper text. */
    resolution: number;
    gap: number;
  };
  weight: {
    show: 'auto' | 'always' | 'never';
    font: string;
    size: number;
    color: string;
    background: string | null;
    padding: number;
    maxCount: number;
    decimals: number;
  };
  card: {
    background: string;
    border: string;
    /** `null` uses the node color. */
    headerBackground: string | null;
    headerColor: string;
    textColor: string;
    font: string;
    size: number;
    padding: number;
  };
  selection: { color: string; hoverColor: string; width: number };
  /** Look and snapping of the transform gizmo. Snapping is active while Ctrl (or Cmd) is held. */
  gizmo: { size: number; space: 'world' | 'local'; snapTranslate: number; snapRotate: number; snapScale: number };
  groups: { palette: string[]; colors: Record<string, string> };
  rules: StyleRule[];
  camera: {
    fov: number;
    zoomMin: number;
    zoomMax: number;
    fitPadding: number;
    autoFit: boolean;
    damping: boolean;
    /** 3D only. `orbit`: keeps the horizon level, tilt stops at the poles. `free`: trackball, unlimited rotation around every axis. */
    rotation: 'orbit' | 'free';
  };
  layout: {
    name: LayoutName;
    idealLength: number;
    spacing: number;
    /** Free space kept between node boxes (node plus label) by tree, layered, circle, grid and sphere layouts. */
    gap: number;
    weightMode: 'ignore' | 'strength';
    gravity: number;
    direction: 'TB' | 'LR';
    seed: number;
    /** Run the layout automatically when a loaded graph has nodes without positions. */
    autoRun: boolean;
  };
  interaction: {
    dragNodes: boolean;
    select: boolean;
    multiSelect: boolean;
    hover: boolean;
    tooltip: boolean;
    /** Click a node to show a transform gizmo (arrows, plane handles, rotation rings, scale handles) at the center of the selection. */
    gizmo: boolean;
    /** Hold X, Y or Z while dragging nodes to restrict the movement to that axis (Z only in 3D). */
    axisLock: boolean;
    openLinks: 'click' | 'dblclick' | 'ctrl-click' | 'never';
    /** Edge hit testing is skipped above this many edges. */
    pickLimit: number;
  };
  links: {
    baseUrl: string;
    target: 'self' | 'blank' | 'panel' | 'event';
    allowAbsolute: boolean;
    panelSandbox: string;
  };
  ui: {
    controls: boolean;
    /** Adds a full screen button to the controls. */
    fullscreen: boolean;
    injectStyles: boolean;
    /** CSS custom properties set on the view root, without the `--gs-` prefix. */
    cssVars: Record<string, string>;
  };
  render: { antialias: boolean; pixelRatio: number | null };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const DEFAULT_CONFIG: GraphscapeConfig = {
  theme: 'light',
  dimension: '2d',
  background: { color: '#f7f8fa', gradientTo: null, transparent: false },
  node: { color: '#4e79a7', shape: 'circle', size: 14, aspect: 1.6, opacity: 1, borderColor: '#2b3a4a', borderWidth: 1, labelColor: '#1f2933' },
  edge: {
    color: '#8b95a1',
    width: 1.5,
    dashed: false,
    opacity: 0.9,
    arrows: true,
    arrowSize: 7,
    curveSpacing: 16,
    loopSize: 0.9,
    dashSize: 5,
    gapSize: 3,
    widthByWeight: { enabled: false, min: 1, max: 6 },
  },
  label: { show: true, font, size: 6, color: '#1f2933', subSize: 4.6, subColor: '#5f6b76', background: null, padding: 1, maxCount: 1500, maxChars: 40, mode: 'world', resolution: 4, gap: 1.5 },
  weight: { show: 'auto', font, size: 5, color: '#3b4652', background: 'rgba(255,255,255,0.85)', padding: 1, maxCount: 3000, decimals: 2 },
  card: { background: '#ffffff', border: '#2b3a4a', headerBackground: null, headerColor: '#ffffff', textColor: '#1f2933', font, size: 4.5, padding: 2 },
  selection: { color: '#e8590c', hoverColor: '#f59f00', width: 2.5 },
  gizmo: { size: 0.9, space: 'world', snapTranslate: 10, snapRotate: 15, snapScale: 0.1 },
  groups: { palette: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'], colors: {} },
  rules: [],
  camera: { fov: 50, zoomMin: 0.02, zoomMax: 60, fitPadding: 1.25, autoFit: true, damping: false, rotation: 'orbit' },
  layout: { name: 'force', idealLength: 60, spacing: 40, gap: 14, weightMode: 'ignore', gravity: 0.05, direction: 'TB', seed: 1, autoRun: true },
  interaction: { dragNodes: true, select: true, multiSelect: true, hover: true, tooltip: true, gizmo: false, axisLock: true, openLinks: 'dblclick', pickLimit: 20000 },
  links: { baseUrl: '', target: 'self', allowAbsolute: false, panelSandbox: 'allow-same-origin allow-scripts allow-popups allow-forms' },
  ui: {
    controls: true,
    fullscreen: false,
    injectStyles: true,
    cssVars: {
      font,
      'panel-bg': 'rgba(255,255,255,0.96)',
      'panel-fg': '#1f2933',
      'panel-border': '#cfd6de',
      accent: '#e8590c',
      radius: '4px',
    },
  },
  render: { antialias: true, pixelRatio: null },
};

/** Built-in themes. Register your own with `registerTheme`. */
export const themes: Record<string, DeepPartial<GraphscapeConfig>> = {
  light: {},
  dark: {
    background: { color: '#14181d', gradientTo: null },
    node: { color: '#6aa6d9', borderColor: '#0b0e11', labelColor: '#e6ebf0' },
    edge: { color: '#7d8996' },
    label: { color: '#e6ebf0', subColor: '#a9b4bf' },
    weight: { color: '#d3dae1', background: 'rgba(20,24,29,0.85)' },
    card: { background: '#1d242c', border: '#6b7886', textColor: '#e6ebf0' },
    selection: { color: '#ffa94d', hoverColor: '#ffd43b' },
    groups: { palette: ['#6aa6d9', '#ffa94d', '#ff7b7b', '#63d2c6', '#8fd36b', '#f2d45c', '#c9a0dc', '#ffb3c1', '#c4a07a', '#aab4bd'] },
    ui: { cssVars: { 'panel-bg': 'rgba(29,36,44,0.96)', 'panel-fg': '#e6ebf0', 'panel-border': '#3a4652', accent: '#ffa94d' } },
  },
  blueprint: {
    background: { color: '#0d3b66', gradientTo: '#0a2c4d' },
    node: { color: '#faf0ca', borderColor: '#f4d35e', labelColor: '#faf0ca' },
    edge: { color: '#a9c7e8' },
    label: { color: '#faf0ca', subColor: '#a9c7e8' },
    weight: { color: '#0d3b66', background: 'rgba(250,240,202,0.92)' },
    card: { background: '#0a2c4d', border: '#f4d35e', headerBackground: '#f4d35e', headerColor: '#0d3b66', textColor: '#faf0ca' },
    selection: { color: '#ee964b', hoverColor: '#f95738' },
    groups: { palette: ['#faf0ca', '#f4d35e', '#ee964b', '#f95738', '#a9c7e8', '#7fb7be', '#d3f3ee', '#e3b5a4'] },
    ui: { cssVars: { 'panel-bg': 'rgba(10,44,77,0.96)', 'panel-fg': '#faf0ca', 'panel-border': '#2f5d8a', accent: '#f4d35e' } },
  },
};

export function registerTheme(name: string, theme: DeepPartial<GraphscapeConfig>): void {
  themes[name] = theme;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

/** Deep merge: plain objects are merged, arrays and everything else are replaced. `undefined` is ignored. */
export function mergeConfig<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : (patch as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeConfig(out[k], v) : Array.isArray(v) ? [...v] : v;
  }
  return out as T;
}

/** defaults < theme < user patch */
export function createConfig(patch: DeepPartial<GraphscapeConfig> = {}): GraphscapeConfig {
  const themeName = patch.theme ?? DEFAULT_CONFIG.theme;
  const theme = themes[themeName] ?? {};
  return mergeConfig(mergeConfig(DEFAULT_CONFIG, theme), patch);
}

/** Typed helper for config files: `export default defineConfig({...})`. */
export function defineConfig(config: DeepPartial<GraphscapeConfig>): DeepPartial<GraphscapeConfig> {
  return config;
}
