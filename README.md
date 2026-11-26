# Graphscape

A three.js based **graph editor and viewer for websites**.

* Draws **directed and undirected**, **weighted and unweighted** graphs with **multi edges** and **self loops**, in **2D or 3D** (switchable per graph).
* **Imports** yEd GraphML (shapes, colors, positions, arrows, UML class nodes), GML, Graphviz DOT, JSON (also D3 and Cytoscape) and CSV edge lists; **exports** all of them plus PNG.
* Nodes and edges can carry **relative website URLs** that open in the page, a new tab, a side panel or your own handler.
* **Full editor**: add, connect, move, multi-select, edit properties, transform gizmo, undo/redo, layouts, themes.
* **Embeddable library** with complete **skinning and configuration** so one code base fits very different sites: social networks, evolution trees, UML class diagrams, dependency graphs, and so on.
* Built and tested with **Node.js**, written in TypeScript, **one runtime dependency** (`three`). MIT licensed.

Contents: [Quick start](#quick-start) · [Project layout](#project-layout) · [Embedding the viewer](#embedding-the-viewer) · [Data model](#data-model) · [File formats](#file-formats) · [Website links](#linking-to-website-content) · [The editor](#the-editor) · [Viewer interaction](#viewer-interaction) · [Layouts](#layouts) · [2D, 3D, shapes, labels](#2d-3d-shapes-and-labels) · [Configuration and skinning](#configuration-and-skinning) · [Runtime API](#runtime-api) · [Architecture](#architecture-and-performance) · [Testing](#testing-and-development) · [Troubleshooting](#troubleshooting) · [Dependencies](#dependencies-and-license) · [Limits](#known-limits)

---

## Quick start

Requirements: **Node.js 18.18 or newer** (works the same in Windows PowerShell, macOS and Linux shells).

```bash
npm install
npm run dev        # editor with hot reload at http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # typecheck + tests + editor + library + standalone bundle + type declarations
npm run serve      # static server for the build output and the examples
npm run clean      # removes dist/
```

| Script | What it does |
| --- | --- |
| `dev` | Vite dev server, hot reload. Examples that import `/src/lib/index.ts` work here, e.g. `http://localhost:5173/examples/module.html` |
| `typecheck` | `tsc --noEmit` over `src`, `tests` and the config files |
| `test` / `test:watch` | vitest, `tests/**/*.test.ts` |
| `build:editor` | editor app to `dist/editor` (relative base, can be copied into any folder) |
| `build:lib` | ES module to `dist/lib/graphscape.js`, `three` stays external |
| `build:standalone` | self-contained script `dist/standalone/graphscape.standalone.js` (three included, global `Graphscape`) |
| `build:types` | `.d.ts` files to `dist/types` |
| `build` | all of the above, in a safe order |
| `serve` | dependency-free static server (`scripts/serve.mjs`), port 4173 or `PORT=...` |

After `npm run build`, `npm run serve` prints these URLs:

| URL | Content |
| --- | --- |
| `/dist/editor/index.html` | the built editor |
| `/examples/standalone.html` | script-tag usage: one attribute, skin file, scripted |
| `/examples/fullscreen.html` | the view switching in and out of full screen |
| `/examples/large-network.html` | 1200 nodes with cliques, hubs, chains, leaves, isolated nodes; layout selector, 2D/3D, full screen |
| `/examples/module.html` | ES module usage (needs `npm run dev`, not `serve`) |

Open pages through a server, not with `file://`, because they fetch graph files.

## Project layout

```
src/core        no DOM, no three.js; runs in Node; unit tested
  types.ts        NodeData, EdgeData, GraphData
  graph.ts        Graph model with change events (structure | position)
  config.ts       GraphscapeConfig, defaults, themes, mergeConfig, createConfig
  style.ts        style resolution: defaults < group color < rules < element values
  geometry.ts     node bodies, curved multi edges, self loops, clipping, arrow tips
  url.ts          safe resolution of node/edge links
  generate.ts     random clustered graphs and the mixed 1200-node style network
  io/             xml (own parser), builder, json, graphml (yEd), gml, dot, csv, format detection
  layout/         force, tree, layered, circle, grid, sphere, random, node boxes
src/lib         browser only
  view.ts         GraphView: scene, cameras, picking, interaction, gizmo, tooltip, link panel, full screen
  labels.ts       canvas textures for labels, sublabels, cards
  styles.ts       default CSS of the DOM parts (injected once)
  index.ts        library entry (re-exports core)
  standalone.ts   script-tag entry: window.Graphscape + data-graphscape auto init
src/editor      the editor application, written against the public API only
tests           vitest tests of the core
public/samples  sample graphs (copied into the editor build)
examples        script-tag, full screen, large network, module example, skin.json
scripts         clean.mjs, serve.mjs
```

---

## Embedding the viewer

The container needs a **size** (an explicit height). `three` must be installed next to the library (peer dependency); the standalone bundle already contains it.

### A. One attribute, no JavaScript

```html
<div data-graphscape data-src="graphs/team.graphml" data-config="graphs/skin.json"
     data-theme="dark" data-dimension="2d" style="height:480px"></div>
<script src="graphscape.standalone.js"></script>
```

| Attribute | Meaning |
| --- | --- |
| `data-src` | graph file (JSON, GraphML, GML, DOT, CSV), path relative to the page |
| `data-config` | JSON file with a partial configuration (a "skin") |
| `data-theme` | `light`, `dark`, `blueprint` or a registered theme |
| `data-dimension` | `2d` or `3d` |
| `data-directed` | `true`: treat CSV edges as directed |

`Graphscape.autoInit()` runs on page load and can be called again for content added later; `Graphscape.getInstance(el)` returns the view of an element.

### B. ES module

```ts
import { GraphView, parseGraph, defineConfig } from 'graphscape';

const config = defineConfig({
  theme: 'light',
  links: { baseUrl: 'content/', target: 'panel' },   // node url "ada.html" opens content/ada.html in a side panel
  groups: { colors: { Sales: '#e0b872' } },
});

const view = new GraphView(document.getElementById('graph')!, config);
const text = await (await fetch('graphs/team.graphml')).text();
view.load(parseGraph(text, { filename: 'team.graphml' }).graph);   // lays out nodes that have no coordinates
view.on('nodeclick', ({ node }) => console.log(node.label));
```

### C. Build the graph in code

```ts
import { Graph, GraphView } from 'graphscape';

const g = new Graph({ directed: true });
const a = g.addNode({ label: 'A', sublabel: 'start', url: 'pages/a.html' });
const b = g.addNode({ label: 'B' });
g.addEdge({ source: a.id, target: b.id, weight: 2.5 });
g.addEdge({ source: b.id, target: b.id, label: 'self loop' });
new GraphView(el, {}, g);    // the view follows every later change of `g`
```

### D. Script tag, scripted

```html
<script src="graphscape.standalone.js"></script>
<script>
  const view = new Graphscape.GraphView(document.getElementById('g'), { theme: 'blueprint' });
  view.load({ directed: true, nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ source: 'a', target: 'b' }] });
</script>
```

### Deploying

Copy `dist/editor` to any folder of your site (all paths are relative) for the editor, and `dist/standalone/graphscape.standalone.js` (or `dist/lib` plus `three`) for viewers. Graph files, skins and linked content are plain static files.

---

## Data model

```ts
interface NodeData {
  id: string;
  label?: string;          // may contain line breaks (\n)
  sublabel?: string;       // smaller second line below the label
  x?: number; y?: number; z?: number;
  group?: string;          // colors by palette/group colors; clusters in circle/grid layouts
  tags?: string[];
  url?: string;            // website content, see "Website links"
  color?: string;          // any CSS color
  shape?: 'circle' | 'square' | 'rectangle' | 'diamond' | 'hexagon' | 'triangle' | 'card';
  size?: number;           // diameter in world units
  body?: string[];         // lines of a card node; '---' draws a separator (UML classes)
  pinned?: boolean;        // not moved by the force layout
  props?: Record<string, string | number | boolean>;
}

interface EdgeData {
  id: string;
  source: string; target: string;
  weight?: number;         // default 1
  directed?: boolean;      // overrides the graph default
  label?: string; url?: string; color?: string;
  width?: number; dashed?: boolean; group?: string;
  props?: Record<string, string | number | boolean>;
}

interface GraphData { directed: boolean; nodes: NodeData[]; edges: EdgeData[]; meta?: { title?, description?, dimension?: '2d' | '3d' } }
```

* **Weights**: technically every edge has a weight. A missing weight means 1, and weight 1 is never displayed in `weight.show: "auto"`. Weights can drive line width (`edge.widthByWeight`) and layout attraction (`layout.weightMode: "strength"`).
* **Direction**: `GraphData.directed` is the default; any edge can override it, so directed and undirected edges may be mixed.
* **Multi edges and self loops** are allowed. Parallel edges are drawn as symmetric curves, self loops as circles beside the node.
* **Coordinates** are optional. Nodes without them get a start position and the configured layout runs when a graph is loaded (`layout.autoRun`).
* **`meta.dimension`** is stored with the graph; a loaded graph switches the view to that dimension.
* The `Graph` class (`addNode`, `updateNode`, `removeNode`, `addEdge`, `updateEdge`, `removeEdge`, `setDirected`, `setPositions`, `edgesOf`, `degree`, `toData`, `load`, `events.on('change', ...)`) is the single source of truth; views and the editor follow its change events.

---

## File formats

`parseGraph(text, options)` detects the format from the file name and the content; `serializeGraph(data, format)` writes it. Both run in Node and in the browser.

| Format | Extensions | Import | Export | Notes |
| --- | --- | --- | --- | --- |
| Graphscape JSON | `.json` | yes | yes | native; also reads D3 node-link (`nodes`/`links`) and Cytoscape.js (`elements`) |
| GraphML (yEd) | `.graphml` `.xml` | yes | yes | yEd shapes, colors, positions, labels, arrows, UML class nodes; the export opens in yEd |
| GML | `.gml` | yes | yes | ids, labels, `graphics` coordinates, `weight`/`value` |
| Graphviz DOT | `.dot` `.gv` | yes | yes | chains, `node`/`edge` defaults, clusters become groups, `record` shapes become cards |
| CSV edge list | `.csv` `.tsv` `.txt` | yes | yes | header `source,target,weight,label,url,directed` or positional columns; a row without target declares an isolated node |

```ts
const { graph, warnings, format } = parseGraph(text, {
  filename: 'team.graphml',          // helps detection
  format: 'graphml',                 // or force a format
  directed: true,                    // CSV only: default direction
  scale: 0.5,                        // GraphML: multiplier for yEd pixel units
  numericLabelsAsWeights: false,     // GraphML: turn numeric edge labels into weights
});
```

### Native JSON

```json
{
  "format": "graphscape", "version": 1,
  "directed": true,
  "meta": { "title": "My graph", "dimension": "2d" },
  "nodes": [ { "id": "a", "label": "A", "sublabel": "first", "x": 0, "y": 0, "group": "g1",
               "url": "pages/a.html", "color": "#4e79a7", "shape": "circle", "size": 14, "props": { "year": 1999 } } ],
  "edges": [ { "id": "e1", "source": "a", "target": "a", "weight": 2.5, "label": "loop", "url": "x.html",
               "directed": false, "dashed": true, "width": 3 } ]
}
```

### yEd GraphML

* **Read**: `ShapeNode`, `GenericNode`, `UMLClassNode` (becomes a `card`; attribute and method labels become `body`), `GroupNode` (flattened), fill color, shape, geometry (center position, y axis flipped, scaled by `scale`), node and edge labels, line style (color, dashed, width), arrows (target arrow = directed; source arrow = ends swapped and directed; none = undirected). Custom data keys with `attr.name` are kept: `url`, `href`, `link`, `label`, `sublabel`, `weight`, `color`, `group`, `shape`, `size`, `x`, `y`, `z` map to fields, everything else lands in `props`.
* **Write**: yEd-compatible graphics (positions, colors, shapes, labels, arrows, UML nodes for cards) and data keys for URLs, weights, groups, sublabels and props.
* **Not supported**: bend points, ports, tables, hyperedges, nested groups as real containers, arrows on both ends (become undirected).

### GML, DOT, CSV in short

* **GML**: our export stores the original id in `gsId` so ids round trip; coordinates go into `graphics [ x y z ]`.
* **DOT**: `digraph`/`graph`, `a -> b -> c [..]` chains, `node [..]`/`edge [..]` defaults, `subgraph cluster_x { label=".." }` becomes a group, `dir=none|back|forward|both`, `URL`/`href`, `fillcolor`, `style=dashed`, `penwidth`, `weight`, `sublabel`/`xlabel`, `shape=record` labels `{Title|attr\l|method\l}` become cards. Layout positions are not imported.
* **CSV**: node attributes are lost, isolated nodes are kept as rows without target.

### Security of imports

The XML parser ignores DOCTYPE content and never resolves external entities. Imported text is rendered via `textContent` or onto a canvas, never as HTML. URLs are filtered again when a link is opened.

---

## Linking to website content

Every node and edge may carry a `url`. Relative paths are the default. `javascript:`, `data:` and `file:` URLs are always rejected; absolute `http(s)` and `mailto` URLs only with `links.allowAbsolute: true`.

| Option | Values | Meaning |
| --- | --- | --- |
| `interaction.openLinks` | `click`, `dblclick` (default), `ctrl-click`, `never` | which gesture opens the link |
| `links.baseUrl` | string | prefix for relative paths, e.g. `content/` |
| `links.target` | `self`, `blank`, `panel`, `event` | navigate, new tab, sandboxed iframe panel inside the view, or let your code decide |
| `links.allowAbsolute` | boolean | allow absolute links |
| `links.panelSandbox` | string | iframe `sandbox` attribute of the panel |

With `target: "event"`, or `event.handled = true` in a `link` listener, you decide what happens, for example loading the content into an element of your page:

```ts
view.on('link', (e) => { e.handled = true; document.getElementById('side')!.load(e.resolved); });
```

---

## The editor

Start it with `npm run dev` or open `dist/editor/index.html` through `npm run serve`.

### Tools and shortcuts

| Action | How |
| --- | --- |
| Select | click; **Shift**-click toggles; **Shift**-drag on the background draws a selection box; **Ctrl+A** all |
| Move nodes | drag; several selected nodes move together; **X**, **Y** or **Z** held while dragging locks the movement to that axis (two keys: plane); a colored guide line shows the axis |
| Add node | double-click the background, or tool **Node** (**N**) and click |
| Add edge | tool **Edge** (**E**), drag from node to node; release on the same node for a self loop; or select two nodes and press **Connect** in the inspector |
| Gizmo | select nodes; **M** move, **R** rotate, **S** scale; **Ctrl** snaps (see below) |
| Delete | **Del** or **Backspace** |
| Undo / redo | **Ctrl+Z** / **Ctrl+Y** (or Ctrl+Shift+Z) |
| Fit view | **F** |
| Select tool, clear selection | **V**, **Esc** |
| Open a linked page | **Ctrl**-click a node or edge with a URL, or the *Open link* button |
| Save | **Ctrl+S** (format chosen in the toolbar) |

Keys are ignored while a text field has focus.

### Gizmo

For the selected nodes a gizmo appears at the **center of the selection** (not the world origin):

| Mode | Handles | Effect |
| --- | --- | --- |
| Move (**M**) | X, Y, Z arrows and the XY, YZ, XZ plane handles | moves all selected nodes together |
| Rotate (**R**) | rings around X, Y, Z (2D: the Z ring only) and an outer view ring | rotates the node positions around the center |
| Scale (**S**) | per-axis handles and a uniform center handle | spreads or compresses the nodes around the center |

Rotate and scale need **two or more** selected nodes, because a single node has no orientation or extent of its own. Free dragging of a node keeps working; a press on a gizmo handle goes to the gizmo, anything else behaves as before. Snapping (while **Ctrl**/Cmd is held): 10 world units, 15 degrees, 0.1 scale, configurable under `gizmo`. In your own pages enable it with `interaction: { gizmo: true }`.

### Inspector

* **Node**: label (multi-line, Enter inserts a break), subline, group, URL, color, shape, size, pinned, card body (for `card` shapes). With several nodes selected the common values are shown and edits apply to all.
* **Edge**: weight, label, URL, color, direction (graph default, directed, undirected), dashed, width, *Reverse*.
* **Graph** (nothing selected): title, default direction, 3D rotation scheme, weight display, width by weight, and the **configuration JSON** with *Apply*, *Download* and *Load file...* so a skin can be developed live and then saved.

### Files, export, themes

Toolbar: *New*, *Open...* (or drag and drop onto the canvas), *Samples*, *Generate...* (random clustered graph), format selector with *Save*, *PNG*, undo/redo, layout selector with *Run layout* and *Stop*, 2D/3D switch, *Fit*, theme selector. The editor chrome follows the theme through the same CSS variables the viewer uses. Undo/redo are JSON snapshots (100 steps).

---

## Viewer interaction

| Input | 2D | 3D |
| --- | --- | --- |
| Left drag on background | pan | rotate (orbit or free, see `camera.rotation`) |
| Right drag | pan | pan |
| Wheel | zoom to cursor | zoom (orbit: to cursor; trackball: to the center) |
| Middle drag | zoom | zoom |
| Touch | 1 finger pan, 2 fingers zoom/pan | 1 finger rotate, 2 fingers zoom/pan |
| Click node/edge | select (Shift adds) | same |
| Drag node | move | move in the plane facing the camera |
| Shift-drag background | box select | box select |
| Hover | tooltip with label, sublabel, group, URL, weight | same |

Buttons in the corner: zoom in/out, *Fit*, 2D/3D, and *Full* if `ui.fullscreen` is on. Everything can be switched off for read-only embeds (see [recipes](#recipes)).

---

## Layouts

`view.runLayout(name)` or `computeLayout(graph, name, options)` (pure function, no view needed).

| Name | Use for | Notes |
| --- | --- | --- |
| `force` | general networks | animated, 2D and 3D, grid accelerated for thousands of nodes, honors pinned nodes and `weightMode` |
| `tree` | clean hierarchies, evolution trees, org charts | parents centered over their children, subtrees never overlap; roots are nodes without incoming edges (undirected graphs: the best connected node); other nodes hang below the first parent that reaches them; `direction` `TB` or `LR` |
| `layered` | DAG-like graphs with many cross links, class diagrams | cycle removal, longest-path layering, barycenter ordering |
| `circle`, `grid`, `sphere`, `random` | overviews | arcs, cells and radius follow the real node sizes |

`tree`, `layered`, `circle`, `grid` and `sphere` size every node as **body + label + sublabel** (or the whole card) and keep `layout.gap` world units free between boxes, so labels do not collide. `layout.spacing` is only the fallback when box sizes are unknown. `nodeBoxes(graph, config)` exposes the footprints for your own layouts.

Layout options: `idealLength` (spring length of `force`), `gap`, `spacing`, `weightMode` (`ignore` or `strength`), `gravity`, `direction`, `seed`. A running force layout can be stopped with `view.stopLayout()`; dragging a node during the simulation pins it while you hold it.

---

## 2D, 3D, shapes and labels

* **Dimension**: `view.setDimension('2d' | '3d')`, the toolbar button, or `config.dimension`. 2D uses an orthographic camera, 3D a perspective camera with a head light. Switching a flat graph to 3D in the editor runs the force layout so it unfolds.
* **3D rotation** (`camera.rotation`): `orbit` (default) keeps the horizon level and stops the tilt at the poles (OrbitControls: unlimited around the vertical axis, about ±90 degrees of tilt). `free` is a trackball (TrackballControls) with unlimited rotation around every axis; the horizon is not kept level and wheel zoom goes to the view center. In `free` mode frames are rendered continuously while you drag, scroll and shortly after, so inertia can finish.
* **Shapes**: 2D draws flat polygons (circle, square, rectangle, diamond, hexagon, triangle); 3D draws real solids (sphere, box, octahedron, hexagonal and triangular prism). `rectangle` uses `node.aspect`. `card` is a sprite in both modes.
* **Cards** show `label` as a header band and `body` lines below, with `---` as separator: UML classes (imported from yEd `UMLClassNode` or DOT `record`), but also any small table of facts. Header color is the node color unless `card.headerBackground` is set.
* **Labels** sit below the node, may contain line breaks, and may have a smaller `sublabel`. In 3D a label is always placed in front of its own node as seen from the camera (it can still be hidden by nearer nodes). `label.mode: "screen"` keeps constant pixel size while zooming. Labels are skipped above `label.maxCount` nodes; the tooltip still works.
* **Edge text**: the edge label plus the weight (for example `mentor (2.5)`), controlled by `weight.show`.
* **Colors**: node color from `node.color`, else group color (`groups.colors`, then the palette in order of first appearance), refined by rules and finally by values on the element.

---

## Configuration and skinning

Every visual and behavioral aspect is one **configuration object**. Pass a *partial* object; everything else falls back to `defaults < theme < your values` (objects are merged deeply; arrays and scalars replace).

```ts
import { GraphView, defineConfig, registerTheme } from 'graphscape';

registerTheme('parchment', { background: { color: '#efe3c8' }, node: { color: '#8c5a2b' } });   // optional own theme
const view = new GraphView(el, defineConfig({ theme: 'parchment', edge: { width: 2 } }));
view.setConfig({ label: { show: false } });     // patch at runtime
view.getUserConfig();                           // what you would save as a config file
```

The same object can be a JSON file (`data-config="skin.json"`, or load and pass it). Function matchers in `rules` need JavaScript. Built-in themes: `light` (default), `dark`, `blueprint`. `examples/skin.json` is a complete skin example.

### General

| Key | Default | Meaning |
| --- | --- | --- |
| `theme` | `light` | name of a registered theme |
| `dimension` | `2d` | `2d` or `3d`; a loaded graph's `meta.dimension` takes precedence |
| `background.color` / `gradientTo` / `transparent` | `#f7f8fa` / `null` / `false` | solid, vertical gradient, or see-through canvas |
| `render.antialias` / `pixelRatio` | `true` / `null` | `null` = device pixel ratio, max 2 |

### Nodes

| Key | Default | Meaning |
| --- | --- | --- |
| `node.color` | `#4e79a7` | fill when there is no group color |
| `node.shape` | `circle` | `circle square rectangle diamond hexagon triangle card` |
| `node.size` | `14` | diameter in world units |
| `node.aspect` | `1.6` | width / height of `rectangle` |
| `node.borderColor` / `borderWidth` | `#2b3a4a` / `1` | outline |
| `node.opacity` | `1` | global node opacity |
| `node.labelColor` | `#1f2933` | label text color |

### Groups and rules

```jsonc
"groups": { "palette": ["#4e79a7", "#f28e2b"], "colors": { "Sales": "#e0b872" } },
"rules": [
  { "target": "node", "match": { "group": "Design" }, "style": { "shape": "diamond", "size": 18 } },
  { "target": "node", "match": { "tag": "group" },   "style": { "shape": "square" } },
  { "target": "edge", "match": { "prop": ["kind", "mentor"] }, "style": { "dashed": true, "color": "#ffd166" } }
]
```

Matchers: `id`, `group`, `tag`, `prop: [key, value]` (all given keys must match), or in JavaScript `(item) => boolean`. Style keys: nodes `color shape size borderColor borderWidth labelColor`, edges `color width dashed`. Precedence: **defaults < group color < rules in order < values stored on the node or edge itself**.

### Edges

| Key | Default | Meaning |
| --- | --- | --- |
| `edge.color` / `width` / `dashed` | `#8b95a1` / `1.5` / `false` | width in CSS pixels |
| `edge.opacity` | `0.9` | |
| `edge.arrows` / `arrowSize` | `true` / `7` | arrow heads on directed edges, size in world units |
| `edge.curveSpacing` | `16` | distance between parallel edges of the same node pair |
| `edge.loopSize` | `0.9` | self loop radius relative to node size |
| `edge.dashSize` / `gapSize` | `5` / `3` | dash pattern |
| `edge.widthByWeight` | `{ enabled: false, min: 1, max: 6 }` | map the weight range of the graph to line widths |

### Weights and labels

| Key | Default | Meaning |
| --- | --- | --- |
| `weight.show` | `auto` | `auto` shows weights other than 1, `always`, `never` |
| `weight.font` `size` `color` `background` `padding` `decimals` `maxCount` | | style of edge texts |
| `label.show` | `true` | |
| `label.font` / `size` / `color` / `background` | system-ui / `6` / `#1f2933` / `null` | size in world units (`screen` mode: CSS pixels) |
| `label.subSize` / `subColor` | `4.6` / `#5f6b76` | sublabel |
| `label.mode` | `world` | `world` scales with zoom, `screen` constant pixel size |
| `label.maxCount` | `1500` | labels are skipped above this node count |
| `label.maxChars` / `gap` / `padding` / `resolution` | `40 / 1.5 / 1 / 4` | truncation per line, distance below node, texture sharpness |
| `card.*` | | `background border headerBackground headerColor textColor font size padding` |

### Selection, gizmo, camera

| Key | Default | Meaning |
| --- | --- | --- |
| `selection.color` / `hoverColor` / `width` | `#e8590c` / `#f59f00` / `2.5` | outline of selected and hovered nodes, selected edge color |
| `gizmo.size` / `space` | `0.9` / `world` | gizmo size, `world` or `local` space |
| `gizmo.snapTranslate` / `snapRotate` / `snapScale` | `10` / `15` / `0.1` | snapping while Ctrl is held (rotation in degrees) |
| `camera.fov` | `50` | 3D field of view |
| `camera.zoomMin` / `zoomMax` | `0.02` / `60` | 2D zoom limits |
| `camera.fitPadding` | `1.25` | margin when fitting |
| `camera.autoFit` | `true` | fit on load and after a layout |
| `camera.damping` | `false` | smooth camera motion (orbit mode) |
| `camera.rotation` | `orbit` | `orbit` or `free` (3D) |

### Layout

| Key | Default | Meaning |
| --- | --- | --- |
| `layout.name` | `force` | `force tree layered circle grid sphere random` |
| `layout.idealLength` | `60` | spring length of the force layout |
| `layout.spacing` | `40` | minimum distance when node boxes are unknown |
| `layout.gap` | `14` | free space between node boxes in the placement layouts |
| `layout.weightMode` | `ignore` | `strength`: heavier edges pull stronger |
| `layout.gravity` / `direction` / `seed` | `0.05` / `TB` / `1` | `direction` is `TB` or `LR` for `tree` and `layered` |
| `layout.autoRun` | `true` | run the layout when loaded nodes have no coordinates |

### Interaction and links

| Key | Default | Meaning |
| --- | --- | --- |
| `interaction.dragNodes` / `select` / `multiSelect` / `hover` / `tooltip` | all `true` | switch features off for a read-only embed |
| `interaction.gizmo` | `false` | transform gizmo for selected nodes (the editor turns it on) |
| `interaction.axisLock` | `true` | X/Y/Z keys lock dragging to an axis |
| `interaction.openLinks` | `dblclick` | `click`, `dblclick`, `ctrl-click`, `never` |
| `interaction.pickLimit` | `20000` | edge hit testing is skipped above this edge count |
| `links.*` | | see [Website links](#linking-to-website-content) |

### DOM parts: tooltip, buttons, panel, full screen

| Key | Meaning |
| --- | --- |
| `ui.controls` | zoom, fit and 2D/3D buttons (default `true`) |
| `ui.fullscreen` | adds a Full / Exit button (default `false`); `view.toggleFullscreen()` does the same from code |
| `ui.injectStyles` | inject the default CSS once; set `false` to ship your own (`defaultCss` exports the text) |
| `ui.cssVars` | map of CSS custom properties set on the view as `--gs-<name>`: `font`, `panel-bg`, `panel-fg`, `panel-border`, `accent`, `radius` |

The DOM parts use the classes `gs-root gs-tooltip gs-controls gs-btn gs-panel gs-box gs-error` and, while in the CSS fallback for full screen, `gs-pseudo-fullscreen`, so a site stylesheet can restyle them directly.

### Full screen

`view.toggleFullscreen()` switches the container in or out of full screen with the Fullscreen API and falls back to a fixed, viewport-filling container where it is unavailable (for example iPhone Safari). It must be called from a user gesture. **Esc** leaves both variants; event `fullscreenchange` reports the state.

### Recipes

* **Read-only embed**: `interaction: { dragNodes: false, select: false }`, `ui: { controls: false }`.
* **Class diagram**: import a yEd file with UML nodes, then `runLayout('layered')`.
* **Social network**: `edge.widthByWeight.enabled = true`, `groups.colors` per community, `label.mode: "screen"`.
* **Evolution tree**: directed graph, `layout.name: "tree"`, `layout.direction: "LR"`, `weight.show: "always"` for time spans.
* **Large network**: `label.show: false`, small `node.size`, `edge.arrows: false`, `edge.opacity: 0.5`, `layout.idealLength` about 2 to 4 times the node size (see `examples/large-network.html`).
* **Match the site**: `background.transparent: true` and `ui.cssVars` set to the site's font and colors.

---

## Runtime API

```ts
const view = new GraphView(container, config?, graph?);

view.load(graphOrData); view.refresh(); view.destroy();
view.graph;                                       // the Graph model

view.setConfig(patch); view.getConfig(); view.getUserConfig();
view.setDimension('3d'); view.getDimension(); view.isFlat();

view.runLayout('force' | 'tree' | 'layered' | ..., options?): Promise<void>;
view.stopLayout(); view.isLayoutRunning;

view.fit(); view.zoomBy(1.4); view.resize();
view.toggleFullscreen(force?): Promise<void>; view.isFullscreen;

view.getSelection(); view.setSelection({ nodes, edges }); view.selectAll(); view.clearSelection();
view.setTool('select' | 'connect'); view.getTool();
view.setGizmoMode('translate' | 'rotate' | 'scale'); view.getGizmoMode();

view.openLink('node' | 'edge', id); view.closePanel();
view.getNodeStyle(id); view.getEdgeStyle(id);
view.exportImage('image/png');                    // data URL including the background

const off = view.on(name, handler);               // returns an unsubscribe function
```

### Events

| Event | Payload |
| --- | --- |
| `nodeclick`, `nodedblclick` | `{ id, node, originalEvent }` |
| `edgeclick` | `{ id, edge, originalEvent }` |
| `backgroundclick`, `backgrounddblclick` | `{ position: [x, y, z], originalEvent }` |
| `selection` | `{ nodes, edges }` |
| `hover` | `{ kind: 'node' \| 'edge' \| null, id }` |
| `nodedragstart`, `nodedragend` | `{ ids }` (also fired by the gizmo) |
| `connect` | `{ source, target }` (tool `connect`, drag from node to node) |
| `link` | `{ url, resolved, kind, id, handled }` (set `handled = true` to take over) |
| `layoutstart`, `layoutend` | `{ name }`, `{ name, completed }` |
| `dimensionchange` | `{ dimension }` |
| `fullscreenchange` | `{ fullscreen }` |
| `gizmomode` | `{ mode }` |

### Pure functions (also in Node)

`parseGraph`, `serializeGraph`, `detectFormat`, `FORMATS`, `computeLayout`, `LAYOUT_NAMES`, `nodeBoxes`, `placeNewNodes`, `generateClustered`, `generateMixedNetwork`, `resolveUrl`, `createConfig`, `mergeConfig`, `defineConfig`, `registerTheme`, `themes`, `resolveNodeStyle`, `resolveEdgeStyle`, and the `geometry` namespace.

```ts
import { Graph, parseGraph, computeLayout } from 'graphscape';
const g = new Graph(parseGraph(text, { filename: 'x.dot' }).graph);
g.setPositions(computeLayout(g, 'tree', { direction: 'LR' }));   // headless layout in Node
```

---

## Architecture and performance

**Data flow.** `Graph` (model) emits a `change` event, `GraphView` marks dirty flags, and one `requestAnimationFrame` rebuilds only what is needed: structure changes rebuild the scene objects, position changes update matrices and line buffers, selection and hover only update colors. Frames are scheduled on demand (graph, selection, camera, running layout), not continuously. The editor mutates the `Graph` and listens to view events; undo/redo are JSON snapshots.

**Rendering.**

* **Nodes**: one `InstancedMesh` per shape for the body and one for the outline (border, selection, hover).
* **Edges**: `LineSegments2` fat lines (pixel widths) grouped into buckets by width and dash style, so draw calls stay few regardless of the edge count. Multi edges are quadratic curves with symmetric offsets, self loops are circles, ends are clipped to the node outline and shortened for the arrow head.
* **Arrows**: one `InstancedMesh` of cones.
* **Labels, edge texts, cards**: canvas textures on sprites, cached by content and style.
* **2D** orders by `renderOrder` with the depth test off; **3D** uses the depth buffer. Labels in 3D are pushed toward the camera.
* **Picking** is done in screen space (projected centers and edge polylines) instead of ray casting, which treats every shape the same way.
* **Gizmo**: three.js `TransformControls` attached to an invisible pivot at the selection center; the deltas of the pivot are applied to the selected node positions.
* **Camera**: `OrbitControls` (2D and 3D orbit) or `TrackballControls` (3D free), switched by configuration.

**Performance.**

* Interactive up to a few thousand nodes and tens of thousands of edges; animated layouts get slower with the edge count because the line buffers of all edges are rebuilt on every position update. Static viewing and zooming of larger graphs is smooth.
* Force repulsion uses a spatial hash with a cutoff above 400 nodes.
* Raise `label.resolution` for crisper text (more texture memory), lower `render.pixelRatio` on weak GPUs, switch labels off for very large graphs.

**Extending.** New file formats go into `src/core/io` (a `parseX(text): ImportResult` and `serializeX(data): string`, registered in `io/index.ts`). New layouts are functions `(graph, options) => Map<id, [x, y, z]>` registered in `layout/index.ts` and `LayoutName`. New themes: `registerTheme(name, partialConfig)`.

---

## Testing and development

* `npm test` runs the unit tests of the framework-free core: graph model, round trips through all formats, a yEd UML GraphML import, DOT parsing, malformed input, URL safety, edge geometry (clipping, parallel edges, loops), all layouts (including box-aware spacing and the tidy tree), the configuration merge and style resolution, and the 1200-node network generator.
* The three.js view and the editor have **no automated tests**; they are covered by type checking and manual use. A short manual check after changes: load the samples, drag a node, box select, add and connect nodes, undo/redo, switch 2D/3D and both rotation schemes, use the gizmo in all three modes, run each layout, toggle full screen, open a link in each `links.target`.
* Types: `npm run typecheck`. Keep `src/core` free of DOM and three.js imports so it stays testable in Node.
* The editor only uses the public library API, so anything it does can be done from your own page.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Empty, invisible view | the container has no height; give it an explicit `height` |
| `Failed to resolve import "three"` | install `three` next to the library (peer dependency) or use the standalone bundle |
| Samples or `data-src` do not load | the page was opened with `file://`; use `npm run serve` or any web server |
| Old behavior after an update | run `npm run clean && npm run build`, hard refresh the browser (cached `graphscape.standalone.js`) |
| Labels missing | graph has more nodes than `label.maxCount`, or `label.show` is `false` |
| Shapes look the same in 3D | 3D draws solids; very small nodes or heavy zoom-out make them look alike |
| Links do nothing | URL rejected (absolute without `links.allowAbsolute`, or a blocked scheme), or `interaction.openLinks` is `never`; listen to `link` to see what arrives |
| Full screen does nothing | must be triggered by a click or key press; some embeds forbid it (iframe without `allowfullscreen`), the CSS fallback is used then |
| Gizmo not visible | `interaction.gizmo` is off in your page, nothing is selected, or rotate/scale mode with a single node selected |

---

## Dependencies and license

| Package | Role | License |
| --- | --- | --- |
| `three` ^0.170 | rendering and controls; peer dependency of the library, bundled into the standalone build | MIT |
| `vite` ^5.4 | dev server and bundler (dev only) | MIT |
| `typescript` ^5.6 | type checking and declarations (dev only) | Apache-2.0 |
| `vitest` ^2.1 | unit tests (dev only) | MIT |
| `@types/three` ^0.170 | typings (dev only) | MIT |

No other runtime dependencies: XML/GraphML, GML, DOT and CSV parsing, the layouts and the geometry are implemented in `src/core`. Graphscape itself is released under the **MIT License** (see `LICENSE`).

## Known limits

* Interactive size: a few thousand nodes with animation, larger graphs for static viewing (see [Performance](#architecture-and-performance)).
* Edges are hit-tested only up to `interaction.pickLimit` edges.
* In 3D, self loops lie in the XY plane and shapes are fixed solids (no per-node rotation yet).
* yEd: groups are flattened, bend points, ports and tables are ignored, edges with arrows on both ends become undirected.
* A single node cannot be rotated or scaled with the gizmo (it has no orientation or extent of its own).
* Layout positions are not imported from DOT; GML coordinates are used as given.
