import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  DEFAULT_LAYOUT_OPTIONS, Emitter, ForceSimulation, Graph, buildGroupIndex, computeLayout, createConfig, geometry, mergeConfig,
  placeNewNodes, resolveEdgeStyle, resolveNodeStyle, resolveUrl,
} from '../core/index';
import type {
  ChangeKind, DeepPartial, Dimension, EdgeData, EdgeStyle, GraphData, GraphscapeConfig, LayoutName, LayoutOptions, NodeData, NodeStyle, Vec3,
} from '../core/index';
import { TextureCache, type TextImage } from './labels';
import { injectStyles } from './styles';

type Body = geometry.Body;

/** What the view needs from OrbitControls (2D, 3D orbit) and TrackballControls (3D free rotation). */
interface CamControls {
  enabled: boolean;
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
  update(): unknown;
}

export type Tool = 'select' | 'connect';
export interface Selection {
  nodes: string[];
  edges: string[];
}

export interface ViewEvents {
  nodeclick: { id: string; node: NodeData; originalEvent: PointerEvent };
  nodedblclick: { id: string; node: NodeData; originalEvent: MouseEvent };
  edgeclick: { id: string; edge: EdgeData; originalEvent: PointerEvent };
  /** `position` is the world position under the pointer (z = 0 in 2D). */
  backgroundclick: { position: Vec3; originalEvent: PointerEvent };
  backgrounddblclick: { position: Vec3; originalEvent: MouseEvent };
  selection: Selection;
  hover: { kind: 'node' | 'edge' | null; id: string | null };
  nodedragstart: { ids: string[] };
  nodedragend: { ids: string[] };
  /** Fired in the `connect` tool when a drag from one node is released over another (or the same) node. */
  connect: { source: string; target: string };
  /** Fired before a link is opened. Set `handled = true` to take over (or use `links.target: "event"`). */
  link: { url: string; resolved: string; kind: 'node' | 'edge'; id: string; handled: boolean };
  layoutstart: { name: LayoutName };
  layoutend: { name: LayoutName; completed: boolean };
  dimensionchange: { dimension: Dimension };
}

interface Layer {
  key: string;
  body: THREE.InstancedMesh;
  outline: THREE.InstancedMesh;
}

interface NodeInfo {
  node: NodeData;
  style: NodeStyle;
  body: Body;
  layerKey: string | null;
  layer: Layer | null;
  slot: number;
  card?: TextImage;
  sprite?: THREE.Sprite;
}

interface EdgeInfo {
  edge: EdgeData;
  style: EdgeStyle;
  weight: number;
  directed: boolean;
  index: number;
  count: number;
  flip: boolean;
  self: boolean;
  path: Vec3[];
  arrowSlot: number;
  tip?: { tip: Vec3; dir: Vec3 };
  bucketKey: string;
  sprite?: THREE.Sprite;
  img?: TextImage;
}

interface Bucket {
  key: string;
  mesh: LineSegments2;
  edges: EdgeInfo[];
  dashed: boolean;
}

type Hit = { kind: 'node' | 'edge'; id: string } | { kind: null; id: null };

type Drag =
  | { type: 'nodes'; ids: string[]; primary: string; offsets: Map<string, Vec3>; starts: Map<string, Vec3>; anchor: Vec3; px: number; py: number; moved: boolean }
  | { type: 'connect'; from: string }
  | { type: 'box'; x0: number; y0: number };

const ORTHO_HEIGHT = 400;
const X_AXIS = new THREE.Vector3(1, 0, 0);
type Axis = 'x' | 'y' | 'z';
const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };
const AXIS_COLOR: Record<Axis, string> = { x: '#e03131', y: '#2f9e44', z: '#1c7ed6' };
const IDENTITY_Q = new THREE.Quaternion();
const DRAG_THRESHOLD = 4;

/**
 * Interactive three.js graph view (2D orthographic or 3D perspective).
 * Create it with a container element that has a size, then `load()` a graph.
 */
export class GraphView {
  readonly events = new Emitter<ViewEvents>();
  config: GraphscapeConfig;

  private _graph: Graph;
  private userConfig: DeepPartial<GraphscapeConfig>;
  private container: HTMLElement;
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private persp: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private controls!: CamControls;
  private orbit: OrbitControls | null = null;
  private disposeControls: () => void = () => {};
  private pointerIsDown = false;
  private activeUntil = 0;
  private ambient = new THREE.AmbientLight(0xffffff, 1.8);
  private headlight = new THREE.DirectionalLight(0xffffff, 1.6);
  private tex: TextureCache;
  private width = 1;
  private height = 1;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private disposed = false;
  private unsubGraph: () => void = () => {};

  private nodeInfo = new Map<string, NodeInfo>();
  private edgeInfo = new Map<string, EdgeInfo>();
  private layers = new Map<string, Layer>();
  private buckets: Bucket[] = [];
  private arrowMesh: THREE.InstancedMesh | null = null;
  private geoms = new Map<string, THREE.BufferGeometry>();
  private colors = new Map<string, THREE.Color>();

  private selNodes = new Set<string>();
  private selEdges = new Set<string>();
  private hoverNode: string | null = null;
  private hoverEdge: string | null = null;
  private tool: Tool = 'select';

  private dirtyStructure = true;
  private dirtyPositions = false;
  private dirtyNodes = false;
  private dirtyEdges = false;
  private dirtyLabels = false;
  private pendingFit = true;
  private pendingLayout = false;

  private sim: ForceSimulation | null = null;
  private simResolve: (() => void) | null = null;
  private dragIds: string[] = [];

  private drag: Drag | null = null;
  private down: { x: number; y: number; hit: Hit; additive: boolean; wasSelected: boolean; moved: boolean; button: number } | null = null;
  private lastPointer = { x: 0, y: 0 };
  private hoverRaf = 0;
  private rubber: THREE.Line | null = null;
  private guide: THREE.Line | null = null;
  private axisKeys = new Set<Axis>();
  private appliedVars: string[] = [];

  private tooltipEl: HTMLDivElement;
  private boxEl: HTMLDivElement;
  private controlsEl: HTMLDivElement | null = null;
  private dimButton: HTMLButtonElement | null = null;
  private panelEl: HTMLDivElement | null = null;

  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane();

