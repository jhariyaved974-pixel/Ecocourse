// Procedural models: tshirt, backpack, sunglasses, wallet, yogamat, dumbbells, notebooks, pens.
// See kit.ts for conventions (metres, grounded, +z front). The main body material of each
// single-colour model is named "upper", so the storefront 3D viewer can tint it to the
// selected colourway (the same contract as the shoe models).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { grounded, mat, mesh, placeholder, type Builder } from './kit';

// ------------------------------------------------------------------ helpers

const TAU = Math.PI * 2;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** n + 1 evenly spaced samples over [0, 1] (or n samples over [0, 1) when `closed`). */
function steps(n: number, closed = false) {
  return Array.from({ length: closed ? n : n + 1 }, (_, i) => i / n);
}

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

/** Superellipse point (x, z) at angle `a` with half extents rx, rz and exponent n. */
function superellipse(a: number, rx: number, rz: number, n: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [Math.sign(c) * Math.abs(c) ** (2 / n) * rx, Math.sign(s) * Math.abs(s) ** (2 / n) * rz];
}

/**
 * Parametric surface through the grid us × vs. With `wrapU` the u samples cover [0, 1) and
 * the surface closes around. Faces point outwards when u runs from +x towards +z around an
 * axis while v runs along it (+y), i.e. when du × dv points inwards.
 */
