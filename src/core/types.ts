/** Spatial mode of a graph view. */
export type Dimension = '2d' | '3d';
export type Vec3 = [number, number, number];

export type NodeShape = 'circle' | 'square' | 'rectangle' | 'diamond' | 'hexagon' | 'triangle' | 'card';
export const NODE_SHAPES: readonly NodeShape[] = ['circle', 'square', 'rectangle', 'diamond', 'hexagon', 'triangle', 'card'];

export type PropValue = string | number | boolean;

/** Node fields the search looks at. */
export type SearchField = 'label' | 'sublabel' | 'id' | 'group' | 'tags' | 'url' | 'props';

/** Weight used when an edge has none. Edges with this weight never display a weight label in `auto` mode. */
export const DEFAULT_WEIGHT = 1;

export interface NodeData {
  id: string;
  label?: string;
  /** Smaller second line below the label. Labels themselves may contain line breaks (\n). */
  sublabel?: string;
  x?: number;
  y?: number;
  z?: number;
  group?: string;
  tags?: string[];
  /** Optional website content. Relative paths are resolved against `links.baseUrl` / the page. */
  url?: string;
  color?: string;
  shape?: NodeShape;
  size?: number;
  /** Body lines of a `card` node (UML class diagrams). A line `---` draws a separator. */
  body?: string[];
  /** Pinned nodes are not moved by force layouts. */
  pinned?: boolean;
  props?: Record<string, PropValue>;
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
  /** Technically every edge is weighted; the default weight is 1 and is not displayed. */
  weight?: number;
  /** Overrides the graph-wide `directed` default for this edge. */
  directed?: boolean;
  label?: string;
  url?: string;
  color?: string;
  width?: number;
  dashed?: boolean;
  group?: string;
  props?: Record<string, PropValue>;
}

export interface GraphMeta {
  title?: string;
  description?: string;
  dimension?: Dimension;
}

export interface GraphData {
  /** Default direction of edges (individual edges may override). */
  directed: boolean;
  nodes: NodeData[];
  edges: EdgeData[];
  meta?: GraphMeta;
}

export interface ImportResult {
  graph: GraphData;
  warnings: string[];
  format: string;
}
