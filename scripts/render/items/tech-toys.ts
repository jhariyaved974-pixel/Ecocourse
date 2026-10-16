// Procedural models: earbuds, headphones, smartwatch, powerbank, speaker, lantern, blocks, plush.
// See kit.ts for conventions (metres, grounded, +z front). The main body material of each
// single-colour model is named "upper", so the storefront 3D viewer can tint it to the
// selected colourway (the same contract as the shoe models).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ItemColorway } from '../catalog';
import { grounded, lathe, mat, mesh, type Builder } from './kit';

// ------------------------------------------------------------------ helpers

const TAU = Math.PI * 2;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = v3(0, 1, 0);

function named<T extends THREE.Material>(m: T, name: string): T {
  m.name = name;
  return m;
}

/** Lightness offset (-1..1) for seams, cavities and highlights. */
function shade(hex: string, dl: number, ds = 0) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, ds, dl);
  return `#${c.getHexString()}`;
}

function mix(a: string, b: string, t: number) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

function luminance(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Welds coincident vertices and recomputes smooth normals (drops UVs). */
function smooth(geo: THREE.BufferGeometry) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const merged = mergeVertices(geo, 1e-6);
  merged.computeVertexNormals();
  return merged;
}

/** Rounded-rectangle outline (counter-clockwise) centred on (cx, cy); radii [tl, tr, br, bl]. */
function rrect(w: number, h: number, r: number | number[], cx = 0, cy = 0, seg = 8) {
  const lim = Math.min(w, h) / 2 - 1e-6;
  const [tl, tr, br, bl] = (typeof r === 'number' ? [r, r, r, r] : r).map((x) => Math.min(Math.max(x, 0), lim));
  const pts: THREE.Vector2[] = [];
  const corner = (x: number, y: number, rad: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      const p = new THREE.Vector2(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      if (!pts.length || pts[pts.length - 1].distanceTo(p) > 1e-7) pts.push(p);
    }
  };
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  corner(x1 - br, y0 + br, br, -Math.PI / 2);
  corner(x1 - tr, y1 - tr, tr, 0);
  corner(x0 + tl, y1 - tl, tl, Math.PI / 2);
  corner(x0 + bl, y0 + bl, bl, Math.PI);
  if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-7) pts.pop();
  return pts;
}

/**
 * A rounded slab: outline w × h (x/y) with corner radii r, extruded `depth` along z with
 * every edge rounded by `edge`. Centred on the origin; the front face is +z.
 */
function slab(w: number, h: number, depth: number, r: number | number[], edge: number, seg = 8, bevelSegments = 6) {
  const radii = (typeof r === 'number' ? [r, r, r, r] : r).map((x) => Math.max(x - edge, 0.0003));
  const shape = new THREE.Shape(rrect(w - 2 * edge, h - 2 * edge, radii, 0, 0, seg));
  const core = Math.max(depth - 2 * edge, 1e-5);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: core, bevelEnabled: edge > 0, bevelThickness: edge, bevelSize: edge, bevelSegments, curveSegments: 1,
  });
  geo.translate(0, 0, -core / 2);
  return smooth(geo);
}

/** Same as slab() but lying flat: outline in x/z, thickness along y, centred on the origin. */
function flatSlab(w: number, d: number, thickness: number, r: number | number[], edge: number, seg = 8, bevelSegments = 6) {
  return slab(w, d, thickness, r, edge, seg, bevelSegments).rotateX(-Math.PI / 2);
}

type Profile = number | ((t: number) => number);
const at = (p: Profile, t: number) => (typeof p === 'function' ? p(t) : p);

/**
 * Sweeps a rounded-rectangle section (superellipse, exponent `round`) along a smooth curve.
 * `side` fixes the direction of the section's width (e.g. the normal of a planar curve).
 */
function band(
  points: THREE.Vector3[],
  o: { width: Profile; thickness: Profile; side: THREE.Vector3; closed?: boolean; segments?: number; radial?: number; round?: number; offset?: Profile },
) {
  const curve = new THREE.CatmullRomCurve3(points, o.closed ?? false, 'centripetal');
  const segs = o.segments ?? 96;
  const radial = o.radial ?? 24;
  const exp = o.round ?? 4;
  const rings = o.closed ? segs : segs + 1;
  const pos: number[] = [];
  const idx: number[] = [];
  const frames: { p: THREE.Vector3; t: THREE.Vector3; ring: THREE.Vector3[] }[] = [];
  for (let i = 0; i < rings; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const B = o.side.clone().addScaledVector(T, -o.side.dot(T)).normalize();
    const N = new THREE.Vector3().crossVectors(T, B).normalize();
    const w = at(o.width, t), h = at(o.thickness, t), off = o.offset ? at(o.offset, t) : 0;
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      const x = (Math.sign(c) * Math.abs(c) ** (2 / exp) * w) / 2;
      const y = (Math.sign(s) * Math.abs(s) ** (2 / exp) * h) / 2 + off;
      const q = p.clone().addScaledVector(B, x).addScaledVector(N, y);
      ring.push(q);
      pos.push(q.x, q.y, q.z);
    }
    frames.push({ p: p.clone().addScaledVector(N, off), t: T, ring });
  }
  for (let i = 0; i < segs; i++) {
    const i2 = o.closed ? (i + 1) % rings : i + 1;
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j, b = i2 * radial + j, c = i2 * radial + j2, d = i * radial + j2;
      idx.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (o.closed) return geo;
  // Flat end caps with their own vertices (so the side shading stays smooth).
  const caps: THREE.BufferGeometry[] = [geo];
  for (const [f, flip] of [[frames[0], true], [frames[frames.length - 1], false]] as const) {
    const cp: number[] = [f.p.x, f.p.y, f.p.z];
    for (const q of f.ring) cp.push(q.x, q.y, q.z);
    const ci: number[] = [];
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      if (flip) ci.push(0, j2 + 1, j + 1);
      else ci.push(0, j + 1, j2 + 1);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cg.setIndex(ci);
    cg.computeVertexNormals();
    caps.push(cg);
  }
  return mergeGeometries(caps)!;
}

