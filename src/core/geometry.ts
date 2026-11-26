import type { NodeShape, Vec3 } from './types';

/** Collision body of a node used for edge clipping and picking. */
export interface Body {
  pos: Vec3;
  /** Half width / half height (in 3D both equal the sphere radius). */
  hw: number;
  hh: number;
  ellipse: boolean;
}

export function isEllipseShape(shape: NodeShape): boolean {
  return shape === 'circle' || shape === 'diamond' || shape === 'hexagon' || shape === 'triangle';
}

export function nodeExtents(shape: NodeShape, size: number, aspect: number, dim3: boolean): { hw: number; hh: number } {
  void dim3; // 3D uses real solids with the same footprint as the 2D shapes
  const hh = size / 2;
  return { hw: shape === 'rectangle' ? hh * aspect : hh, hh };
}

export function inside(p: Vec3, b: Body, dim3: boolean): boolean {
  const dx = p[0] - b.pos[0];
  const dy = p[1] - b.pos[1];
  if (dim3) {
    const dz = p[2] - b.pos[2];
    return dx * dx + dy * dy + dz * dz < b.hw * b.hw;
  }
  if (b.ellipse) return (dx * dx) / (b.hw * b.hw) + (dy * dy) / (b.hh * b.hh) < 1;
  return Math.abs(dx) < b.hw && Math.abs(dy) < b.hh;
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function quadratic(a: Vec3, c: Vec3, b: Vec3, segments: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
      u * u * a[2] + 2 * u * t * c[2] + t * t * b[2],
    ]);
  }
  return out;
}

/** Unit vector perpendicular to (dx,dy,dz). In the XY plane this is the in-plane normal. */
export function normalTo(dx: number, dy: number, dz: number): Vec3 {
  let n: Vec3 = [dy, -dx, 0];
  let len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-9) {
    n = [-dz, 0, dx];
    len = Math.hypot(n[0], n[1], n[2]);
  }
  if (len < 1e-9) return [0, 1, 0];
  return [n[0] / len, n[1] / len, n[2] / len];
}

export interface PathOptions {
  /** Distance between parallel (multi) edges, in world units. */
  spacing: number;
  segments: number;
  dim3: boolean;
  /** Radius factor of self loops relative to the node size. */
  loopScale: number;
}

function loopPoints(b: Body, index: number, o: PathOptions): Vec3[] {
  const base = Math.max(b.hw, b.hh);
  const rr = base * o.loopScale * (1 + 0.5 * index);
  const ang = index * (Math.PI / 3);
  const d = base + rr * 0.35;
  const cx = b.pos[0] - Math.sin(ang) * d;
  const cy = b.pos[1] + Math.cos(ang) * d;
  const phi0 = ang - Math.PI / 2;
  const delta = 0.35;
  const n = Math.max(12, o.segments * 2);
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const phi = phi0 + delta + (i / n) * (2 * Math.PI - 2 * delta);
    pts.push([cx + rr * Math.cos(phi), cy + rr * Math.sin(phi), b.pos[2]]);
  }
  return pts;
}

/** Removes the leading part of a polyline that lies inside `body` and cuts at the boundary. */
export function trimStart(pts: Vec3[], body: Body, dim3: boolean): Vec3[] {
  let i = 0;
  while (i < pts.length && inside(pts[i], body, dim3)) i++;
  if (i === 0 || i >= pts.length) return pts;
  let lo = pts[i - 1];
  let hi = pts[i];
  for (let k = 0; k < 18; k++) {
    const mid = lerp3(lo, hi, 0.5);
    if (inside(mid, body, dim3)) lo = mid;
    else hi = mid;
  }
  return [hi, ...pts.slice(i)];
}

export function trimEnd(pts: Vec3[], body: Body, dim3: boolean): Vec3[] {
  return trimStart([...pts].reverse(), body, dim3).reverse();
}

/**
 * Polyline of an edge, clipped to the node boundaries.
 * @param index position of the edge within its group of parallel edges (self loops: index among loops)
 * @param count size of that group
 * @param flip true when the edge runs against the canonical (sorted id) direction of its group
 */
export function edgePath(a: Body, b: Body, index: number, count: number, flip: boolean, self: boolean, o: PathOptions): Vec3[] {
  let pts: Vec3[];
  if (self) {
    pts = loopPoints(a, index, o);
  } else {
    const k = (index - (count - 1) / 2) * o.spacing * (flip ? -1 : 1);
    if (Math.abs(k) < 1e-6) pts = [a.pos, b.pos];
    else {
      const dx = b.pos[0] - a.pos[0];
      const dy = b.pos[1] - a.pos[1];
      const dz = o.dim3 ? b.pos[2] - a.pos[2] : 0;
      const n = normalTo(dx, dy, dz);
      const mid: Vec3 = [(a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2, (a.pos[2] + b.pos[2]) / 2];
      const c: Vec3 = [mid[0] + n[0] * 2 * k, mid[1] + n[1] * 2 * k, mid[2] + n[2] * 2 * k];
      pts = quadratic(a.pos, c, b.pos, o.segments);
    }
  }
  pts = trimStart(pts, a, o.dim3);
  pts = trimEnd(pts, b, o.dim3);
  return pts;
}

export function pathLength(pts: Vec3[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist3(pts[i - 1], pts[i]);
  return l;
}

/** Cuts `amount` off the end of a polyline (used to stop lines at the arrow head). */
export function shortenEnd(pts: Vec3[], amount: number): Vec3[] {
  if (pts.length < 2 || pathLength(pts) <= amount * 1.2) return pts;
  const out = pts.slice();
  let remaining = amount;
  while (out.length >= 2) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    const d = dist3(a, b);
    if (d > remaining + 1e-9) {
      out[out.length - 1] = lerp3(a, b, (d - remaining) / d);
      return out;
    }
    remaining -= d;
    out.pop();
  }
  return pts;
}

export function pointAtFraction(pts: Vec3[], f: number): Vec3 {
  const total = pathLength(pts);
  if (total === 0) return pts[0];
  let want = total * f;
  for (let i = 1; i < pts.length; i++) {
    const d = dist3(pts[i - 1], pts[i]);
    if (want <= d) return lerp3(pts[i - 1], pts[i], d === 0 ? 0 : want / d);
    want -= d;
  }
  return pts[pts.length - 1];
}

/** Position and unit direction of the end of a polyline. */
export function tipOf(pts: Vec3[]): { tip: Vec3; dir: Vec3 } {
  const tip = pts[pts.length - 1];
  let i = pts.length - 2;
  while (i > 0 && dist3(pts[i], tip) < 1e-6) i--;
  const p = pts[Math.max(0, i)];
  const d = dist3(p, tip) || 1;
  return { tip, dir: [(tip[0] - p[0]) / d, (tip[1] - p[1]) / d, (tip[2] - p[2]) / d] };
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