  constructor(container: HTMLElement, config: DeepPartial<GraphscapeConfig> = {}, graph?: Graph | Partial<GraphData>) {
    this.container = container;
    this.userConfig = config;
    this.config = createConfig(config);
    this._graph = graph instanceof Graph ? graph : new Graph(graph);
    if (this.config.ui.injectStyles) injectStyles();
    container.classList.add('gs-container');
    this.root = document.createElement('div');
    this.root.className = 'gs-root';
    container.appendChild(this.root);

    this.renderer = new THREE.WebGLRenderer({ antialias: this.config.render.antialias, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.root.appendChild(this.canvas);
    this.tex = new TextureCache(this.config.label.resolution);

    this.persp = new THREE.PerspectiveCamera(this.config.camera.fov, 1, 1, 100000);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    this.camera = this.config.dimension === '3d' ? this.persp : this.ortho;
    this.scene.add(this.ambient, this.headlight, this.headlight.target);

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'gs-tooltip gs-ui';
    this.tooltipEl.hidden = true;
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'gs-box';
    this.boxEl.hidden = true;
    this.root.append(this.tooltipEl, this.boxEl);

    this.setupCamera();
    this.buildControls();
    this.applyAppearance();

    this.root.addEventListener('pointerdown', this.onPointerDown, true);
    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerup', this.onPointerUp);
    this.root.addEventListener('pointercancel', this.onPointerUp);
    this.root.addEventListener('pointerleave', this.onPointerLeave);
    this.root.addEventListener('dblclick', this.onDblClick);
    this.root.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(container);
    }
    this.subscribe();
    this.resize();
    this.afterLoad();
  }

  // ------------------------------------------------------------------ public API

  get graph(): Graph {
    return this._graph;
  }

  on<K extends keyof ViewEvents>(type: K, fn: (payload: ViewEvents[K]) => void): () => void {
    return this.events.on(type, fn);
  }

  /** Replaces the content with a graph (or graph data). The view adopts `meta.dimension` when present. */
  load(data: Graph | Partial<GraphData>): void {
    this.stopLayout();
    this.unsubGraph();
    if (data instanceof Graph) this._graph = data;
    else this._graph.load(data, false);
    this.subscribe();
    this.selNodes.clear();
    this.selEdges.clear();
    this.hoverNode = this.hoverEdge = null;
    const dim = this._graph.meta.dimension;
    if (dim && dim !== this.config.dimension) this.setDimension(dim);
    this.afterLoad();
  }

  /** Forces a full rebuild (e.g. after changing node data without going through the Graph API). */
  refresh(): void {
    this.dirtyStructure = true;
    this.requestRender();
  }

  getConfig(): GraphscapeConfig {
    return this.config;
  }

  /** The partial config that was passed in / patched so far (what you would save as a config file). */
  getUserConfig(): DeepPartial<GraphscapeConfig> {
    return this.userConfig;
  }

  /** Deep-merges a patch into the user config and re-applies everything (theme, colors, labels, ...). */
  setConfig(patch: DeepPartial<GraphscapeConfig>): void {
    const { dimension, ...rest } = patch;
    const prevRotation = this.config.camera.rotation;
    this.userConfig = mergeConfig(this.userConfig, rest);
    this.config = createConfig(this.userConfig);
    this.tex.resolution = this.config.label.resolution;
    this.tex.clear();
    this.persp.fov = this.config.camera.fov;
    this.persp.updateProjectionMatrix();
    if (this.config.dimension === '3d' && this.config.camera.rotation !== prevRotation) this.setupCamera(true);
    if (this.orbit) this.orbit.enableDamping = this.config.camera.damping;
    this.applyControlLimits();
    this.applyAppearance();
    this.dirtyStructure = true;
    this.requestRender();
    if (dimension !== undefined) this.setDimension(dimension);
  }

  getDimension(): Dimension {
    return this.config.dimension;
  }

  setDimension(dimension: Dimension): void {
    if (dimension === this.config.dimension) return;
    this.stopLayout();
    this.userConfig = mergeConfig(this.userConfig, { dimension });
    this.config = createConfig(this.userConfig);
    this.camera = dimension === '3d' ? this.persp : this.ortho;
    this.setupCamera();
    this.resize();
    this.dirtyStructure = true;
    this.pendingFit = this.config.camera.autoFit;
    if (this.dimButton) this.dimButton.textContent = dimension === '2d' ? '3D' : '2D';
    this.events.emit('dimensionchange', { dimension });
    this.requestRender();
  }

  /** True when all nodes lie in one plane (z = 0), e.g. right after switching a 2D graph to 3D. */
  isFlat(): boolean {
    return this._graph.nodes.every((n) => !n.z);
  }

  /**
   * Runs a layout. `force` is animated and resolves when the simulation has settled; the other layouts
   * apply immediately. Pinned nodes stay in place.
   */
  runLayout(name: LayoutName = this.config.layout.name, options: Partial<LayoutOptions> = {}): Promise<void> {
    this.stopLayout();
    const g = this._graph;
    if (g.nodes.length === 0) return Promise.resolve();
    const cfg = this.config;
    placeNewNodes(g, cfg.dimension, cfg.layout.idealLength, cfg.layout.seed);
    const lo: LayoutOptions = {
      ...DEFAULT_LAYOUT_OPTIONS,
      dimension: cfg.dimension,
      spacing: cfg.layout.spacing,
      idealLength: cfg.layout.idealLength,
      gravity: cfg.layout.gravity,
      weightMode: cfg.layout.weightMode,
      direction: cfg.layout.direction,
      seed: cfg.layout.seed,
      ...options,
    };
    this.events.emit('layoutstart', { name });
    if (name === 'force') {
      this.sim = new ForceSimulation(g, lo);
      this.simName = name;
      this.requestRender();
      return new Promise<void>((resolve) => {
        this.simResolve = resolve;
      });
    }
    const pos = computeLayout(g, name, lo);
    g.setPositions([...pos].filter(([id]) => !g.getNode(id)?.pinned));
    if (cfg.camera.autoFit) this.pendingFit = true;
    this.events.emit('layoutend', { name, completed: true });
    this.requestRender();
    return Promise.resolve();
  }

  private simName: LayoutName = 'force';

  stopLayout(completed = false): void {
    if (!this.sim) return;
    this.sim = null;
    const resolve = this.simResolve;
    this.simResolve = null;
    if (completed && this.config.camera.autoFit) this.pendingFit = true;
    this.events.emit('layoutend', { name: this.simName, completed });
    resolve?.();
    this.requestRender();
  }

  get isLayoutRunning(): boolean {
    return this.sim !== null;
  }

  /** Frames the whole graph. */
  fit(): void {
    const infos = [...this.nodeInfo.values()];
    const cam = this.camera;
    const dim3 = this.config.dimension === '3d';
    if (infos.length === 0) {
      this.controls.target.set(0, 0, 0);
      if (!dim3) {
        this.ortho.zoom = 1;
        this.ortho.position.set(0, 0, 1000);
      } else this.persp.position.set(0, 0, 300);
      this.ortho.updateProjectionMatrix();
      this.controls.update();
      this.requestRender();
      return;
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const i of infos) {
      const [x, y, z] = i.body.pos;
      minX = Math.min(minX, x - i.body.hw);
      maxX = Math.max(maxX, x + i.body.hw);
      minY = Math.min(minY, y - i.body.hh);
      maxY = Math.max(maxY, y + i.body.hh);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const pad = this.config.camera.fitPadding;
    const bw = Math.max(maxX - minX, 10), bh = Math.max(maxY - minY, 10), bd = maxZ - minZ;
    if (!dim3) {
      const aspect = this.width / this.height;
      const zoom = Math.min((ORTHO_HEIGHT * aspect) / bw, ORTHO_HEIGHT / bh) / pad;
      this.ortho.zoom = Math.min(this.config.camera.zoomMax, Math.max(this.config.camera.zoomMin, zoom));
      this.ortho.position.set(cx, cy, 1000);
      this.controls.target.set(cx, cy, 0);
      this.ortho.updateProjectionMatrix();
    } else {
      const radius = Math.max(0.5 * Math.hypot(bw, bh, bd), 10);
      const vHalf = THREE.MathUtils.degToRad(this.persp.fov) / 2;
      const hHalf = Math.atan(Math.tan(vHalf) * (this.width / this.height));
      const dist = (radius / Math.sin(Math.min(vHalf, hHalf))) * pad * 0.8;
      const dir = this.tmpV.copy(cam.position).sub(this.controls.target);
      if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1);
      dir.normalize();
      this.controls.target.set(cx, cy, cz);
      cam.position.set(cx, cy, cz).addScaledVector(dir, dist);
    }
    this.controls.update();
    this.requestRender();
  }

  zoomBy(factor: number): void {
    if (this.config.dimension === '2d') {
      const c = this.config.camera;
      this.ortho.zoom = Math.min(c.zoomMax, Math.max(c.zoomMin, this.ortho.zoom * factor));
      this.ortho.updateProjectionMatrix();
    } else {
      const off = this.tmpV.copy(this.persp.position).sub(this.controls.target).multiplyScalar(1 / factor);
      this.persp.position.copy(this.controls.target).add(off);
    }
    this.controls.update();
    this.requestRender();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.canvas.style.cursor = tool === 'connect' ? 'crosshair' : '';
  }

  getTool(): Tool {
    return this.tool;
  }

  getSelection(): Selection {
    return { nodes: [...this.selNodes], edges: [...this.selEdges] };
  }

  setSelection(sel: Partial<Selection>): void {
    this.selNodes = new Set((sel.nodes ?? []).filter((id) => this._graph.hasNode(id)));
    this.selEdges = new Set((sel.edges ?? []).filter((id) => !!this._graph.getEdge(id)));
    this.dirtyNodes = this.dirtyEdges = true;
    this.events.emit('selection', this.getSelection());
    this.requestRender();
  }

  selectAll(): void {
    this.setSelection({ nodes: this._graph.nodes.map((n) => n.id) });
  }

  clearSelection(): void {
    if (this.selNodes.size || this.selEdges.size) this.setSelection({});
  }

  getNodeStyle(id: string): NodeStyle | undefined {
    return this.nodeInfo.get(id)?.style;
  }

  getEdgeStyle(id: string): EdgeStyle | undefined {
    return this.edgeInfo.get(id)?.style;
  }

  /** Opens the url of a node or edge according to `links` (self / blank / panel / event). */
  openLink(kind: 'node' | 'edge', id: string): boolean {
    const item = kind === 'node' ? this._graph.getNode(id) : this._graph.getEdge(id);
    const resolved = resolveUrl(item?.url, this.config.links);
    if (!item || !item.url || !resolved) return false;
    const payload = { url: item.url, resolved, kind, id, handled: false };
    this.events.emit('link', payload);
    if (payload.handled || this.config.links.target === 'event') return true;
    switch (this.config.links.target) {
      case 'blank': window.open(resolved, '_blank', 'noopener'); break;
      case 'panel': this.openPanel(resolved, (item as { label?: string }).label ?? id); break;
      default: window.location.assign(resolved);
    }
    return true;
  }

  closePanel(): void {
    this.panelEl?.remove();
    this.panelEl = null;
  }

  /** PNG (or other) data URL of the current view including the background. */
  exportImage(type = 'image/png', quality?: number): string {
    this.frame();
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const ctx = out.getContext('2d')!;
    const bg = this.config.background;
    if (!bg.transparent) {
      if (bg.gradientTo) {
        const g = ctx.createLinearGradient(0, 0, 0, out.height);
        g.addColorStop(0, bg.color);
        g.addColorStop(1, bg.gradientTo);
        ctx.fillStyle = g;
      } else ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.drawImage(this.canvas, 0, 0);
    return out.toDataURL(type, quality);
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.config.render.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    this.ortho.left = (-ORTHO_HEIGHT * aspect) / 2;
    this.ortho.right = (ORTHO_HEIGHT * aspect) / 2;
    this.ortho.top = ORTHO_HEIGHT / 2;
    this.ortho.bottom = -ORTHO_HEIGHT / 2;
    this.ortho.updateProjectionMatrix();
    for (const b of this.buckets) (b.mesh.material as LineMaterial).resolution.set(w, h);
    if (this.controls && !this.orbit) (this.controls as unknown as TrackballControls).handleResize();
    this.dirtyLabels = true;
    this.requestRender();
  }

  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.hoverRaf);
    this.ro?.disconnect();
    this.unsubGraph();
    this.stopLayout();
    this.root.removeEventListener('pointerdown', this.onPointerDown, true);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.setAxisGuide(null);
    this.disposeControls();
    this.clearScene();
    for (const g of this.geoms.values()) g.dispose();
    this.tex.clear();
    this.renderer.dispose();
    this.root.remove();
    this.container.classList.remove('gs-container');
    this.events.clear();
  }

