// Checks that the admin preview renderer (weberact-admin/assets/cms-render.js) and the build renderer
// (tools/cms.py) turn the same content into the same HTML. Run: node tools/test_cms_parity.mjs [content.json]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.join(here, '..', 'weberact');
const contentFile = process.argv[2] || path.join(site, 'content.json');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(here, '..', 'weberact-admin/assets/cms-render.js'), 'utf8'), ctx);
const R = ctx.WA_RENDER, content = JSON.parse(readFileSync(contentFile, 'utf8'));
const py = JSON.parse(execFileSync('python3', ['-c', `
import json, sys; sys.path.insert(0, ${JSON.stringify(here)}); import cms
c = json.load(open(${JSON.stringify(contentFile)}))
out = {k: f(c) for k, f in cms.RENDER.items()}
out.update({'page.' + slug: cms.r_page(c, slug) for slug in c.get('pages', {})})
print(json.dumps(out))`], { encoding: 'utf8', maxBuffer: 1 << 26 }));
let bad = 0;
const keys = new Set([...Object.keys(py), ...Object.keys(R.RENDER), ...Object.keys(content.pages || {}).map(s => 'page.' + s)]);
for (const k of keys){
  const js = R.renderKey(k, content);
  if (!(k in py) || js == null){ console.log('missing on one side:', k); bad++; continue; }
  if (js !== py[k]){
    let i = 0; while (i < js.length && js[i] === py[k][i]) i++;
    console.log(`DIFF ${k} at ${i}\n  py: ${JSON.stringify(py[k].slice(Math.max(0, i - 60), i + 60))}\n  js: ${JSON.stringify(js.slice(Math.max(0, i - 60), i + 60))}`); bad++;
  }
}
console.log(bad ? `${bad} renderer(s) differ` : `all ${keys.size} renderers match`);
process.exit(bad ? 1 : 0);