function surface(us: number[], vs: number[], fn: (u: number, v: number) => THREE.Vector3, wrapU = false) {
  const pos: number[] = [];
  for (const v of vs) for (const u of us) {
    const p = fn(u, v);
    pos.push(p.x, p.y, p.z);
  }
  const nu = us.length;
  const idx: number[] = [];
  for (let j = 0; j < vs.length - 1; j++) {
    for (let i = 0; i < (wrapU ? nu : nu - 1); i++) {
      const i2 = (i + 1) % nu;
      const a = j * nu + i, b = j * nu + i2, c = (j + 1) * nu + i2, d = (j + 1) * nu + i;
      idx.push(a, c, b, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Flat fan closing a ring of points (`up` = facing +y side of a horizontal ring). */
function capFan(ring: THREE.Vector3[], up: boolean) {
  const c = ring.reduce((s, p) => s.add(p), v3(0, 0, 0)).multiplyScalar(1 / ring.length);
  const pos: number[] = [c.x, c.y, c.z];
  for (const p of ring) pos.push(p.x, p.y, p.z);
  const idx: number[] = [];
  for (let j = 0; j < ring.length; j++) {
    const j2 = (j + 1) % ring.length;
    if (up) idx.push(0, j2 + 1, j + 1);
    else idx.push(0, j + 1, j2 + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
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
function slab(w: number, h: number, depth: number, r: number | number[], edge: number, seg = 8, bevelSegments = 5) {
  const radii = (typeof r === 'number' ? [r, r, r, r] : r).map((x) => Math.max(x - edge, 0.0002));
  const shape = new THREE.Shape(rrect(w - 2 * edge, h - 2 * edge, radii, 0, 0, seg));
  const core = Math.max(depth - 2 * edge, 1e-5);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: core, bevelEnabled: edge > 0, bevelThickness: edge, bevelSize: edge, bevelSegments, curveSegments: 1,
  });
  geo.translate(0, 0, -core / 2);
  return smooth(geo);
}

/** Same as slab() but lying flat: outline in x/z (h runs along -z), thickness along y. */
function flatSlab(w: number, d: number, thickness: number, r: number | number[], edge: number, seg = 8, bevelSegments = 5) {
  return slab(w, d, thickness, r, edge, seg, bevelSegments).rotateX(-Math.PI / 2);
}

type Profile = number | ((t: number) => number);
const at = (p: Profile, t: number) => (typeof p === 'function' ? p(t) : p);

/**
 * Sweeps a rounded-rectangle section (superellipse, exponent `round`) along a smooth curve.
 * `side` fixes the direction of the section's width; `offset` shifts the section along its
 * thickness direction (N = T × side).
 */
function sweep(
  points: THREE.Vector3[],
  o: { width: Profile; thickness: Profile; side: THREE.Vector3; closed?: boolean; segments?: number; radial?: number; round?: number; offset?: Profile },
) {
  const curve = new THREE.CatmullRomCurve3(points, o.closed ?? false, 'centripetal');
  const segs = o.segments ?? 96;
  const radial = o.radial ?? 16;
  const exp = o.round ?? 4;
  const rings = o.closed ? segs : segs + 1;
  const pos: number[] = [];
  const idx: number[] = [];
  const ends: { p: THREE.Vector3; ring: THREE.Vector3[] }[] = [];
  for (let i = 0; i < rings; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const B = o.side.clone().addScaledVector(T, -o.side.dot(T)).normalize();
    const N = new THREE.Vector3().crossVectors(T, B).normalize();
    const w = at(o.width, t), h = at(o.thickness, t), off = o.offset ? at(o.offset, t) : 0;
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < radial; j++) {
      const [x, y] = superellipse((j / radial) * TAU, w / 2, h / 2, exp);
      const q = p.clone().addScaledVector(B, x).addScaledVector(N, y + off);
      ring.push(q);
      pos.push(q.x, q.y, q.z);
    }
    if (i === 0 || i === rings - 1) ends.push({ p: p.clone().addScaledVector(N, off), ring });
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
  const parts: THREE.BufferGeometry[] = [geo];
  ends.forEach(({ p, ring }, k) => {
    const cp: number[] = [p.x, p.y, p.z];
    for (const q of ring) cp.push(q.x, q.y, q.z);
    const ci: number[] = [];
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      if (k === 0) ci.push(0, j2 + 1, j + 1);
      else ci.push(0, j + 1, j2 + 1);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cg.setIndex(ci);
    cg.computeVertexNormals();
    parts.push(cg);
  });
  return mergeGeometries(parts)!;
}

/** Round tube along a smooth curve, with rounded (sphere) ends when open. */
function tube(points: THREE.Vector3[], radius: number, closed = false, segments = 64, radial = 12) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const parts: THREE.BufferGeometry[] = [new THREE.TubeGeometry(curve, segments, radius, radial, closed)];
  if (!closed) {
    for (const p of [points[0], points[points.length - 1]]) {
      parts.push(new THREE.SphereGeometry(radius, radial, Math.max(6, radial / 2)).translate(p.x, p.y, p.z));
    }
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
}

/** Deterministic PRNG (mulberry32), so renders are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ t-shirt

/**
 * Scales a colour's linear albedo. Diffuse fabrics and foams render about 1.5× brighter than
 * their swatch under the studio lights, so they are toned down to read true to the swatch.
 */
function albedo(hex: string, k: number) {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
}

/** Soft cotton jersey: diffuse with a faint sheen (the kit preset reads too pale on light tees). */
function cottonMaterial(hex: string, side: THREE.Side = THREE.FrontSide) {
  return new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.92, metalness: 0, sheen: 0.35, sheenRoughness: 0.7, side,
    sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.25),
  });
}

/**
 * Crew-neck tee on an invisible ("ghost") mannequin, standing on its hem: lofted body,
 * yoke narrowing to the neck, short sleeves angled down and a ribbed collar.
 */
const buildTshirt: Builder = (c) => {
  const g = new THREE.Group();
  const tone = albedo(c.primary, luminance(c.primary) > 0.8 ? 0.62 : 0.66);
  const cotton = named(cottonMaterial(tone), 'upper');
  // The inside of the garment (seen through the neck, sleeves) is in shade.
  const inside = named(cottonMaterial(albedo(tone, 0.5), THREE.BackSide), 'upper');
  /** Adds a thin-shell part with its outside and inside materials. */
  const shell = (geo: THREE.BufferGeometry, name: string) => {
    g.add(mesh(geo, cotton, name));
    g.add(mesh(geo, inside, `${name}-inside`));
  };

  // Body sections [y, half width, half depth, superellipse exponent], hem to the yoke.
  const K: [number, number, number, number][] = [
    [0.0, 0.212, 0.108, 2.6],
    [0.22, 0.204, 0.105, 2.5],
    [0.46, 0.21, 0.112, 2.4],
    [0.58, 0.206, 0.108, 2.4],
    [0.645, 0.202, 0.1, 2.4],
  ];
  const section = (y: number) => {
    let i = 0;
    while (i < K.length - 2 && y > K[i + 1][0]) i++;
    const [y0, a0, b0, n0] = K[i], [y1, a1, b1, n1] = K[i + 1];
    const t = smoothstep(y0, y1, y);
    return [lerp(a0, a1, t), lerp(b0, b1, t), lerp(n0, n1, t)];
  };
  const yS = K[K.length - 1][0];
  const [aS, bS, nS] = section(yS);
  const aN = 0.08, bN = 0.07, zN = -0.012;
  const shoulder = new THREE.CubicBezierCurve(
    new THREE.Vector2(aS, yS), new THREE.Vector2(aS - 0.001, 0.671), new THREE.Vector2(0.172, 0.681), new THREE.Vector2(aN, 0.717),
  );
  // Neckline height around the opening: the front dips below the back.
  const neckY = (a: number) => 0.718 - 0.022 * Math.max(0, Math.sin(a)) ** 1.6 + 0.003 * Math.max(0, -Math.sin(a));
  // Soft drape: low-frequency ripples, strongest towards the hem.
  const ripple = (a: number, y: number) =>
    0.004 * (0.4 + 0.6 * (1 - smoothstep(0, 0.3, y))) *
    (Math.sin(3 * a + 1.3 + 9 * y) + 0.6 * Math.sin(7 * a - 0.4 - 13 * y) + 0.35 * Math.sin(2 * a + 23 * y));
  // Shallow drag folds running from each underarm down towards the middle, front and back.
  const drag = (a: number, y: number) => {
    let d = 0;
    for (const side of [0, Math.PI]) {
      for (const fb of [1, -1]) {
        const da = Math.atan2(Math.sin(a - side), Math.cos(a - side)) * fb * (side === 0 ? 1 : -1);
        if (da <= 0) continue;
        const line = 0.5 - (y - 0.52) * 1.6; // angle from the side seam where the fold runs
        d -= 0.0035 * Math.exp(-(((da - line) / 0.07) ** 2)) * smoothstep(0.3, 0.42, y) * (1 - smoothstep(0.5, 0.56, y));
      }
    }
    return d;
  };
  // Hem stitching: a shallow groove ~2 cm from the edge.
  const groove = (x: number, at: number) => -0.0008 * Math.exp(-(((x - at) / 0.0016) ** 2));

  // t in [0, 1] walks the lower body (y = t * yS); t in (1, 2] walks the yoke.
  const bodyPoint = (u: number, t: number) => {
    const a = u * TAU;
    if (t <= 1) {
      const y = t * yS;
      const [ra, rb, n] = section(y);
      const [x, z] = superellipse(a, ra, rb, n);
      const nrm = new THREE.Vector2(x / (ra * ra), z / (rb * rb)).normalize();
      const d = ripple(a, y) * (1 - smoothstep(0.4, 0.6, y)) + drag(a, y) + groove(y, 0.022);
      return v3(x + nrm.x * d, y, z + nrm.y * d);
    }
    // Yoke: the side silhouette follows a Bézier from the vertical side wall over the
    // shoulder to a ~22° shoulder slope; the neckline dip blends in towards the top.
    const s = t - 1;
    const side = shoulder.getPoint(s);
    const rb = lerp(bS, bN, s ** 1.8);
    const [x, z] = superellipse(a, side.x, rb, lerp(nS, 2.05, s));
    const y = side.y + (neckY(a) - neckY(0)) * s ** 2;
    return v3(x, y, z + zN * s);
  };
  const ts: number[] = [];
  for (const y of [0, 0.004, 0.009, 0.014, 0.018, 0.0205, 0.022, 0.0235, 0.026, 0.03, 0.036]) ts.push(y / yS);
  for (let i = 1; i <= 36; i++) ts.push((0.036 + ((yS - 0.036) * i) / 36) / yS);
  for (let i = 1; i <= 24; i++) ts.push(1 + i / 24);
  shell(surface(steps(144, true), ts, bodyPoint, true), 'tee-body');
  // A shaded floor inside the body, so the view down the neck reads as the garment's
  // interior instead of the bright studio floor.
  const floorRing = steps(72, true).map((u) => bodyPoint(u, 0.3 / yS).multiplyScalar(0.97).setY(0.3));
  g.add(mesh(capFan(floorRing, true), mat.matte(albedo(tone, 0.3), 0.95), 'tee-inside'));
  // Folded hem edge.
  g.add(mesh(tube(steps(96, true).map((u) => bodyPoint(u, 0.0021 / yS)), 0.0021, true, 144, 8), cotton));

  // Sleeves: tapered elliptical tubes angled 45° down from the armhole. The part inside the
  // body narrows so it never pokes through the shoulder.
  for (const sx of [-1, 1]) {
    const d = v3(sx, -1, 0).normalize();
    const e1 = v3(sx, 1, 0).normalize(); // up and out, perpendicular to d
    const e2 = v3(0, 0, 1);
    const C = v3(sx * 0.2, 0.556, -0.004); // armhole centre, on the body side
    const T0 = -0.07, T1 = 0.142; // axis range (metres) from the armhole centre to the hem
    const sleevePoint = (u: number, k: number) => {
      const a = -u * TAU * sx;
      const t = lerp(T0, T1, k);
      const f = t / T1;
      const inside = 1 - 0.42 * smoothstep(0, T0, t);
      const ra = lerp(0.075, 0.063, clamp(f, 0, 1)) * inside;
      const rb = lerp(0.06, 0.05, clamp(f, 0, 1)) * inside;
      const wob = 0.0018 * Math.sin(3 * a + 9 * t + sx) * smoothstep(0.2, 1, f) + groove(t, T1 - 0.02);
      const p = C.clone().addScaledVector(d, t);
      return p.addScaledVector(e1, Math.cos(a) * (ra + wob)).addScaledVector(e2, Math.sin(a) * (rb + wob));
    };
    const ks = [...steps(20).map((k) => k * 0.88), 0.9, 0.91, 0.92, 0.93, 0.945, 0.96, 0.98, 1];
    shell(surface(steps(72, true), ks, sleevePoint, true), 'tee-sleeve');
    g.add(mesh(tube(steps(64, true).map((u) => sleevePoint(u, 1)), 0.0019, true, 96, 8), cotton));
  }

  // Ribbed collar: a closed band standing on the neck opening, ribs as a thickness ripple.
  const ring = steps(96, true).map((u) => {
    const p = bodyPoint(u, 2);
    const out = v3(p.x, 0, p.z - zN).normalize();
    return p.add(v3(0, 0.0062, 0)).addScaledVector(out, 0.0012);
  });
  const ribs = 120;
  g.add(mesh(sweep(ring, {
    width: 0.0175, thickness: (t) => 0.0036 + 0.0006 * Math.cos(t * ribs * TAU), side: v3(0, 1, 0),
    closed: true, segments: ribs * 4, radial: 12, round: 3,
  }), cotton, 'tee-collar'));

  // Woven neck label inside the back.
  const back = bodyPoint(0.75, 2);
  const label = mesh(slab(0.034, 0.014, 0.0008, 0.002, 0.0002), mat.matte(mix(c.primary, '#d8d4cc', 0.75), 0.8), 'tee-label');
  label.position.set(0, back.y - 0.011, back.z + 0.0045);
  label.rotation.x = 0.12;
  g.add(label);
  return grounded(g);
};

// ------------------------------------------------------------------ backpack

/** Half-width of a rounded-rectangle silhouette of height h at height y (corner radii r0 bottom, r1 top). */
function roundedHalf(half: number, h: number, r0: number, r1: number, y: number) {
  const top = y > h / 2;
  const r = top ? r1 : r0;
  const d = top ? h - y : y;
  if (d >= r) return half;
  const k = r - Math.max(d, 0);
  return half - r + Math.sqrt(Math.max(r * r - k * k, 0));
}

/** Heights from y0 to y1, dense near rounded ends of radius r0 / r1 (cosine spacing). */
function endDense(y0: number, y1: number, r0: number, r1: number, n = 10, mid = 8) {
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) ys.push(y0 + r0 * (1 - Math.cos((i / n) * (Math.PI / 2))));
  for (let i = 1; i < mid; i++) ys.push(y0 + r0 + ((y1 - r1 - y0 - r0) * i) / mid);
  for (let i = n; i >= 0; i--) ys.push(y1 - r1 * (1 - Math.cos((i / n) * (Math.PI / 2))));
  return ys.filter((y, i, a) => i === 0 || y - a[i - 1] > 1e-7);
}

/** Coated-polyester bag fabric: mostly matte with a soft sheen. */
function bagFabric(hex: string) {
  return new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.78, metalness: 0, sheen: 0.45, sheenRoughness: 0.55,
    sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.3),
  });
}

