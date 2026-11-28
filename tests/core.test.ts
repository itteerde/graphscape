import classesGraphml from '../public/samples/classes.graphml?raw';
import { describe, expect, it } from 'vitest';
import {
  Graph, computeLayout, generateMixedNetwork, describeLinkGesture, NodeSearchIndex, parseQuery, helpLines, CONFIG_DOCS, configToJsonc, diffConfig, findUnknownKeys, parseJsonc, createConfig, detectFormat, generateClustered, geometry, mergeConfig, parseGraph, resolveEdgeStyle,
  resolveNodeStyle, buildGroupIndex, resolveUrl, serializeGraph, ForceSimulation, undocumentedConfigPaths,
  type GraphData, type GraphFormat,
} from '../src/core/index';

const sample = (): GraphData => ({
  directed: true,
  meta: { title: 'Test' },
  nodes: [
    { id: 'a', label: 'Alpha', sublabel: 'first line\nsecond', x: 10, y: 20, group: 'g1', url: 'pages/a.html', color: '#112233', shape: 'diamond', size: 20 },
    { id: 'b', label: 'Beta', x: -5, y: 8, group: 'g2' },
    { id: 'c', x: 0, y: 0 },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b', weight: 2.5, label: 'knows', url: 'x.html' },
    { id: 'e2', source: 'a', target: 'b' },
    { id: 'e3', source: 'b', target: 'b', weight: 3 },
    { id: 'e4', source: 'c', target: 'a', directed: false },
  ],
});

describe('Graph model', () => {
  it('supports multi edges, self loops and cascading removal', () => {
    const g = new Graph(sample());
    expect(g.nodes).toHaveLength(3);
    expect(g.edges).toHaveLength(4);
    expect(g.weightOf(g.getEdge('e2')!)).toBe(1);
    expect(g.isDirected(g.getEdge('e4')!)).toBe(false);
    expect(g.removeNode('b').sort()).toEqual(['e1', 'e2', 'e3']);
    expect(g.edges).toHaveLength(1);
  });

  it('emits change events and validates edges', () => {
    const g = new Graph();
    const kinds: string[] = [];
    g.events.on('change', (e) => kinds.push(e.kind));
    g.addNode({ id: 'x' });
    g.addNode({ id: 'y' });
    g.addEdge({ source: 'x', target: 'y' });
    g.setPositions([['x', [1, 2, 3]]]);
    expect(kinds).toEqual(['structure', 'structure', 'structure', 'position']);
    expect(() => g.addEdge({ source: 'x', target: 'nope' })).toThrow();
    expect(() => g.addNode({ id: 'x' })).toThrow();
  });

  it('updateNode removes fields set to undefined', () => {
    const g = new Graph(sample());
    g.updateNode('a', { color: undefined, label: 'New' });
    expect(g.getNode('a')!.color).toBeUndefined();
    expect(g.getNode('a')!.label).toBe('New');
  });
});

