# Configuration and skinning

Every visual and behavioral aspect is controlled by one configuration object. Pass a **partial** object; everything you leave out falls back to
`defaults < theme < your values` (deep merge: objects merge, arrays and scalars replace).

```ts
import { GraphView, defineConfig, registerTheme } from 'graphscape';

registerTheme('parchment', { background: { color: '#efe3c8' }, node: { color: '#8c5a2b' } });   // optional own theme
const view = new GraphView(el, defineConfig({ theme: 'parchment', edge: { width: 2 } }));
view.setConfig({ label: { show: false } });   // patch at runtime; view.getUserConfig() returns what you would save
```

The same object can live in a JSON file (`data-config="skin.json"`, or load it and pass it in). Function matchers in `rules` need JavaScript.
The editor shows the active configuration under *Graph* (nothing selected) and can apply, download and load it.

Built-in themes: `light` (default), `dark`, `blueprint`. Select with `theme`.

## Reference

### General
| Key | Default | Meaning |
| --- | --- | --- |
| `theme` | `"light"` | name of a registered theme |
| `dimension` | `"2d"` | `"2d"` or `"3d"`; a loaded graph's `meta.dimension` takes precedence |
| `background.color` / `gradientTo` / `transparent` | `#f7f8fa` / `null` / `false` | solid color, optional vertical gradient, or see-through canvas |
| `render.antialias` / `pixelRatio` | `true` / `null` | `null` = device pixel ratio, max 2 |

### Nodes
`node` holds the defaults; single nodes can override with their own `color`, `shape`, `size`.
| Key | Default | Meaning |
| --- | --- | --- |
| `node.color` | `#4e79a7` | fill, used when a node has no group color |
| `node.shape` | `circle` | `circle square rectangle diamond hexagon triangle card`. In 2D these are flat polygons, in 3D real solids (sphere, box, octahedron, hexagonal and triangular prism); `card` is a sprite in both |
| `node.size` | `14` | diameter in world units |
| `node.aspect` | `1.6` | width / height of `rectangle` |
| `node.borderColor` / `borderWidth` | `#2b3a4a` / `1` | outline |
| `node.opacity` | `1` | global node and outline opacity |
| `node.labelColor` | `#1f2933` | label text color |

### Groups and rules
```jsonc
"groups": { "palette": ["#4e79a7", "#f28e2b"], "colors": { "Sales": "#e0b872" } }
```
Nodes with a `group` get `groups.colors[group]` or the palette color by order of first appearance.

```jsonc
"rules": [
  { "target": "node", "match": { "group": "Design" }, "style": { "shape": "diamond", "size": 18 } },
  { "target": "node", "match": { "tag": "group" },   "style": { "shape": "square" } },
  { "target": "edge", "match": { "prop": ["kind", "mentor"] }, "style": { "dashed": true, "color": "#ffd166" } }
]
```
Matchers: `id`, `group`, `tag`, `prop: [key, value]` (all given keys must match), or in JavaScript `(item) => boolean`.
Style keys: node `color shape size borderColor borderWidth labelColor`, edge `color width dashed`.
Precedence: defaults < group color < rules in order < values stored on the node/edge itself.

### Edges
| Key | Default | Meaning |
| --- | --- | --- |
| `edge.color` / `width` / `dashed` | `#8b95a1` / `1.5` / `false` | width in CSS pixels |
| `edge.opacity` | `0.9` | |
| `edge.arrows` / `arrowSize` | `true` / `7` | arrow heads on directed edges, size in world units |
| `edge.curveSpacing` | `16` | distance between parallel edges of the same node pair |
| `edge.loopSize` | `0.9` | self loop radius relative to node size |
| `edge.dashSize` / `gapSize` | `5` / `3` | |
| `edge.widthByWeight` | `{ enabled: false, min: 1, max: 6 }` | map the weight range of the graph to line widths |

### Weights
`weight.show`: `"auto"` (default, shows weights other than 1), `"always"`, `"never"`. Also `font size color background padding decimals maxCount`.
The edge label is shown together with the weight, e.g. `mentor (2.5)`.

