import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// The core must run in a Web Worker: no DOM, no Node, no imports outside the
// package (only expr.ts may import @johnhenry/math, type-only plus Symbolic).
const SRC = new URL("../src/", import.meta.url);
const FORBIDDEN =
  /\b(document|window|navigator|process|require|Buffer|globalThis|self|postMessage|HTMLCanvasElement|OffscreenCanvas|Blob|URL)\b/;

test("core modules reference no DOM / Node globals and import only siblings", () => {
  for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts") && n !== "expr.ts")) {
    const code = readFileSync(new URL(f, SRC), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, FORBIDDEN, f);
    for (const m of code.matchAll(/from\s+"([^"]+)"/g)) assert.match(m[1], /^\.\/[\w-]+\.ts$/, `${f} imports ${m[1]}`);
  }
});

test("expr.ts is the only module that touches @johnhenry/math", () => {
  const code = readFileSync(new URL("expr.ts", SRC), "utf8");
  assert.match(code, /@johnhenry\/math/);
});