describe('format round trips', () => {
  const formats: GraphFormat[] = ['json', 'graphml', 'gml', 'dot'];
  for (const f of formats) {
    it(`keeps nodes, edges, weights, urls and directions (${f})`, () => {
      const text = serializeGraph(sample(), f);
      expect(detectFormat(text)).toBe(f);
      const { graph } = parseGraph(text);
      const g = new Graph(graph);
      expect(g.directed).toBe(true);
      expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
      expect(g.edges).toHaveLength(4);
      const ab = g.edges.filter((e) => e.source === 'a' && e.target === 'b');
      expect(ab).toHaveLength(2);
      expect(ab.map((e) => g.weightOf(e)).sort()).toEqual([1, 2.5]);
      expect(g.edges.some((e) => e.source === 'b' && e.target === 'b')).toBe(true);
      expect(g.getNode('a')!.url).toBe('pages/a.html');
      expect(g.getNode('a')!.group).toBe('g1');
      expect(g.getNode('a')!.sublabel).toBe('first line\nsecond');
      expect(g.edges.find((e) => e.source === 'c')!.directed).toBe(false);
      expect(g.edges.find((e) => e.url === 'x.html')!.label).toBe('knows');
    });
  }

  it('keeps coordinates in json, gml and graphml', () => {
    for (const f of ['json', 'gml', 'graphml'] as GraphFormat[]) {
      const g = new Graph(parseGraph(serializeGraph(sample(), f)).graph);
      expect(g.getNode('a')!.x).toBeCloseTo(10, 1);
      expect(g.getNode('a')!.y).toBeCloseTo(20, 1);
    }
  });

  it('parses csv edge lists with and without header', () => {
    const a = parseGraph('source,target,weight\nx,y,2\ny,z\n', { format: 'csv', directed: true }).graph;
    expect(a.nodes).toHaveLength(3);
    expect(a.edges[0].weight).toBe(2);
    expect(a.directed).toBe(true);
    const b = parseGraph('x;y;3;friends\n"p ""q""";r\n', { format: 'csv' }).graph;
    expect(b.edges[0].weight).toBe(3);
    expect(b.edges[0].label).toBe('friends');
    expect(b.nodes.map((n) => n.id)).toContain('p "q"');
    const round = parseGraph(serializeGraph(sample(), 'csv'), { format: 'csv', directed: true }).graph;
    expect(round.edges).toHaveLength(4);
  });

  it('accepts d3 node-link and cytoscape json', () => {
    const d3 = parseGraph('{"nodes":[{"id":"a"},{"id":"b","group":"x"}],"links":[{"source":0,"target":1,"value":4}]}').graph;
    expect(d3.edges[0]).toMatchObject({ source: 'a', target: 'b', weight: 4 });
    const cy = parseGraph('{"elements":{"nodes":[{"data":{"id":"p"}},{"data":{"id":"q"}}],"edges":[{"data":{"source":"p","target":"q"}}]}}').graph;
    expect(cy.edges).toHaveLength(1);
  });

  it('parses DOT with chains, clusters and defaults', () => {
    const dot = `digraph G {
      rankdir=LR; node [shape=box];
      subgraph cluster_x { label="Team X"; a; b; }
      a -> b -> c [weight=3, label="go"];
      c -- d [dir=none];
      d [URL="pages/d.html", fillcolor="#ff0000"];
    }`;
    const g = new Graph(parseGraph(dot).graph);
    expect(g.directed).toBe(true);
    expect(g.nodes).toHaveLength(4);
    expect(g.getNode('a')!.group).toBe('Team X');
    expect(g.getNode('a')!.shape).toBe('rectangle');
    expect(g.edges).toHaveLength(3);
    expect(g.edges[1].weight).toBe(3);
    expect(g.edges[2].directed).toBe(false);
    expect(g.getNode('d')!.url).toBe('pages/d.html');
  });

  it('imports a yEd GraphML file with UML class nodes, arrows and self loops', () => {
    const text = classesGraphml;
    expect(detectFormat(text, 'classes.graphml')).toBe('graphml');
    const { graph } = parseGraph(text);
    const g = new Graph(graph);
    expect(g.directed).toBe(true);
    expect(g.nodes).toHaveLength(4);
    const shape = g.getNode('n0')!;
    expect(shape.shape).toBe('card');
    expect(shape.label).toBe('Shape');
    expect(shape.url).toBe('docs/shape.html');
    expect(shape.body).toContain('---');
    expect(shape.body).toContain('+ area(): double');
    expect(shape.x).toBeCloseTo((150 + 65) * 0.5, 1);
    expect(shape.y).toBeCloseTo(-(30 + 45) * 0.5, 1);
    expect(g.getNode('n3')!.shape).toBe('circle');
    expect(g.getNode('n3')!.color).toBe('#FF9999');
    expect(g.edges).toHaveLength(4);
    expect(g.getEdge('e0')!.label).toBe('extends');
    expect(g.getEdge('e2')!.dashed).toBe(true);
    expect(g.getEdge('e3')!.directed).toBe(false);
    expect(g.getEdge('e3')!.source).toBe('n3');
  });

  it('rejects malformed input with a clear error', () => {
    expect(() => parseGraph('<graphml><graph>', { format: 'graphml' })).toThrow();
    expect(() => parseGraph('graph [ node [ id 1 ', { format: 'gml' })).toThrow();
    expect(() => parseGraph('digraph { a -> ', { format: 'dot' })).toThrow();
  });
});