/** Round tube along a smooth curve, with rounded (sphere) ends when open. */
function tube(points: THREE.Vector3[], radius: number, closed = false, segments = 64, radial = 14) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const parts: THREE.BufferGeometry[] = [new THREE.TubeGeometry(curve, segments, radius, radial, closed)];
  if (!closed) {
    for (const p of [points[0], points[points.length - 1]]) {
      parts.push(new THREE.SphereGeometry(radius, radial, Math.max(6, radial / 2)).translate(p.x, p.y, p.z));
    }
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
}

function ellipsoid(rx: number, ry: number, rz: number, ws = 40, hs = 28) {
  return new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);
}

/** Point on an ellipsoid surface in the direction `dir` from its centre. */
function onEllipsoid(centre: THREE.Vector3, radii: THREE.Vector3, dir: THREE.Vector3, lift = 0) {
  const d = dir.clone().normalize();
  const k = 1 / Math.sqrt((d.x / radii.x) ** 2 + (d.y / radii.y) ** 2 + (d.z / radii.z) ** 2);
  return centre.clone().addScaledVector(d, k + lift);
}

/** Orients an object so its local +y axis points along `dir`. */
function pointAlong(obj: THREE.Object3D, dir: THREE.Vector3) {
  obj.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  return obj;
}

/**
 * Lofted superellipse body: horizontal sections at heights `ys`, half extents from `half(y)`.
 * Returns the side surface plus flat caps at the lowest and highest section (separate
 * geometries so they can take their own material).
 */
function loft(ys: number[], half: (y: number) => [number, number], n = 3, radial = 64) {
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = (y: number) => {
    const [rx, rz] = half(y);
    const out: THREE.Vector3[] = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      out.push(v3(Math.sign(c) * Math.abs(c) ** (2 / n) * rx, y, Math.sign(s) * Math.abs(s) ** (2 / n) * rz));
    }
    return out;
  };
  const rings = ys.map(ring);
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j, b = (i + 1) * radial + j, c = (i + 1) * radial + j2, d = i * radial + j2;
      // Sections go counter-clockwise seen from below, so this winding faces outwards.
      idx.push(a, b, d, b, c, d);
    }
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  side.setIndex(idx);
  side.computeVertexNormals();
  const cap = (r: THREE.Vector3[], up: boolean) => {
    const y = r[0].y;
    const cp: number[] = [0, y, 0];
    for (const p of r) cp.push(p.x, p.y, p.z);
    const ci: number[] = [];
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      if (up) ci.push(0, j2 + 1, j + 1);
      else ci.push(0, j + 1, j2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    g.setIndex(ci);
    g.computeVertexNormals();
    return g;
  };
  return { side, bottom: cap(rings[0], false), top: cap(rings[rings.length - 1], true) };
}

/** Half-width of a rounded-rectangle silhouette of total height h at height y (corner radius r). */
function roundedHalf(halfW: number, h: number, r: number, y: number) {
  const d = Math.min(y, h - y);
  if (d >= r) return halfW;
  const k = r - Math.max(d, 0);
  return halfW - r + Math.sqrt(Math.max(r * r - k * k, 0));
}

/** Heights sampled densely near the rounded ends (cosine spacing over `r`). */
function endDense(y0: number, y1: number, r0: number, r1: number, steps = 10, mid = 6) {
  const ys: number[] = [];
  for (let i = 0; i <= steps; i++) ys.push(y0 + r0 * (1 - Math.cos((i / steps) * (Math.PI / 2))));
  for (let i = 1; i < mid; i++) ys.push(y0 + r0 + ((y1 - r1 - y0 - r0) * i) / mid);
  for (let i = steps; i >= 0; i--) ys.push(y1 - r1 * (1 - Math.cos((i / steps) * (Math.PI / 2))));
  return ys.filter((y, i, a) => i === 0 || y - a[i - 1] > 1e-7);
}

