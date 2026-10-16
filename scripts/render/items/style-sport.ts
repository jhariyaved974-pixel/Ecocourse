// Procedural models: tshirt, backpack, sunglasses, wallet, yogamat, dumbbells, notebooks, pens.
// See kit.ts for conventions (metres, grounded, +z front). The main body material of each
// single-colour model is named "upper", so the storefront 3D viewer can tint it to the
// selected colourway (the same contract as the shoe models).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { grounded, lathe, mat, mesh, type Builder } from './kit';

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
 * `side` fixes the direction of the section's width (or returns it per sample, in order); `offset` shifts the section along its
 * thickness direction (N = T × side).
 */
function sweep(
  points: THREE.Vector3[],
  o: { width: Profile; thickness: Profile; side: THREE.Vector3 | ((t: number, T: THREE.Vector3) => THREE.Vector3); closed?: boolean; segments?: number; radial?: number; round?: number; offset?: Profile },
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
    const sd = typeof o.side === 'function' ? o.side(t, T) : o.side;
    const B = sd.clone().addScaledVector(T, -sd.dot(T)).normalize();
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

// ------------------------------------------------------------------ wallet

/** Smooth-grain leather with a waxy finish. */
function leatherMaterial(hex: string) {
  return new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.52, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.45,
    sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.3),
  });
}

/**
 * Running stitches along a 2D polyline. `place(p)` maps a polyline point to 3D and `frame(p)`
 * returns the surface normal there; stitches are flattened ellipsoids sunk into the surface.
 */