/** Pushes the +z face of a centred geometry outwards into a soft pillow. */
function pillow(geo: THREE.BufferGeometry, hw: number, hh: number, amount: number) {
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) <= 0) continue;
    const fx = clamp(1 - (p.getX(i) / hw) ** 2, 0, 1), fy = clamp(1 - (p.getY(i) / hh) ** 2, 0, 1);
    p.setZ(i, p.getZ(i) + amount * fx * fy * Math.min(1, p.getZ(i) / 0.01));
  }
  geo.computeVertexNormals();
  return geo;
}

/** Zip slider with a pull tab hanging along -y; local frame: surface normal +z. */
function zipPull(metal: THREE.Material, tab: THREE.Material, len = 0.036) {
  const g = new THREE.Group();
  const slider = mesh(slab(0.012, 0.016, 0.006, 0.003, 0.0018), metal, 'zip-slider');
  slider.position.z = 0.003;
  g.add(slider);
  const ring = mesh(new THREE.TorusGeometry(0.0035, 0.0009, 8, 20), metal);
  ring.position.set(0, -0.009, 0.005);
  g.add(ring);
  const t = mesh(slab(0.011, len, 0.0035, [0.004, 0.004, 0.0055, 0.0055], 0.0012), tab, 'zip-pull');
  t.position.set(0, -0.011 - len / 2, 0.0045);
  t.rotation.x = 0.06;
  g.add(t);
  return g;
}

