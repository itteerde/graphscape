import { DEFAULT_CONFIG } from './config';

/**
 * One line of documentation per configuration key (dotted path). Used to write the commented configuration
 * the editor shows, so every option is explained where it is edited. A test makes sure no key is missing.
 */
export const CONFIG_DOCS: Record<string, string> = {
  theme: 'Base look. Built in: "light", "dark", "blueprint"; more can be added with registerTheme(). Everything below overrides the theme.',
  dimension: '"2d" (flat, orthographic) or "3d" (perspective). A graph file can store its own dimension in meta.dimension.',

  background: 'Canvas background.',
  'background.color': 'CSS color of the background (top color when gradientTo is set).',
  'background.gradientTo': 'CSS color for a vertical gradient from color to this one, or null for a solid background.',
  'background.transparent': 'true: no background at all, the page behind the view shows through.',

  node: 'Default look of nodes. A node can override color, shape and size itself; group colors and rules sit in between.',
  'node.color': 'Fill color when the node has neither its own color nor a group color.',
  'node.shape': 'circle, square, rectangle, diamond, hexagon, triangle or card (title plus lines, e.g. UML classes). 2D: flat polygons, 3D: solids.',
  'node.size': 'Diameter in world units.',
  'node.aspect': 'Width / height of the "rectangle" shape.',
  'node.opacity': 'Opacity of all nodes, 0 to 1.',
  'node.borderColor': 'Outline color.',
  'node.borderWidth': 'Outline width in world units.',
  'node.labelColor': 'Text color of the node label.',

  edge: 'Default look of edges. An edge can override color, width and dashed itself; rules sit in between.',
  'edge.color': 'Line color.',
  'edge.width': 'Line width in CSS pixels.',
  'edge.dashed': 'true: dashed lines.',
  'edge.opacity': 'Opacity of all edges, 0 to 1.',
  'edge.arrows': 'Draw arrow heads on directed edges.',
  'edge.arrowSize': 'Arrow head length in world units.',
  'edge.curveSpacing': 'Distance between parallel edges of the same node pair, in world units.',
  'edge.loopSize': 'Radius of self loops relative to the node size.',
  'edge.dashSize': 'Length of a dash in world units (dashed edges).',
  'edge.gapSize': 'Length of a gap in world units (dashed edges).',
  'edge.widthByWeight': 'Map the weights of the graph to line widths.',
  'edge.widthByWeight.enabled': 'true: width depends on the weight (lowest weight = min, highest = max).',
  'edge.widthByWeight.min': 'Line width in pixels for the lowest weight.',
  'edge.widthByWeight.max': 'Line width in pixels for the highest weight.',

  label: 'Node labels. A label may contain line breaks, and a node can have a smaller sublabel below it.',
  'label.show': 'Show labels at all.',
  'label.font': 'CSS font family of labels and sublabels.',
  'label.size': 'Font size: world units in "world" mode, CSS pixels in "screen" mode.',
  'label.color': 'Default label color (a node style can override it with labelColor).',
  'label.subSize': 'Font size of the sublabel.',
  'label.subColor': 'Color of the sublabel.',
  'label.background': 'CSS color of a box behind the label, or null for none.',
  'label.padding': 'Space between text and label box edge.',
  'label.maxCount': 'Labels are skipped above this node count (tooltips still work).',
  'label.maxChars': 'Longer lines are cut off with an ellipsis.',
  'label.mode': '"world": labels scale with the zoom. "screen": constant pixel size.',
  'label.resolution': 'Texture pixels per label unit. Higher is sharper and needs more memory.',
  'label.gap': 'Distance between node and label, in world units.',

  weight: 'Text on edges: label and weight.',
  'weight.show': '"auto": show weights other than 1. "always" or "never".',
  'weight.font': 'CSS font family of edge texts.',
  'weight.size': 'Font size of edge texts.',
  'weight.color': 'Text color of edge texts.',
  'weight.background': 'CSS color of the box behind edge texts, or null.',
  'weight.padding': 'Space between text and box edge.',
  'weight.maxCount': 'Edge texts are skipped above this edge count.',
  'weight.decimals': 'Maximum number of decimals shown for weights.',

  card: 'Look of nodes with the "card" shape (title in a header band, lines below; "---" is a separator).',
  'card.background': 'Card body color.',
  'card.border': 'Border and separator color.',
  'card.headerBackground': 'Header band color, or null to use the node color.',
  'card.headerColor': 'Title text color.',
  'card.textColor': 'Body text color.',
  'card.font': 'CSS font family.',
  'card.size': 'Font size in world units.',
  'card.padding': 'Inner padding in world units.',

  selection: 'Highlighting of selected and hovered items.',
  'selection.color': 'Outline color of selected nodes and color of selected edges.',
  'selection.hoverColor': 'Outline color of the hovered node and color of the hovered edge.',
  'selection.width': 'Outline width of selected nodes, in world units.',

  gizmo: 'Transform gizmo of the selection (needs interaction.gizmo). Snapping is active while Ctrl or Cmd is held.',
  'gizmo.size': 'Size of the gizmo.',
  'gizmo.space': '"world" or "local" axes.',
  'gizmo.snapTranslate': 'Snap distance for moving, in world units.',
  'gizmo.snapRotate': 'Snap angle for rotating, in degrees.',
  'gizmo.snapScale': 'Snap step for scaling.',

  groups: 'Colors by node group.',
  'groups.palette': 'Colors handed out to groups in order of first appearance, then repeated.',
  'groups.colors': 'Fixed colors per group name, for example { "Sales": "#e0b872" }.',

  rules: 'Style rules, applied in order after the group color and before the values stored on the node or edge.\nExample: { "target": "node", "match": { "group": "Design" }, "style": { "shape": "diamond" } }\nmatch keys: id, group, tag, prop [key, value]. Node style keys: color, shape, size, borderColor, borderWidth, labelColor. Edge: color, width, dashed.',

  camera: 'Camera and view fitting.',
  'camera.fov': '3D field of view in degrees.',
  'camera.zoomMin': 'Smallest 2D zoom.',
  'camera.zoomMax': 'Largest 2D zoom.',
  'camera.fitPadding': 'Margin factor when the graph is fitted into the view (1 = tight).',
  'camera.autoFit': 'Fit the graph into the view after loading and after a layout.',
  'camera.damping': 'Smooth camera motion (orbit mode).',
  'camera.rotation': '3D only. "orbit": horizon stays level, tilt stops at the poles. "free": trackball, unlimited rotation around every axis.',

  layout: 'Automatic placement of nodes.',
  'layout.name': 'force (general networks), tree (clean hierarchy), layered (DAG with cross links), circle, grid, sphere or random.',
  'layout.idealLength': 'Spring length of the force layout, in world units.',
  'layout.spacing': 'Minimum node distance when node sizes are unknown.',
  'layout.gap': 'Free space kept between node boxes (node plus label) by tree, layered, circle, grid and sphere.',
  'layout.weightMode': 'Edge weights in the force layout. "ignore": no effect. "closer": heavier edge = shorter (similarity, strength of a tie). "longer": heavier edge = longer (distance, cost, duration). Lengths are relative to the median weight and limited to 0.25x to 4x of layout.idealLength.',
  'layout.gravity': 'Pull towards the center in the force layout, keeps separate parts together.',
  'layout.direction': '"TB" (top to bottom) or "LR" (left to right) for tree and layered.',
  'layout.seed': 'Seed of the random start positions, so layouts are reproducible.',
  'layout.autoRun': 'Run the layout when a loaded graph has nodes without coordinates.',

  search: 'Search box (ui.search): finds nodes while typing and selects them. Terms are case-insensitive substrings, several terms must all match. field:term searches one field: group:Sales, tag:team, id:n12, label:"New York", url:pages/, prop:2019.',
  'search.minChars': 'Terms shorter than this are ignored, so typing the first letter does not select half the graph.',
  'search.fields': 'Fields searched by plain terms: label, sublabel, id, group, tags, url, props.',
  'search.fitOnEnter': 'Enter in the search box zooms to the matches.',

  interaction: 'What visitors can do.',
  'interaction.dragNodes': 'Nodes can be dragged.',
  'interaction.select': 'Nodes and edges can be selected.',
  'interaction.multiSelect': 'Shift-click and Shift-drag select several.',
  'interaction.hover': 'Highlight the item under the pointer.',
  'interaction.tooltip': 'Show a tooltip with details for the hovered item.',
  'interaction.gizmo': 'Show the transform gizmo (move, rotate, scale) for the selected nodes.',
  'interaction.axisLock': 'Holding X, Y or Z while dragging a node locks the movement to that axis.',
  'interaction.openLinks': 'Gesture that opens the url of a node or edge: "ctrl-click" (default, keeps plain clicks for selecting), "click", "dblclick" or "never" (no links at all).',
  'interaction.pickLimit': 'Edges are not hit-tested above this edge count (speed).',

  links: 'Website content behind node and edge urls.',
  'links.baseUrl': 'Prefix for relative urls, for example "content/".',
  'links.target': '"self" (navigate), "blank" (new tab), "panel" (sandboxed iframe inside the view) or "event" (your code decides, listen to the link event).',
  'links.allowAbsolute': 'Allow absolute http(s) and mailto links. Relative paths are always allowed; javascript: and data: never.',
  'links.panelSandbox': 'sandbox attribute of the iframe used by target "panel".',
  'links.badge': 'Draw a small link badge on every node and edge that has a url, so visitors see what is clickable.',
  'links.badgeColor': 'Color of the link badge.',
  'links.badgeSize': 'Size of the link badge in world units.',
  'links.hint': 'Tooltips of linked items say how to open the page (for example "Ctrl+click to open the page").',
  'links.chip': 'Show an "Open page" chip next to a single selected node or edge that has a url. Works with touch and needs no modifier key.',
  'links.chipLabel': 'Text of that chip (translate it here).',

  ui: 'Buttons, tooltip and panel around the canvas.',
  'ui.controls': 'Zoom, fit and 2D/3D buttons.',
  'ui.search': 'Search box in the corner: finds and selects nodes and whole groups while you type (see search).',
  'ui.help': 'Help button (question mark) that lists the controls of this view, including the link gesture and full screen.',
  'ui.fullscreen': 'Full screen / back button (the usual corner icon). Set false to remove it.',
  'ui.injectStyles': 'Inject the default CSS once. Set false to ship your own (the class names start with "gs-").',
  'ui.cssVars': 'CSS custom properties set on the view as --gs-<name>; they style tooltip, buttons and panel.',
  'ui.cssVars.font': 'Font family of the DOM parts.',
  'ui.cssVars.panel-bg': 'Background of tooltip, buttons and panel.',
  'ui.cssVars.panel-fg': 'Text color of tooltip, buttons and panel.',
  'ui.cssVars.panel-border': 'Border color of tooltip, buttons and panel.',
  'ui.cssVars.accent': 'Highlight color (button hover, selection box).',
  'ui.cssVars.radius': 'Corner radius of buttons and tooltip.',

  render: 'Renderer settings.',
  'render.antialias': 'Smooth edges (needs a reload of the view to change).',
  'render.pixelRatio': 'Device pixel ratio to render at, or null for the screen default (maximum 2).',
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Maps whose keys are chosen by the user, so they are not checked against the defaults. */
const DYNAMIC = new Set(['groups.colors', 'ui.cssVars']);

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}