function stitches(
  path: THREE.Vector2[], place: (p: THREE.Vector2) => THREE.Vector3, normal: THREE.Vector3,
  o: { pitch?: number; len?: number; width?: number; skip?: (p: THREE.Vector2) => boolean } = {},
) {
  const pitch = o.pitch ?? 0.003, len = o.len ?? 0.002, width = o.width ?? 0.00075;
  const seg: number[] = [0];
  for (let i = 1; i < path.length; i++) seg.push(seg[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = seg[seg.length - 1];
  const n = Math.floor(total / pitch);
  const start = (total - n * pitch) / 2 + pitch / 2;
  const base = new THREE.SphereGeometry(1, 8, 4);
  base.deleteAttribute('uv');
  const parts: THREE.BufferGeometry[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = start + i * pitch;
    while (k < seg.length - 2 && seg[k + 1] < s) k++;
    const t = (s - seg[k]) / Math.max(seg[k + 1] - seg[k], 1e-9);
    const p = path[k].clone().lerp(path[k + 1], t);
    if (o.skip?.(p)) continue;
    const dir2 = path[k + 1].clone().sub(path[k]).normalize();
    const a = place(p), b = place(p.clone().addScaledVector(dir2, 0.001));
    const X = b.sub(a).normalize();
    const Y = normal.clone();
    const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
    const m = new THREE.Matrix4().makeBasis(X, Y, Z).scale(v3(len / 2, 0.00034, width / 2));
    m.setPosition(a.addScaledVector(Y, -0.00022)); // sunk in, standing ~0.12 mm proud
    parts.push(base.clone().applyMatrix4(m));
  }
  return mergeGeometries(parts)!;
}

/**
 * Slim bifold wallet lying on its back, opened about 35° so the stepped card slots (with card
 * edges peeking out) show on both halves. Outer leather wraps round a soft spine; edges are
 * stitched in a contrast thread.
 */
const buildWallet: Builder = (c) => {
  const g = new THREE.Group();
  const outer = named(leatherMaterial(albedo(c.primary, 0.82)), 'upper');
  const panel = leatherMaterial(albedo(shade(c.primary, -0.025), 0.8));
  const lining = leatherMaterial(albedo(c.secondary, 0.85));
  const thread = mat.matte(c.accent, 0.75);
  const cardMats = ['#2c56a8', '#d5b46c', '#dfe2e6', '#1f1f22', '#b5372f', '#2f8466'].map((h) => mat.plastic(h, 0.3));

  const H = 0.09; // height along the spine (x)
  const L = 0.108; // width of each half (z)
  const T0 = 0.0018; // outer leather
  const TL = 0.0007; // lining / slot layers
  const TC = 0.00076; // cards
  const GAP = 0.00004;
  const R = 0.0068; // spine bend radius (outer face)
  const OPEN = THREE.MathUtils.degToRad(35);
  const RC = 0.0065; // free-edge corner radius
  const E = 0.0005; // edge rounding

  // Slot tiers (v = distance from the bottom edge of the half, along +x).
  const cardTop = [0.0848, 0.0698, 0.0552];
  const layerTop = [0.0762, 0.0614, 0.047];
  const U0 = 0.0045, U1 = L - 0.0012; // panel extent across the half
  const V0 = 0.0012, V1 = H - 0.0012;
  const yLining = T0 + GAP;
  const yCard = (k: number) => yLining + TL + GAP + k * (TC + TL + 2 * GAP);
  const yLayer = (k: number) => yCard(k) + TC + GAP;

  /** One half in its flat-open position: s = +1 extends towards +z (base), -1 towards -z (lid). */
  const half = (s: 1 | -1, cardOffset: number) => {
    const h = new THREE.Group();
    const at = (u: number, v: number, y: number) => v3(v - H / 2, y, s * u);
    // Corner radii in flatSlab order [tl, tr, br, bl]: the spine side is square.
    const radii = (r: number, spine = 0.0004) => (s > 0 ? [spine, spine, r, r] : [r, r, spine, spine]);
    const flat = (u0: number, u1: number, v0: number, v1: number, y: number, t: number, r: number[], m: THREE.Material, name?: string, edge = E) => {
      const piece = mesh(flatSlab(v1 - v0, u1 - u0, t, r, Math.min(edge, t * 0.45), 8, 3), m, name);
      piece.position.copy(at((u0 + u1) / 2, (v0 + v1) / 2, y + t / 2));
      return piece;
    };
    h.add(flat(0, L, 0, H, 0, T0, radii(RC), outer, 'wallet-shell'));
    h.add(flat(0.0015, L - 0.0012, V0, V1, yLining, TL, radii(RC - 0.0012), lining, 'wallet-lining'));
    for (let k = 0; k < 3; k++) {
      // Card: long side across the half, top edge peeking above its pocket.
      const cw = 0.0856, ch = 0.054;
      const cu = (U0 + U1) / 2 + s * 0.0004;
      const card = mesh(flatSlab(ch, cw, TC, 0.003, 0.00028, 6, 2), cardMats[(k + cardOffset) % cardMats.length], 'wallet-card');
      card.position.copy(at(cu, cardTop[k] - ch / 2, yCard(k) + TC / 2));
      h.add(card);
      // Pocket layer in front of the card: from the bottom edge up to its top edge.
      // flatSlab corners (v → x, u → z): tl(-v,-z) tr(+v,-z) br(+v,+z) bl(-v,+z); only the
      // bottom corner on the free edge follows the shell's rounding.
      const rr = s > 0 ? [0.0009, 0.001, 0.001, RC - 0.0012] : [RC - 0.0012, 0.001, 0.001, 0.0009];
      h.add(flat(U0, U1, V0, layerTop[k], yLayer(k), TL, rr, panel, 'wallet-slot'));
      // Glued edge strips in the card gap along the free and bottom edges, so the stitched
      // edge reads as one solid leather edge instead of loose plates.
      const tf = TC + 2 * GAP + 0.00012;
      const cardU1 = cu + cw / 2 + 0.0006;
      const fr = s > 0 ? [0.0004, 0.0004, 0.0004, RC - 0.0016] : [RC - 0.0016, 0.0004, 0.0004, 0.0004];
      h.add(flat(cardU1, U1 - 0.00025, V0 + 0.00025, layerTop[k] - 0.0004, yCard(k) - GAP - 0.00006, tf, fr, panel, 'wallet-edge', 0.0002));
      const cardV0 = cardTop[k] - ch - 0.0006;
      if (cardV0 > V0 + 0.002) {
        h.add(flat(U0 + 0.00025, cardU1, V0 + 0.00025, cardV0, yCard(k) - GAP - 0.00006, tf, [0.0004, 0.0004, 0.0004, 0.0004], panel, 'wallet-edge', 0.0002));
      }
    }

    // Stitching round the three open edges, 3 mm in: outside on the shell, inside through
    // the slot layers (skipping the steps between tiers).
    const d = 0.003, rs = RC - d;
    const open: THREE.Vector2[] = [new THREE.Vector2(0.006, d)];
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * (Math.PI / 2);
      open.push(new THREE.Vector2(L - RC + rs * Math.cos(a), RC + rs * Math.sin(a)));
    }
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      open.push(new THREE.Vector2(L - RC + rs * Math.cos(a), H - RC + rs * Math.sin(a)));
    }
    open.push(new THREE.Vector2(0.006, H - d));
    h.add(mesh(stitches(open, (p) => at(p.x, p.y, 0), v3(0, -1, 0)), thread, 'wallet-stitch'));
    const top = (u: number, v: number) => {
      if (u < U0 || u > U1 || v < V0 || v > V1) return T0;
      for (let k = 2; k >= 0; k--) if (v <= layerTop[k]) return yLayer(k) + TL;
      return yLining + TL;
    };
    const near = (v: number) => layerTop.some((e) => Math.abs(v - e) < 0.0016);
    h.add(mesh(stitches(open, (p) => at(p.x, p.y, top(p.x, p.y)), v3(0, 1, 0), { skip: (p) => near(p.y) }), thread, 'wallet-stitch'));
    return h;
  };

  g.add(half(1, 0));
  // Lid: the mirrored half swung up about the spine axis (x through y = R, z = 0).
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, R, 0);
  lidPivot.rotation.x = Math.PI - OPEN;
  const lid = half(-1, 3);
  lid.position.set(0, -R, 0);
  lidPivot.add(lid);
  g.add(lidPivot);

  // Spine: the outer leather bending round from the base to the lid (with short straight
  // tongues tucked just inside both shells so the joins stay seamless).
  const prof: THREE.Vector2[] = [];
  const bevel = 0.0004;
  const ro = R - 0.00005 - bevel, ri = R - T0 + 0.00005 + bevel; // the bevel grows it back
  const sweepAngle = Math.PI - OPEN;
  const arc = (r: number, rev: boolean) => {
    const pts: THREE.Vector2[] = [];
    // Tongue into the base half (z > 0).
    pts.push(new THREE.Vector2(0.003, R - r));
    for (let i = 0; i <= 24; i++) {
      const f = (i / 24) * sweepAngle;
      pts.push(new THREE.Vector2(-r * Math.sin(f), R - r * Math.cos(f)));
    }
    // Tongue into the lid.
    const tip = pts[pts.length - 1];
    pts.push(new THREE.Vector2(tip.x + 0.003 * Math.cos(OPEN), tip.y + 0.003 * Math.sin(OPEN)));
    return rev ? pts.reverse() : pts;
  };
  prof.push(...arc(ro, false), ...arc(ri, true));
  const spineGeo = new THREE.ExtrudeGeometry(new THREE.Shape(prof), {
    depth: H - 2 * bevel - 0.0002, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1,
  });
  spineGeo.translate(0, 0, -(H - 2 * bevel - 0.0002) / 2);
  spineGeo.rotateY(-Math.PI / 2);
  g.add(mesh(smooth(spineGeo), outer, 'wallet-spine'));
  return grounded(g);
};

