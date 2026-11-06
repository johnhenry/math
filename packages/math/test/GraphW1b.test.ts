import assert from "node:assert/strict";
import { test } from "node:test";
import { Graph } from "../src/Graph.ts";

const weighted = () => {
  const g = new Graph<string>();
  g.addEdge("a", "b", 4).addEdge("a", "c", 1).addEdge("b", "c", 2).addEdge("b", "d", 5).addEdge("c", "d", 8);
  return g;
};

for (const algorithm of ["kruskal", "prim"] as const) {
  test(`mst (${algorithm}) finds the minimum spanning tree`, () => {
    const r = weighted().mst(algorithm);
    assert.equal(r.totalWeight, 8); // a-c 1, b-c 2, b-d 5
    assert.equal(r.edges.length, 3);
    assert.equal(r.components, 1);
  });

  test(`mst (${algorithm}) of a disconnected graph is a forest`, () => {
    const g = weighted();
    g.addEdge("x", "y", 3).addVertex("lonely");
    const r = g.mst(algorithm);
    assert.equal(r.components, 3);
    assert.equal(r.edges.length, g.vertices().length - 3);
    assert.equal(r.totalWeight, 11);
  });
}

test("mst works on a directed graph by ignoring direction", () => {
  const g = new Graph<number>(true);
  g.addEdge(1, 2, 1).addEdge(3, 2, 2).addEdge(1, 3, 10);
  assert.equal(g.mst().totalWeight, 3);
});

const digraph = () => {
  const g = new Graph<string>(true);
  g.addEdge("a", "b")
    .addEdge("b", "c")
    .addEdge("c", "a")
    .addEdge("c", "d")
    .addEdge("d", "e")
    .addEdge("e", "d")
    .addEdge("e", "f");
  return g;
};

test("scc is Tarjan's strongly connected components", () => {
  const sccs = digraph()
    .scc()
    .map((c) => [...c].sort())
    .sort((x, y) => x[0].localeCompare(y[0]));
  assert.deepEqual(sccs, [["a", "b", "c"], ["d", "e"], ["f"]]);
});

test("condensation collapses components into a DAG", () => {
  const { graph, components, componentOf } = digraph().condensation();
  assert.equal(components.length, 3);
  assert.equal(graph.hasCycle(), false);
  const id = (v: string) => componentOf.get(v) as number;
  assert.equal(id("a"), id("c"));
  assert.deepEqual(
    graph
      .edges()
      .map((e) => [e.from, e.to])
      .sort(),
    [
      [id("a"), id("d")],
      [id("e"), id("f")],
    ].sort(),
  );
  const topo = graph.topologicalSort() as number[];
  assert.ok(topo.indexOf(id("a")) < topo.indexOf(id("d")) && topo.indexOf(id("d")) < topo.indexOf(id("f")));
});