### Labels and cards
| Key | Default | Meaning |
| --- | --- | --- |
| `label.show` | `true` | |
| `label.subSize` / `subColor` | `4.6` / `#5f6b76` | size and color of a node's `sublabel` (second line) |
| `label.font` / `size` / `color` / `background` | system-ui / `6` / `#1f2933` / `null` | size in world units (`screen` mode: CSS pixels) |
| `label.mode` | `"world"` | `world`: scales with zoom, `screen`: constant pixel size |
| `label.maxCount` | `1500` | labels are skipped above this node count (tooltips still work) |
| `label.maxChars`, `gap`, `padding`, `resolution` | `40, 1.5, 1, 4` | truncation per line, distance below node, texture sharpness |

Labels may contain line breaks (`\n`), and a node can carry a `sublabel` that is drawn smaller below the label. In 3D the label is always placed in front of its own node, as seen from the camera.
| `card.*` | | `background border headerBackground headerColor textColor font size padding` for `card` nodes (UML classes) |

### Selection
`selection.color`, `selection.hoverColor`, `selection.width` (outline width in world units).

### Transform gizmo
`interaction.gizmo: true` shows, for the selected nodes, a gizmo at the center of the selection (not at the world origin):

| Mode | Handles | Effect |
| --- | --- | --- |
| `translate` | X, Y, Z arrows and the XY, YZ, XZ plane handles | moves all selected nodes together |
| `rotate` | rings around X, Y and Z (2D: only the Z ring) plus an outer view ring | rotates the positions of the selected nodes around the center |
| `scale` | per-axis handles and a uniform center handle | spreads or compresses the selected nodes around the center |

Rotate and scale need two or more selected nodes, because a single node has no orientation or extent of its own. Free dragging of a node and the X/Y/Z lock keys keep working.
`view.setGizmoMode('translate' | 'rotate' | 'scale')`, event `gizmomode`. Hold **Ctrl** (or Cmd) while dragging to snap.
`gizmo.size` (0.9), `gizmo.space` (`world` or `local`), `gizmo.snapTranslate` (10 world units), `gizmo.snapRotate` (15 degrees), `gizmo.snapScale` (0.1).

### Camera and layout
| Key | Default | Meaning |
| --- | --- | --- |
| `camera.fov` | `50` | 3D field of view |
| `camera.zoomMin` / `zoomMax` | `0.02` / `60` | 2D zoom limits |
| `camera.fitPadding` | `1.25` | margin when fitting |
| `camera.autoFit` | `true` | fit on load and after a layout |
| `camera.damping` | `false` | smooth camera motion (orbit mode) |
| `camera.rotation` | `orbit` | 3D only. `orbit` keeps the horizon level and stops the tilt at the poles (OrbitControls). `free` is a trackball with unlimited rotation around every axis (TrackballControls); the horizon is not kept level and zoom goes to the view center |
| `layout.name` | `force` | `force tree layered circle grid sphere random` |
| `layout.idealLength` | `60` | spring length of the force layout |
| `layout.spacing` | `40` | minimum node distance when node boxes are unknown |
| `layout.gap` | `14` | free space kept between node boxes (node + label) by `tree`, `layered`, `circle`, `grid`, `sphere` |
| `layout.weightMode` | `ignore` | `strength`: heavier edges pull stronger |
| `layout.gravity`, `direction`, `seed` | `0.05`, `TB`, `1` | `direction` is `TB` or `LR` for `layered` |
| `layout.autoRun` | `true` | run the layout when loaded nodes have no coordinates |

### Interaction and links
| Key | Default | Meaning |
| --- | --- | --- |
| `interaction.dragNodes` / `select` / `multiSelect` / `hover` / `tooltip` | all `true` | switch features off for a read-only embed |
| `interaction.gizmo` | `false` | click a node to get a transform gizmo at the center of the selection (see below); the editor turns it on |
| `interaction.axisLock` | `true` | hold **X**, **Y** or **Z** while dragging nodes to move them along that axis only (a colored guide line shows it); two keys give a plane; Z exists only in 3D |
| `interaction.openLinks` | `dblclick` | `click`, `dblclick`, `ctrl-click`, `never` |
| `interaction.pickLimit` | `20000` | edge hit testing is skipped above this edge count |
| `links.baseUrl` | `""` | prefix for relative node/edge URLs |
| `links.target` | `self` | `self`, `blank`, `panel`, `event` |
| `links.allowAbsolute` | `false` | allow `http(s)` and `mailto` URLs |
| `links.panelSandbox` | `allow-same-origin allow-scripts allow-popups allow-forms` | iframe sandbox of the panel |