function canvasOf(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

function colorTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Tiling normal map from a periodic height field h(u, v) in 0..1. */
function normalTexture(size: number, height: (u: number, v: number) => number, strength: number, repeat: [number, number]) {
  const hs = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hs[y * size + x] = height(x / size, y / size);
  const c = canvasOf(size, size, (g) => {
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const hx = hs[y * size + ((x + 1) % size)] - hs[y * size + ((x + size - 1) % size)];
        const hy = hs[((y + size - 1) % size) * size + x] - hs[((y + 1) % size) * size + x];
        const n = v3(-hx * strength, -hy * strength, 1).normalize();
        const k = (y * size + x) * 4;
        img.data[k] = (n.x * 0.5 + 0.5) * 255;
        img.data[k + 1] = (n.y * 0.5 + 0.5) * 255;
        img.data[k + 2] = (n.z * 0.5 + 0.5) * 255;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  return t;
}

/** Remaps a geometry's UVs to its x/y bounding box (for flat printed faces). */
function planarUV(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const p = geo.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < p.count; i++) uv.push((p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/** Lifts an object so its lowest point rests on y = 0 (for loose parts in a scene). */
function rest(obj: THREE.Object3D, y = 0) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.y += y - box.min.y;
  return obj;
}

// ------------------------------------------------------------------ earbuds

/** One stem earbud. Local frame: head on the origin, stem down (-y), ear tip towards -x. */
function earbud(shell: THREE.Material, tip: THREE.Material, metal: THREE.Material, grille: THREE.Material) {
  const g = new THREE.Group();
  g.add(mesh(ellipsoid(0.0091, 0.0083, 0.0097), shell, 'bud-head'));
  // Silicone ear tip on an angled nozzle.
  const tipDir = v3(-1, 0.12, 0.42).normalize();
  const nozzle = mesh(lathe([[0, 0], [0.0029, 0], [0.003, 0.0035], [0, 0.0036]], 24), shell);
  pointAlong(nozzle, tipDir).position.copy(tipDir.clone().multiplyScalar(0.0062));
  g.add(nozzle);
  const tipGeo = lathe([[0, 0.0012], [0.0028, 0.0012], [0.0031, 0.0026], [0.0054, 0.0036], [0.0061, 0.0049], [0.0057, 0.0063], [0.0044, 0.0073], [0.0024, 0.0079], [0, 0.008]], 32);
  const tipMesh = mesh(tipGeo, tip, 'ear-tip');
  pointAlong(tipMesh, tipDir).position.copy(tipDir.clone().multiplyScalar(0.0068));
  g.add(tipMesh);
  // Stem with a metal charging contact.
  g.add(mesh(lathe([[0, -0.0246], [0.0034, -0.0246], [0.0034, -0.004], [0.0026, -0.001], [0, 0]], 24), shell, 'bud-stem'));
  g.add(mesh(lathe([[0, -0.0281], [0.0024, -0.028], [0.0031, -0.0275], [0.00342, -0.0266], [0.00345, -0.0247], [0, -0.0247]], 24), metal));
  // Outer touch pad with a mesh grille.
  const pad = mesh(ellipsoid(0.0012, 0.0034, 0.0042, 20, 14), grille);
  pad.position.set(0.0084, 0.0006, 0.0006);
  g.add(pad);
  return g;
}

const buildEarbuds: Builder = (c) => {
  const g = new THREE.Group();
  const shell = named(mat.glossy(c.primary), 'upper');
  const inner = mat.plastic(c.secondary, 0.6);
  const tip = mat.rubber(luminance(c.primary) > 0.5 ? shade(c.secondary, -0.06) : shade(c.secondary, 0.04));
  const metal = mat.metal(c.accent, 0.25);
  const grille = mat.matte(shade(c.secondary, -0.08), 0.7);

  // Pebble-shaped case: a lofted superellipse split into base and lid.
  const W = 0.062, D = 0.029, Hb = 0.03, Ht = 0.046, R = 0.016, E = 0.0085;
  const half = (y: number): [number, number] => [roundedHalf(W / 2, Ht, R, y), roundedHalf(D / 2, Ht, E, y)];
  const base = loft(endDense(0, Hb, R, 0.0001, 12, 6).filter((y) => y <= Hb), half, 3.2, 72);
  g.add(mesh(base.side, shell, 'case-base'));
  g.add(mesh(base.bottom, shell));
  g.add(mesh(base.top, inner, 'case-deck'));
  // Bud wells in the deck.
  for (const sx of [-1, 1]) {
    const well = mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2).scale(0.0098, 1, 0.0088), mat.matte(shade(c.secondary, -0.1), 0.8));
    well.position.set(sx * 0.0145, Hb + 0.0002, 0.0005);
    g.add(well);
  }
  // Charging LED on the front.
  const led = mesh(new THREE.SphereGeometry(0.0011, 16, 10), mat.emissive('#86efac', 1.4));
  led.position.set(0, Hb * 0.62, half(Hb * 0.62)[1] - 0.0004);
  g.add(led);

  // Lid, hinged at the back of the seam and opened ~105°.
  const gap = 0.0007;
  const lidYs = endDense(Hb + gap, Ht, 0.0001, R, 12, 4).filter((y) => y >= Hb + gap);
  const lid = loft(lidYs, half, 3.2, 72);
  const lidGroup = new THREE.Group();
  lidGroup.add(mesh(lid.side, shell, 'case-lid'));
  lidGroup.add(mesh(lid.top, shell));
  lidGroup.add(mesh(lid.bottom, inner, 'lid-inner'));
  const hinge = new THREE.Group();
  hinge.position.set(0, Hb + gap / 2, -D / 2 + 0.0005);
  lidGroup.position.set(0, -(Hb + gap / 2), D / 2 - 0.0005);
  hinge.add(lidGroup);
  hinge.rotation.x = THREE.MathUtils.degToRad(-105);
  g.add(hinge);
  const pin = mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.014, 20).rotateZ(Math.PI / 2), mat.metal(shade(c.accent, -0.1), 0.35));
  pin.position.set(0, Hb + gap / 2, -D / 2 - 0.0002);
  g.add(pin);

  // One bud seated in the case, the other resting in front of it.
  const seated = earbud(shell, tip, metal, grille);
  seated.rotation.set(0, 0.35, 0);
  seated.position.set(-0.0145, Hb + 0.0052, 0.0005);
  g.add(seated);

  const loose = earbud(shell, tip, metal, grille);
  loose.rotation.set(-1.32, 0.0, 0.28, 'YXZ');
  const holder = new THREE.Group();
  holder.add(loose);
  holder.rotation.y = -0.55;
  holder.position.set(0.026, 0, 0.034);
  rest(holder);
  g.add(holder);
  return grounded(g);
};

// ------------------------------------------------------------------ headphones