// ------------------------------------------------------------------ shared (yoga mat .. pens)

/** Flips a geometry's triangle winding when its normals mostly disagree with `out(p)`. */
function facing(geo: THREE.BufferGeometry, out: (p: THREE.Vector3) => THREE.Vector3) {
  geo.computeVertexNormals();
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  let s = 0;
  const q = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) s += m.fromBufferAttribute(n, i).dot(out(q.fromBufferAttribute(p, i)));
  if (s < 0) {
    const idx = geo.getIndex()!;
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    geo.computeVertexNormals();
  }
  return geo;
}

/** Indexed quad strip between two equally long point rows (flat caps, end faces). */
function strip(a: THREE.Vector3[], b: THREE.Vector3[]) {
  const pos: number[] = [];
  for (const p of [...a, ...b]) pos.push(p.x, p.y, p.z);
  const n = a.length, idx: number[] = [];
  for (let i = 0; i < n - 1; i++) idx.push(i, n + i, i + 1, i + 1, n + i, n + i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

/** Merges parts that each keep their own normals (hard edges between them). */
function mergeParts(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    return g;
  }))!;
}

/** Text / badge texture drawn on a canvas. */
function canvasMap(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ yoga mat

/** TPE foam: soft, matte, with a faint sheen. */
function foamMaterial(hex: string) {
  return new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.82, metalness: 0, sheen: 0.3, sheenRoughness: 0.6,
    sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.25),
  });
}

/**
 * 6 mm two-tone mat rolled up and lying on its side (axis along x): an Archimedean spiral of
 * ~7 wraps, top colour outside, underside colour inside, so the open ends show the layered
 * swirl. Two webbing loops hold it; the carry strap between them lies in a loose U on the floor.
 */
