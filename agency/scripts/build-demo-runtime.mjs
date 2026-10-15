// Bundles the client-side runtime that every generated demo preview ships with.
// Output: public/demo-runtime/{boot.js,runtime.js,scene.js} (copied into each preview's assets/).
import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "demo-runtime");
await mkdir(out, { recursive: true });

const common = { bundle: true, minify: true, format: "esm", target: ["es2020", "safari15"], legalComments: "none", logLevel: "info" };
await build({ ...common, entryPoints: [path.join(root, "demo-runtime/runtime.ts")], outfile: path.join(out, "runtime.js"), external: ["./scene.js"] });
await build({ ...common, entryPoints: [path.join(root, "demo-runtime/scene.ts")], outfile: path.join(out, "scene.js") });
await build({ ...common, format: "iife", entryPoints: [path.join(root, "demo-runtime/boot.js")], outfile: path.join(out, "boot.js") });

// Optional product model for the shoes template (optimised GLB from the existing store's asset pipeline).
const model = path.join(root, "demo-runtime/models/sneaker.glb");
try {
  await copyFile(model, path.join(out, "sneaker.glb"));
} catch {
  /* model is optional */
}
