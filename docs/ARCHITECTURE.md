# Architecture

```
src/core            no DOM, no three.js: runs in Node and is unit tested
  types.ts          NodeData, EdgeData, GraphData
  graph.ts          Graph model with change events (structure | position)
  config.ts         GraphscapeConfig, defaults, themes, mergeConfig, createConfig
  style.ts          resolution: defaults < group palette < rules < element values
  geometry.ts       node bodies, curved multi edges, self loops, clipping, arrow tips
  url.ts            safe resolution of node/edge links
  generate.ts       random clustered graphs for demos and tests
  io/               xml (own parser), builder, json, graphml (yEd), gml, dot, csv, detection
  layout/           force (grid accelerated, 2D+3D), layered, circle, grid, sphere, random
src/lib             browser only
  view.ts           GraphView: scene, cameras, picking, interaction, tooltip, link panel
  labels.ts         canvas textures for labels and cards
  styles.ts         default CSS for the DOM parts (injected once, themable by CSS variables)
  standalone.ts     script-tag entry: window.Graphscape + data-graphscape auto init
src/editor          the editor, written against the public API only
```

## Rendering design

* **Nodes**: one `InstancedMesh` per shape for the body and one for the outline (border, selection, hover). 3D uses spheres.
* **Edges**: `LineSegments2` (fat lines in screen pixels) grouped into buckets by width and dash style, so the number of draw calls is small
  and independent of the edge count. Multi edges are quadratic curves with symmetric offsets, self loops are circles, ends are clipped
  to the node outline and shortened for the arrow head.
* **Arrows**: one `InstancedMesh` of cones.
* **Labels, weights, cards**: canvas textures on sprites, cached by content and style.
* **2D** uses an orthographic camera and ordering by `renderOrder`; **3D** uses a perspective camera, the depth buffer and a head light.
* **Picking** is done in screen space (projected centers and polylines) instead of ray casting, which handles every shape uniformly.
* **Render on demand**: a frame is scheduled only when something changed (graph, selection, camera, running layout).

## Data flow

`Graph` (model) -> `change` event -> `GraphView` marks dirty flags -> one `requestAnimationFrame` rebuilds what is needed:
structure changes rebuild the scene objects, position changes only update matrices and line buffers, selection and hover only update colors.
The editor mutates the `Graph` and listens to `GraphView` events (`selection`, `connect`, `nodedragend`, ...); undo/redo are JSON snapshots.

## Performance notes

* Force layout repulsion uses a spatial hash with a cutoff above 400 nodes, so thousands of nodes stay interactive.
* Position updates rebuild the line buffers of all edges. This is the main cost during animated layouts with very many edges.
* Raise `label.resolution` for crisper text (more texture memory), lower `render.pixelRatio` for weak GPUs.