const buildHeadphones: Builder = (c) => {
  const g = new THREE.Group();
  const shellMat = named(mat.plastic(c.primary, 0.55), 'upper');
  const cushionMat = new THREE.MeshPhysicalMaterial({
    color: c.secondary, roughness: 0.62, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(c.secondary).lerp(new THREE.Color('#ffffff'), 0.4), clearcoat: 0.08,
  });
  const fabricMat = mat.fabric(shade(c.primary, -0.22));
  const metalMat = mat.metal(c.accent, 0.28);

  const cupH = 0.092, cupW = 0.074; // oval cup outline (height × width)
  const sy = cupH / 2, sz = cupW / 2;
  const shellT = 0.026, cushT = 0.022, inner = 0.05;
  const cx = inner + cushT; // cup back plane (shell starts here)
  const cy = cupH / 2;

  /** Builds a cup facing -x (cushion towards the head) at the origin; axis is x. */
  const cup = () => {
    const cg = new THREE.Group();
    const toCup = (geo: THREE.BufferGeometry) => geo.rotateZ(-Math.PI / 2).scale(1, sy, sz);
    // Shell: lathe profile [radius (0..1), height along the axis].
    const shell = toCup(lathe([
      [0, 0], [0.9, 0], [0.95, 0.0015], [0.985, 0.005], [1.0, 0.011], [0.985, 0.017], [0.95, 0.0215], [0.88, 0.0243], [0.7, 0.0256], [0.35, 0.0262], [0, 0.0263],
    ], 72));
    cg.add(mesh(shell, shellMat, 'cup-shell'));
    // Accent ring on the outer face.
    const ring = toCup(lathe([[0.8, 0.0254], [0.81, 0.0262], [0.83, 0.0266], [0.85, 0.0262], [0.86, 0.0252]], 72));
    cg.add(mesh(ring, metalMat));
    // Cushion: a puffy ring with a superellipse section.
    const sec: [number, number][] = [];
    const rc = 0.725, ra = 0.255, yc = -cushT / 2, yb = cushT / 2 + 0.0004;
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU;
      const co = Math.cos(a), si = Math.sin(a);
      sec.push([rc + ra * Math.sign(co) * Math.abs(co) ** (2 / 2.6), yc + yb * Math.sign(si) * Math.abs(si) ** (2 / 2.6)]);
    }
    cg.add(mesh(toCup(lathe(sec, 72)), cushionMat, 'cushion'));
    // Fabric driver cover inside the cushion.
    cg.add(mesh(toCup(lathe([[0, -0.007], [0.5, -0.007], [0.52, -0.004], [0.52, 0.0]], 64)), fabricMat));
    return cg;
  };

  for (const s of [1, -1]) {
    const cg = cup();
    cg.position.set(s * cx, cy, 0);
    if (s < 0) cg.rotation.y = Math.PI;
    g.add(cg);

    // Yoke: a metal fork around the cup's upper edge, pivoting at the cup's front/back.
    const xf = s * (cx + 0.0105);
    const fork: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = -0.08 + (i / 16) * (Math.PI + 0.16);
      fork.push(v3(xf, cy + Math.sin(a) * (sy + 0.007), Math.cos(a) * (sz + 0.0042)));
    }
    g.add(mesh(tube(fork, 0.0026, false, 72, 12), metalMat, 'yoke'));
    for (const sz2 of [1, -1]) {
      const pv = mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 24).rotateX(Math.PI / 2), shellMat);
      pv.position.set(xf, cy - 0.003, sz2 * (sz + 0.002));
      g.add(pv);
    }
    // Slider from the top of the fork into the headband.
    const slider = mesh(new THREE.BoxGeometry(0.0022, 0.03, 0.009), metalMat);
    slider.position.set(xf * 0.985, cy + sy + 0.007 + 0.013, 0);
    g.add(slider);
  }

  // Headband: a padded arch in the x/y plane.
  const bx = cx + 0.0105, by = cupH + 0.026, bh = 0.094;
  const arch = (inset: number, from: number, to: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = from + ((to - from) * i) / 40;
      const co = Math.cos(a), si = Math.sin(a);
      pts.push(v3((bx - inset) * Math.sign(co) * Math.abs(co) ** 0.9, by + (bh - inset) * Math.abs(si) ** 0.85, 0));
    }
    return pts;
  };
  const Z = v3(0, 0, 1);
  g.add(mesh(band(arch(0, 0, Math.PI), { width: (t) => 0.024 + 0.008 * Math.sin(t * Math.PI), thickness: 0.0075, side: Z, segments: 140, radial: 28 }), shellMat, 'headband'));
  const pad = band(arch(0.0078, 0.32, Math.PI - 0.32), {
    width: (t) => 0.022 + 0.004 * Math.sin(t * Math.PI), thickness: (t) => 0.003 + 0.0072 * Math.sin(t * Math.PI) ** 0.6, side: Z, segments: 120, radial: 28, round: 3,
  });
  g.add(mesh(pad, cushionMat, 'headband-pad'));
  return grounded(g);
};

// ------------------------------------------------------------------ smartwatch

function watchFace(accent: string) {
  const bright = luminance(accent) < 0.25 ? shade(accent, 0.18, 0.1) : accent;
  return colorTexture(canvasOf(420, 500, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 420, 500);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#a1a1aa';
    g.font = '600 34px Inter, "DejaVu Sans", sans-serif';
    g.fillText('FRI 16', 210, 108);
    g.fillStyle = '#ffffff';
    g.font = '700 138px Inter, "DejaVu Sans", sans-serif';
    g.fillText('10:09', 210, 248);
    // Activity ring.
    g.lineCap = 'round';
    g.lineWidth = 18;
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    g.arc(130, 362, 50, 0, TAU);
    g.stroke();
    g.strokeStyle = bright;
    g.beginPath();
    g.arc(130, 362, 50, -Math.PI / 2, -Math.PI / 2 + TAU * 0.72);
    g.stroke();
    g.textAlign = 'left';
    g.fillStyle = bright;
    g.font = '700 42px Inter, "DejaVu Sans", sans-serif';
    g.fillText('7,842', 212, 356);
    g.fillStyle = '#a1a1aa';
    g.font = '500 28px Inter, "DejaVu Sans", sans-serif';
    g.fillText('steps', 214, 394);
  }));
}

