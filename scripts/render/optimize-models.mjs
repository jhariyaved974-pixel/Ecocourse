// Post-processes the generated product models for the web: merges meshes per
// material (fewer draw calls), simplifies to a triangle budget suitable for
// phones, then re-quantizes and meshopt-compresses.
//
//   node scripts/render/optimize-models.mjs [--budget=60000] [files...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, flatten, join, meshopt, prune, quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const budget = Number(args.find((a) => a.startsWith('--budget='))?.split('=')[1] ?? 60000);
const files = args.filter((a) => !a.startsWith('--'));
const dir = path.resolve('public/models');
const targets = files.length ? files : readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => path.join(dir, f));

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

function triangles(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return n;
}

for (const file of targets) {
  const before = statSync(file).size;
  const doc = await io.read(file);
  const tris = triangles(doc);
  await doc.transform(dequantize(), flatten(), join({ keepNamed: false }), weld());
  if (tris > budget) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: budget / tris, error: 0.002, lockBorder: false }));
  }
  await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const meshes = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
  await io.write(file, doc);
  console.log(`${path.basename(file)}: ${Math.round(tris)} → ${Math.round(triangles(doc))} tris, ${meshes} draw calls, ${(before / 1024).toFixed(0)} KB → ${(statSync(file).size / 1024).toFixed(0)} KB`);
}
