import type { LayoutName } from '../config';
import type { Graph } from '../graph';
import { mulberry32 } from '../random';
import type { Dimension, Vec3 } from '../types';
import { nodeBoxes, estimateTextBox, type Box } from './boxes';
import { ForceSimulation } from './force';
import { layeredLayout } from './layered';
import { circleLayout, gridLayout, randomLayout, sphereLayout } from './simple';
import { treeLayout } from './tree';

export { ForceSimulation, layeredLayout, treeLayout, circleLayout, gridLayout, sphereLayout, randomLayout, nodeBoxes, estimateTextBox };
export type { ForceOptions } from './force';
export type { Box, PlaceOptions } from './boxes';

export interface LayoutOptions {
  dimension: Dimension;
  /** Distance between nodes when no boxes are given, minimum otherwise. */
  spacing: number;
  /** Free space between node boxes in the placement layouts. */
  gap: number;
  /** Node footprints (body + label); see `nodeBoxes`. Without them nodes are treated as `spacing` x `spacing` squares. */
  boxes?: Map<string, Box>;
  /** Spring length of the force layout. */
  idealLength: number;
  gravity: number;
  weightMode: 'ignore' | 'strength';
  direction: 'TB' | 'LR';
  seed: number;
  /** Maximum iterations of the synchronous force layout. */
  iterations: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  dimension: '2d', spacing: 40, gap: 12, idealLength: 60, gravity: 0.05, weightMode: 'ignore', direction: 'TB', seed: 1, iterations: 300,
};

export const LAYOUT_NAMES: LayoutName[] = ['force', 'tree', 'layered', 'circle', 'grid', 'sphere', 'random'];

/** Computes positions without touching the graph. `force` runs synchronously to completion. */
export function computeLayout(graph: Graph, name: LayoutName, options: Partial<LayoutOptions> = {}): Map<string, Vec3> {
  const o = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  const place = { spacing: o.spacing, gap: o.gap, boxes: o.boxes, dim3: o.dimension === '3d', seed: o.seed };
  switch (name) {
    case 'circle': return circleLayout(graph, place);
    case 'grid': return gridLayout(graph, place);
    case 'sphere': return sphereLayout(graph, place);
    case 'random': return randomLayout(graph, place);
    case 'layered': return layeredLayout(graph, { ...place, direction: o.direction });
    case 'tree': return treeLayout(graph, { ...place, direction: o.direction });
    case 'force': {
      const sim = new ForceSimulation(graph, o);
      for (let i = 0; i < o.iterations && sim.alpha > 0.02; i++) sim.step();
      return new Map(sim.entries());
    }
  }
}

/**
 * Gives nodes without coordinates a start position: next to an already positioned neighbour,
 * otherwise random inside the occupied area. Returns how many nodes were placed. Emits no event.
 */
export function placeNewNodes(graph: Graph, dimension: Dimension, idealLength: number, seed: number): number {
  const rnd = mulberry32(seed);
  const dim3 = dimension === '3d';
  const has = (n: { x?: number; y?: number }): boolean => n.x !== undefined && n.y !== undefined;
  const radius = idealLength * Math.sqrt(Math.max(graph.nodes.length, 1)) * 0.6 + idealLength;
  let placed = 0;
  for (const n of graph.nodes) {
    if (has(n)) {
      if (n.z === undefined) n.z = 0;
      continue;
    }
    let base: { x: number; y: number; z: number } | undefined;
    for (const e of graph.edges) {
      const other = e.source === n.id ? graph.getNode(e.target) : e.target === n.id ? graph.getNode(e.source) : undefined;
      if (other && other !== n && has(other)) {
        base = { x: other.x!, y: other.y!, z: other.z ?? 0 };
        break;
      }
    }
    const spread = base ? idealLength * 0.6 : radius;
    n.x = (base?.x ?? 0) + (rnd() * 2 - 1) * spread;
    n.y = (base?.y ?? 0) + (rnd() * 2 - 1) * spread;
    n.z = dim3 ? (base?.z ?? 0) + (rnd() * 2 - 1) * spread : base?.z ?? 0;
    placed++;
  }
  return placed;
}