describe('urls', () => {
  const policy = { baseUrl: '', allowAbsolute: false };
  it('allows relative paths and blocks scripts and absolute urls by default', () => {
    expect(resolveUrl('pages/a.html', policy)).toBe('pages/a.html');
    expect(resolveUrl('javascript:alert(1)', policy)).toBeNull();
    expect(resolveUrl('java\tscript:alert(1)', { ...policy, allowAbsolute: true })).toBeNull();
    expect(resolveUrl('https://example.com', policy)).toBeNull();
    expect(resolveUrl('https://example.com', { ...policy, allowAbsolute: true })).toBe('https://example.com');
    expect(resolveUrl('data:text/html,x', { ...policy, allowAbsolute: true })).toBeNull();
    expect(resolveUrl('./a.html', { baseUrl: 'content/', allowAbsolute: false })).toBe('content/a.html');
  });
});

describe('edge geometry', () => {
  const body = (x: number, y: number, r = 7): geometry.Body => ({ pos: [x, y, 0], hw: r, hh: r, ellipse: true });
  const opts = { spacing: 16, segments: 16, dim3: false, loopScale: 0.9 };

  it('clips straight edges to the node boundaries', () => {
    const p = geometry.edgePath(body(0, 0), body(100, 0), 0, 1, false, false, opts);
    expect(p).toHaveLength(2);
    expect(p[0][0]).toBeCloseTo(7, 1);
    expect(p[1][0]).toBeCloseTo(93, 1);
  });

  it('spreads parallel edges symmetrically', () => {
    const mid = (i: number): number => geometry.pointAtFraction(geometry.edgePath(body(0, 0), body(100, 0), i, 3, false, false, opts), 0.5)[1];
    expect(mid(1)).toBeCloseTo(0, 3);
    expect(mid(0)).toBeCloseTo(-mid(2), 3);
    expect(Math.abs(mid(0))).toBeGreaterThan(5);
  });

  it('draws self loops outside the node', () => {
    const b = body(0, 0);
    const p = geometry.edgePath(b, b, 0, 1, false, true, opts);
    expect(p.length).toBeGreaterThan(8);
    for (const q of p) expect(geometry.inside(q, b, false)).toBe(false);
  });

  it('shortens the end of a path for arrow heads', () => {
    const s = geometry.shortenEnd([[0, 0, 0], [10, 0, 0], [20, 0, 0]], 5);
    expect(s[s.length - 1][0]).toBeCloseTo(15, 5);
    expect(geometry.tipOf([[0, 0, 0], [0, 4, 0]]).dir).toEqual([0, 1, 0]);
  });
});

describe('layouts', () => {
  it('force layout pulls neighbours together and separates components', () => {
    const g = new Graph({
      nodes: ['a', 'b', 'c', 'x', 'y'].map((id) => ({ id })),
      edges: [{ id: '1', source: 'a', target: 'b' }, { id: '2', source: 'b', target: 'c' }, { id: '3', source: 'x', target: 'y' }],
    });
    const p = computeLayout(g, 'force', { dimension: '2d', idealLength: 50, iterations: 400 });
    const d = (u: string, v: string): number => geometry.dist3(p.get(u)!, p.get(v)!);
    for (const v of p.values()) expect(v.every(Number.isFinite)).toBe(true);
    expect(d('a', 'b')).toBeLessThan(d('a', 'x'));
    expect(p.get('a')![2]).toBe(0);
    const p3 = computeLayout(g, 'force', { dimension: '3d', iterations: 100 });
    expect(Math.abs(p3.get('a')![2]) + Math.abs(p3.get('b')![2]) + Math.abs(p3.get('c')![2])).toBeGreaterThan(0);
  });

  it('force layout scales to thousands of nodes (grid repulsion)', () => {
    const g = new Graph(generateClustered({ nodes: 2000, avgDegree: 3, seed: 3 }));
    const sim = new ForceSimulation(g, { dimension: '2d', idealLength: 40, gravity: 0.05, weightMode: 'ignore', seed: 1 });
    for (let i = 0; i < 5; i++) sim.step();
    expect(sim.entries().every(([, v]) => v.every(Number.isFinite))).toBe(true);
  });

  it('layered layout orders edges downwards, even with cycles', () => {
    const g = new Graph({
      directed: true,
      nodes: ['r', 'a', 'b', 'c', 'd'].map((id) => ({ id })),
      edges: [['r', 'a'], ['r', 'b'], ['a', 'c'], ['b', 'c'], ['c', 'd'], ['d', 'a']].map(([s, t], i) => ({ id: `e${i}`, source: s, target: t })),
    });
    const p = computeLayout(g, 'layered', { spacing: 40 });
    expect(p.get('r')![1]).toBeGreaterThan(p.get('a')![1]);
    expect(p.get('a')![1]).toBeGreaterThan(p.get('c')![1]);
    expect(p.get('c')![1]).toBeGreaterThan(p.get('d')![1]);
  });

  it('circle, grid, sphere and random place every node', () => {
    const g = new Graph(generateClustered({ nodes: 30, seed: 2 }));
    for (const name of ['circle', 'grid', 'sphere', 'random'] as const) expect(computeLayout(g, name, { dimension: '3d' }).size).toBe(30);
  });
});

