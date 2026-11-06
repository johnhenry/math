/**
 * Graph — a weighted (optionally directed) graph with the standard algorithms:
 * breadth/depth-first traversal, Dijkstra shortest paths, minimum spanning tree
 * (Kruskal), topological sort, connected components, cycle detection, and
 * conversion to an adjacency matrix (feeding {@link MatrixMath}) with
 * Floyd-Warshall all-pairs distances.
 */

export interface Edge<T> {
  from: T;
  to: T;
  weight: number;
}

/**
 * Minimal binary min-heap keyed by a numeric priority, used by
 * {@link Graph.dijkstra} / {@link Graph.shortestPath} to pick the next
 * closest unvisited vertex in O(log n) instead of a linear scan. Supports
 * duplicate/stale entries (an item can be pushed more than once when its
 * distance improves); the caller is expected to skip entries whose stored
 * priority no longer matches the current best-known distance ("lazy
 * deletion"), which is cheaper than a decrease-key operation.
 */
class MinHeap<T> {
  private readonly items: Array<{ priority: number; value: T }> = [];

  get size(): number {
    return this.items.length;
  }

  push(value: T, priority: number): void {
    this.items.push({ priority, value });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): { priority: number; value: T } | undefined {
    const top = this.items[0];
    if (top === undefined) return undefined;
    const last = this.items.pop() as { priority: number; value: T };
    if (this.items.length) {
      this.items[0] = last;
      let i = 0;
      const n = this.items.length;
      for (;;) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < n && this.items[left].priority < this.items[smallest].priority) smallest = left;
        if (right < n && this.items[right].priority < this.items[smallest].priority) smallest = right;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

export class Graph<T = string | number> {
  readonly directed: boolean;
  private readonly adjacency = new Map<T, Map<T, number>>();

  constructor(directed = false) {
    this.directed = directed;
  }

  addVertex(v: T): this {
    if (!this.adjacency.has(v)) this.adjacency.set(v, new Map());
    return this;
  }

  addEdge(u: T, v: T, weight = 1): this {
    this.addVertex(u).addVertex(v);
    (this.adjacency.get(u) as Map<T, number>).set(v, weight);
    if (!this.directed) (this.adjacency.get(v) as Map<T, number>).set(u, weight);
    return this;
  }

  vertices(): T[] {
    return [...this.adjacency.keys()];
  }

  neighbors(v: T): T[] {
    return [...(this.adjacency.get(v)?.keys() ?? [])];
  }

  edges(): Array<Edge<T>> {
    const out: Array<Edge<T>> = [];
    const seen = new Set<string>();
    for (const [from, nbrs] of this.adjacency) {
      for (const [to, weight] of nbrs) {
        if (!this.directed) {
          const key = JSON.stringify([from, to].map(String).sort());
          if (seen.has(key)) continue;
          seen.add(key);
        }
        out.push({ from, to, weight });
      }
    }
    return out;
  }

  /** Breadth-first traversal order from `start`. */
  bfs(start: T): T[] {
    const visited = new Set<T>([start]);
    const order: T[] = [];
    const queue: T[] = [start];
    while (queue.length) {
      const v = queue.shift() as T;
      order.push(v);
      for (const n of this.neighbors(v))
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
    }
    return order;
  }

  /** Depth-first traversal order from `start`. */
  dfs(start: T): T[] {
    const visited = new Set<T>();
    const order: T[] = [];
    const visit = (v: T) => {
      visited.add(v);
      order.push(v);
      for (const n of this.neighbors(v)) if (!visited.has(n)) visit(n);
    };
    visit(start);
    return order;
  }

  /**
   * Shared Dijkstra core used by {@link dijkstra} and {@link shortestPath}:
   * a binary min-heap keyed on tentative distance replaces the O(V) linear
   * scan for "closest unvisited vertex", bringing the algorithm from
   * O(V²) down to the standard O((V+E) log V). Stale heap entries (pushed
   * when a shorter distance was later found) are skipped lazily instead of
   * removed, which is cheaper than a decrease-key operation.
   */
  private runDijkstra(start: T): { dist: Map<T, number>; prev: Map<T, T> } {
    const dist = new Map<T, number>();
    const prev = new Map<T, T>();
    for (const v of this.vertices()) dist.set(v, Number.POSITIVE_INFINITY);
    dist.set(start, 0);
    const visited = new Set<T>();
    const heap = new MinHeap<T>();
    heap.push(start, 0);
    while (heap.size) {
      const top = heap.pop() as { priority: number; value: T };
      const u = top.value;
      if (visited.has(u)) continue;
      if (top.priority > (dist.get(u) as number)) continue; // stale entry
      visited.add(u);
      for (const [n, w] of this.adjacency.get(u) ?? []) {
        if (visited.has(n)) continue;
        const nd = (dist.get(u) as number) + w;
        if (nd < (dist.get(n) as number)) {
          dist.set(n, nd);
          prev.set(n, u);
          heap.push(n, nd);
        }
      }
    }
    return { dist, prev };
  }

  /** Dijkstra shortest-path distances from `start` (non-negative weights). */
  dijkstra(start: T): Map<T, number> {
    return this.runDijkstra(start).dist;
  }

  /** The shortest path from `start` to `end` as `{ distance, path }`. */
  shortestPath(start: T, end: T): { distance: number; path: T[] } {
    const { dist, prev } = this.runDijkstra(start);
    if (dist.get(end) === Number.POSITIVE_INFINITY) return { distance: Number.POSITIVE_INFINITY, path: [] };
    const path: T[] = [];
    let cur: T | undefined = end;
    while (cur !== undefined) {
      path.unshift(cur);
      cur = cur === start ? undefined : prev.get(cur);
    }
    return { distance: dist.get(end) as number, path };
  }

  /** Connected components (undirected graphs). */
  connectedComponents(): T[][] {
    const seen = new Set<T>();
    const components: T[][] = [];
    for (const v of this.vertices()) {
      if (seen.has(v)) continue;
      const comp = this.bfs(v);
      for (const c of comp) seen.add(c);
      components.push(comp);
    }
    return components;
  }

  /** Topological order for a DAG, or `null` if the graph has a cycle. */
  topologicalSort(): T[] | null {
    const inDegree = new Map<T, number>();
    for (const v of this.vertices()) inDegree.set(v, 0);
    for (const [, nbrs] of this.adjacency) for (const [to] of nbrs) inDegree.set(to, (inDegree.get(to) as number) + 1);
    const queue = this.vertices().filter((v) => inDegree.get(v) === 0);
    const order: T[] = [];
    while (queue.length) {
      const v = queue.shift() as T;
      order.push(v);
      for (const n of this.neighbors(v)) {
        inDegree.set(n, (inDegree.get(n) as number) - 1);
        if (inDegree.get(n) === 0) queue.push(n);
      }
    }
    return order.length === this.vertices().length ? order : null;
  }

  /** True when the graph contains a cycle. */
  hasCycle(): boolean {
    if (this.directed) return this.topologicalSort() === null;
    const seen = new Set<T>();
    const visit = (v: T, parent: T | null): boolean => {
      seen.add(v);
      for (const n of this.neighbors(v)) {
        if (!seen.has(n)) {
          if (visit(n, v)) return true;
        } else if (n !== parent) return true;
      }
      return false;
    };
    for (const v of this.vertices()) if (!seen.has(v) && visit(v, null)) return true;
    return false;
  }

  /** Minimum spanning tree (Kruskal) of an undirected graph, as a list of edges. */
  minimumSpanningTree(): Array<Edge<T>> {
    const parent = new Map<T, T>();
    const find = (x: T): T => {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x) as T) as T);
        x = parent.get(x) as T;
      }
      return x;
    };
    for (const v of this.vertices()) parent.set(v, v);
    const mst: Array<Edge<T>> = [];
    for (const e of this.edges().sort((a, b) => a.weight - b.weight)) {
      const ra = find(e.from);
      const rb = find(e.to);
      if (ra !== rb) {
        parent.set(ra, rb);
        mst.push(e);
      }
    }
    return mst;
  }

  /**
   * Minimum spanning tree (or forest, when the graph is disconnected) with
   * its total weight and the number of connected components. Edge direction
   * is ignored. `algorithm` picks Kruskal (default, sort + union-find) or
   * Prim (heap-based, grown from each unvisited vertex in turn); both give
   * the same total weight, though tie-broken edge choices may differ.
   */
  mst(algorithm: "kruskal" | "prim" = "kruskal"): { edges: Array<Edge<T>>; totalWeight: number; components: number } {
    const n = this.vertices().length;
    let edges: Array<Edge<T>>;
    if (algorithm === "kruskal") edges = this.minimumSpanningTree();
    else {
      edges = [];
      const nbrs = new Map<T, Array<Edge<T>>>();
      for (const v of this.vertices()) nbrs.set(v, []);
      for (const e of this.edges()) {
        (nbrs.get(e.from) as Array<Edge<T>>).push(e);
        (nbrs.get(e.to) as Array<Edge<T>>).push(e);
      }
      const seen = new Set<T>();
      for (const root of this.vertices()) {
        if (seen.has(root)) continue;
        seen.add(root);
        const heap = new MinHeap<Edge<T>>();
        for (const e of nbrs.get(root) as Array<Edge<T>>) heap.push(e, e.weight);
        for (let top = heap.pop(); top; top = heap.pop()) {
          const e = top.value;
          const next = seen.has(e.from) ? e.to : e.from;
          if (seen.has(next)) continue;
          seen.add(next);
          edges.push(e);
          for (const f of nbrs.get(next) as Array<Edge<T>>)
            if (!seen.has(f.from) || !seen.has(f.to)) heap.push(f, f.weight);
        }
      }
    }
    return { edges, totalWeight: edges.reduce((s, e) => s + e.weight, 0), components: n - edges.length };
  }

  /** Alias of {@link stronglyConnectedComponents} (Tarjan; components in reverse topological order). */
  scc(): T[][] {
    return this.stronglyConnectedComponents();
  }

  /**
   * The condensation: one vertex per strongly connected component (numbered
   * by position in {@link scc}'s output), with one weight-1 edge `i -> j`
   * wherever the original graph has any edge from a member of `i` to a
   * member of `j`. Always a DAG. Also returns the `components` and the
   * `componentOf` vertex-to-index map.
   */
  condensation(): { graph: Graph<number>; components: T[][]; componentOf: Map<T, number> } {
    const components = this.scc();
    const componentOf = new Map<T, number>();
    components.forEach((c, i) => {
      for (const v of c) componentOf.set(v, i);
    });
    const graph = new Graph<number>(true);
    for (let i = 0; i < components.length; i++) graph.addVertex(i);
    for (const e of this.edges()) {
      const a = componentOf.get(e.from) as number;
      const b = componentOf.get(e.to) as number;
      if (a !== b) graph.addEdge(a, b, 1);
      if (!this.directed && a !== b) graph.addEdge(b, a, 1);
    }
    return { graph, components, componentOf };
  }

  /** Adjacency matrix (rows/cols follow the returned `order`; `Infinity` = no edge). */
  toAdjacencyMatrix(): { matrix: number[][]; order: T[] } {
    const order = this.vertices();
    const index = new Map(order.map((v, i) => [v, i]));
    const n = order.length;
    const matrix = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 0 : Number.POSITIVE_INFINITY)),
    );
    for (const [from, nbrs] of this.adjacency) {
      for (const [to, w] of nbrs) matrix[index.get(from) as number][index.get(to) as number] = w;
    }
    return { matrix, order };
  }

  /**
   * Strongly connected components (Tarjan's algorithm, single DFS pass,
   * O(V+E)) — maximal vertex sets where every vertex can reach every
   * other via directed edges. On an undirected graph this always reduces
   * to {@link connectedComponents} (every edge is bidirectional, so
   * "strongly connected" and "connected" coincide) — `connectedComponents`
   * is the more direct choice there; this method exists for directed
   * graphs, e.g. pruning a compatibility digraph down to the vertices
   * that can actually participate in a cycle.
   */
  stronglyConnectedComponents(): T[][] {
    let index = 0;
    const indices = new Map<T, number>();
    const lowlink = new Map<T, number>();
    const onStack = new Set<T>();
    const stack: T[] = [];
    const components: T[][] = [];

    const strongconnect = (v: T): void => {
      indices.set(v, index);
      lowlink.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);

      for (const w of this.neighbors(v)) {
        if (!indices.has(w)) {
          strongconnect(w);
          lowlink.set(v, Math.min(lowlink.get(v) as number, lowlink.get(w) as number));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v) as number, indices.get(w) as number));
        }
      }

      if (lowlink.get(v) === indices.get(v)) {
        const component: T[] = [];
        let w: T;
        do {
          w = stack.pop() as T;
          onStack.delete(w);
          component.push(w);
        } while (w !== v);
        components.push(component);
      }
    };

    for (const v of this.vertices()) if (!indices.has(v)) strongconnect(v);
    return components;
  }

  /** All-pairs shortest distances by Floyd-Warshall. */
  floydWarshall(): { distances: number[][]; order: T[] } {
    const { matrix, order } = this.toAdjacencyMatrix();
    const n = order.length;
    const d = matrix.map((row) => [...row]);
    for (let k = 0; k < n; k++)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
    return { distances: d, order };
  }
}