### DOM parts (tooltip, buttons, panel)
| Key | Meaning |
| --- | --- |
| `ui.controls` | zoom, fit and 2D/3D buttons (default `true`) |
| `ui.fullscreen` | adds a Full / Exit button (default `false`); `view.toggleFullscreen()` does the same from code |
| `ui.injectStyles` | inject the default CSS once; set `false` to ship your own, `defaultCss` exports the text |
| `ui.cssVars` | map of CSS custom properties set on the view as `--gs-<name>`: `font`, `panel-bg`, `panel-fg`, `panel-border`, `accent`, `radius` |

All DOM parts use the classes `gs-root gs-tooltip gs-controls gs-btn gs-panel gs-box`, so a site stylesheet can restyle them directly.

## Runtime API

```ts
const view = new GraphView(container, config?, graph?);
view.load(graphOrData); view.refresh();
view.setConfig(patch); view.getConfig(); view.getUserConfig();
view.setDimension('3d'); view.getDimension(); view.isFlat();
view.runLayout('force' | 'layered' | ..., options?): Promise<void>; view.stopLayout();
view.fit(); view.zoomBy(1.4); view.resize();
view.toggleFullscreen(force?): Promise<void>; view.isFullscreen;
view.getSelection(); view.setSelection({ nodes, edges }); view.selectAll(); view.clearSelection();
view.setTool('select' | 'connect');
view.setGizmoMode('translate' | 'rotate' | 'scale'); view.getGizmoMode();
view.openLink('node' | 'edge', id); view.closePanel();
view.getNodeStyle(id); view.getEdgeStyle(id);
view.exportImage('image/png'); view.destroy();
view.graph   // the Graph model: addNode, updateNode, removeNode, addEdge, updateEdge, removeEdge, setPositions, toData, load
```

Events (`view.on(name, fn)` returns an unsubscribe function):
`nodeclick nodedblclick edgeclick backgroundclick backgrounddblclick selection hover nodedragstart nodedragend connect link layoutstart layoutend dimensionchange fullscreenchange gizmomode`. `nodedragstart`/`nodedragend` are also fired by the gizmo.
`link` fires before a link opens; set `event.handled = true` to open it yourself.

Pure functions usable without a view (also in Node): `parseGraph`, `serializeGraph`, `detectFormat`, `computeLayout`, `generateClustered`, `resolveUrl`.

## Layouts

| Name | Use for |
| --- | --- |
| `force` | general networks; animated, spaces nodes by connectivity |
| `tree` | clean hierarchy: parents centered over their children, no overlaps; roots are nodes without incoming edges (undirected graphs: best connected node). `layout.direction` `TB` or `LR` |
| `layered` | DAG-like graphs with many cross links (class diagrams), minimizes crossings by layer ordering |
| `circle`, `grid`, `sphere`, `random` | quick overviews; spacing follows the real node and label sizes plus `layout.gap` |

The placement layouts size every node as body + label + sublabel (or the whole card), so labels do not collide.

## Recipes

* **Read-only embed**: `interaction: { dragNodes: false, select: false, tooltip: true }`, `ui: { controls: false }`.
* **Class diagrams**: import a yEd file with UML nodes, then `runLayout('layered')`; directed edges show arrows.
* **Social network**: `edge.widthByWeight.enabled = true`, `groups.colors` per community, `label.mode: "screen"`.
* **Evolution tree**: directed graph, `layout.name: "tree"`, `layout.direction: "LR"`, `weight.show: "always"` for time spans.
* **Match the site**: set `background.transparent: true` and `ui.cssVars` to the site's font and colors.