/**
 * 25 L laptop backpack standing upright: lofted pillowy body with a contrast base, front
 * pocket, wrap-around main zip with double pulls, top grab handle, padded back panel and
 * S-curved shoulder straps.
 */
const buildBackpack: Builder = (c) => {
  const g = new THREE.Group();
  const shell = named(bagFabric(albedo(c.primary, 0.66)), 'upper');
  const base = bagFabric(albedo(c.secondary, 0.75));
  const padding = bagFabric(albedo(shade(c.secondary, -0.02), 0.75));
  const tape = mat.matte(shade(c.secondary, -0.04), 0.7);
  const teeth = mat.plastic(shade(c.secondary, -0.08), 0.5);
  const metal = mat.metal('#5b5e66', 0.32);
  const pullTab = mat.rubber(c.accent);

  const H = 0.46, W = 0.31, DF = 0.068, DB = 0.056; // height, width, front / back half depth
  const RB = 0.04, RT = 0.13; // corner radii of the front silhouette
  const hx = (y: number) => roundedHalf(W / 2, H, RB, RT, y);
  const hz = (y: number, front: boolean) => {
    const d = front ? DF * (0.94 + 0.06 * Math.sin((Math.PI * y) / H)) : DB;
    return roundedHalf(d, H, 0.028, d, y);
  };
  const n = 2.8;
  // Soft-goods wrinkles: a faint low-frequency waviness over the panels.
  const wrinkle = (a: number, y: number) =>
    0.0019 * (Math.sin(5 * a + 21 * y) + 0.7 * Math.sin(9 * a - 17 * y + 1.7) + 0.45 * Math.sin(14 * a + 37 * y + 0.4));
  const bodyPoint = (u: number, y: number, lift = 0) => {
    const a = u * TAU;
    const front = Math.sin(a) >= 0;
    const rx = hx(y), rz = hz(y, front);
    const [x] = superellipse(a, rx, 1, n);
    const [, z] = superellipse(a, 1, rz, n);
    const nrm = new THREE.Vector2(x / (rx * rx), z / Math.max(rz * rz, 1e-6)).normalize();
    const d = (lift + wrinkle(a, y) * smoothstep(0, 0.03, Math.min(y - 0.06, H - y))) * (rz > 0.004 ? 1 : 0);
    return v3(x + nrm.x * d, y, z + nrm.y * d);
  };
  const us = steps(96, true);
  const ys = endDense(0, H, 0.028, DF, 10, 14);
  const split = 0.055;
  const lowYs = [...ys.filter((y) => y < split), split];
  const highYs = [split, ...ys.filter((y) => y > split)];
  g.add(mesh(surface(us, lowYs, bodyPoint, true), base, 'bag-base'));
  g.add(mesh(capFan(us.map((u) => bodyPoint(u, 0)), false), base));
  g.add(mesh(surface(us, highYs, bodyPoint, true), shell, 'bag-body'));
  // Piping where the base panel meets the body.
  g.add(mesh(tube(us.map((u) => bodyPoint(u, split).multiplyScalar(1.004).setY(split)), 0.0028, true, 128, 8), base));

  // Main zip: follows the front silhouette (z = 0) up one side, over the top and down.
  const zipPts: THREE.Vector3[] = [];
  const zy = ys.filter((y) => y >= 0.19);
  for (const y of zy) zipPts.push(v3(hx(y), y, 0));
  for (let i = 1; i < 6; i++) zipPts.push(v3(lerp(hx(H), -hx(H), i / 6), H, 0));
  for (const y of [...zy].reverse()) zipPts.push(v3(-hx(y), y, 0));
  g.add(mesh(sweep(zipPts, { width: 0.016, thickness: 0.0024, side: v3(0, 0, 1), offset: 0.0011, segments: 160, radial: 12 }), tape, 'zip-tape'));
  g.add(mesh(sweep(zipPts, { width: 0.0055, thickness: 0.0034, side: v3(0, 0, 1), offset: 0.0017, segments: 160, radial: 10 }), teeth, 'zip-teeth'));
  for (const y of [0.322, 0.262]) {
    const p = zipPull(metal, pullTab);
    p.position.set(hx(y) + 0.0024, y, 0);
    p.rotation.set(0, Math.PI / 2, 0);
    g.add(p);
  }

  // Stretch side pocket on the right: bulges off the side panel, open along its top edge.
  const sideA = 0.62, sy0 = 0.06, sy1 = 0.215;
  const bulge = (k: number, y: number) => 0.017 * Math.sin(Math.PI * k) ** 0.7 * smoothstep(sy0, sy0 + 0.07, y);
  const sidePoint = (k: number, y: number) => bodyPoint(lerp(-sideA, sideA, k) / TAU, y, bulge(k, y) + 0.0008);
  const sideMesh = bagFabric(albedo(mix(c.secondary, c.primary, 0.35), 0.7));
  sideMesh.side = THREE.DoubleSide;
  g.add(mesh(surface(steps(28), endDense(sy0, sy1, 0.02, 0.0001, 6, 8), sidePoint), sideMesh, 'bag-side-pocket'));
  g.add(mesh(tube(steps(28).map((k) => sidePoint(k, sy1)), 0.0032, false, 48, 8), base));

  // Front pocket: a soft pillow on the lower front with its own zip.
  const PW = 0.24, PH = 0.2, PD = 0.046, PY = 0.17;
  const pocketGeo = pillow(slab(PW, PH, PD, [0.07, 0.07, 0.04, 0.04], 0.018, 10, 6), PW / 2, PH / 2, 0.012);
  const pocket = mesh(pocketGeo, shell, 'bag-pocket');
  const pz = hz(PY, true) - 0.012;
  pocket.position.set(0, PY, pz);
  g.add(pocket);
  // Piping around the pocket's front edge.
  const rim = rrect(PW - 0.012, PH - 0.012, [0.064, 0.064, 0.034, 0.034], 0, 0, 10).map((q) => v3(q.x, q.y + PY, pz + PD / 2 - 0.006));
  g.add(mesh(tube(rim, 0.0026, true, 160, 8), base, 'bag-piping'));
  const faceZ = (x: number, y: number) => pz + PD / 2 + 0.012 * clamp(1 - (x / (PW / 2)) ** 2, 0, 1) * clamp(1 - ((y - PY) / (PH / 2)) ** 2, 0, 1);
  const pzy = PY + PH / 2 - 0.03;
  const pZip = steps(16).map((k) => {
    const x = lerp(-0.098, 0.098, k);
    return v3(x, pzy, faceZ(x, pzy));
  });
  g.add(mesh(sweep(pZip, { width: 0.013, thickness: 0.0022, side: v3(0, 1, 0), offset: 0.0006, segments: 48, radial: 10 }), tape));
  g.add(mesh(sweep(pZip, { width: 0.005, thickness: 0.003, side: v3(0, 1, 0), offset: 0.0012, segments: 48, radial: 8 }), teeth));
  const pp = zipPull(metal, pullTab, 0.03);
  pp.position.set(0.07, pzy, faceZ(0.07, pzy) + 0.0012);
  g.add(pp);

  // Rubber patch above the pocket.
  const patch = mesh(slab(0.05, 0.02, 0.003, 0.004, 0.0012), mat.rubber(shade(c.secondary, -0.03)), 'bag-patch');
  patch.position.set(0, 0.335, hz(0.335, true) + 0.0006);
  g.add(patch);

  // Top grab handle.
  const hz0 = -0.018;
  const handle = [v3(-0.05, H - 0.006, hz0), v3(-0.035, H + 0.022, hz0), v3(0, H + 0.032, hz0), v3(0.035, H + 0.022, hz0), v3(0.05, H - 0.006, hz0)];
  g.add(mesh(sweep(handle, { width: 0.026, thickness: 0.007, side: v3(0, 0, 1), segments: 40, radial: 12 }), base, 'bag-handle'));

  // Padded back panel: two vertical pads.
  for (const sx of [-1, 1]) {
    const pad = mesh(slab(0.105, 0.31, 0.026, 0.04, 0.011, 8, 5), padding, 'bag-back-pad');
    pad.position.set(sx * 0.058, 0.24, -DB - 0.004);
    g.add(pad);
  }

  // Shoulder straps: padded S-curves from the top of the back to the bottom corners.
  for (const sx of [-1, 1]) {
    const zb = -DB - 0.012;
    const pts = [
      v3(sx * 0.045, H - 0.05, hz(H - 0.05, false) * -1 + 0.006),
      v3(sx * 0.055, H - 0.1, zb - 0.026),
      v3(sx * 0.072, 0.29, zb - 0.044),
      v3(sx * 0.094, 0.17, zb - 0.042),
      v3(sx * 0.118, 0.085, zb - 0.022),
      v3(sx * 0.13, 0.035, -hz(0.035, false) + 0.004),
    ];
    const w = (t: number) => lerp(0.066, 0.036, smoothstep(0.62, 0.86, t)) * (0.85 + 0.15 * smoothstep(0, 0.12, t));
    const th = (t: number) => lerp(0.016, 0.0035, smoothstep(0.6, 0.82, t));
    g.add(mesh(sweep(pts, { width: w, thickness: th, side: v3(1, 0, 0), segments: 96, radial: 14 }), padding, 'bag-strap'));
    // Ladder-lock buckle where the padding ends.
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const bp = curve.getPointAt(0.8), bt = curve.getTangentAt(0.8);
    const buckle = mesh(slab(0.04, 0.022, 0.006, 0.004, 0.002), mat.plastic('#1f1f22', 0.5), 'bag-buckle');
    buckle.position.copy(bp).add(v3(0, 0, -0.003));
    buckle.lookAt(bp.clone().add(v3(0, 0, -1)));
    buckle.rotateZ(Math.atan2(bt.x, -bt.y) * -1);
    g.add(buckle);
  }
  return grounded(g);
};

