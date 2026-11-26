# File formats

`parseGraph(text, options)` detects the format from the file extension and from the content. `serializeGraph(data, format)` writes it.
Both live in `src/core/io` and run in Node and in the browser.

| Format | Extensions | Import | Export | Notes |
| --- | --- | --- | --- | --- |
| Graphscape JSON | `.json` | yes | yes | Native format; also reads D3 node-link (`nodes`/`links`) and Cytoscape.js (`elements`) |
| GraphML (yEd) | `.graphml` `.xml` | yes | yes | yEd shapes, colors, positions, labels, arrows, UML class nodes; export opens in yEd |
| GML | `.gml` | yes | yes | node ids, labels, `graphics` coordinates, `weight`/`value` |
| Graphviz DOT | `.dot` `.gv` | yes | yes | chains, `node`/`edge` defaults, clusters become groups, `record` shapes become cards |
| CSV edge list | `.csv` `.tsv` `.txt` | yes | yes | header `source,target,weight,label,url,directed` or positional columns; a row without target declares an isolated node |

## Native JSON

```json
{
  "format": "graphscape", "version": 1,
  "directed": true,
  "meta": { "title": "My graph", "dimension": "2d" },
  "nodes": [ { "id": "a", "label": "A", "x": 0, "y": 0, "group": "g1", "url": "pages/a.html",
               "color": "#4e79a7", "shape": "circle", "size": 14, "pinned": false, "props": { "year": 1999 } } ],
  "edges": [ { "id": "e1", "source": "a", "target": "a", "weight": 2.5, "label": "loop", "url": "x.html",
               "directed": false, "dashed": true, "width": 3, "color": "#999" } ]
}
```

* Every edge is weighted: a missing `weight` means 1, and weight 1 is never displayed in `weight.show: "auto"`.
* `directed` on the graph is the default; an edge may override it. Multiple edges between the same nodes and self loops are allowed.
* Node `shape`: `circle square rectangle diamond hexagon triangle card`. A `card` shows `label` as title and `body` lines below (`---` is a separator), which is how UML classes are drawn.
* Coordinates are optional. Nodes without them get a start position and the configured layout runs when the graph is loaded.

## yEd GraphML

Read: `y:ShapeNode`, `y:GenericNode`, `y:UMLClassNode` (becomes a `card`, attributes and methods become `body`), `y:GroupNode` (flattened), fill color,
shape, geometry (position and size, scaled by `scale`, default 0.5, y axis flipped), node and edge labels, line style (color, dashed, width),
arrows (a target arrow makes the edge directed, a source arrow swaps the ends, none makes it undirected). Custom data keys (`attr.name`/`attr.type`)
are kept: `url`, `href`, `link`, `label`, `weight`, `color`, `group`, `shape`, `size`, `x`, `y`, `z` map to fields, everything else lands in `props`.
Option `numericLabelsAsWeights: true` turns numeric edge labels into weights.

Write: yEd-compatible graphics so the file opens in yEd with positions, colors, shapes and labels; URLs, weights, groups and props as data keys.
Edge bend points, ports and nested graphs are not written.

## Security

The XML parser ignores DOCTYPE content and never resolves external entities. Imported URLs are filtered again when a link is opened (see README).
All imported text is rendered with `textContent` or on a canvas, never as HTML.
