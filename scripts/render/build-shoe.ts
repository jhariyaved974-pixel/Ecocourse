// Turns a ShoeDesign into a three.js Group with PBR materials named after
// their role (upper, accent, sole, ...). The storefront's 3D viewer tints the
// material named "upper" to the selected colour, so this naming is a contract.

import * as THREE from 'three';
import { ambientOcclusion, surfaceNets, type SDF } from './sdf';
import { buildDesign, type MaterialName, type ShoeDesign, type Silhouette } from './shoe-designs';

export interface Colorway {
  name: string;
  upper: string;
  accent: string;
  overlay: string;
  sole: string;
  outsole: string;
  lining: string;
  laces: string;
}

const KNIT: Silhouette[] = ['runner', 'trainer', 'slipon'];

/** Tone-on-tone laces still need a little contrast to read in photos. */
function laceColor(c: Colorway) {
  const lace = new THREE.Color(c.laces);
  const upper = new THREE.Color(c.upper);
  const lum = (col: THREE.Color) => 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
  if (Math.abs(lum(lace) - lum(upper)) < 0.06) {
    lace.offsetHSL(0, 0, lum(upper) > 0.5 ? -0.09 : 0.12);
  }
  return '#' + lace.getHexString();
}

export function createMaterials(silhouette: Silhouette, c: Colorway): Record<MaterialName, THREE.MeshPhysicalMaterial> {
  const knit = KNIT.includes(silhouette);
  const leather = silhouette === 'oxford';
  const suede = silhouette === 'boot';
  const mk = (name: MaterialName, color: string, opts: THREE.MeshPhysicalMaterialParameters) => {
    const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), vertexColors: true, ...opts });
    m.name = name;
    return m;
  };
  return {
    upper: mk('upper', c.upper, {
      roughness: leather ? 0.42 : suede ? 0.95 : knit ? 0.86 : 0.55,
      clearcoat: leather ? 0.3 : 0,
      clearcoatRoughness: 0.35,
      sheen: knit ? 0.6 : suede ? 0.4 : 0,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color(c.upper).lerp(new THREE.Color('#ffffff'), 0.35),
    }),
    accent: mk('accent', c.accent, { roughness: leather ? 0.35 : 0.5, clearcoat: leather ? 0.4 : 0.1 }),
    overlay: mk('overlay', c.overlay, { roughness: leather ? 0.3 : 0.6, clearcoat: leather ? 0.5 : 0 }),
    sole: mk('sole', c.sole, { roughness: leather ? 0.45 : 0.62 }),
    outsole: mk('outsole', c.outsole, { roughness: 0.88 }),
    lining: mk('lining', c.lining, { roughness: 0.9, sheen: 0.3, sheenColor: new THREE.Color(c.lining) }),
    laces: mk('laces', laceColor(c), { roughness: 0.78, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }),
    metal: mk('metal', '#a1a1aa', { metalness: 0.9, roughness: 0.32, vertexColors: false }),
  };
}

function toGeometry(mesh: ReturnType<typeof surfaceNets>, ao: Float32Array) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  const colors = new Float32Array(ao.length * 3);
  for (let i = 0; i < ao.length; i++) {
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = ao[i];
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return g;
}

function gradient(f: SDF, p: THREE.Vector3) {
  const e = 0.0008;
  return new THREE.Vector3(
    f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z),
    f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z),
    f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e),
  ).normalize();
}

/** March from outside along -dir until the surface of f is hit. */
function hitSurface(f: SDF, target: THREE.Vector3, dir: THREE.Vector3) {
  const origin = target.clone().addScaledVector(dir, 0.45);
  let prev = 0;
  for (let t = 0; t <= 0.6; t += 0.0015) {
    const p = origin.clone().addScaledVector(dir, -t);
    if (f(p.x, p.y, p.z) < 0) {
      let lo = prev, hi = t;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const q = origin.clone().addScaledVector(dir, -mid);
        if (f(q.x, q.y, q.z) < 0) hi = mid;
        else lo = mid;
      }
      return origin.clone().addScaledVector(dir, -(lo + hi) / 2);
    }
    prev = t;
  }
  return null;
}