const buildSmartwatch: Builder = (c) => {
  const g = new THREE.Group();
  const strapMat = named(new THREE.MeshPhysicalMaterial({ color: c.primary, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 }), 'upper');
  const caseMat = mat.metal(c.secondary, 0.32);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#050506', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 });

  const W = 0.038, H = 0.045, T = 0.0105, R = 0.0105;
  const yc = 0.0415; // case centre height (the strap loop rests on the floor)
  const caseG = new THREE.Group();
  caseG.position.set(0, yc, 0);
  caseG.add(mesh(slab(W, H, T, R, 0.0036, 10, 7), caseMat, 'case'));
  // Domed glass and the display.
  const glass = mesh(slab(W - 0.0024, H - 0.0024, 0.0016, R - 0.0012, 0.0007, 10, 4), glassMat, 'glass');
  glass.position.z = T / 2 - 0.0002;
  caseG.add(glass);
  const screenGeo = planarUV(new THREE.ShapeGeometry(new THREE.Shape(rrect(W - 0.0074, H - 0.0074, R - 0.0042, 0, 0, 10))));
  const face = watchFace(c.accent);
  const screen = mesh(screenGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', map: face, emissive: '#ffffff', emissiveMap: face, emissiveIntensity: 0.75, roughness: 0.18 }), 'screen');
  screen.position.z = T / 2 + 0.0006 + 0.00005;
  caseG.add(screen);
  // Crown with an accent ring, and a side button.
  const crown = mesh(lathe([[0, 0], [0.0029, 0], [0.0031, 0.0006], [0.0031, 0.0026], [0.0028, 0.0031], [0, 0.0032]], 32).rotateZ(-Math.PI / 2), caseMat, 'crown');
  crown.position.set(W / 2 - 0.0006, 0.0065, -0.0004);
  caseG.add(crown);
  const crownRing = mesh(new THREE.TorusGeometry(0.0021, 0.00045, 10, 32).rotateY(Math.PI / 2), mat.plastic(c.accent, 0.4));
  crownRing.position.set(W / 2 + 0.0026, 0.0065, -0.0004);
  caseG.add(crownRing);
  const button = mesh(new THREE.CapsuleGeometry(0.0011, 0.0062, 6, 16), caseMat);
  button.position.set(W / 2 - 0.0002, -0.0065, -0.0004);
  caseG.add(button);
  // Optical sensor on the back.
  const sensor = mesh(lathe([[0, -0.0033], [0.008, -0.0033], [0.0115, -0.0022], [0.0128, 0]], 48).rotateX(Math.PI / 2), mat.glossy('#0b0b0d'));
  sensor.position.z = -T / 2 + 0.0004;
  caseG.add(sensor);
  g.add(caseG);

  // Strap: one silicone loop from the top lug, round the back, to the bottom lug.
  const SW = 0.024, ST = 0.0032;
  const ry = yc - ST / 2 - 0.0002; // loop rests on the floor
  const yl = ry + ST / 2 + 0.0002;
  const rz = 0.026, zl = -rz - 0.0035;
  const loop: THREE.Vector3[] = [v3(0, yc + H / 2 - 0.006, -0.0012), v3(0, yc + H / 2 + 0.0018, -0.0038)];
  for (let i = 0; i <= 18; i++) {
    const a = THREE.MathUtils.degToRad(62 + (i / 18) * 236);
    loop.push(v3(0, yl + Math.sin(a) * (ry + 0.0006), zl + Math.cos(a) * rz));
  }
  loop.push(v3(0, yc - H / 2 - 0.0018, -0.0038), v3(0, yc - H / 2 + 0.006, -0.0012));
  g.add(mesh(band(loop, { width: SW, thickness: ST, side: v3(1, 0, 0), segments: 160, radial: 28, round: 5 }), strapMat, 'strap'));
  // Keeper loop round the strap at the back.
  const keeperAt = new THREE.CatmullRomCurve3(loop, false, 'centripetal');
  const kp = keeperAt.getPointAt(0.56);
  const kt = keeperAt.getTangentAt(0.56);
  const keeper = mesh(slab(SW + 0.0026, 0.0058, ST + 0.0024, 0.0022, 0.0011, 6, 3), new THREE.MeshPhysicalMaterial({ color: shade(c.primary, -0.03), roughness: 0.5, clearcoat: 0.2 }), 'keeper');
  keeper.position.copy(kp);
  keeper.quaternion.setFromUnitVectors(v3(0, 1, 0), kt);
  keeper.rotateY(0);
  g.add(keeper);
  return grounded(g);
};

// ------------------------------------------------------------------ power bank

const buildPowerbank: Builder = (c) => {
  const g = new THREE.Group();
  const bodyMat = named(new THREE.MeshPhysicalMaterial({ color: c.primary, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45 }), 'upper');
  const W = 0.072, H = 0.15, T = 0.026, R = 0.014, E = 0.0075;
  // Stands upright on its base, ports on the top end, LEDs near the top of the face.
  const body = mesh(slab(W, H, T, R, E, 10, 7), bodyMat, 'body');
  body.position.y = H / 2;
  g.add(body);

  // Grippy ribbed panel on the face.
  const ribs = normalTexture(64, (_u, v) => Math.sin(v * TAU) * 0.5, 2.5, [1, 1]);
  const panelGeo = slab(W - 0.02, 0.104, 0.0012, 0.006, 0.0005, 8, 2);
  const uvs: number[] = [];
  const pp = panelGeo.getAttribute('position');
  for (let i = 0; i < pp.count; i++) uvs.push(pp.getX(i) / 0.0032, pp.getY(i) / 0.0032);
  panelGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const panel = mesh(panelGeo, new THREE.MeshPhysicalMaterial({ color: c.secondary, roughness: 0.72, normalMap: ribs, normalScale: new THREE.Vector2(0.6, 0.6) }), 'grip-panel');
  panel.position.set(0, 0.012 + 0.052, T / 2 - 0.0003);
  g.add(panel);

  // Four charge LEDs (three lit).
  for (let i = 0; i < 4; i++) {
    const lit = i < 3;
    const dot = mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0008, 20).rotateX(Math.PI / 2), lit ? mat.emissive(c.accent, 1.6) : mat.plastic(shade(c.primary, luminance(c.primary) > 0.5 ? -0.25 : 0.12), 0.3));
    dot.position.set(-0.0075 + i * 0.005, 0.133, T / 2 + 0.0001);
    g.add(dot);
  }
  // Ports on the top end: 2 × USB-A, 1 × USB-C (dark openings with a tongue).
  const hole = mat.matte('#0c0c0e', 0.6);
  const tongue = mat.plastic('#3a3a40', 0.5);
  const port = (w: number, h: number, r: number, x: number, tw: number) => {
    const p = mesh(flatSlab(w, h, 0.0006, r, 0.0001, 4, 1), hole);
    p.position.set(x, H + 0.0001, 0);
    g.add(p);
    if (tw > 0) {
      const tg = mesh(new THREE.BoxGeometry(tw, 0.0004, h * 0.32), tongue);
      tg.position.set(x, H + 0.0004, -h * 0.12);
      g.add(tg);
    }
  };
  port(0.0128, 0.0048, 0.0004, -0.016, 0.011);
  port(0.0128, 0.0048, 0.0004, 0.0, 0.011);
  port(0.0088, 0.0029, 0.00144, 0.016, 0.0064);
  // Power button on the side.
  const btn = mesh(new THREE.CapsuleGeometry(0.0013, 0.007, 6, 16), mat.plastic(shade(c.primary, luminance(c.primary) > 0.5 ? -0.06 : 0.06), 0.4));
  btn.position.set(W / 2 + 0.0002, 0.118, 0);
  g.add(btn);
  return grounded(g);
};

