#!/usr/bin/env node
// Publishes every non-private workspace package whose version isn't on npm yet.
//
// Generalizes the single-package `npm-publish-if-new.mjs` idiom to the
// workspace: the version field is the signal — bump it in a PR, merge, cut a
// release, and CI publishes exactly what's new. Idempotent, so re-running a
// release or a manual dispatch is safe.
//
// Usage: node scripts/publish-workspaces.mjs [--dry-run]
// Requires NODE_AUTH_TOKEN when actually publishing.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

const packagesDir = join(ROOT, "packages");
const entries = await readdir(packagesDir, { withFileTypes: true });

let published = 0;
let failed = 0;

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const dir = join(packagesDir, entry.name);

  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  } catch {
    continue; // not a package
  }
  if (pkg.private) {
    console.log(`⏭️  skip ${pkg.name}: private`);
    continue;
  }

  const spec = `${pkg.name}@${pkg.version}`;
  const view = spawnSync("npm", ["view", spec, "version"], {
    cwd: dir,
    encoding: "utf8",
  });
  if (view.status === 0 && view.stdout.trim() !== "") {
    console.log(`⏭️  skip ${spec}: already published`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`🔎 would publish ${spec}`);
    continue;
  }

  console.log(`🚀 publishing ${spec} ...`);
  const result = spawnSync(
    "npm",
    ["publish", "--provenance", "--access", "public"],
    { cwd: dir, stdio: "inherit" },
  );
  if (result.status === 0) published++;
  else {
    console.error(`❌ failed to publish ${spec}`);
    failed++;
  }
}

console.log(`\nPublished ${published} package(s); ${failed} failure(s).`);
process.exit(failed > 0 ? 1 : 0);
