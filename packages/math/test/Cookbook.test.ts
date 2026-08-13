/**
 * Docs-as-tests (issue #17, pattern from Woxi's scrut-run documentation —
 * see mallory-plus's docs/spikes/woxi-study.md): every fenced ```ts block in
 * docs/COOKBOOK.md is EXECUTED by this suite, so a documented example that
 * stops compiling or starts throwing fails CI instead of silently rotting.
 *
 * Two levels of checking:
 *
 * 1. Every block must run to completion (imports rewritten from
 *    "mallory-math" to this package's src/index.ts; blocks execute as real
 *    ES modules under Node's type stripping). This catches API renames,
 *    signature changes, and removed exports — the dominant doc-rot mode.
 *
 * 2. Lines ending in `// => <expression>` additionally assert the value:
 *    `Statistics.mean(sample); // => 5` becomes a tolerant deep-equality
 *    check (numbers to 1e-9 relative, bigints/strings exact, arrays/objects
 *    recursive). Approximate or prose comments (`// ≈ -1 + 0i`) are left
 *    alone and get level-1 checking only.
 *
 * Blocks marked with `<!-- cookbook: skip -->` on the line directly above
 * the fence are excluded (none currently — the marker exists so any future
 * exclusion is explicit and grep-able, never silent).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const HERE = new URL(".", import.meta.url).pathname;
const COOKBOOK = join(HERE, "../docs/COOKBOOK.md");
const INDEX_URL = pathToFileURL(join(HERE, "../src/index.ts")).href;

interface DocBlock {
  heading: string;
  fenceLine: number;
  code: string;
  skipped: boolean;
}

function extractBlocks(markdown: string): DocBlock[] {
  const lines = markdown.split("\n");
  const blocks: DocBlock[] = [];
  let heading = "(preamble)";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const h = line.match(/^#+\s+(.*)$/);
    if (h) heading = h[1] as string;
    if (line.trim() === "```ts") {
      const skipped = (lines[i - 1] ?? "").includes("<!-- cookbook: skip -->");
      const start = i + 1;
      let end = start;
      while (end < lines.length && (lines[end] as string).trim() !== "```") end++;
      blocks.push({ heading, fenceLine: i + 1, code: lines.slice(start, end).join("\n"), skipped });
      i = end;
    }
  }
  return blocks;
}

/** Tolerant deep equality: numbers to 1e-9 relative (docs quote rounded
 * values sometimes; float noise must not fail a doc), everything else exact
 * shape/value. */
function docEqual(actual: unknown, expected: unknown): boolean {
  if (typeof expected === "number" && typeof actual === "number") {
    if (Number.isNaN(expected)) return Number.isNaN(actual);
    return Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => docEqual(actual[i], e));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") return false;
    const ek = Object.keys(expected as object);
    const ak = Object.keys(actual as object);
    return (
      ek.length === ak.length &&
      ek.every((k) => docEqual((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k]))
    );
  }
  return Object.is(actual, expected) || actual === expected;
}

const CHECK_RE = /^(\s*)([^/].*?);\s*\/\/\s*=>\s*(.+?)\s*$/;

/** Rewrite one doc block into an executable module: imports resolved to
 * src/index.ts, `EXPR; // => V` lines turned into __docCheck calls. */
function materialize(block: DocBlock): string {
  const out: string[] = [
    `const __docEqual = ${docEqual.toString()};`,
    `function __docCheck(actualFn, expectedFn, where) {`,
    `  const actual = actualFn();`,
    `  const expected = expectedFn();`,
    `  if (!__docEqual(actual, expected)) {`,
    `    throw new Error("documented value is wrong at " + where + ": documented " + __show(expected) + " but got " + __show(actual));`,
    `  }`,
    `}`,
    `function __show(v) { return typeof v === "bigint" ? v + "n" : JSON.stringify(v); }`,
  ];
  const lines = block.code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] as string).replace(/from\s+"mallory-math"/g, `from ${JSON.stringify(INDEX_URL)}`);
    const m = line.match(CHECK_RE);
    const stmt = m?.[2] ?? "";
    const isCheckable =
      m && !/^(const|let|var|import|type|function|class|return)\b/.test(stmt.trim()) && !stmt.includes("//");
    if (m && isCheckable) {
      out.push(
        `${m[1]}__docCheck(() => (${stmt}), () => (${m[3]}), ${JSON.stringify(`COOKBOOK.md "${block.heading}" block line ${i + 1}`)});`,
      );
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

test("every COOKBOOK.md ```ts block runs, and every `// =>` documented value matches", async (t) => {
  const blocks = extractBlocks(readFileSync(COOKBOOK, "utf8"));
  assert.ok(blocks.length >= 15, `expected a substantial cookbook, found only ${blocks.length} ts blocks`);
  const checkCount = blocks.reduce(
    (n, b) => n + b.code.split("\n").filter((l) => CHECK_RE.test(l)).length,
    0,
  );
  assert.ok(checkCount >= 20, `expected >= 20 checked (// =>) doc values, found ${checkCount} -- conversions have regressed`);

  const dir = mkdtempSync(join(tmpdir(), "mallory-cookbook-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  for (const [i, block] of blocks.entries()) {
    await t.test(`${block.heading} (fence at COOKBOOK.md:${block.fenceLine})`, async () => {
      if (block.skipped) return; // explicit, grep-able opt-out only
      const file = join(dir, `block-${i}.ts`);
      writeFileSync(file, materialize(block));
      await import(pathToFileURL(file).href); // throws -> the doc is wrong
    });
  }
});