// ------------------------------------------------------------------ speaker

const buildSpeaker: Builder = (c) => {
  const g = new THREE.Group();
  const R = 0.04, H = 0.1;
  const weave = normalTexture(64, (u, v) => {
    const a = Math.sin(u * TAU * 2), b = Math.sin(v * TAU * 2);
    return 0.5 + 0.25 * Math.abs(a) * (b > 0 ? 1 : 0.4) + 0.25 * Math.abs(b) * (a > 0 ? 0.4 : 1);
  }, 3, [48, 22]);
  const fabric = named(new THREE.MeshPhysicalMaterial({
    color: c.primary, roughness: 0.92, sheen: 1, sheenRoughness: 0.75, sheenColor: new THREE.Color(c.primary).lerp(new THREE.Color('#ffffff'), 0.3), normalMap: weave, normalScale: new THREE.Vector2(0.9, 0.9),
  }), 'upper');
  const rubber = mat.plastic(c.secondary, 0.7);
  const icon = mat.plastic(c.accent, 0.45);

  g.add(mesh(lathe([[0, 0], [0.034, 0], [0.0372, 0.0012], [0.0388, 0.004], [0.0392, 0.0085], [0.037, 0.0088]], 72), rubber, 'foot'));
  g.add(mesh(lathe([[0.0378, 0.006], [0.0396, 0.0085], [0.0402, 0.0125], [R, 0.05], [0.0402, 0.0875], [0.0396, 0.0915], [0.0378, 0.094]], 96), fabric, 'fabric'));
  g.add(mesh(lathe([[0.037, 0.0912], [0.0392, 0.0915], [0.0393, 0.0955], [0.0382, 0.0985], [0.0358, 0.1], [0.02, H], [0, H]], 72), rubber, 'top'));

  // Embossed controls on the top: +, −, power and play.
  const raise = 0.0009, top = H + raise / 2 - 0.0001;
  const bar = (w: number, d: number, x: number, z: number, rot = 0) => {
    const b = mesh(flatSlab(w, d, raise, d / 2, raise / 2.2, 4, 2), icon);
    b.position.set(x, top, z);
    b.rotation.y = rot;
    g.add(b);
  };
  bar(0.008, 0.0018, 0, 0.019);
  bar(0.008, 0.0018, 0, 0.019, Math.PI / 2);
  bar(0.008, 0.0018, 0, -0.019);
  const pwr = mesh(new THREE.TorusGeometry(0.0034, 0.0008, 8, 40, TAU * 0.8).rotateX(-Math.PI / 2).rotateY(Math.PI / 2 + TAU * 0.1), icon);
  pwr.position.set(-0.019, H + 0.0002, 0);
  g.add(pwr);
  bar(0.0036, 0.0016, -0.019, -0.0032, Math.PI / 2);
  const play = new THREE.Shape([new THREE.Vector2(-0.0026, -0.003), new THREE.Vector2(0.0034, 0), new THREE.Vector2(-0.0026, 0.003)]);
  const playGeo = new THREE.ExtrudeGeometry(play, { depth: 0.0005, bevelEnabled: true, bevelThickness: 0.0002, bevelSize: 0.0003, bevelSegments: 2 }).rotateX(-Math.PI / 2);
  const pl = mesh(playGeo, icon);
  pl.position.set(0.019, H, 0);
  g.add(pl);

  // Carry strap: a fabric loop rising from the back edge of the top.
  const strapMat = mat.fabric(shade(c.secondary, -0.02));
  const anchor = mesh(slab(0.016, 0.009, 0.007, 0.003, 0.0022, 6, 3), rubber, 'strap-anchor');
  anchor.position.set(0, H - 0.0035, -R + 0.0022);
  anchor.rotation.x = 0.35;
  g.add(anchor);
  const loopPts = [
    v3(0, H - 0.001, -R + 0.002), v3(0, H + 0.008, -R - 0.002), v3(0, H + 0.018, -R - 0.012), v3(0, H + 0.02, -R - 0.026),
    v3(0, H + 0.011, -R - 0.034), v3(0, H + 0.0015, -R - 0.026), v3(0, H - 0.003, -R - 0.012), v3(0, H - 0.005, -R + 0.0005),
  ];
  g.add(mesh(band(loopPts, { width: 0.012, thickness: 0.0022, side: v3(1, 0, 0), segments: 90, radial: 20, round: 6 }), strapMat, 'strap'));
  return grounded(g);
};

// ------------------------------------------------------------------ lantern