const HEADER = `// Graphscape configuration: JSON with comments.
// Comments (// and /* */) and trailing commas are allowed here and are ignored when applying.
// Values that equal the default are fine to keep, they are dropped when the configuration is saved.
`;

/** Pretty prints a configuration as JSON with a comment above every documented key. */
export function configToJsonc(config: object, header = true): string {
  const comment = (path: string, indent: string): string => {
    const doc = CONFIG_DOCS[path];
    return doc ? wrap(doc, Math.max(40, 100 - indent.length)).map((l) => `${indent}// ${l}`.trimEnd()).join('\n') + '\n' : '';
  };
  const render = (value: unknown, path: string, indent: string): string => {
    if (isObj(value)) {
      const keys = Object.keys(value);
      if (keys.length === 0) return '{}';
      const inner = indent + '  ';
      const parts = keys.map((k) => {
        const p = path ? `${path}.${k}` : k;
        return `${comment(p, inner)}${inner}${JSON.stringify(k)}: ${render(value[k], p, inner)}`;
      });
      return `{\n${parts.join(',\n')}\n${indent}}`;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      if (value.every((v) => typeof v !== 'object' || v === null)) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      const inner = indent + '  ';
      return `[\n${value.map((v) => inner + JSON.stringify(v)).join(',\n')}\n${indent}]`;
    }
    return JSON.stringify(value) ?? 'null';
  };
  return (header ? HEADER : '') + render(config, '', '') + '\n';
}