describe('configuration and styling', () => {
  it('merges defaults, theme and user patch in that order', () => {
    const c = createConfig({ theme: 'dark', node: { size: 30 } });
    expect(c.background.color).toBe('#14181d');
    expect(c.node.size).toBe(30);
    expect(c.node.shape).toBe('circle');
    expect(mergeConfig({ a: { b: 1, c: 2 } }, { a: { b: 5 } })).toEqual({ a: { b: 5, c: 2 } });
    expect(createConfig().interaction.gizmo).toBe(false);
    expect(createConfig({ interaction: { gizmo: true }, gizmo: { snapRotate: 5 } }).gizmo).toEqual({ size: 0.9, space: 'world', snapTranslate: 10, snapRotate: 5, snapScale: 0.1 });
  });

  it('resolves styles: palette < rules < element values', () => {
    const cfg = createConfig({
      groups: { colors: { g2: '#00ff00' } },
      rules: [{ target: 'node', match: { group: 'g1' }, style: { shape: 'hexagon' } }, { target: 'edge', match: (e) => (e as { weight?: number }).weight === 2.5, style: { dashed: true } }],
    });
    const g = new Graph(sample());
    const idx = buildGroupIndex(g);
    const a = resolveNodeStyle(g.getNode('a')!, cfg, idx);
    expect(a.shape).toBe('diamond');
    expect(a.color).toBe('#112233');
    expect(a.size).toBe(20);
    expect(resolveNodeStyle(g.getNode('b')!, cfg, idx).color).toBe('#00ff00');
    expect(resolveEdgeStyle(g.getEdge('e1')!, 2.5, cfg, { min: 1, max: 3 }).dashed).toBe(true);
    const w = createConfig({ edge: { widthByWeight: { enabled: true, min: 1, max: 5 } } });
    expect(resolveEdgeStyle(g.getEdge('e2')!, 1, w, { min: 1, max: 3 }).width).toBe(1);
    expect(resolveEdgeStyle(g.getEdge('e3')!, 3, w, { min: 1, max: 3 }).width).toBe(5);
  });
});