const buildYogaMat: Builder = (c) => {
  const g = new THREE.Group();
  const top = named(foamMaterial(albedo(c.primary, 0.6)), 'upper');
  const under = foamMaterial(albedo(c.secondary, 0.7));
  const webbing = bagFabric(albedo(c.accent, luminance(c.accent) > 0.3 ? 0.7 : 1));
  const plastic = mat.plastic('#1d1d20', 0.45);

  const W = 0.61, T = 0.006, GAP = 0.00035, R0 = 0.021;
  const L = 1.83;
  // Spiral length → number of turns: L = TAU * n * (R0 + n T / 2).
  const turns = (-TAU * R0 + Math.sqrt((TAU * R0) ** 2 + 2 * TAU * T * L)) / (TAU * T);
  const TH = turns * TAU;
  const rAt = (th: number) => R0 + (T * th) / TAU;
  const RO = rAt(TH) + T - GAP; // outer radius of the roll
  const cy = RO;
  // θ runs from the core outwards; the outer end of the mat finishes at the front-bottom.
  const phase = TH + 2.45;
  const pt = (x: number, r: number, th: number) => v3(x, cy + r * Math.cos(phase - th), r * Math.sin(phase - th));
  const nTh = Math.ceil(turns * 90);
  const ths = steps(nTh).map((k) => k * TH);

  const band = (rin: (th: number) => number, rout: (th: number) => number, m: THREE.Material, name: string) => {
    const xs = [-W / 2, W / 2];
    const radial = (p: THREE.Vector3) => v3(0, p.y - cy, p.z);
    const parts: THREE.BufferGeometry[] = [
      facing(surface(ths, xs, (th, x) => pt(x, rout(th), th)), (p) => radial(p)),
      facing(surface(ths, xs, (th, x) => pt(x, rin(th), th)), (p) => radial(p).negate()),
    ];
    for (const x of xs) {
      parts.push(facing(strip(ths.map((th) => pt(x, rin(th), th)), ths.map((th) => pt(x, rout(th), th))), () => v3(Math.sign(x), 0, 0)));
    }
    for (const [th, sgn] of [[0, -1], [TH, 1]] as const) {
      const a = pt(-W / 2, rin(th), th), b = pt(-W / 2, rout(th), th);
      const tangent = pt(0, rin(th), th + 0.01).sub(pt(0, rin(th), th)).multiplyScalar(sgn);
      parts.push(facing(strip([a, b], [a.clone().setX(W / 2), b.clone().setX(W / 2)]), () => tangent));
    }
    g.add(mesh(mergeParts(parts), m, name));
  };
  // Underside layer (inner half of each wrap) and top layer (outer half).
  band((th) => rAt(th), (th) => rAt(th) + T * 0.42, under, 'mat-underside');
  band((th) => rAt(th) + T * 0.42, (th) => rAt(th) + T - GAP, top, 'mat-top');

  // Webbing loops round the roll, each with a slider buckle on top.
  const LX = 0.205, SW = 0.025, ST = 0.0022;
  for (const sx of [-1, 1]) {
    const ring = steps(96, true).map((k) => pt(sx * LX, RO + ST / 2 + 0.0002, k * TAU));
    g.add(mesh(sweep(ring, { width: SW, thickness: ST, side: v3(1, 0, 0), closed: true, segments: 96, radial: 10 }), webbing, 'mat-loop'));
    const buckle = mesh(slab(SW + 0.006, 0.03, 0.005, 0.004, 0.0018), plastic, 'mat-buckle');
    buckle.rotation.x = -Math.PI / 2;
    buckle.position.set(sx * LX, cy + RO + ST + 0.0024, 0);
    g.add(buckle);
  }
  // Carry strap: leaves each loop low on the front and lies in a loose U on the floor.
  const a0 = 0.95; // angle from the top of the roll (towards +z) where the strap joins the loop
  const rS = RO + ST * 1.5 + 0.0003;
  const y = ST / 2 + 0.0002;
  const on = (x: number, a: number) => v3(x, cy + rS * Math.cos(a), rS * Math.sin(a));
  const strapPts = [
    on(-LX, a0), on(-LX, 1.5),
    v3(-LX, cy * 0.42, rS + 0.003),
    v3(-LX + 0.002, 0.009, rS + 0.013),
    v3(-LX + 0.008, y, rS + 0.04),
    v3(-LX + 0.05, y, RO + 0.1),
    v3(-0.03, y, RO + 0.122),
    v3(0.06, y, RO + 0.116),
    v3(LX - 0.04, y, RO + 0.088),
    v3(LX - 0.006, y, rS + 0.038),
    v3(LX, 0.009, rS + 0.013),
    v3(LX, cy * 0.42, rS + 0.003),
    on(LX, 1.5), on(LX, a0),
  ];
  // Width lies flat on whatever the strap rests on: horizontal and across the path on the
  // floor, carried over unchanged (along x) where the strap hangs vertically.
  let prev: THREE.Vector3 | null = null;
  const across = (_t: number, T: THREE.Vector3) => {
    let b = v3(0, 1, 0).cross(T);
    if (b.length() < 0.35 && prev) b = prev.clone();
    else {
      b.normalize();
      if (prev && b.dot(prev) < 0) b.negate();
    }
    prev = b.clone();
    return b;
  };
  g.add(mesh(sweep(strapPts, { width: SW, thickness: ST, side: across, segments: 200, radial: 10, round: 6 }), webbing, 'mat-strap'));
  return grounded(g);
};

