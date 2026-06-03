import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Tell Node how to interpret the .js files in each output folder, so the dual
// build works under plain `require` (cjs) and native ESM (esm) alike.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

for (const [dir, type] of [
  ["cjs", "commonjs"],
  ["esm", "module"],
]) {
  const target = resolve(root, dir);
  mkdirSync(target, { recursive: true });
  writeFileSync(resolve(target, "package.json"), JSON.stringify({ type }, null, 2) + "\n");
}