describe('placement layouts respect node boxes', () => {
  const boxes = (g: Graph): Map<string, { w: number; h: number }> => new Map(g.nodes.map((n) => [n.id, { w: 60, h: 40 }]));
  const minDist = (p: Map<string, [number, number, number]>): number => {
    const v = [...p.values()];
    let m = Infinity;
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) m = Math.min(m, geometry.dist3(v[i], v[j]));
    return m;
  };

  it('circle and grid keep neighbours apart by at least the box size', () => {
    const g = new Graph(generateClustered({ nodes: 30, seed: 4 }));
    expect(minDist(computeLayout(g, 'circle', { boxes: boxes(g), gap: 12 }))).toBeGreaterThan(58);
    expect(minDist(computeLayout(g, 'grid', { boxes: boxes(g), gap: 12 }))).toBeGreaterThan(50);
  });

  it('layered layout leaves room between wide boxes in the same layer', () => {
    const g = new Graph({
      directed: true,
      nodes: ['r', 'a', 'b', 'c'].map((id) => ({ id })),
      edges: [['r', 'a'], ['r', 'b'], ['r', 'c']].map(([s, t], i) => ({ id: `e${i}`, source: s, target: t })),
    });
    const p = computeLayout(g, 'layered', { boxes: new Map(g.nodes.map((n) => [n.id, { w: 100, h: 30 }])), gap: 10 });
    expect(Math.abs(p.get('a')![0] - p.get('b')![0])).toBeGreaterThan(109);
  });
});

describe('tree layout', () => {
  it('centers parents over their children and never overlaps subtrees', () => {
    const g = new Graph({
      directed: true,
      nodes: ['root', 'a', 'b', 'a1', 'a2', 'a3', 'b1', 'x'].map((id) => ({ id })),
      edges: [['root', 'a'], ['root', 'b'], ['a', 'a1'], ['a', 'a2'], ['a', 'a3'], ['b', 'b1'], ['b1', 'x'], ['x', 'root']].map(([s, t], i) => ({ id: `e${i}`, source: s, target: t })),
    });
    const boxes = new Map(g.nodes.map((n) => [n.id, { w: 50, h: 30 }]));
    const p = computeLayout(g, 'tree', { boxes, gap: 10 });
    const x = (id: string): number => p.get(id)![0];
    const y = (id: string): number => p.get(id)![1];
    expect(x('a')).toBeCloseTo((x('a1') + x('a3')) / 2, 5);
    expect(x('root')).toBeCloseTo((x('a') + x('b')) / 2, 5);
    expect(y('root')).toBeGreaterThan(y('a'));
    expect(y('a')).toBeGreaterThan(y('a1'));
    expect(y('a1')).toBe(y('b1'));
    expect(x('a3')).toBeLessThan(x('b1'));
    expect(x('a2') - x('a1')).toBeGreaterThan(59);
    const lr = computeLayout(g, 'tree', { boxes, gap: 10, direction: 'LR' });
    expect(lr.get('root')![0]).toBeLessThan(lr.get('a')![0]);
  });

  it('handles forests, cycles without entry and undirected graphs', () => {
    const cyc = new Graph({ directed: true, nodes: ['a', 'b', 'c'].map((id) => ({ id })), edges: [['a', 'b'], ['b', 'c'], ['c', 'a']].map(([s, t], i) => ({ id: `e${i}`, source: s, target: t })) });
    expect(computeLayout(cyc, 'tree').size).toBe(3);
    const star = new Graph({ nodes: ['hub', 's1', 's2', 's3'].map((id) => ({ id })), edges: ['s1', 's2', 's3'].map((t, i) => ({ id: `e${i}`, source: t, target: 'hub' })) });
    const p = computeLayout(star, 'tree');
    expect(p.get('hub')![1]).toBeGreaterThan(p.get('s1')![1]);
    const big = new Graph(generateClustered({ nodes: 800, directed: true, seed: 5 }));
    expect([...computeLayout(big, 'tree').values()].every((v) => v.every(Number.isFinite))).toBe(true);
  });
});

describe('mixed network generator', () => {
  it('creates the requested node count with very different degrees', () => {
    const data = generateMixedNetwork({ nodes: 1200, seed: 7 });
    expect(data.nodes).toHaveLength(1200);
    const g = new Graph(data);
    const deg = new Map(g.nodes.map((n) => [n.id, 0]));
    for (const e of g.edges) {
      deg.set(e.source, deg.get(e.source)! + 1);
      deg.set(e.target, deg.get(e.target)! + 1);
    }
    const degrees = [...deg.values()];
    expect(Math.max(...degrees)).toBeGreaterThan(15);
    expect(degrees.filter((d) => d === 0).length).toBeGreaterThan(20);
    expect(g.nodes.filter((n) => n.group === 'Cliques' && deg.get(n.id)! >= 2).length).toBeGreaterThan(200);
    expect(g.edges.some((e) => e.source === e.target)).toBe(true);
    const pairs = new Set<string>();
    let parallel = 0;
    for (const e of g.edges) {
      const k = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
      if (pairs.has(k)) parallel++;
      pairs.add(k);
    }
    expect(parallel).toBeGreaterThan(2);
    expect(JSON.stringify(generateMixedNetwork({ nodes: 1200, seed: 7 }))).toBe(JSON.stringify(data));
    expect(generateMixedNetwork({ nodes: 60, seed: 1 }).nodes).toHaveLength(60);
  });
});