// ------------------------------------------------------------------ dumbbells

/** Regular n-gon outline with rounded corners: apothem `a`, corner radius `rc`, a flat at the bottom. */
function roundedPolygon(n: number, a: number, rc: number, seg = 6) {
  const pts: THREE.Vector2[] = [];
  const cR = (a - rc) / Math.cos(Math.PI / n);
  for (let k = 0; k < n; k++) {
    const phi = (k / n) * TAU; // vertex directions 0°, 60°, ... → flats top and bottom for n = 6
    for (let i = 0; i <= seg; i++) {
      const t = phi - Math.PI / n + (i / seg) * ((2 * Math.PI) / n);
      pts.push(new THREE.Vector2(cR * Math.cos(phi) + rc * Math.cos(t), cR * Math.sin(phi) + rc * Math.sin(t)));
    }
  }
  return pts;
}

/** Neoprene coating: soft rubbery matte. */
function neopreneMaterial(hex: string) {
  return new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.68, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.6,
    sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.3),
  });
}

/**
 * A pair of neoprene-coated hex dumbbells lying side by side on their flats: rounded hex
 * heads, a slightly waisted handle that flares into the heads, and a printed weight badge on
 * each end.
 */
const buildDumbbells: Builder = (c) => {
  const g = new THREE.Group();
  const coat = named(neopreneMaterial(albedo(c.primary, 0.74)), 'upper');
  const handleMat = neopreneMaterial(albedo(shade(c.primary, -0.03), 0.72));
  const label = canvasMap(256, 256, (x) => {
    x.fillStyle = c.secondary;
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = c.accent;
    x.lineWidth = 7;
    x.beginPath();
    x.arc(128, 128, 112, 0, TAU);
    x.stroke();
    x.fillStyle = c.accent;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = 'bold 104px Arial, Helvetica, sans-serif';
    x.fillText('3', 128, 106);
    x.font = 'bold 50px Arial, Helvetica, sans-serif';
    x.fillText('KG', 128, 180);
  });
  label.center.set(0.5, 0.5);
  label.rotation = Math.PI;
  const badgeMat = new THREE.MeshPhysicalMaterial({ map: label, roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const badgeRim = mat.plastic(c.secondary, 0.5);

  const F = 0.074; // head across flats
  const HL = 0.048; // head length
  const GL = 0.1; // handle (grip) length between heads
  const E = 0.0065; // edge rounding of the heads
  const RG = 0.0158; // grip radius
  const cyA = F / 2;

  const headGeo = (() => {
    const core = HL - 2 * E;
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(roundedPolygon(6, F / 2 - E, 0.009 - E * 0.6, 6)), {
      depth: core, bevelEnabled: true, bevelThickness: E, bevelSize: E, bevelSegments: 6, curveSegments: 1,
    });
    geo.translate(0, 0, -core / 2);
    geo.rotateY(Math.PI / 2); // extrusion along x; the outline lies in the y/z plane
    return smooth(geo);
  })();
  const gripGeo = (() => {
    const prof: [number, number][] = [];
    const half = GL / 2 + 0.004; // runs a few mm into the heads
    for (const k of steps(48)) {
      const x = lerp(-half, half, k);
      const d = GL / 2 - Math.abs(x); // distance from the head face
      const flare = 0.0075 * Math.exp(-Math.max(d, 0) / 0.0045);
      const waist = -0.0009 * Math.cos((Math.PI * x) / GL);
      prof.push([RG + flare + waist + (d < 0 ? 0.0075 : 0), x]);
    }
    return lathe(prof, 40).rotateZ(-Math.PI / 2);
  })();
  const badgeGeo = new THREE.CylinderGeometry(0.0185, 0.0185, 0.0012, 48, 1);
  badgeGeo.rotateZ(-Math.PI / 2); // cap faces +x

  const dumbbell = () => {
    const d = new THREE.Group();
    d.add(mesh(gripGeo, handleMat, 'dumbbell-grip'));
    for (const sx of [-1, 1]) {
      const head = mesh(headGeo, coat, 'dumbbell-head');
      head.position.x = sx * (GL / 2 + HL / 2);
      d.add(head);
      const badge = mesh(badgeGeo, [badgeRim, badgeMat, badgeRim] as unknown as THREE.Material, 'dumbbell-label');
      badge.position.x = sx * (GL / 2 + HL + 0.0006 - 0.00025);
      // Keep the print upright on both ends.
      if (sx < 0) badge.rotation.y = Math.PI;
      d.add(badge);
    }
    d.position.y = cyA;
    return d;
  };
  const a = dumbbell();
  a.position.set(0.012, cyA, 0.046);
  g.add(a);
  const b = dumbbell();
  b.position.set(-0.016, cyA, -0.05);
  b.rotation.y = 0.1;
  g.add(b);
  return grounded(g);
};

// ------------------------------------------------------------------ notebooks

/** Book-cloth / kraft board: dry and matte. */
function coverMaterial(hex: string) {
  return new THREE.MeshPhysicalMaterial({
    color: hex, roughness: 0.74, metalness: 0, sheen: 0.25, sheenRoughness: 0.6,
    sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.25),
  });
}