const buildLantern: Builder = (c) => {
  const g = new THREE.Group();
  const body = named(mat.plastic(c.primary, 0.5), 'upper');
  const dark = mat.plastic(c.secondary, 0.55);
  const rubber = mat.rubber(shade(c.secondary, -0.02));

  // Base with a rubber grip band.
  g.add(mesh(lathe([[0, 0], [0.043, 0], [0.0475, 0.0018], [0.0498, 0.0055], [0.05, 0.036], [0.0494, 0.0405], [0.0472, 0.0432], [0.0435, 0.0445], [0, 0.0446]], 96), body, 'base'));
  g.add(mesh(lathe([[0.0499, 0.0095], [0.0508, 0.0102], [0.0511, 0.0118], [0.0511, 0.0262], [0.0508, 0.0278], [0.0499, 0.0285]], 96), rubber, 'grip'));
  g.add(mesh(lathe([[0, -0.0001], [0.04, -0.0001], [0.0425, 0.0006], [0.043, 0.0016], [0, 0.0016]], 64), rubber));

  // Frosted, fluted diffuser that glows.
  const glow = canvasOf(4, 128, (x) => {
    const grad = x.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#5a4a2a');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(1, '#5a4a2a');
    x.fillStyle = grad;
    x.fillRect(0, 0, 4, 128);
  });
  const glowTex = colorTexture(glow);
  const dGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.082, 128, 24, true);
  const dp = dGeo.getAttribute('position');
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i);
    const a = Math.atan2(z, x);
    const barrel = 1 + 0.03 * (1 - (y / 0.041) ** 2);
    const r = (0.042 + 0.0007 * Math.cos(a * 36)) * barrel;
    const k = r / Math.hypot(x, z);
    dp.setXYZ(i, x * k, y, z * k);
  }
  dGeo.computeVertexNormals();
  dGeo.translate(0, 0.043 + 0.041, 0);
  const diffuser = new THREE.MeshPhysicalMaterial({
    color: mix('#fffdf5', c.accent, 0.35), roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.3, emissive: new THREE.Color(c.accent), emissiveMap: glowTex, emissiveIntensity: 0.95,
  });
  g.add(mesh(dGeo, diffuser, 'diffuser'));
  // Inner cap closing the diffuser (seen through nothing, but keeps the model watertight).
  // Top cap.
  g.add(mesh(lathe([[0.0425, 0.1235], [0.0462, 0.125], [0.0478, 0.1285], [0.048, 0.1405], [0.0466, 0.1452], [0.0425, 0.1482], [0.03, 0.1505], [0, 0.151]], 96), body, 'cap'));
  // Guard bars between base and cap.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const bar = mesh(slab(0.0065, 0.083, 0.0045, 0.0025, 0.0018, 6, 3), dark, 'guard');
    bar.position.set(Math.sin(a) * 0.0442, 0.0835, Math.cos(a) * 0.0442);
    bar.rotation.y = a;
    g.add(bar);
  }
  // Fold-down handle (shown raised) on two pivots.
  const hy = 0.142;
  for (const s of [-1, 1]) {
    const lug = mesh(slab(0.007, 0.012, 0.012, 0.003, 0.0022, 6, 3), dark, 'handle-pivot');
    lug.position.set(s * 0.0478, hy, 0);
    lug.rotation.y = Math.PI / 2;
    g.add(lug);
  }
  const handle: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI;
    handle.push(v3(Math.cos(a) * 0.0515, hy + Math.sin(a) ** 0.8 * 0.058, 0));
  }
  g.add(mesh(tube(handle, 0.0026, false, 80, 14), dark, 'handle'));
  const grip: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 + ((i - 4) / 8) * 0.9;
    grip.push(v3(Math.cos(a) * 0.0515, hy + Math.sin(a) ** 0.8 * 0.058, 0));
  }
  g.add(mesh(tube(grip, 0.0042, false, 32, 16), rubber, 'handle-grip'));

  // Power button and USB-C flap on the front of the base.
  const btn = mesh(lathe([[0, 0], [0.0062, 0], [0.0064, 0.0008], [0.0058, 0.0018], [0, 0.002]], 40).rotateX(Math.PI / 2), dark, 'button');
  btn.position.set(0, 0.032, 0.0496);
  g.add(btn);
  const ring = mesh(new THREE.TorusGeometry(0.0039, 0.0005, 8, 40), mat.emissive(c.accent, 1.3));
  ring.position.set(0, 0.032, 0.0512);
  g.add(ring);
  const flap = mesh(slab(0.011, 0.0045, 0.0016, 0.0022, 0.0006, 6, 2), rubber);
  flap.position.set(0, 0.0175, 0.0505);
  g.add(flap);
  return grounded(g);
};

// ------------------------------------------------------------------ building blocks

const BLOCK_P = 0.016; // stud pitch
const BLOCK_H = 0.0192; // brick height

function brickGeometry(nx: number, nz: number) {
  const w = nx * BLOCK_P - 0.0003, d = nz * BLOCK_P - 0.0003;
  const parts: THREE.BufferGeometry[] = [flatSlab(w, d, BLOCK_H, 0.0016, 0.0013, 4, 3).translate(0, BLOCK_H / 2, 0)];
  const stud = lathe([[0.0047, -0.0004], [0.0047, 0.0036], [0.00455, 0.0043], [0.0041, 0.0047], [0, 0.0047]], 28);
  stud.deleteAttribute('uv');
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      parts.push(stud.clone().translate((i - (nx - 1) / 2) * BLOCK_P, BLOCK_H, (j - (nz - 1) / 2) * BLOCK_P));
    }
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

const buildBlocks: Builder = (c) => {
  const g = new THREE.Group();
  const palette = [c.primary, c.secondary, c.accent, '#22c55e', '#f97316', '#a855f7', '#38bdf8', '#f8fafc'];
  const mats = palette.map((hex) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.18 }));
  const geos = new Map<string, THREE.BufferGeometry>();
  const brick = (nx: number, nz: number, colour: number, x: number, level: number, z: number, rotY = 0) => {
    const key = `${nx}x${nz}`;
    if (!geos.has(key)) geos.set(key, brickGeometry(nx, nz));
    const m = mesh(geos.get(key)!, mats[colour], `brick-${key}`);
    m.position.set(x * BLOCK_P, level * BLOCK_H, z * BLOCK_P);
    m.rotation.y = rotY;
    g.add(m);
    return m;
  };
  // A small stepped tower...
  brick(2, 4, 1, 0, 0, 0, Math.PI / 2); // blue base (long along x)
  brick(2, 4, 3, -1, 0, -2.0, Math.PI / 2); // green behind
  brick(2, 4, 0, 0.5, 1, -1.0, Math.PI / 2); // red bridging both
  brick(2, 2, 2, -1, 2, -1.0); // yellow
  brick(2, 2, 6, 1, 2, -1.0); // sky
  brick(2, 4, 4, 0, 3, -1.0, Math.PI / 2); // orange
  brick(2, 2, 5, 0, 4, -1.0); // purple on top
  // ...and a few loose bricks in front.
  brick(2, 2, 7, 3.6, 0, 1.8, 0.35); // white
  brick(2, 4, 5, -3.4, 0, 1.6, -0.25 + Math.PI / 2); // purple
  brick(2, 2, 0, 0.6, 0, 2.6, -0.2); // red
  brick(2, 2, 2, 3.4, 0, -1.4, 0.7); // yellow
  return grounded(g);
};