describe('commented configuration (JSON with comments)', () => {
  it('documents every option of the defaults', () => {
    expect(undocumentedConfigPaths()).toEqual([]);
    expect(Object.keys(CONFIG_DOCS).length).toBeGreaterThan(100);
  });

  it('writes the full configuration with explanations and reads it back unchanged', () => {
    const cfg = createConfig({ theme: 'dark', groups: { colors: { Sales: '#e0b872' } }, rules: [{ target: 'node', match: { group: 'x' }, style: { shape: 'diamond' } }] });
    const text = configToJsonc(cfg);
    expect(text).toContain('// Diameter in world units.');
    expect(text).toContain('// Full screen / back button');
    expect(JSON.stringify(parseJsonc(text))).toBe(JSON.stringify(cfg));
  });

  it('strips comments and trailing commas but keeps strings intact', () => {
    const v = parseJsonc('{ "a": "http://x // not a comment", // c\n "b": [1, 2,], /* block */ "c": { "d": 1, }, }') as { a: string; b: number[]; c: { d: number } };
    expect(v.a).toBe('http://x // not a comment');
    expect(v.b).toEqual([1, 2]);
    expect(v.c.d).toBe(1);
    expect(() => parseJsonc('{ "a": }')).toThrow();
  });

  it('reduces a full configuration to what differs from defaults and theme', () => {
    const base = createConfig({ theme: 'dark' });
    const edited = JSON.parse(JSON.stringify(base));
    edited.node.size = 20;
    edited.ui.fullscreen = false;
    edited.groups.colors.Sales = '#fff';
    expect(diffConfig(base, edited)).toEqual({ node: { size: 20 }, groups: { colors: { Sales: '#fff' } }, ui: { fullscreen: false } });
    expect(diffConfig(base, JSON.parse(JSON.stringify(base)))).toEqual({});
  });

  it('finds typos but allows user chosen keys', () => {
    expect(findUnknownKeys({ node: { sizee: 1, size: 2 }, foo: 2, groups: { colors: { Anything: '#fff' } }, ui: { cssVars: { custom: 'x' } } })).toEqual(['node.sizee', 'foo']);
  });

  it('shows the full screen button by default and lets it be removed', () => {
    expect(createConfig().ui.fullscreen).toBe(true);
    expect(createConfig({ ui: { fullscreen: false } }).ui.fullscreen).toBe(false);
  });
});

describe('link discoverability', () => {
  it('opens links with Ctrl-click by default and offers badge, hint and chip', () => {
    const c = createConfig();
    expect(c.interaction.openLinks).toBe('ctrl-click');
    expect(c.links.badge).toBe(true);
    expect(c.links.hint).toBe(true);
    expect(c.links.chip).toBe(true);
    expect(c.links.chipLabel).toBe('Open page');
  });

  it('names the gesture for tooltips', () => {
    expect(describeLinkGesture('ctrl-click')).toBe('Ctrl+click');
    expect(describeLinkGesture('ctrl-click', true)).toBe('Cmd+click');
    expect(describeLinkGesture('click')).toBe('Click');
    expect(describeLinkGesture('dblclick')).toBe('Double-click');
    expect(describeLinkGesture('never')).toBe('');
  });
});