  // ------------------------------------------------------------------ setup helpers

  private subscribe(): void {
    this.unsubGraph = this._graph.events.on('change', this.onGraphChange);
  }

  private onGraphChange = (e: { kind: ChangeKind }): void => {
    if (e.kind === 'position') this.dirtyPositions = true;
    else {
      if (this.sim) this.stopLayout();
      this.dirtyStructure = true;
    }
    this.requestRender();
  };

  private afterLoad(): void {
    const missing = this._graph.nodes.some((n) => n.x === undefined || n.y === undefined);
    this.pendingFit = this.config.camera.autoFit;
    this.pendingLayout = missing && this.config.layout.autoRun;
    this.dirtyStructure = true;
    this.requestRender();
  }

  /** @param preserve keep the current camera pose (used when only the control scheme changes) */
  private setupCamera(preserve = false): void {
    const dim3 = this.config.dimension === '3d';
    const free = dim3 && this.config.camera.rotation === 'free';
    const target = this.controls ? this.controls.target.clone() : null;
    this.disposeControls();
    this.camera = dim3 ? this.persp : this.ortho;
    if (!preserve) {
      if (!dim3) {
        this.ortho.position.set(0, 0, 1000);
        this.ortho.zoom = 1;
      } else this.persp.position.set(0, 0, 300);
    }
    if (dim3) this.persp.up.set(0, 1, 0);
    if (free) {
      // Trackball: unlimited rotation around every axis, the horizon is not kept level.
      const t = new TrackballControls(this.camera, this.canvas);
      t.rotateSpeed = 2.5;
      t.zoomSpeed = 1.2;
      t.panSpeed = 0.8;
      t.staticMoving = false;
      t.dynamicDampingFactor = 0.12;
      t.keys = ['', '', '']; // no A/S/D key modes, they would collide with editor shortcuts
      t.addEventListener('change', this.onCameraChange);
      this.disposeControls = () => {
        t.removeEventListener('change', this.onCameraChange);
        t.dispose();
      };
      this.orbit = null;
      this.controls = t;
    } else {
      const c = new OrbitControls(this.camera, this.canvas);
      c.enableDamping = this.config.camera.damping;
      c.zoomToCursor = true;
      c.addEventListener('change', this.onCameraChange);
      if (!dim3) {
        c.enableRotate = false;
        c.screenSpacePanning = true;
        c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
      } else {
        c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      }
      this.disposeControls = () => {
        c.removeEventListener('change', this.onCameraChange);
        c.dispose();
      };
      this.orbit = c;
      this.controls = c;
    }
    if (preserve && target) this.controls.target.copy(target);
    this.applyControlLimits();
    this.controls.update();
  }

  private applyControlLimits(): void {
    const cam = this.config.camera;
    if (this.orbit) {
      this.orbit.minZoom = cam.zoomMin;
      this.orbit.maxZoom = cam.zoomMax;
    }
    this.controls.minDistance = 5;
    this.controls.maxDistance = 50000;
  }

  /** Trackball controls only move the camera when `update()` runs, so keep frames coming while the user interacts. */
  private get needsContinuousFrames(): boolean {
    return !this.orbit && this.config.dimension === '3d' && (this.pointerIsDown || performance.now() < this.activeUntil);
  }

  private onCameraChange = (): void => {
    if (this.config.label.mode === 'screen') this.dirtyLabels = true;
    this.requestRender();
  };

  private applyAppearance(): void {
    const c = this.config;
    const bg = c.background;
    this.root.style.background = bg.transparent ? 'transparent' : bg.gradientTo ? `linear-gradient(${bg.color}, ${bg.gradientTo})` : bg.color;
    for (const k of this.appliedVars) this.root.style.removeProperty(`--gs-${k}`);
    this.appliedVars = Object.keys(c.ui.cssVars);
    for (const [k, v] of Object.entries(c.ui.cssVars)) this.root.style.setProperty(`--gs-${k}`, v);
    this.tooltipEl.hidden = true;
  }

  private buildControls(): void {
    this.controlsEl?.remove();
    this.controlsEl = null;
    if (!this.config.ui.controls) return;
    const el = document.createElement('div');
    el.className = 'gs-controls gs-ui';
    const mk = (text: string, title: string, fn: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gs-btn';
      b.textContent = text;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      el.appendChild(b);
      return b;
    };
    mk('+', 'Zoom in', () => this.zoomBy(1.4));
    mk('\u2212', 'Zoom out', () => this.zoomBy(1 / 1.4));
    mk('Fit', 'Fit graph to view', () => this.fit());
    this.dimButton = mk(this.config.dimension === '2d' ? '3D' : '2D', 'Switch between 2D and 3D', () => {
      this.setDimension(this.config.dimension === '2d' ? '3d' : '2d');
    });
    this.root.appendChild(el);
    this.controlsEl = el;
  }