/**
 * Two A5 hardcover dot-grid notebooks, one fanned on top of the other: boards with rounded
 * fore-edge corners and a rounded spine, a cream page block with faint page lines, a vertical
 * elastic closure band and a ribbon marker trailing from the tail.
 */
const buildNotebooks: Builder = (c) => {
  const g = new THREE.Group();
  const cover = named(coverMaterial(albedo(c.primary, luminance(c.primary) > 0.2 ? 0.62 : 1)), 'upper');
  const edgeMap = canvasMap(64, 256, (x) => {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 64, 256);
    const r = rng(7);
    for (let i = 0; i < 256; i += 2) {
      x.fillStyle = `rgba(90,70,40,${0.05 + r() * 0.08})`;
      x.fillRect(0, i, 64, 1);
    }
  });
  edgeMap.wrapS = edgeMap.wrapT = THREE.RepeatWrapping;
  const pages = new THREE.MeshStandardMaterial({ color: albedo(c.secondary, 0.86), roughness: 0.9, metalness: 0, map: edgeMap });
  const elastic = bagFabric(albedo(c.accent, luminance(c.accent) > 0.3 ? 0.8 : 1));
  const ribbon = bagFabric(albedo(c.accent, luminance(c.accent) > 0.3 ? 0.8 : 1.1));

  const W = 0.148, D = 0.21; // A5 cover
  const TB = 0.0024; // board thickness
  const P = 0.0112; // page block (80 sheets of 100 GSM)
  const SQ = 0.0025; // cover overhang ("squares")
  const HT = 2 * TB + P; // total thickness
  const RC = 0.007;
  const EB = 0.0013; // band thickness

  /** One notebook lying on its back cover, spine along -x, fore edge +x, head -z. */
  const notebook = (withBand: boolean, ribbonOnFloor: boolean) => {
    const nb = new THREE.Group();
    // Page block: UVs from flatSlab are not useful, so map the page lines by height instead.
    const block = flatSlab(W - SQ - 0.004, D - 2 * SQ, P, [0.0004, RC - SQ, RC - SQ, 0.0004].map((r) => Math.max(r, 0.0005)), 0.0006, 8, 2);
    const bp = block.getAttribute('position');
    const uv: number[] = [];
    for (let i = 0; i < bp.count; i++) uv.push(0.5, ((bp.getY(i) + P / 2) / P) * 0.6);
    block.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const pb = mesh(block, pages, 'notebook-pages');
    pb.position.set((0.004 - SQ) / 2, TB + P / 2, 0);
    nb.add(pb);
    for (const yb of [TB / 2, TB + P + TB / 2]) {
      const board = mesh(flatSlab(W - TB, D, TB, [0.0004, RC, RC, 0.0004], 0.0007, 8, 3), cover, 'notebook-cover');
      board.position.set(TB / 2, yb, 0);
      nb.add(board);
    }
    // Rounded spine: a C-section wrapping the page block's back.
    const ro = HT / 2, ri = HT / 2 - TB;
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = -Math.PI / 2 - (i / 20) * Math.PI;
      prof.push(new THREE.Vector2(0.0015 + Math.cos(a) * ro * 0.55, Math.sin(a) * ro));
    }
    for (let i = 20; i >= 0; i--) {
      const a = -Math.PI / 2 - (i / 20) * Math.PI;
      prof.push(new THREE.Vector2(0.0015 + Math.cos(a) * ri * 0.5, Math.sin(a) * ri));
    }
    const sb = 0.0005;
    const spine = new THREE.ExtrudeGeometry(new THREE.Shape(prof), {
      depth: D - 2 * sb, bevelEnabled: true, bevelThickness: sb, bevelSize: sb * 0.5, bevelSegments: 2, curveSegments: 1,
    });
    spine.translate(0, 0, -(D - 2 * sb) / 2);
    const sp = mesh(smooth(spine), cover, 'notebook-spine');
    sp.position.set(-W / 2 + TB / 2 + 0.0002, HT / 2, 0);
    nb.add(sp);

    if (withBand) {
      // Elastic closure band round the head and tail, parallel to the spine near the fore edge.
      const bx = W / 2 - 0.016;
      const y0 = EB / 2 + 0.00002, y1 = HT + EB / 2, z0 = D / 2 + EB / 2, rr = 0.0022;
      const loop: THREE.Vector3[] = [];
      const corner = (cy: number, cz: number, a0: number) => {
        for (let i = 0; i <= 5; i++) {
          const a = a0 + (i / 5) * (Math.PI / 2);
          loop.push(v3(bx, cy + Math.sin(a) * rr, cz + Math.cos(a) * rr));
        }
      };
      corner(y1 - rr, z0 - rr, 0); // top-front (+z) corner
      corner(y1 - rr, -z0 + rr, Math.PI / 2);
      corner(y0 + rr, -z0 + rr, Math.PI);
      corner(y0 + rr, z0 - rr, (3 * Math.PI) / 2);
      nb.add(mesh(sweep(loop, { width: 0.0065, thickness: EB, side: v3(1, 0, 0), closed: true, segments: 120, radial: 10 }), elastic, 'notebook-band'));
    }
    // Ribbon marker: leaves the page block at the tail, then either curls onto the floor or
    // hangs down the tail edge onto the notebook below (whose cover is EB lower).
    const rx = -0.02;
    const zt = D / 2 - SQ;
    const rib = ribbonOnFloor
      ? [
        v3(rx, TB + P * 0.62, zt - 0.004),
        v3(rx, TB + P * 0.62, zt + 0.002),
        v3(rx + 0.002, TB + P * 0.3, zt + 0.007),
        v3(rx + 0.004, 0.0014, zt + 0.013),
        v3(rx + 0.008, 0.0005, zt + 0.03),
        v3(rx + 0.016, 0.0005, zt + 0.05),
      ]
      : [
        v3(rx, TB + P * 0.62, zt - 0.004),
        v3(rx, TB + P * 0.62, zt + 0.0015),
        v3(rx, TB + P * 0.35, D / 2 + 0.0011),
        v3(rx, TB * 0.3, D / 2 + 0.0011),
        v3(rx + 0.0005, -EB + 0.0008, D / 2 + 0.0035),
        v3(rx + 0.0015, -EB + 0.00028, D / 2 + 0.011),
      ];
    nb.add(mesh(sweep(rib, { width: 0.0045, thickness: 0.0005, side: v3(1, 0, 0), segments: 60, radial: 8, round: 6 }), ribbon, 'notebook-ribbon'));
    return nb;
  };

  const lower = notebook(true, true);
  g.add(lower);
  // The upper notebook rests on the lower one's band.
  const upper = notebook(true, false);
  upper.position.set(0.026, HT + EB + 0.0001, -0.014);
  upper.rotation.y = 0.2;
  g.add(upper);
  return grounded(g);
};