describe('edge weights in the force layout', () => {
  const path = (): Graph =>
    new Graph({
      nodes: ['a', 'b', 'c'].map((id) => ({ id })),
      edges: [{ id: 'e1', source: 'a', target: 'b', weight: 1 }, { id: 'e2', source: 'b', target: 'c', weight: 4 }],
    });
  const lengths = (mode: 'ignore' | 'closer' | 'longer'): [number, number] => {
    const p = computeLayout(path(), 'force', { dimension: '2d', idealLength: 50, iterations: 800, weightMode: mode });
    return [geometry.dist3(p.get('a')!, p.get('b')!), geometry.dist3(p.get('b')!, p.get('c')!)];
  };

  it('ignores weights by default', () => {
    const [ab, bc] = lengths('ignore');
    expect(Math.abs(ab - bc)).toBeLessThan(Math.min(ab, bc) * 0.15);
  });

  it('"longer" makes heavy edges long (distance semantics)', () => {
    const [ab, bc] = lengths('longer');
    expect(bc / ab).toBeGreaterThan(2);
  });

  it('"closer" makes heavy edges short (similarity semantics)', () => {
    const [ab, bc] = lengths('closer');
    expect(ab / bc).toBeGreaterThan(2);
  });
});

describe('node search', () => {
  const g = new Graph({
    nodes: [
      { id: 'n1', label: 'Ada Lovelace', group: 'Engineering', tags: ['math'], props: { year: 1815 } },
      { id: 'n2', label: 'Grace Hopper', sublabel: 'Compiler pioneer', group: 'Engineering', url: 'pages/grace.html' },
      { id: 'n3', label: 'Eva', group: 'Design Team' },
      { id: 'n4', label: 'Adam', group: 'Sales' },
    ],
    edges: [],
  });
  const index = new NodeSearchIndex(g);

  it('finds substrings in labels, sublabels, ids and groups, ignoring case', () => {
    expect(index.search('ada').ids).toEqual(['n1', 'n4']);
    expect(index.search('PIONEER').ids).toEqual(['n2']);
    expect(index.search('n3').ids).toEqual(['n3']);
    expect(index.search('engineer').ids).toEqual(['n1', 'n2']);
  });

  it('selects whole groups with a field prefix, quotes and several terms', () => {
    expect(index.search('group:sales').ids).toEqual(['n4']);
    expect(index.search('group:"design team"').ids).toEqual(['n3']);
    expect(index.search('group:engineering grace').ids).toEqual(['n2']);
    expect(index.search('tag:math').ids).toEqual(['n1']);
    expect(index.search('1815').ids).toEqual(['n1']);
    expect(index.search('pages/').ids).toEqual([]);
    expect(index.search('url:pages/').ids).toEqual(['n2']);
  });

  it('ignores terms shorter than minChars and reports it', () => {
    const r = index.search('a');
    expect(r.ids).toEqual([]);
    expect(r.tooShort).toBe(true);
    expect(index.search('a', { minChars: 1 }).ids.length).toBeGreaterThan(0);
    expect(index.search('').tooShort).toBe(false);
    expect(parseQuery('http://x a:b')).toEqual([{ field: undefined, term: 'http://x' }, { field: undefined, term: 'a:b' }]);
  });

  it('stays fast for 10000 nodes', () => {
    const big = new Graph(generateClustered({ nodes: 10000, seed: 3 }));
    const idx = new NodeSearchIndex(big);
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) idx.search('group 7 n12');
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(idx.search('group:"group 1"').ids.length).toBeGreaterThan(100);
  });
});

describe('help lines', () => {
  it('lists only controls that exist', () => {
    const text = (c = createConfig()): string => helpLines(c).map((l) => `${l.keys} ${l.text}`).join('\n');
    expect(text()).toContain('Ctrl+click');
    expect(text()).toContain('Open page');
    expect(text()).toContain('Search box');
    expect(text()).toContain('Esc');
    expect(text()).toContain('Pan');
    expect(text(createConfig({ dimension: '3d' }))).toContain('Rotate');
    expect(text(createConfig({ interaction: { openLinks: 'never' } }))).not.toContain('Open the linked page');
    expect(text(createConfig({ ui: { search: false, fullscreen: false } }))).not.toContain('Search box');
    expect(text(createConfig({ interaction: { gizmo: true } }))).toContain('handles');
    expect(text(createConfig())).not.toContain('handles');
  });
});