// ------------------------------------------------------------------ plush bear

const buildPlush: Builder = (c) => {
  const g = new THREE.Group();
  const fur = named(new THREE.MeshPhysicalMaterial({
    color: c.primary, roughness: 1, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(c.primary).lerp(new THREE.Color('#ffffff'), 0.45),
  }), 'upper');
  const light = new THREE.MeshPhysicalMaterial({ color: c.secondary, roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(c.secondary).lerp(new THREE.Color('#ffffff'), 0.4) });
  const thread = new THREE.MeshPhysicalMaterial({ color: c.accent, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.4 });

  // Seated body: a pear-shaped lathe, slightly flattened front to back.
  const bodyGeo = lathe([[0, 0.004], [0.04, 0.006], [0.064, 0.02], [0.074, 0.048], [0.07, 0.085], [0.058, 0.118], [0.04, 0.142], [0.018, 0.156], [0, 0.16]], 64).scale(1, 1, 0.9);
  const bodyM = mesh(bodyGeo, fur, 'body');
  bodyM.rotation.x = -0.08;
  g.add(bodyM);
  const belly = mesh(ellipsoid(0.046, 0.05, 0.02), light, 'belly');
  belly.position.set(0, 0.07, 0.054);
  belly.rotation.x = -0.18;
  g.add(belly);

  // Head with muzzle, nose, mouth, eyes and ears.
  const hc = v3(0, 0.205, 0.006), hr = v3(0.07, 0.064, 0.066);
  g.add(Object.assign(mesh(ellipsoid(hr.x, hr.y, hr.z, 48, 32), fur, 'head'), { position: hc }));
  const mc = v3(0, 0.186, 0.058), mr = v3(0.033, 0.025, 0.022);
  g.add(Object.assign(mesh(ellipsoid(mr.x, mr.y, mr.z), light, 'muzzle'), { position: mc }));
  const nose = mesh(ellipsoid(0.0115, 0.0078, 0.0068), thread, 'nose');
  nose.position.copy(onEllipsoid(mc, mr, v3(0, 0.42, 1), -0.0025));
  g.add(nose);
  const mouth = [v3(0, 0.3, 1), v3(0, -0.05, 1), v3(-0.25, -0.32, 1)].map((d) => onEllipsoid(mc, mr, d, 0.0004));
  const mouth2 = [v3(0, -0.05, 1), v3(0.25, -0.32, 1)].map((d) => onEllipsoid(mc, mr, d, 0.0004));
  g.add(mesh(tube(mouth, 0.0009, false, 24, 8), thread, 'mouth'));
  g.add(mesh(tube([mouth[1], ...mouth2.slice(1)], 0.0009, false, 16, 8), thread));
  for (const s of [-1, 1]) {
    const eye = mesh(ellipsoid(0.0068, 0.0082, 0.0042, 24, 16), new THREE.MeshPhysicalMaterial({ color: c.accent, roughness: 0.35, clearcoat: 0.6 }), 'eye');
    const ep = onEllipsoid(hc, hr, v3(s * 0.36, 0.3, 1), -0.0018);
    eye.position.copy(ep);
    eye.lookAt(ep.clone().add(ep.clone().sub(hc)));
    g.add(eye);
    // Ears: flattened discs with a lighter inner ear.
    const ear = new THREE.Group();
    ear.add(mesh(ellipsoid(0.026, 0.024, 0.011), fur, 'ear'));
    const inner = mesh(ellipsoid(0.016, 0.014, 0.005), light, 'ear-inner');
    inner.position.set(0, -0.002, 0.0072);
    ear.add(inner);
    ear.position.copy(onEllipsoid(hc, hr, v3(s * 0.62, 0.78, -0.05), -0.004));
    ear.rotation.set(-0.15, s * -0.25, s * -0.45);
    g.add(ear);
  }

  // Arms reaching forward, legs stretched out with paw pads.
  const limb = (from: THREE.Vector3, to: THREE.Vector3, r: number, name: string) => {
    const len = from.distanceTo(to);
    const m = mesh(new THREE.CapsuleGeometry(r, len, 12, 28), fur, name);
    m.position.copy(from.clone().add(to).multiplyScalar(0.5));
    pointAlong(m, to.clone().sub(from));
    m.scale.set(1, 1, 0.92);
    g.add(m);
    return m;
  };
  for (const s of [-1, 1]) {
    limb(v3(s * 0.058, 0.128, 0.012), v3(s * 0.07, 0.066, 0.05), 0.023, 'arm');
    const legFrom = v3(s * 0.044, 0.031, 0.006), legTo = v3(s * 0.058, 0.031, 0.08);
    limb(legFrom, legTo, 0.031, 'leg');
    const dir = legTo.clone().sub(legFrom).normalize();
    const pad = mesh(ellipsoid(0.021, 0.023, 0.006), light, 'paw-pad');
    pad.position.copy(legTo.clone().addScaledVector(dir, 0.0275));
    pad.lookAt(pad.position.clone().add(dir));
    g.add(pad);
  }
  return grounded(g);
};

export const BUILDERS = {
  earbuds: buildEarbuds,
  headphones: buildHeadphones,
  smartwatch: buildSmartwatch,
  powerbank: buildPowerbank,
  speaker: buildSpeaker,
  lantern: buildLantern,
  blocks: buildBlocks,
  plush: buildPlush,
};
