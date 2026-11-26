# Graphscape

A three.js based **graph editor and viewer for websites**. It draws directed and undirected, weighted and
unweighted graphs with multi edges and self loops in **2D or 3D**, imports **yEd GraphML** (and GML, DOT, JSON,
CSV), lets nodes and edges link to **relative website content**, and is fully **skinnable** so the same code
fits very different sites (social networks, evolution trees, UML class diagrams, ...).

Two deliverables come out of one repository:

| Deliverable | What it is | Where |
| --- | --- | --- |
| **Library** | Embeddable viewer (with optional editing hooks), ES module with `three` as peer dependency, plus a self-contained script-tag bundle and TypeScript types | `dist/lib`, `dist/standalone`, `dist/types` |
| **Editor app** | Full graph editor: tools, inspector, import/export, undo/redo, layouts, themes | `dist/editor` |

Everything is MIT licensed, all dependencies are open source (see [Dependencies](#dependencies)).

## Quick start

Requirements: Node.js 18.18 or newer.

```bash
npm install
npm run dev        # editor with hot reload at http://localhost:5173
npm test           # unit tests (vitest) for model, formats, geometry, layouts, config
npm run build      # typecheck + tests + editor + library + standalone bundle + types
npm run serve      # static server for the build output, see below
```

After `npm run build`, `npm run serve` (a tiny dependency-free Node server) prints the URLs:

* `http://localhost:4173/dist/editor/index.html` the editor (built, relative paths, can be copied to any folder)
* `http://localhost:4173/examples/standalone.html` script-tag examples including a skin file
* `http://localhost:4173/examples/fullscreen.html` the view switching in and out of full screen (button, `F` key, `Esc`)
* `http://localhost:4173/examples/large-network.html` 1200 nodes with cliques, hubs, chains, leaves and isolated nodes; layout selector, 2D/3D and full screen

On Windows PowerShell the same commands work unchanged.

## Using the viewer on a website

### A. One attribute (no JavaScript to write)

```html
<div data-graphscape data-src="graphs/team.graphml" data-config="graphs/skin.json"
     data-theme="dark" data-dimension="2d" style="height:480px"></div>
<script src="graphscape.standalone.js"></script>
```

`data-src` may be JSON, GraphML, GML, DOT or CSV (detected by extension and content). All paths are relative to the page.

### B. ES module

```ts
import { GraphView, parseGraph, defineConfig } from 'graphscape';

const config = defineConfig({
  theme: 'light',
  links: { baseUrl: 'content/', target: 'panel' },   // node url "ada.html" -> content/ada.html in a side panel
  groups: { colors: { Sales: '#e0b872' } },
});

const view = new GraphView(document.getElementById('graph')!, config);
const text = await (await fetch('graphs/team.graphml')).text();
view.load(parseGraph(text, { filename: 'team.graphml' }).graph);   // runs a layout when nodes have no positions
view.on('nodeclick', ({ node }) => console.log(node.label));
```

The container needs an explicit height. Remember `three` must be installed next to it (peer dependency).

### C. Building a graph in code

```ts
import { Graph, GraphView } from 'graphscape';
const g = new Graph({ directed: true });
const a = g.addNode({ label: 'A', url: 'pages/a.html' });
const b = g.addNode({ label: 'B' });
g.addEdge({ source: a.id, target: b.id, weight: 2.5 });
g.addEdge({ source: b.id, target: b.id, label: 'self loop' });
new GraphView(el, {}, g);            // the view follows every change of `g`
```

### Relative website content

Every node and edge may carry a `url`. Relative paths are the default; absolute `http(s)` and `mailto` links are only
allowed when `links.allowAbsolute` is `true`, and `javascript:`/`data:` URLs are always rejected.

| Option | Meaning |
| --- | --- |
| `interaction.openLinks` | `click`, `dblclick` (default), `ctrl-click` or `never` |
| `links.baseUrl` | Prefix for relative paths, e.g. `content/` |
| `links.target` | `self` (navigate), `blank` (new tab), `panel` (sandboxed iframe inside the view) or `event` |

With `target: "event"` (or `event.handled = true` in a `link` listener) you decide what happens, e.g. load the content into your own element.

## The editor

| Action | How |
| --- | --- |
| Move nodes | drag (several selected nodes move together); hold **X**, **Y** or **Z** while dragging to move only along that axis (two keys: within that plane), release to move freely again |
| Select | click; Shift-click toggles; Shift-drag on the background draws a selection box; Ctrl+A |
| Add node | double-click the background, or tool **Node** (N) and click |
| Add edge | tool **Edge** (E), drag from node to node; release on the same node for a self loop; or select two nodes and press **Connect** |
| Edit | inspector on the right: label (multi-line), subline, group, URL, color, shape, size, pinned, card body; for edges weight, label, URL, color, direction, dashed, width |
| Delete | Del / Backspace |
| Undo / redo | Ctrl+Z / Ctrl+Y |
| 2D / 3D | button in the toolbar, stored per graph (`meta.dimension`); 3D rotation is `orbit` or `free` (Graph panel) |
| Layout | force, tree (clean hierarchy), layered (class diagrams), circle, grid, sphere, random |
| Import | Open..., drag and drop a file onto the canvas, or Samples |
| Export | JSON, GraphML (opens in yEd), GML, DOT, CSV, PNG |
| Skin | theme selector, or edit the configuration JSON in the inspector (nothing selected) |

## Documentation

* [docs/CONFIGURATION.md](docs/CONFIGURATION.md) every configuration option, themes, style rules, CSS variables, events, API
* [docs/FORMATS.md](docs/FORMATS.md) supported file formats and what is preserved
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) code layout, rendering design, performance notes

## Project layout

```
src/core     framework-free model, formats, layouts, geometry, config (unit tested, runs in Node)
src/lib      three.js view, labels, DOM styles, script-tag entry (library)
src/editor   editor application (uses only the public library API)
tests        vitest tests
public       sample graphs (copied into the editor build)
examples     script-tag and ES module examples, skin example
scripts      clean and static serve scripts
```

## Dependencies

| Package | Role | License |
| --- | --- | --- |
| `three` ^0.170 | rendering (runtime, peer dependency of the library, bundled into the standalone build) | MIT |
| `vite` ^5.4 | dev server and bundler (dev only) | MIT |
| `typescript` ^5.6 | type checking and declarations (dev only) | Apache-2.0 |
| `vitest` ^2.1 | unit tests (dev only) | MIT |
| `@types/three` | typings (dev only) | MIT |

There are no other runtime dependencies. XML/GraphML, GML, DOT and CSV parsing are implemented in `src/core/io`.

## Limits and honest notes

* Interactive up to a few thousand nodes and tens of thousands of edges; larger graphs render and zoom well, but animated layouts become slow. Labels switch off above `label.maxCount`.
* In 3D, shapes are real solids (sphere, box, octahedron, prisms); edges and self loops are polylines (loops lie in the XY plane).
* yEd groups are flattened (the group node stays, members get `group`), table nodes, ports and bend points are ignored, edges with arrows on both ends become undirected.
* Edges are hit-tested only up to `interaction.pickLimit` edges.