// ------------------------------------------------------------------ sunglasses

/** Mirrors a geometry across x = 0 and restores the triangle winding. */
function mirrorX(geo: THREE.BufferGeometry) {
  const m = geo.clone();
  m.scale(-1, 1, 1);
  const idx = m.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
  } else {
    for (const attr of Object.values(m.attributes) as THREE.BufferAttribute[]) {
      for (let i = 0; i < attr.count; i += 3) {
        for (let k = 0; k < attr.itemSize; k++) {
          const b = attr.getComponent(i + 1, k);
          attr.setComponent(i + 1, k, attr.getComponent(i + 2, k));
          attr.setComponent(i + 2, k, b);
        }
      }
    }
  }
  return m;
}

/** Aviator lens outline (mm): u from the nose side outwards, v up from the lowest point. */
const AVIATOR: [number, number][] = [
  [7, 47], [20, 48.8], [35, 49.2], [47, 47.8], [54.5, 43.5], [57.6, 35], [56.5, 23], [51, 11.5], [42, 3.4],
  [31.5, 0], [22.5, 1.3], [14.5, 6], [8.5, 13.5], [4.4, 23.5], [3, 34], [3.8, 42.5]
];

/**
 * Metal aviator sunglasses standing open on their lens rims and temple tips: teardrop
 * gradient-tinted lenses in wire rims, double bridge, nose pads on arms, and cable temples
 * with acetate tips.
 */