  // ------------------------------------------------------------------ render loop

  private requestRender(): void {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.raf = 0;
    if (this.disposed) return;
    this.frame();
    if (this.sim || this.needsContinuousFrames) this.requestRender();
  };

  private frame(): void {
    if (this.sim) this.stepSimulation();
    if (this.dirtyStructure) this.rebuildStructure();
    if (this.pendingFit) {
      this.pendingFit = false;
      this.fit();
    }
    if (this.pendingLayout) {
      this.pendingLayout = false;
      void this.runLayout();
    }
    if (this.dirtyPositions) this.updatePositions();
    if (this.dirtyNodes) {
      this.dirtyNodes = false;
      this.updateNodeInstances();
    }
    if (this.dirtyEdges) {
      this.dirtyEdges = false;
      this.writeEdges();
    }
    if (this.dirtyLabels) {
      this.dirtyLabels = false;
      this.updateLabels();
    }
    this.controls.update();
    if (this.config.dimension === '3d') {
      this.headlight.position.copy(this.persp.position);
      this.headlight.target.position.copy(this.controls.target);
      this.headlight.target.updateMatrixWorld();
    }
    this.renderer.render(this.scene, this.camera);
  }

  private stepSimulation(): void {
    const sim = this.sim;
    if (!sim) return;
    const n = this._graph.nodes.length;
    const steps = n <= 1500 ? 3 : n <= 5000 ? 2 : 1;
    for (const id of this.dragIds) {
      const nd = this._graph.getNode(id);
      if (nd) sim.pin(id, [nd.x ?? 0, nd.y ?? 0, nd.z ?? 0]);
    }
    for (let i = 0; i < steps; i++) sim.step();
    sim.commit(this._graph);
    if (sim.alpha < 0.02) this.stopLayout(true);
  }

  // ------------------------------------------------------------------ scene construction

  private color(c: string): THREE.Color {
    let col = this.colors.get(c);
    if (!col) {
      col = new THREE.Color(c);
      this.colors.set(c, col);
    }
    return col;
  }

  private geometryFor(key: string): THREE.BufferGeometry {
    let g = this.geoms.get(key);
    if (g) return g;
    switch (key) {
      case 'sphere': g = new THREE.SphereGeometry(0.5, 24, 16); break;
      case 'square':
      case 'rectangle': g = new THREE.PlaneGeometry(1, 1); break;
      case 'diamond': g = new THREE.CircleGeometry(0.5, 4); break;
      case 'hexagon': g = new THREE.CircleGeometry(0.5, 6); break;
      case 'triangle': g = new THREE.CircleGeometry(0.5, 3); g.rotateZ(Math.PI / 2); break;
      case 'arrow': g = new THREE.ConeGeometry(0.5, 1, 14); g.rotateZ(-Math.PI / 2); g.translate(-0.5, 0, 0); break;
      default: g = new THREE.CircleGeometry(0.5, 40);
    }
    this.geoms.set(key, g);
    return g;
  }

  /** Material flags that differ between 2D (ordered by renderOrder) and 3D (depth buffer). */
  private applyMode(m: THREE.Material, opacity: number): void {
    const dim3 = this.config.dimension === '3d';
    m.transparent = dim3 ? opacity < 1 : true;
    m.opacity = opacity;
    m.depthTest = dim3;
    m.depthWrite = dim3;
  }