function bakeVertexAO(scene: SDF, geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const nor = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const ao = ambientOcclusion(scene, {
    positions: pos.array as Float32Array,
    normals: nor.array as Float32Array,
    indices: new Uint32Array(0),
  }, 0.6);
  const colors = new Float32Array(ao.length * 3);
  for (let i = 0; i < ao.length; i++) colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = ao[i];
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function buildLaces(design: ShoeDesign, materials: Record<MaterialName, THREE.Material>) {
  const spec = design.laces!;
  const group = new THREE.Group();
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  const normalsL: THREE.Vector3[] = [];
  const normalsR: THREE.Vector3[] = [];
  for (let i = 0; i < spec.rows; i++) {
    const t = i / (spec.rows - 1);
    const x = spec.start[0] + (spec.end[0] - spec.start[0]) * t;
    const h = spec.start[1] + (spec.end[1] - spec.start[1]) * t;
    const tilt = spec.tiltStart + (spec.tiltEnd - spec.tiltStart) * t;
    const hw = spec.halfWidthStart + (spec.halfWidthEnd - spec.halfWidthStart) * t;
    const dir = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0).normalize();
    for (const side of [1, -1]) {
      const target = new THREE.Vector3(x, design.base(x) + h, side * hw);
      const hit = hitSurface(design.upper, target, dir);
      if (!hit) continue;
      const n = gradient(design.upper, hit);
      (side === 1 ? left : right).push(hit.clone().addScaledVector(n, 0.0025));
      (side === 1 ? normalsL : normalsR).push(n);
    }
  }
  const rows = Math.min(left.length, right.length);
  const tube = (a: THREE.Vector3, b: THREE.Vector3, lift: number, radius: number) => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const centreHit = hitSurface(design.upper, new THREE.Vector3(mid.x, mid.y - 0.02, 0), new THREE.Vector3(mid.x - a.x, 1, 0).normalize());
    const apex = centreHit ? centreHit.clone().add(new THREE.Vector3(0, lift, 0)) : mid.clone().add(new THREE.Vector3(0, lift, 0));
    // Choose the control point so the curve's midpoint sits exactly on the apex
    // (B(0.5) = a/4 + c/2 + b/4), keeping laces above a domed vamp.
    const control = apex.clone().multiplyScalar(2).sub(a.clone().add(b).multiplyScalar(0.5));
    const curve = new THREE.QuadraticBezierCurve3(a, control, b);
    const geometry = new THREE.TubeGeometry(curve, 24, radius, 8, false);
    geometry.scale(1, 1, 1);
    return new THREE.Mesh(geometry, materials.laces);
  };
  if (spec.style === 'bar') {
    for (let i = 0; i < rows; i++) group.add(tube(left[i], right[i], 0.006, spec.radius));
  } else {
    group.add(tube(left[0], right[0], 0.006, spec.radius));
    for (let i = 0; i < rows - 1; i++) {
      group.add(tube(left[i], right[i + 1], 0.008, spec.radius));
      group.add(tube(right[i], left[i + 1], 0.011, spec.radius));
    }
  }
  // Eyelets.
  const eyelet = new THREE.TorusGeometry(spec.radius * 1.6, spec.radius * 0.55, 8, 20);
  [...left.map((p, i) => [p, normalsL[i]] as const), ...right.map((p, i) => [p, normalsR[i]] as const)].forEach(([p, n]) => {
    const m = new THREE.Mesh(eyelet, materials.metal);
    m.position.copy(p).addScaledVector(n, -0.0015);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    group.add(m);
  });
  group.name = 'laces';
  return group;
}

export interface BuiltShoe {
  group: THREE.Group;
  materials: Record<MaterialName, THREE.MeshPhysicalMaterial>;
  height: number;
}

const geometryCache = new Map<Silhouette, { design: ShoeDesign; geometries: { name: string; material: MaterialName; geometry: THREE.BufferGeometry }[] }>();

export function buildShoe(silhouette: Silhouette, colorway: Colorway, cell = 0.0045): BuiltShoe {
  let cached = geometryCache.get(silhouette);
  if (!cached) {
    const design = buildDesign(silhouette);
    const geometries = design.parts.map((part) => {
      const mesh = surfaceNets(part.sdf, part.bounds, cell);
      const ao = ambientOcclusion(design.scene, mesh, 0.6);
      return { name: part.name, material: part.material, geometry: toGeometry(mesh, ao) };
    });
    cached = { design, geometries };
    geometryCache.set(silhouette, cached);
  }
  const materials = createMaterials(silhouette, colorway);
  const group = new THREE.Group();
  group.name = `auren-${silhouette}`;
  for (const g of cached.geometries) {
    if (g.geometry.index && g.geometry.index.count === 0) continue;
    const mesh = new THREE.Mesh(g.geometry, materials[g.material]);
    mesh.name = g.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (cached.design.laces) {
    const laces = buildLaces(cached.design, materials);
    laces.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'TubeGeometry') {
        bakeVertexAO(cached!.design.scene, o.geometry);
        o.castShadow = true;
      }
    });
    group.add(laces);
  }
  return { group, materials, height: cached.design.height };
}