const buildSunglasses: Builder = (c) => {
  const g = new THREE.Group();
  // Dark metals read almost black in reflections; lift them so gunmetal still reads as grey.
  const metal = named(mat.metal(luminance(c.primary) < 0.2 ? shade(c.primary, 0.14) : c.primary, 0.22), 'upper');
  const tips = mat.plastic(shade(c.accent, -0.12), 0.32);
  const pads = new THREE.MeshPhysicalMaterial({ color: '#d9d6cc', roughness: 0.3, transparent: true, opacity: 0.55 });
  const lens = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.03, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02,
    transparent: true, opacity: 0.9,
  });

  const R = 0.00115; // rim wire radius
  const y0 = R;
  const X0 = 0.0072; // half the bridge gap
  // Frame wrap and lens base curve: everything sits on this surface (z = 0 at the centre).
  const zf = (x: number, y: number) => -(x * x) / 0.42 - ((Math.abs(x) - 0.037) ** 2 + (y - 0.026) ** 2) / 0.26;
  const outline = new THREE.CatmullRomCurve3(AVIATOR.map(([u, v]) => v3(X0 + u / 1000, y0 + v / 1000, 0)), true, 'centripetal');
  const N = 120;
  const rimPts = outline.getSpacedPoints(N).slice(0, N);
  const centre = rimPts.reduce((s, p) => s.add(p), v3(0, 0, 0)).multiplyScalar(1 / N);
  centre.y += 0.004;
  const onFrame = (p: THREE.Vector3, dz = 0) => v3(p.x, p.y, zf(p.x, p.y) + dz);

  // Lens: a curved shell (front and back faces) over a polar grid inside the rim.
  const lensPoint = (u: number, r: number, dz: number) => {
    const i = u * N;
    const a = rimPts[Math.floor(i) % N], b = rimPts[(Math.floor(i) + 1) % N];
    const edge = a.clone().lerp(b, i - Math.floor(i));
    const p = centre.clone().lerp(edge, r * 0.985);
    return onFrame(p, dz);
  };
  const rs = steps(10);
  const tint = new THREE.Color(c.secondary);
  const lensColors = (geo: THREE.BufferGeometry) => {
    const p = geo.getAttribute('position');
    const col: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const k = smoothstep(0.008, 0.046, p.getY(i));
      const cc = tint.clone().lerp(new THREE.Color('#c9cfc0'), 0.16 * (1 - k)).multiplyScalar(lerp(0.95, 0.62, k));
      col.push(cc.r, cc.g, cc.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  };
  // Polar grid: u runs counter-clockwise seen from the front, r outwards → du × dr faces -z,
  // so the front face uses the mirrored winding (swap u direction).
  const front = lensColors(surface(steps(N, true).map((u) => 1 - u), rs, (u, r) => lensPoint(u, r, 0.0003), true));
  const back = lensColors(surface(steps(N, true), rs, (u, r) => lensPoint(u, r, -0.0011), true));
  const lensGeo = mergeGeometries([front, back])!;

  const right: THREE.BufferGeometry[] = [];
  const rightTips: THREE.BufferGeometry[] = [];
  const rightPads: THREE.BufferGeometry[] = [];
  right.push(tube(rimPts.map((p) => onFrame(p, -0.0004)), R, true, 200, 10));
  // Nose pad arm and pad.
  const padArm = [v3(X0 + 0.0034, y0 + 0.024, 0), v3(X0 + 0.0026, y0 + 0.0215, -0.0045), v3(X0 + 0.0016, y0 + 0.0185, -0.0085)]
    .map((p) => p.setZ(p.z + zf(X0 + 0.0034, y0 + 0.024) - 0.0004));
  right.push(tube(padArm, 0.0005, false, 16, 6));
  const pad = new THREE.SphereGeometry(1, 20, 14).scale(0.0018, 0.0048, 0.0008);
  pad.rotateY(-1.05).rotateZ(-0.18).rotateX(0.2);
  pad.translate(padArm[2].x - 0.0006, padArm[2].y - 0.0032, padArm[2].z - 0.0012);
  rightPads.push(pad);
  // End piece and hinge at the outer top corner, then the cable temple.
  const ep = onFrame(v3(X0 + 0.0565, y0 + 0.041, 0), -0.0004);
  const hinge = v3(X0 + 0.0614, y0 + 0.0408, ep.z - 0.0062);
  right.push(tube([ep, v3(ep.x + 0.0035, ep.y + 0.0003, ep.z - 0.0028), hinge], 0.00105, false, 16, 8));
  right.push(new RoundedBoxGeometry(0.0032, 0.0046, 0.0068, 2, 0.0011).translate(hinge.x + 0.0004, hinge.y, hinge.z - 0.002));
  const tStart = v3(hinge.x + 0.0006, hinge.y, hinge.z - 0.005);
  const tEnd = v3(hinge.x + 0.0042, hinge.y - 0.0018, hinge.z - 0.108);
  right.push(tube([tStart, tStart.clone().lerp(tEnd, 0.5).add(v3(0.0006, 0.0003, 0)), tEnd], 0.00095, false, 48, 8));
  const tipPts = [
    tStart.clone().lerp(tEnd, 0.86),
    tEnd.clone(),
    v3(tEnd.x + 0.0004, tEnd.y - 0.0035, tEnd.z - 0.017),
    v3(tEnd.x + 0.0006, tEnd.y - 0.014, tEnd.z - 0.031),
    v3(tEnd.x + 0.0006, tEnd.y - 0.027, tEnd.z - 0.037),
    v3(tEnd.x + 0.0005, 0.0019, tEnd.z - 0.0395),
  ];
  rightTips.push(sweep(tipPts, { width: (t) => lerp(0.0028, 0.0036, Math.sin(Math.PI * t)), thickness: 0.0034, side: v3(1, 0, 0), segments: 48, radial: 12, round: 2.4 }));

  const both = (list: THREE.BufferGeometry[]) => mergeGeometries([...list, ...list.map(mirrorX)].map((x) => (x.index ? x.toNonIndexed() : x)))!;
  g.add(mesh(both(right), metal, 'frame'));
  g.add(mesh(both(rightTips), tips, 'temple-tips'));
  g.add(mesh(both(rightPads), pads, 'nose-pads'));
  const lenses = mesh(mergeGeometries([lensGeo, mirrorX(lensGeo)])!, lens, 'lenses');
  lenses.castShadow = true;
  g.add(lenses);

  // Double bridge: a straight brow bar and an arched lower bridge.
  const brow = [-0.0185, -0.009, 0, 0.009, 0.0185].map((x) => onFrame(v3(x, y0 + 0.0487 + 0.0007 * Math.cos((x / 0.0185) * (Math.PI / 2)), 0), -0.0006));
  g.add(mesh(tube(brow, 0.00105, false, 32, 8), metal));
  const lower = [[-X0 - 0.0034, 0.0365], [-0.0058, 0.0402], [0, 0.0414], [0.0058, 0.0402], [X0 + 0.0034, 0.0365]]
    .map(([x, y]) => onFrame(v3(x, y0 + y, 0), -0.0004));
  g.add(mesh(tube(lower, 0.001, false, 32, 8), metal));
  return grounded(g);
};

// ------------------------------------------------------------------ export

void luminance;
void rng;

export const BUILDERS = {
  tshirt: buildTshirt,
  backpack: buildBackpack,
  sunglasses: buildSunglasses,
  wallet: ((c) => placeholder(c)) as Builder,
  yogamat: ((c) => placeholder(c)) as Builder,
  dumbbells: ((c) => placeholder(c)) as Builder,
  notebooks: ((c) => placeholder(c)) as Builder,
  pens: ((c) => placeholder(c)) as Builder,
};