  private clearScene(): void {
    for (const l of this.layers.values()) {
      this.scene.remove(l.body, l.outline);
      (l.body.material as THREE.Material).dispose();
      (l.outline.material as THREE.Material).dispose();
      l.body.dispose();
      l.outline.dispose();
    }
    this.layers.clear();
    for (const b of this.buckets) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
    }
    this.buckets = [];
    if (this.arrowMesh) {
      this.scene.remove(this.arrowMesh);
      (this.arrowMesh.material as THREE.Material).dispose();
      this.arrowMesh.dispose();
      this.arrowMesh = null;
    }
    for (const i of this.nodeInfo.values()) if (i.sprite) this.dropSprite(i.sprite);
    for (const i of this.edgeInfo.values()) if (i.sprite) this.dropSprite(i.sprite);
    this.nodeInfo.clear();
    this.edgeInfo.clear();
  }

  private dropSprite(s: THREE.Sprite): void {
    this.scene.remove(s);
    s.material.dispose();
  }

  private makeSprite(img: TextImage, order: number): THREE.Sprite {
    const dim3 = this.config.dimension === '3d';
    const mat = new THREE.SpriteMaterial({ map: img.texture, transparent: true, depthTest: dim3, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.renderOrder = order;
    s.frustumCulled = false;
    this.scene.add(s);
    return s;
  }

  private rebuildStructure(): void {
    this.dirtyStructure = false;
    this.clearScene();
    const cfg = this.config;
    const g = this._graph;
    const dim3 = cfg.dimension === '3d';
    placeNewNodes(g, cfg.dimension, cfg.layout.idealLength, cfg.layout.seed);
    for (const id of [...this.selNodes]) if (!g.hasNode(id)) this.selNodes.delete(id);
    for (const id of [...this.selEdges]) if (!g.getEdge(id)) this.selEdges.delete(id);
    if (this.hoverNode && !g.hasNode(this.hoverNode)) this.hoverNode = null;
    if (this.hoverEdge && !g.getEdge(this.hoverEdge)) this.hoverEdge = null;

    // nodes
    const groups = buildGroupIndex(g);
    const byLayer = new Map<string, NodeInfo[]>();
    for (const n of g.nodes) {
      const style = resolveNodeStyle(n, cfg, groups);
      const ext = geometry.nodeExtents(style.shape, style.size, cfg.node.aspect, dim3);
      const info: NodeInfo = {
        node: n,
        style,
        body: { pos: [0, 0, 0], hw: ext.hw, hh: ext.hh, ellipse: geometry.isEllipseShape(style.shape) },
        layerKey: null,
        layer: null,
        slot: -1,
      };
      if (style.shape === 'card') {
        info.card = this.tex.card(n, style, cfg);
        info.body.hw = info.card.w / 2;
        info.body.hh = info.card.h / 2;
        info.body.ellipse = false;
        if (dim3) info.body.hw = info.body.hh = Math.max(info.body.hw, info.body.hh);
        info.sprite = this.makeSprite(info.card, 4);
      } else {
        info.layerKey = dim3 ? 'sphere' : style.shape;
        const list = byLayer.get(info.layerKey) ?? [];
        list.push(info);
        byLayer.set(info.layerKey, list);
      }
      this.nodeInfo.set(n.id, info);
    }
    for (const [key, list] of byLayer) {
      const geo = this.geometryFor(key);
      const bodyMat = dim3 ? new THREE.MeshLambertMaterial() : new THREE.MeshBasicMaterial();
      this.applyMode(bodyMat, cfg.node.opacity);
      const outMat = new THREE.MeshBasicMaterial({ side: dim3 ? THREE.BackSide : THREE.FrontSide });
      this.applyMode(outMat, cfg.node.opacity);
      const body = new THREE.InstancedMesh(geo, bodyMat, list.length);
      const outline = new THREE.InstancedMesh(geo, outMat, list.length);
      for (const m of [body, outline]) {
        m.frustumCulled = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      }
      outline.renderOrder = 3;
      body.renderOrder = 4;
      const layer: Layer = { key, body, outline };
      list.forEach((info, i) => {
        info.layer = layer;
        info.slot = i;
        body.setColorAt(i, this.color(info.style.color));
        outline.setColorAt(i, this.color(info.style.borderColor));
      });
      this.layers.set(key, layer);
      this.scene.add(outline, body);
    }
    if (cfg.label.show && g.nodes.length <= cfg.label.maxCount) {
      for (const info of this.nodeInfo.values()) {
        if (info.card) continue;
        const img = this.tex.text(info.node.label ?? info.node.id, { ...cfg.label, color: info.style.labelColor });
        info.sprite = this.makeSprite(img, 5);
      }
    }

    // edges
    let min = Infinity;
    let max = -Infinity;
    for (const e of g.edges) {
      const w = g.weightOf(e);
      min = Math.min(min, w);
      max = Math.max(max, w);
    }
    const groupsByPair = new Map<string, EdgeInfo[]>();
    const bucketMap = new Map<string, Bucket>();
    let arrows = 0;
    for (const e of g.edges) {
      const weight = g.weightOf(e);
      const style = resolveEdgeStyle(e, weight, cfg, { min, max });
      const self = e.source === e.target;
      const info: EdgeInfo = {
        edge: e, style, weight, directed: g.isDirected(e), index: 0, count: 1, flip: !self && e.source > e.target, self,
        path: [], arrowSlot: -1, bucketKey: `${style.width}|${style.dashed ? 1 : 0}`,
      };
      const pair = self ? `s\u0000${e.source}` : e.source < e.target ? `${e.source}\u0000${e.target}` : `${e.target}\u0000${e.source}`;
      const list = groupsByPair.get(pair) ?? [];
      list.push(info);
      groupsByPair.set(pair, list);
      this.edgeInfo.set(e.id, info);
      if (info.directed && cfg.edge.arrows) info.arrowSlot = arrows++;
      let bucket = bucketMap.get(info.bucketKey);
      if (!bucket) {
        const mat = new LineMaterial({
          color: 0xffffff, linewidth: style.width, vertexColors: true, dashed: style.dashed, dashSize: cfg.edge.dashSize, gapSize: cfg.edge.gapSize,
        });
        mat.resolution.set(this.width, this.height);
        this.applyMode(mat, cfg.edge.opacity);
        const mesh = new LineSegments2(new LineSegmentsGeometry(), mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        mesh.visible = false;
        this.scene.add(mesh);
        bucket = { key: info.bucketKey, mesh, edges: [], dashed: style.dashed };
        bucketMap.set(info.bucketKey, bucket);
      }
      bucket.edges.push(info);
    }
    for (const list of groupsByPair.values()) list.forEach((info, i) => { info.index = i; info.count = list.length; });
    this.buckets = [...bucketMap.values()];
    if (arrows > 0) {
      const mat = new THREE.MeshBasicMaterial();
      this.applyMode(mat, cfg.edge.opacity);
      const mesh = new THREE.InstancedMesh(this.geometryFor('arrow'), mat, arrows);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < arrows; i++) mesh.setColorAt(i, this.color('#ffffff'));
      this.arrowMesh = mesh;
      this.scene.add(mesh);
    }
    if (g.edges.length <= cfg.weight.maxCount) {
      for (const info of this.edgeInfo.values()) {
        const text = this.edgeText(info);
        if (!text) continue;
        info.img = this.tex.text(text, { ...cfg.weight, maxChars: cfg.label.maxChars });
        info.sprite = this.makeSprite(info.img, 5);
      }
    }

    this.dirtyPositions = false;
    this.dirtyNodes = this.dirtyEdges = false;
    this.updatePositions();
  }

  private edgeText(info: EdgeInfo): string {
    const cfg = this.config.weight;
    const showW = cfg.show === 'always' || (cfg.show === 'auto' && info.weight !== 1);
    const w = showW ? String(Number(info.weight.toFixed(cfg.decimals))) : '';
    const l = info.edge.label ?? '';
    return l && w ? `${l} (${w})` : l || w;
  }

  // ------------------------------------------------------------------ per-frame updates

  private updatePositions(): void {
    this.dirtyPositions = false;
    const dim3 = this.config.dimension === '3d';
    for (const info of this.nodeInfo.values()) {
      const n = info.node;
      info.body.pos[0] = n.x ?? 0;
      info.body.pos[1] = n.y ?? 0;
      info.body.pos[2] = dim3 ? n.z ?? 0 : 0;
    }
    this.updateNodeInstances();
    this.computePaths();
    this.writeEdges();
    this.updateLabels();
  }

  private updateNodeInstances(): void {
    const cfg = this.config;
    const dim3 = cfg.dimension === '3d';
    const m = this.tmpM;
    for (const [id, info] of this.nodeInfo) {
      const layer = info.layer;
      if (!layer) continue;
      const sel = this.selNodes.has(id);
      const hov = id === this.hoverNode;
      const bw = sel ? cfg.selection.width : hov ? cfg.selection.width * 0.8 : info.style.borderWidth;
      const sx = info.body.hw * 2;
      const sy = info.body.hh * 2;
      const [x, y, z] = info.body.pos;
      m.compose(this.tmpV.set(x, y, z), IDENTITY_Q, this.tmpS.set(sx, sy, dim3 ? sy : 1));
      layer.body.setMatrixAt(info.slot, m);
      m.compose(this.tmpV.set(x, y, z), IDENTITY_Q, this.tmpS.set(sx + 2 * bw, sy + 2 * bw, dim3 ? sy + 2 * bw : 1));
      layer.outline.setMatrixAt(info.slot, m);
      layer.outline.setColorAt(info.slot, this.color(sel ? cfg.selection.color : hov ? cfg.selection.hoverColor : info.style.borderColor));
    }
    for (const l of this.layers.values()) {
      l.body.instanceMatrix.needsUpdate = true;
      l.outline.instanceMatrix.needsUpdate = true;
      if (l.outline.instanceColor) l.outline.instanceColor.needsUpdate = true;
    }
  }

  private computePaths(): void {
    const cfg = this.config;
    const opts: geometry.PathOptions = { spacing: cfg.edge.curveSpacing, segments: 16, dim3: cfg.dimension === '3d', loopScale: cfg.edge.loopSize };
    for (const info of this.edgeInfo.values()) {
      const a = this.nodeInfo.get(info.edge.source)?.body;
      const b = this.nodeInfo.get(info.edge.target)?.body;
      if (!a || !b) {
        info.path = [];
        continue;
      }
      let path = geometry.edgePath(a, b, info.index, info.count, info.flip, info.self, opts);
      info.tip = undefined;
      if (info.arrowSlot >= 0 && path.length >= 2) {
        info.tip = geometry.tipOf(path);
        path = geometry.shortenEnd(path, cfg.edge.arrowSize * 0.9);
      }
      info.path = path;
    }
  }

  private edgeColor(info: EdgeInfo): THREE.Color {
    const sel = this.config.selection;
    if (this.selEdges.has(info.edge.id)) return this.color(sel.color);
    if (info.edge.id === this.hoverEdge) return this.color(sel.hoverColor);
    return this.color(info.style.color);
  }

  /** Writes line and arrow buffers from the cached paths. */
  private writeEdges(): void {
    for (const b of this.buckets) {
      let segs = 0;
      for (const e of b.edges) segs += Math.max(0, e.path.length - 1);
      const pos = new Float32Array(segs * 6);
      const col = new Float32Array(segs * 6);
      let o = 0;
      for (const e of b.edges) {
        const c = this.edgeColor(e);
        for (let i = 1; i < e.path.length; i++) {
          const p = e.path[i - 1];
          const q = e.path[i];
          pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
          pos[o + 3] = q[0]; pos[o + 4] = q[1]; pos[o + 5] = q[2];
          col[o] = col[o + 3] = c.r;
          col[o + 1] = col[o + 4] = c.g;
          col[o + 2] = col[o + 5] = c.b;
          o += 6;
        }
      }
      const geo = new LineSegmentsGeometry();
      if (segs > 0) {
        geo.setPositions(pos);
        geo.setColors(col);
      }
      b.mesh.geometry.dispose();
      b.mesh.geometry = geo;
      b.mesh.visible = segs > 0;
      if (segs > 0 && b.dashed) b.mesh.computeLineDistances();
    }
    if (this.arrowMesh) {
      const len = this.config.edge.arrowSize;
      for (const info of this.edgeInfo.values()) {
        if (info.arrowSlot < 0) continue;
        if (!info.tip) {
          this.arrowMesh.setMatrixAt(info.arrowSlot, this.tmpM.makeScale(0, 0, 0));
          continue;
        }
        const d = info.tip.dir;
        this.tmpQ.setFromUnitVectors(X_AXIS, this.tmpV2.set(d[0], d[1], d[2]));
        this.tmpM.compose(this.tmpV.set(info.tip.tip[0], info.tip.tip[1], info.tip.tip[2]), this.tmpQ, this.tmpS.set(len, len * 0.8, len * 0.8));
        this.arrowMesh.setMatrixAt(info.arrowSlot, this.tmpM);
        this.arrowMesh.setColorAt(info.arrowSlot, this.edgeColor(info));
      }
      this.arrowMesh.instanceMatrix.needsUpdate = true;
      if (this.arrowMesh.instanceColor) this.arrowMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateLabels(): void {
    const cfg = this.config;
    const screen = cfg.label.mode === 'screen';
    for (const info of this.nodeInfo.values()) {
      const s = info.sprite;
      if (!s) continue;
      const [x, y, z] = info.body.pos;
      if (info.card) {
        s.position.set(x, y, z);
        s.scale.set(info.card.w, info.card.h, 1);
        continue;
      }
      const img = (s.material.map as THREE.CanvasTexture).image as HTMLCanvasElement;
      const res = this.tex.resolution;
      const u = screen ? 1 / this.pxPerUnitAt(x, y, z) : 1;
      const w = (img.width / res) * u;
      const h = (img.height / res) * u;
      s.scale.set(w, h, 1);
      s.position.set(x, y - info.body.hh - cfg.label.gap * u - h / 2, z);
    }
    for (const info of this.edgeInfo.values()) {
      const s = info.sprite;
      if (!s || !info.img || info.path.length < 2) {
        if (s) s.visible = false;
        continue;
      }
      const p = geometry.pointAtFraction(info.path, 0.5);
      const u = screen ? 1 / this.pxPerUnitAt(p[0], p[1], p[2]) : 1;
      s.visible = true;
      s.scale.set(info.img.w * u, info.img.h * u, 1);
      s.position.set(p[0], p[1], p[2]);
    }
  }

  /** CSS pixels per world unit at a world position. */
  private pxPerUnitAt(x: number, y: number, z: number): number {
    if (this.camera === this.ortho) return this.height / ((this.ortho.top - this.ortho.bottom) / this.ortho.zoom);
    const v = this.tmpV2.set(x, y, z).applyMatrix4(this.persp.matrixWorldInverse);
    const d = Math.max(0.001, -v.z);
    return this.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.persp.fov) / 2) * d);
  }

  // ------------------------------------------------------------------ picking

  private ndc = new THREE.Vector2();

  private eventPoint(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** World position of a screen point on the plane through `anchor` that faces the camera. */
  private worldAt(sx: number, sy: number, anchor: Vec3): Vec3 | null {
    this.camera.updateMatrixWorld();
    this.ndc.set((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const dir = this.camera.getWorldDirection(this.tmpV2);
    this.plane.setFromNormalAndCoplanarPoint(dir, this.tmpV.set(anchor[0], anchor[1], anchor[2]));
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.tmpS);
    return hit ? [hit.x, hit.y, hit.z] : null;
  }

  private pick(sx: number, sy: number): Hit {
    this.camera.updateMatrixWorld();
    const dim3 = this.config.dimension === '3d';
    const v = this.tmpV;
    let best: string | null = null;
    let bestZ = Infinity;
    for (const [id, info] of this.nodeInfo) {
      const p = info.body.pos;
      v.set(p[0], p[1], p[2]).project(this.camera);
      if (v.z < -1 || v.z > 1) continue;
      const px = (v.x * 0.5 + 0.5) * this.width;
      const py = (-v.y * 0.5 + 0.5) * this.height;
      const ppu = this.pxPerUnitAt(p[0], p[1], p[2]);
      const dx = (sx - px) / Math.max(info.body.hw * ppu, 4);
      const dy = (sy - py) / Math.max(info.body.hh * ppu, 4);
      const inside = info.body.ellipse || dim3 ? dx * dx + dy * dy <= 1 : Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      if (inside && v.z <= bestZ) {
        best = id;
        bestZ = v.z;
      }
    }
    if (best) return { kind: 'node', id: best };
    if (this.edgeInfo.size > this.config.interaction.pickLimit) return { kind: null, id: null };
    let bestEdge: string | null = null;
    let bestD = 6;
    for (const [id, info] of this.edgeInfo) {
      const pts = info.path;
      if (pts.length < 2) continue;
      let ax = 0;
      let ay = 0;
      for (let i = 0; i < pts.length; i++) {
        v.set(pts[i][0], pts[i][1], pts[i][2]).project(this.camera);
        const bx = (v.x * 0.5 + 0.5) * this.width;
        const by = (-v.y * 0.5 + 0.5) * this.height;
        if (i > 0) {
          const d = geometry.distToSegment(sx, sy, ax, ay, bx, by);
          if (d < bestD) {
            bestD = d;
            bestEdge = id;
          }
        }
        ax = bx;
        ay = by;
      }
    }
    return bestEdge ? { kind: 'edge', id: bestEdge } : { kind: null, id: null };
  }

  // ------------------------------------------------------------------ pointer interaction

  private onWheel = (): void => {
    this.activeUntil = performance.now() + 700;
    this.requestRender();
  };

  private onPointerDown = (e: PointerEvent): void => {
    if ((e.target as Element).closest?.('.gs-ui')) return;
    this.pointerIsDown = true;
    this.requestRender();
    if (e.button !== 0) return;
    const p = this.eventPoint(e);
    this.lastPointer = p;
    const hit = this.pick(p.x, p.y);
    const additive = e.shiftKey;
    const inter = this.config.interaction;
    const wasSelected = hit.kind === 'node' && this.selNodes.has(hit.id);
    this.down = { x: p.x, y: p.y, hit, additive, wasSelected, moved: false, button: e.button };
    this.hideTooltip();
    if (hit.kind === 'node') {
      if (this.tool === 'connect') {
        this.drag = { type: 'connect', from: hit.id };
      } else {
        if (inter.select && !wasSelected) {
          if (additive && inter.multiSelect) this.selNodes.add(hit.id);
          else {
            this.selNodes = new Set([hit.id]);
            this.selEdges.clear();
          }
          this.dirtyNodes = this.dirtyEdges = true;
          this.events.emit('selection', this.getSelection());
          this.requestRender();
        }
        if (inter.dragNodes) {
          const ids = this.selNodes.has(hit.id) ? [...this.selNodes] : [hit.id];
          const anchor = this.nodeInfo.get(hit.id)!.body.pos;
          const w = this.worldAt(p.x, p.y, anchor);
          if (w) {
            const offsets = new Map<string, Vec3>();
            const starts = new Map<string, Vec3>();
            for (const id of ids) {
              const b = this.nodeInfo.get(id)?.body.pos;
              if (b) {
                offsets.set(id, [b[0] - w[0], b[1] - w[1], b[2] - w[2]]);
                starts.set(id, [b[0], b[1], b[2]]);
              }
            }
            this.drag = { type: 'nodes', ids, primary: hit.id, offsets, starts, anchor: [anchor[0], anchor[1], anchor[2]], px: p.x, py: p.y, moved: false };
          }
        }
      }
    } else if (e.shiftKey && inter.select && inter.multiSelect) {
      this.drag = { type: 'box', x0: p.x, y0: p.y };
    }
    if (this.drag) {
      this.controls.enabled = false;
      this.canvas.setPointerCapture(e.pointerId);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.eventPoint(e);
    this.lastPointer = p;
    const down = this.down;
    if (down && !down.moved && Math.hypot(p.x - down.x, p.y - down.y) > DRAG_THRESHOLD) down.moved = true;
    const d = this.drag;
    if (!d) {
      if (!down) this.scheduleHover();
      this.moveTooltip(p);
      return;
    }
    if (d.type === 'nodes') {
      if (!down?.moved) return;
      if (!d.moved) {
        d.moved = true;
        this.dragIds = d.ids;
        this.canvas.style.cursor = 'grabbing';
        this.events.emit('nodedragstart', { ids: d.ids });
      }
      this.dragNodes(d, p);
    } else if (d.type === 'connect') {
      this.updateRubber(d.from, p);
      const hit = this.pick(p.x, p.y);
      const hn = hit.kind === 'node' ? hit.id : null;
      if (hn !== this.hoverNode) {
        this.hoverNode = hn;
        this.dirtyNodes = true;
        this.requestRender();
      }
    } else if (down?.moved) {
      const x = Math.min(d.x0, p.x);
      const y = Math.min(d.y0, p.y);
      this.boxEl.hidden = false;
      Object.assign(this.boxEl.style, { left: `${x}px`, top: `${y}px`, width: `${Math.abs(p.x - d.x0)}px`, height: `${Math.abs(p.y - d.y0)}px` });
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointerIsDown = false;
    this.activeUntil = performance.now() + 1000;
    this.requestRender();
    const down = this.down;
    const drag = this.drag;
    this.down = null;
    this.drag = null;
    this.controls.enabled = true;
    if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.boxEl.hidden = true;
    this.removeRubber();
    this.setAxisGuide(null);
    this.canvas.style.cursor = this.tool === 'connect' ? 'crosshair' : '';
    if (drag?.type === 'nodes' && drag.moved) {
      for (const id of drag.ids) this.sim?.unpin(id, !!this._graph.getNode(id)?.pinned);
      this.dragIds = [];
      this.events.emit('nodedragend', { ids: drag.ids });
      return;
    }
    if (!down || e.type === 'pointercancel') return;
    const p = this.eventPoint(e);
    if (drag?.type === 'connect') {
      const hit = this.pick(p.x, p.y);
      if (hit.kind === 'node') this.events.emit('connect', { source: drag.from, target: hit.id });
      return;
    }
    if (drag?.type === 'box' && down.moved) {
      this.selectInBox(drag.x0, drag.y0, p.x, p.y, down.additive);
      return;
    }
    if (down.moved) return; // camera pan / orbit
    this.handleClick(down.hit, down.additive, down.wasSelected, e);
  };

  private handleClick(hit: Hit, additive: boolean, wasSelected: boolean, e: PointerEvent): void {
    const inter = this.config.interaction;
    const openOn = (mod: boolean): boolean => inter.openLinks === 'click' || (inter.openLinks === 'ctrl-click' && mod);
    const mod = e.ctrlKey || e.metaKey;
    if (hit.kind === 'node') {
      const node = this._graph.getNode(hit.id);
      if (!node) return;
      if (inter.select && wasSelected) {
        if (additive) this.selNodes.delete(hit.id);
        else if (this.selNodes.size > 1) this.selNodes = new Set([hit.id]);
        this.dirtyNodes = this.dirtyEdges = true;
        this.events.emit('selection', this.getSelection());
        this.requestRender();
      }
      this.events.emit('nodeclick', { id: hit.id, node, originalEvent: e });
      if (openOn(mod)) this.openLink('node', hit.id);
    } else if (hit.kind === 'edge') {
      const edge = this._graph.getEdge(hit.id);
      if (!edge) return;
      if (inter.select) {
        if (additive && inter.multiSelect) {
          if (!this.selEdges.delete(hit.id)) this.selEdges.add(hit.id);
        } else {
          this.selNodes.clear();
          this.selEdges = new Set([hit.id]);
        }
        this.dirtyNodes = this.dirtyEdges = true;
        this.events.emit('selection', this.getSelection());
        this.requestRender();
      }
      this.events.emit('edgeclick', { id: hit.id, edge, originalEvent: e });
      if (openOn(mod)) this.openLink('edge', hit.id);
    } else {
      if (!additive) this.clearSelection();
      const p = this.eventPoint(e);
      const position = this.worldAt(p.x, p.y, this.config.dimension === '3d' ? (this.controls.target.toArray() as Vec3) : [0, 0, 0]) ?? [0, 0, 0];
      this.events.emit('backgroundclick', { position, originalEvent: e });
    }
  }

  private onDblClick = (e: MouseEvent): void => {
    if ((e.target as Element).closest?.('.gs-ui')) return;
    const p = this.eventPoint(e);
    const hit = this.pick(p.x, p.y);
    const dbl = this.config.interaction.openLinks === 'dblclick';
    if (hit.kind === 'node') {
      const node = this._graph.getNode(hit.id);
      if (node) this.events.emit('nodedblclick', { id: hit.id, node, originalEvent: e });
      if (dbl) this.openLink('node', hit.id);
    } else if (hit.kind === 'edge') {
      if (dbl) this.openLink('edge', hit.id);
    } else {
      const position = this.worldAt(p.x, p.y, this.config.dimension === '3d' ? (this.controls.target.toArray() as Vec3) : [0, 0, 0]) ?? [0, 0, 0];
      this.events.emit('backgrounddblclick', { position, originalEvent: e });
    }
  };

  private onPointerLeave = (): void => {
    if (this.drag) return;
    this.hideTooltip();
    if (this.hoverNode || this.hoverEdge) {
      this.hoverNode = this.hoverEdge = null;
      this.dirtyNodes = this.dirtyEdges = true;
      this.events.emit('hover', { kind: null, id: null });
      this.requestRender();
    }
  };

  /** Axes currently locked by the X / Y / Z keys (Z only exists in 3D). */
  private activeAxes(): Axis[] {
    if (!this.config.interaction.axisLock) return [];
    const dim3 = this.config.dimension === '3d';
    return [...this.axisKeys].filter((a) => dim3 || a !== 'z');
  }

  private toScreen(p: Vec3): { x: number; y: number } {
    this.camera.updateMatrixWorld();
    this.tmpV.set(p[0], p[1], p[2]).project(this.camera);
    return { x: (this.tmpV.x * 0.5 + 0.5) * this.width, y: (-this.tmpV.y * 0.5 + 0.5) * this.height };
  }

  /**
   * Moves the dragged nodes. Without axis keys they follow the pointer. With one held key (X, Y or Z) they move only
   * along that axis, measured by projecting the pointer motion onto the axis as it appears on screen. With two keys they
   * move within that plane.
   */
  private dragNodes(d: Extract<Drag, { type: 'nodes' }>, p: { x: number; y: number }): void {
    const dim3 = this.config.dimension === '3d';
    const axes = this.activeAxes();
    const entries: [string, Vec3][] = [];
    let guide: { origin: Vec3; axis: Axis } | null = null;
    if (axes.length === 1) {
      const axis = axes[0];
      const origin = d.starts.get(d.primary);
      if (!origin) return;
      const unit: Vec3 = [0, 0, 0];
      unit[AXIS_INDEX[axis]] = 1;
      const L = 10;
      const s0 = this.toScreen(origin);
      const s1 = this.toScreen([origin[0] + unit[0] * L, origin[1] + unit[1] * L, origin[2] + unit[2] * L]);
      const sx = s1.x - s0.x;
      const sy = s1.y - s0.y;
      const dd = sx * sx + sy * sy;
      const t = dd > 1e-6 ? (((p.x - d.px) * sx + (p.y - d.py) * sy) / dd) * L : 0;
      for (const id of d.ids) {
        const st = d.starts.get(id);
        const n = this._graph.getNode(id);
        if (!st || !n) continue;
        entries.push([id, [st[0] + unit[0] * t, st[1] + unit[1] * t, dim3 ? st[2] + unit[2] * t : n.z ?? 0]]);
      }
      guide = { origin, axis };
    } else {
      const w = this.worldAt(p.x, p.y, d.anchor);
      if (!w) return;
      const free = axes.length === 0;
      for (const id of d.ids) {
        const off = d.offsets.get(id);
        const st = d.starts.get(id);
        const n = this._graph.getNode(id);
        if (!off || !st || !n) continue;
        const pick = (i: number, axis: Axis): number => (free || axes.includes(axis) ? w[i] + off[i] : st[i]);
        entries.push([id, [pick(0, 'x'), pick(1, 'y'), dim3 ? pick(2, 'z') : n.z ?? 0]]);
      }
    }
    this.setAxisGuide(guide);
    this._graph.setPositions(entries);
  }

  private setAxisGuide(g: { origin: Vec3; axis: Axis } | null): void {
    if (!g) {
      if (!this.guide) return;
      this.scene.remove(this.guide);
      this.guide.geometry.dispose();
      (this.guide.material as THREE.Material).dispose();
      this.guide = null;
      this.requestRender();
      return;
    }
    if (!this.guide) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      this.guide = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: this.color(AXIS_COLOR[g.axis]), depthTest: false, transparent: true, opacity: 0.8 }));
      this.guide.renderOrder = 19;
      this.guide.frustumCulled = false;
      this.scene.add(this.guide);
    }
    (this.guide.material as THREE.LineBasicMaterial).color.copy(this.color(AXIS_COLOR[g.axis]));
    const a = this.guide.geometry.getAttribute('position') as THREE.BufferAttribute;
    const i = AXIS_INDEX[g.axis];
    const lo: Vec3 = [g.origin[0], g.origin[1], g.origin[2]];
    const hi: Vec3 = [g.origin[0], g.origin[1], g.origin[2]];
    lo[i] -= 50000;
    hi[i] += 50000;
    a.setXYZ(0, lo[0], lo[1], lo[2]);
    a.setXYZ(1, hi[0], hi[1], hi[2]);
    a.needsUpdate = true;
    this.requestRender();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.matches?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((k === 'x' || k === 'y' || k === 'z') && !this.axisKeys.has(k)) {
      this.axisKeys.add(k);
      this.refreshAxisDrag();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if ((k === 'x' || k === 'y' || k === 'z') && this.axisKeys.delete(k)) this.refreshAxisDrag();
  };

  private onBlur = (): void => {
    if (this.axisKeys.size) {
      this.axisKeys.clear();
      this.refreshAxisDrag();
    }
  };

  /** Re-applies the running node drag after a key press or release so the constraint takes effect immediately. */
  private refreshAxisDrag(): void {
    const d = this.drag;
    if (d?.type === 'nodes' && d.moved) this.dragNodes(d, this.lastPointer);
  }

  private selectInBox(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    this.camera.updateMatrixWorld();
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const ids = additive ? new Set(this.selNodes) : new Set<string>();
    for (const [id, info] of this.nodeInfo) {
      const p = info.body.pos;
      this.tmpV.set(p[0], p[1], p[2]).project(this.camera);
      const px = (this.tmpV.x * 0.5 + 0.5) * this.width;
      const py = (-this.tmpV.y * 0.5 + 0.5) * this.height;
      if (this.tmpV.z >= -1 && this.tmpV.z <= 1 && px >= minX && px <= maxX && py >= minY && py <= maxY) ids.add(id);
    }
    this.setSelection({ nodes: [...ids] });
  }

  private scheduleHover(): void {
    if (!this.config.interaction.hover || this.hoverRaf) return;
    this.hoverRaf = requestAnimationFrame(() => {
      this.hoverRaf = 0;
      this.updateHover();
    });
  }

  private updateHover(): void {
    if (this.drag || this.disposed) return;
    const hit = this.pick(this.lastPointer.x, this.lastPointer.y);
    const hn = hit.kind === 'node' ? hit.id : null;
    const he = hit.kind === 'edge' ? hit.id : null;
    if (hn !== this.hoverNode) this.dirtyNodes = true;
    if (he !== this.hoverEdge) this.dirtyEdges = true;
    if (hn !== this.hoverNode || he !== this.hoverEdge) {
      this.hoverNode = hn;
      this.hoverEdge = he;
      this.events.emit('hover', { kind: hit.kind, id: hit.id });
      this.showTooltip(hit);
      this.requestRender();
    }
    const item = hit.kind === 'node' ? this._graph.getNode(hit.id) : hit.kind === 'edge' ? this._graph.getEdge(hit.id) : undefined;
    this.canvas.style.cursor = this.tool === 'connect' ? 'crosshair' : item?.url ? 'pointer' : '';
  }

  // ------------------------------------------------------------------ tooltip, rubber band, link panel

  private hideTooltip(): void {
    this.tooltipEl.hidden = true;
  }

  private showTooltip(hit: Hit): void {
    const el = this.tooltipEl;
    if (!this.config.interaction.tooltip || hit.kind === null) {
      el.hidden = true;
      return;
    }
    el.replaceChildren();
    const line = (text: string, cls?: string): void => {
      const d = document.createElement('div');
      if (cls) d.className = cls;
      d.textContent = text;
      el.appendChild(d);
    };
    const g = this._graph;
    if (hit.kind === 'node') {
      const n = g.getNode(hit.id);
      if (!n) return;
      line(n.label ?? n.id, 'gs-tt-title');
      if (n.group) line(n.group, 'gs-tt-muted');
      if (n.url) line(n.url, 'gs-tt-muted');
      for (const [k, v] of Object.entries(n.props ?? {})) line(`${k}: ${v}`, 'gs-tt-muted');
    } else {
      const e = g.getEdge(hit.id);
      if (!e) return;
      const name = (id: string): string => g.getNode(id)?.label ?? id;
      line(`${name(e.source)} ${g.isDirected(e) ? '\u2192' : '\u2014'} ${name(e.target)}`, 'gs-tt-title');
      line(`weight ${g.weightOf(e)}`, 'gs-tt-muted');
      if (e.label) line(e.label);
      if (e.url) line(e.url, 'gs-tt-muted');
    }
    el.hidden = false;
    this.moveTooltip(this.lastPointer);
  }

  private moveTooltip(p: { x: number; y: number }): void {
    const el = this.tooltipEl;
    if (el.hidden) return;
    const pad = 14;
    let x = p.x + pad;
    let y = p.y + pad;
    if (x + el.offsetWidth > this.width) x = Math.max(0, p.x - el.offsetWidth - pad);
    if (y + el.offsetHeight > this.height) y = Math.max(0, p.y - el.offsetHeight - pad);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  private updateRubber(from: string, p: { x: number; y: number }): void {
    const info = this.nodeInfo.get(from);
    if (!info) return;
    const w = this.worldAt(p.x, p.y, info.body.pos) ?? info.body.pos;
    if (!this.rubber) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: this.color(this.config.selection.color), depthTest: false, transparent: true });
      this.rubber = new THREE.Line(g, m);
      this.rubber.renderOrder = 20;
      this.rubber.frustumCulled = false;
      this.scene.add(this.rubber);
    }
    const a = this.rubber.geometry.getAttribute('position') as THREE.BufferAttribute;
    a.setXYZ(0, info.body.pos[0], info.body.pos[1], info.body.pos[2]);
    a.setXYZ(1, w[0], w[1], w[2]);
    a.needsUpdate = true;
    this.requestRender();
  }

  private removeRubber(): void {
    if (!this.rubber) return;
    this.scene.remove(this.rubber);
    this.rubber.geometry.dispose();
    (this.rubber.material as THREE.Material).dispose();
    this.rubber = null;
    this.requestRender();
  }

  private openPanel(url: string, title: string): void {
    this.closePanel();
    const panel = document.createElement('div');
    panel.className = 'gs-panel gs-ui';
    const head = document.createElement('div');
    head.className = 'gs-panel-head';
    const t = document.createElement('span');
    t.className = 'gs-panel-title';
    t.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'gs-btn';
    close.textContent = '\u00d7';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close panel');
    close.addEventListener('click', () => this.closePanel());
    head.append(t, close);
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', this.config.links.panelSandbox);
    frame.title = title;
    frame.src = url;
    panel.append(head, frame);
    this.root.appendChild(panel);
    this.panelEl = panel;
  }
}