// ------------------------------------------------------------------ pens

const PEN_INKS = ['#1d4ed8', '#dc2626', '#16a34a', '#1f2328', '#7c3aed', '#ec4899', '#f97316', '#0891b2', '#8b5a2b', '#eab308'];

/**
 * Ten retractable 0.5 mm gel pens in a loose staggered row: glossy barrels in the ink colour,
 * ribbed rubber grips, chrome tip cones and wire clips, and a plunger button.
 */
const buildPens: Builder = (c) => {
  const g = new THREE.Group();
  const inks = [c.primary, c.secondary, c.accent, ...PEN_INKS.slice(3)];
  const chrome = mat.metal('#d7d9dc', 0.18);
  const LEN = 0.142;
  const FAN = THREE.MathUtils.degToRad(6.2); // angle between neighbouring pens
  const TIP_R = 0.113; // distance from the fan pivot to the tips
  const RB = 0.0054; // barrel radius (pens rest on the barrel and grip crests)

  // Profiles along the pen axis (x from the plunger end at 0 to the tip at LEN).
  const bodyProf: [number, number][] = [];
  const add = (r: number, x: number) => bodyProf.push([r, x]);
  add(0.0001, 0.006);
  for (const k of steps(6)) add(0.0046 * Math.sin((k * Math.PI) / 2) + 0.0001, 0.006 + 0.0035 * k ** 0.6);
  for (const k of steps(30)) add(lerp(0.0047, RB, smoothstep(0, 0.12, k)) - 0.00025 * k, lerp(0.0096, 0.094, k));
  add(RB - 0.0004, 0.095);
  add(0.0001, 0.095);
  // Rubber grip with circumferential ribs, tapering into the cone.
  const gripProf: [number, number][] = [];
  for (const k of steps(90)) {
    const x = lerp(0.0935, 0.13, k);
    const rib = 0.00022 * Math.cos(((x - 0.0935) / 0.0019) * TAU);
    const taper = lerp(RB - 0.0002, 0.0036, smoothstep(0.76, 1, k));
    gripProf.push([taper + rib * (1 - smoothstep(0.7, 0.9, k)) * smoothstep(0, 0.04, k), x]);
  }
  gripProf.unshift([0.0001, 0.0935]);
  gripProf.push([0.0001, 0.13]);
  const tipProf: [number, number][] = [[0.0001, 0.128], [0.0033, 0.1285], [0.0033, 0.1305], [0.0012, 0.1395], [0.0007, 0.1405], [0.0005, 0.1415], [0.0001, 0.1418]];
  const plungerProf: [number, number][] = [[0.0001, -0.004], [0.0018, -0.0038], [0.0026, -0.0028], [0.0029, -0.001], [0.0029, 0.0095], [0.0001, 0.0095]];
  const alongX = (prof: [number, number][]) => {
    // Lathe axis y → x: rotating +90° about z sends y = -x to x, so negate (and reverse, to
    // keep the faces pointing outwards) the profile.
    const geo = lathe(prof.map(([r, x]) => [r, -x] as [number, number]).reverse(), 40);
    return geo.rotateZ(Math.PI / 2);
  };
  const bodyG = alongX(bodyProf), gripG = alongX(gripProf), tipG = alongX(tipProf), plungerG = alongX(plungerProf);
  // Clip: a wire strip from the collar along the top of the barrel, ending in a rounded bead.
  const clipPts = [v3(0.0085, RB - 0.0006, 0), v3(0.0105, RB + 0.0016, 0), v3(0.016, RB + 0.0019, 0), v3(0.035, RB + 0.0012, 0), v3(0.05, RB + 0.0004, 0)];
  const clipG = mergeParts([
    sweep(clipPts, { width: 0.0028, thickness: 0.0009, side: v3(0, 0, 1), segments: 40, radial: 10 }),
    new THREE.SphereGeometry(0.0012, 12, 8).scale(1.4, 0.8, 1.2).translate(0.0498, RB + 0.0005, 0),
  ]);
  // Collar ring where the clip is fixed.
  const collarG = new THREE.CylinderGeometry(RB + 0.00025, RB + 0.00025, 0.0035, 40).rotateZ(Math.PI / 2).translate(0.0095, 0, 0);

  const r = rng(11);
  inks.forEach((ink, i) => {
    const pen = new THREE.Group();
    const barrel = mat.glossy(albedo(ink, 0.85));
    const grip = mat.rubber(albedo(shade(ink, -0.08), 0.75));
    const button = mat.plastic(albedo(shade(ink, 0.04), 0.9), 0.3);
    pen.add(mesh(bodyG, barrel, 'pen-barrel'));
    pen.add(mesh(gripG, grip, 'pen-grip'));
    pen.add(mesh(tipG, chrome, 'pen-tip'));
    pen.add(mesh(plungerG, button, 'pen-button'));
    pen.add(mesh(collarG, barrel, 'pen-collar'));
    const clip = mesh(clipG, chrome, 'pen-clip');
    pen.add(clip);
    // Roll each pen a little about its axis so the clips do not all point straight up.
    pen.rotation.x = (r() - 0.5) * 0.5;
    // Fan: tips gather towards a pivot at the front, plungers spread out behind.
    const phi = (i - 4.5) * FAN;
    const u = v3(Math.sin(phi), 0, -Math.cos(phi));
    const d0 = TIP_R + (r() - 0.5) * 0.005;
    const holder = new THREE.Group();
    holder.add(pen);
    holder.position.copy(u.clone().multiplyScalar(d0 + LEN)).setY(RB + 0.00025);
    holder.rotation.y = -Math.PI / 2 - phi;
    g.add(holder);
  });
  return grounded(g);
};

// ------------------------------------------------------------------ export

export const BUILDERS = {
  tshirt: buildTshirt,
  backpack: buildBackpack,
  sunglasses: buildSunglasses,
  wallet: buildWallet,
  yogamat: buildYogaMat,
  dumbbells: buildDumbbells,
  notebooks: buildNotebooks,
  pens: buildPens,
};
