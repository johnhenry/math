/**
 * Regression test for issue #79 (github.com/johnhenry/math/issues/79): a
 * caret range on a pre-1.0 `0.0.x` version only ever matches that EXACT
 * version (npm's well-known 0.0.x-caret quirk), so a stale
 * `@johnhenry/math: "^0.0.0"` (or `"^0.0.1"`, etc.) dependency installs a
 * SECOND copy of `@johnhenry/math` alongside whatever newer patch version
 * a consumer actually depends on -- `instanceof` checks and CAS-object
 * identity across the two copies then silently diverge (this package's
 * whole purpose is patching `Number.prototype` with methods that hand
 * back a `ComplexNumber` from the CALLER's own `@johnhenry/math` copy, so
 * a duplicate is exactly the failure mode that matters here). The fix
 * widens the range to the non-caret `">=0.0.0 <0.1.0"`, which keeps
 * matching every 0.0.x patch release without needing a bump in lockstep
 * with `math` every time -- unlike a caret-bump (e.g. the earlier
 * `^0.0.0` -> `^0.0.1` fix for this exact package), which only fixes the
 * mismatch that exists TODAY and drifts stale again the next time `math`
 * publishes a patch.
 *
 * Real npm currently only has `@johnhenry/math` published at `0.0.0` and
 * `0.0.1`, so testing purely against the real registry can't distinguish
 * "fixed for the version that happens to be current" from "fixed for
 * real" -- a hypothetical future `0.0.2` is exactly what a caret-bump
 * fix would NOT survive. This test manufactures that future version as a
 * local `file:` fixture (a minimal but structurally real package, not a
 * mock of npm's resolver) alongside a real `npm pack` of this package's
 * own tree, installs both into a fresh temp consumer, and asserts `npm ls`
 * shows one deduped copy. `turbo.json` makes `build` a dependency of
 * `test`, so `dist/` (required by this package's own `files` field, hence
 * by `npm pack`) already exists by the time this test runs.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

/** A minimal but structurally real `@johnhenry/math` fixture at a version that has never actually been published (real npm only has 0.0.0/0.0.1) -- standing in for "whatever math's next patch release is", the exact case a caret-bump fix (rather than a genuinely open range) fails to survive. */
async function writeFutureMathFixture(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "@johnhenry/math", version: "0.0.2", type: "module", main: "index.js", exports: { ".": "./index.js" } },
      null,
      2,
    ),
  );
  await writeFile(path.join(dir, "index.js"), "export class ComplexNumber {}\n");
  return dir;
}

test("install-time dedupe: a fresh consumer depending on a NEWER (future, not-yet-published) @johnhenry/math patch alongside this package resolves ONE copy, not two", {
  timeout: 120_000,
}, async () => {
  const work = await mkdtemp(path.join(tmpdir(), "math-prototype-patch-dedupe-"));
  try {
    const { stdout: packOut } = await execFileAsync("npm", ["pack", "--silent", "--pack-destination", work], {
      cwd: PACKAGE_ROOT,
    });
    const tarballName = packOut.trim().split("\n").pop()!.trim();
    const tarballPath = path.join(work, tarballName);

    const mathFixtureDir = await writeFutureMathFixture(path.join(work, "math-0.0.2"));

    const consumerDir = path.join(work, "consumer");
    await mkdir(consumerDir);
    await writeFile(
      path.join(consumerDir, "package.json"),
      JSON.stringify(
        {
          name: "math-prototype-patch-dedupe-consumer",
          private: true,
          version: "0.0.0",
          dependencies: {
            "@johnhenry/math": `file:${mathFixtureDir}`,
            "@johnhenry/math-prototype-patch": `file:${tarballPath}`,
          },
        },
        null,
        2,
      ),
    );

    await execFileAsync("npm", ["install", "--no-audit", "--no-fund"], { cwd: consumerDir });

    const { stdout: lsOut } = await execFileAsync("npm", ["ls", "@johnhenry/math", "--all", "--json"], {
      cwd: consumerDir,
    });
    const tree = JSON.parse(lsOut) as {
      dependencies: {
        "@johnhenry/math"?: { version?: string };
        "@johnhenry/math-prototype-patch"?: { dependencies?: Record<string, { version?: string; resolved?: string }> };
      };
    };
    const topLevel = tree.dependencies["@johnhenry/math"];
    const nested = tree.dependencies["@johnhenry/math-prototype-patch"]?.dependencies?.["@johnhenry/math"];
    assert.equal(
      topLevel?.version,
      "0.0.2",
      "expected the top-level @johnhenry/math to resolve to the future-fixture version",
    );
    // A single deduped copy means math-prototype-patch's OWN
    // @johnhenry/math dependency is satisfied by hoisting to the
    // top-level install -- `npm ls --json` represents that as EITHER
    // omitting the nested entry entirely, or listing it with no
    // "resolved" of its own (nothing separate was fetched for it) and
    // the SAME version as the top-level copy. A genuine duplicate (the
    // pre-fix caret-pin bug) instead shows its own "resolved"
    // tarball/registry URL and a different (older) version -- the real
    // registry's 0.0.0 or 0.0.1, whichever the stale caret matched.
    assert.ok(
      !nested || (nested.resolved === undefined && nested.version === topLevel.version),
      `expected @johnhenry/math to dedupe to a single copy matching the top-level version ${topLevel?.version}; math-prototype-patch's own dependency entry was ${JSON.stringify(nested)} (a separately-"resolved" or differently-versioned entry means npm installed a second, separate copy)`,
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