/** Removes // and block comments and trailing commas (string aware). */
export function stripJsonComments(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  let inStr = false;
  while (i < n) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
      i++;
    } else if (c === '"') {
      inStr = true;
      out += c;
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
    } else {
      if (c === '}' || c === ']') out = out.replace(/,\s*$/, '');
      out += c;
      i++;
    }
  }
  return out;
}

export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonComments(text.replace(/^\uFEFF/, '')));
}

/** The parts of `value` that differ from `base` (objects are compared key by key, everything else by value). */
export function diffConfig(base: unknown, value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isObj(value)) return out;
  for (const [k, v] of Object.entries(value)) {
    const b = isObj(base) ? base[k] : undefined;
    if (isObj(v) && isObj(b)) {
      const d = diffConfig(b, v);
      if (Object.keys(d).length) out[k] = d;
    } else if (JSON.stringify(v) !== JSON.stringify(b)) out[k] = v;
  }
  return out;
}

/** Paths in `value` that are not configuration options (typos), for example "node.sizee". */
export function findUnknownKeys(value: unknown, defaults: unknown = DEFAULT_CONFIG, path = ''): string[] {
  const out: string[] = [];
  if (!isObj(value) || !isObj(defaults)) return out;
  for (const [k, v] of Object.entries(value)) {
    const p = path ? `${path}.${k}` : k;
    if (!(k in defaults)) out.push(p);
    else if (isObj(v) && !DYNAMIC.has(p)) out.push(...findUnknownKeys(v, defaults[k], p));
  }
  return out;
}

/** Option paths of the defaults that have no documentation (used by the tests). */
export function undocumentedConfigPaths(): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (!isObj(v)) return;
    for (const [k, c] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (!(p in CONFIG_DOCS)) out.push(p);
      if (!DYNAMIC.has(p)) walk(c, p);
    }
  };
  walk(DEFAULT_CONFIG, '');
  for (const k of Object.keys(DEFAULT_CONFIG.ui.cssVars)) if (!(`ui.cssVars.${k}` in CONFIG_DOCS)) out.push(`ui.cssVars.${k}`);
  return out;
}
