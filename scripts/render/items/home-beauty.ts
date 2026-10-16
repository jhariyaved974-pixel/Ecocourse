// Procedural models: bottle, mugs, frypan, lamp, planters, serum, lotion, bodywash.
// See kit.ts for conventions (metres, grounded, +z front). The main body material of each
// model is named "upper", so the storefront 3D viewer can tint it to the selected
// colourway (the same contract as the shoe models).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ItemColorway } from '../catalog';
import { grounded, mat, mesh, type Builder } from './kit';

// ------------------------------------------------------------------ helpers

const TAU = Math.PI * 2;
/** Labels on round packs are turned slightly towards +x so they read in the 3/4 hero view too. */
const LABEL_TURN = 0.3;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

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

/** Deterministic PRNG (mulberry32) so every render of a product is identical. */
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

/** Welds coincident vertices and recomputes smooth normals (drops UVs). */
function smooth(geo: THREE.BufferGeometry) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const merged = mergeVertices(geo, 1e-6);
  merged.computeVertexNormals();
  return merged;
}

type P = [number, number];
/** Profile vertex: [radius, height, corner radius?, cut?]. A cut starts a new piece there. */
type PV = [number, number, number?, boolean?];

/**
 * Turns a polyline into lathe profile pieces with rounded corners (quadratic fillets).
 * Cut points end one piece and start the next (so each piece can take its own material);
 * put them on straight runs so the shading stays continuous across the cut.
 */
function profile(pts: PV[], seg = 6): P[][] {
  const pieces: P[][] = [[]];
  const push = (p: P) => {
    const cur = pieces[pieces.length - 1];
    const last = cur[cur.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-7) cur.push(p);
  };
  pts.forEach(([x, y, rad = 0, cut = false], i) => {
    if (cut) {
      push([x, y]);
      pieces.push([[x, y]]);
      return;
    }
    if (i === 0 || i === pts.length - 1 || rad <= 0) {
      push([x, y]);
      return;
    }
    const [px, py] = pts[i - 1];
    const [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py);
    const l2 = Math.hypot(nx - x, ny - y);
    const d1 = Math.min(rad, l1 / 2);
    const d2 = Math.min(rad, l2 / 2);
    const a: P = [x + ((px - x) * d1) / l1, y + ((py - y) * d1) / l1];
    const b: P = [x + ((nx - x) * d2) / l2, y + ((ny - y) * d2) / l2];
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const u = 1 - t;
      push([u * u * a[0] + 2 * u * t * x + t * t * b[0], u * u * a[1] + 2 * u * t * y + t * t * b[1]]);
    }
  });
  return pieces;
}

/**
 * Revolves a profile around y. phiStart = PI puts the texture seam at the back, so the
 * middle of a CanvasTexture (u = 0.5) faces the front (+z).
 */
function rev(pts: P[], segments = 72, phiStart = Math.PI, phiLength = TAU) {
  const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segments, phiStart, phiLength);
  // LatheGeometry spaces v by point index; respace it by arc length so maps don't stretch
  // along long straight runs.
  const acc = [0];
  for (let j = 1; j < pts.length; j++) acc.push(acc[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  const total = acc[acc.length - 1] || 1;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, acc[i % pts.length] / total);
  return geo;
}

/** Lathe with vertical grip ribs between heights y0..y1 (screw caps, pump collars). */
function ribbed(pts: P[], ribs: number, depth: number, y0: number, y1: number) {
  const geo = rev(pts, ribs * 6);
  const pos = geo.attributes.position;
  const soft = 0.0012;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const w = THREE.MathUtils.smoothstep(y, y0, y0 + soft) * (1 - THREE.MathUtils.smoothstep(y, y1 - soft, y1));
    const phi = Math.atan2(x, z);
    const k = (r - depth * w * Math.pow(0.5 - 0.5 * Math.cos(ribs * phi), 0.6)) / r;
    pos.setXYZ(i, x * k, y, z * k);
  }
  return smooth(geo);
}

type Prof = number | ((t: number) => number);
const at = (p: Prof, t: number) => (typeof p === 'function' ? p(t) : p);

/**
 * Sweeps a superellipse section (exponent `round`: 2 = ellipse, higher = squarer) along a
 * smooth curve. `side` fixes the direction of the section width. Ends are left open (they
 * are usually buried in another part) unless `capEnd` asks for a domed cap on the last
 * section. The geometry carries UVs (scaled by `uvScale`) for textured materials.
 */
function sweep(points: THREE.Vector3[], o: { width: Prof; thickness: Prof; side: THREE.Vector3; segments?: number; radial?: number; round?: number; capEnd?: boolean; uvScale?: [number, number] }) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segs = o.segments ?? 48;
  const radial = o.radial ?? 20;
  const exp = o.round ?? 2;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let probe: { c: THREE.Vector3; q: THREE.Vector3 } | null = null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const B = o.side.clone().addScaledVector(T, -o.side.dot(T)).normalize();
    const N = new THREE.Vector3().crossVectors(T, B).normalize();
    const w = at(o.width, t), h = at(o.thickness, t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      const x = (Math.sign(c) * Math.abs(c) ** (2 / exp) * w) / 2;
      const y = (Math.sign(s) * Math.abs(s) ** (2 / exp) * h) / 2;
      const q = p.clone().addScaledVector(B, x).addScaledVector(N, y);
      pos.push(q.x, q.y, q.z);
      uv.push((j / radial) * (o.uvScale?.[0] ?? 1), t * (o.uvScale?.[1] ?? 1));
      if (i === Math.floor(segs / 2) && j === 0) probe = { c: p, q };
    }
  }
  const row = radial + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  if (o.capEnd) {
    // Domed end cap: a fan from the last ring to a point pushed out along the tangent.
    const p = curve.getPointAt(1);
    const T = curve.getTangentAt(1);
    const tip = p.clone().addScaledVector(T, Math.min(at(o.width, 1), at(o.thickness, 1)) * 0.25);
    const ci = pos.length / 3;
    pos.push(tip.x, tip.y, tip.z);
    uv.push(0.5, 1);
    for (let j = 0; j < radial; j++) idx.push(segs * row + j, ci, segs * row + j + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Make sure the faces point outwards (the winding depends on the frame handedness).
  const nAttr = geo.attributes.normal;
  const k = Math.floor(segs / 2) * row;
  if (probe) {
    const { c, q } = probe as { c: THREE.Vector3; q: THREE.Vector3 };
    const n = v3(nAttr.getX(k), nAttr.getY(k), nAttr.getZ(k));
    if (n.dot(q.clone().sub(c)) < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      geo.setIndex(idx);
      geo.computeVertexNormals();
    }
  }
  return geo;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, jpeg = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (jpeg) t.userData.mimeType = 'image/jpeg'; // smaller GLBs for photographic maps
  return t;
}

/** Speckled glaze: white base (the material colour tints it) with dots in `speck`. */
function speckleTexture(speck: string, seed: number, w = 1024, h = 320, density = 1) {
  const t = canvasTexture(w, h, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    // Glaze pools slightly darker towards the foot.
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0.03)');
    grad.addColorStop(1, 'rgba(0,0,0,0.1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const r = rng(seed);
    const c = new THREE.Color(speck);
    const dots = Math.round(w * h * 0.0016 * density);
    for (let i = 0; i < dots; i++) {
      const x = r() * w, y = r() * h;
      const big = r() < 0.06;
      const rad = big ? 1.8 + r() * 1.6 : 0.5 + r() * 1.1;
      g.fillStyle = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${0.35 + r() * 0.55})`;
      for (const dx of [0, -w, w]) {
        g.beginPath();
        g.arc(x + dx, y, rad, 0, TAU);
        g.fill();
      }
    }
  }, true);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Sets UVs from a top-down projection (for discs, where lathe UVs pinch at the centre). */
function planarUV(geo: THREE.BufferGeometry, size: number) {
  const pos = geo.attributes.position;
  const uv: number[] = [];
  for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i) / size + 0.5, 0.5 - pos.getZ(i) / size);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/**
 * A printed decal hugging a cylinder of radius r between heights y0..y1, centred on the
 * front (+z) turned by `turn` radians towards +x, spanning `arc` metres. Transparent, no
 * shadow (it sits on the surface).
 */
function decal(r: number, y0: number, y1: number, arc: number, map: THREE.Texture, opts: { roughness?: number; clearcoat?: number; turn?: number } = {}) {
  const phi = arc / r;
  const geo = rev([[r, y0], [r, y1]], 32, TAU - phi / 2 + (opts.turn ?? 0), phi);
  const m = mesh(
    geo,
    new THREE.MeshPhysicalMaterial({
      map, transparent: true, depthWrite: false, roughness: opts.roughness ?? 0.5, clearcoat: opts.clearcoat ?? 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    'print',
  );
  m.castShadow = false;
  return m;
}

/** Canvas helper: letter-spaced text centred on x. */
function spacedText(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  const align = g.textAlign;
  g.textAlign = 'left';
  chars.forEach((ch, i) => {
    g.fillText(ch, cx, y);
    cx += widths[i] + spacing;
  });
  g.textAlign = align;
}

function font(weight: number, px: number) {
  return `${weight} ${px}px Inter, "DejaVu Sans", Arial, sans-serif`;
}

/** Simple leaf glyph pointing up-right, centred on (x, y). */
function leafGlyph(g: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string, vein: string, angle = -0.6) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(0, size / 2);
  g.bezierCurveTo(size * 0.42, size * 0.25, size * 0.42, -size * 0.25, 0, -size / 2);
  g.bezierCurveTo(-size * 0.42, -size * 0.25, -size * 0.42, size * 0.25, 0, size / 2);
  g.fill();
  g.strokeStyle = vein;
  g.lineWidth = Math.max(1, size * 0.04);
  g.beginPath();
  g.moveTo(0, size * 0.48);
  g.lineTo(0, -size * 0.38);
  g.stroke();
  g.restore();
}

// ------------------------------------------------------------------ bottle

/** 1 L double-wall bottle: powder-coated body, steel neck ring, screw cap with carry loop. */
const bottle: Builder = (c) => {
  const g = new THREE.Group();
  const R = 0.0445;
  const coat = named(new THREE.MeshPhysicalMaterial({ color: c.primary, roughness: 0.66, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.6 }), 'upper');
  const steel = mat.metal(c.secondary, 0.2);
  const capMat = mat.plastic(c.accent, 0.42);

  const [body] = profile([
    [0, 0.0035], [0.034, 0.0035, 0.0015], [0.0365, 0, 0.0015], [R, 0, 0.006],
    [R, 0.196, 0.03], [0.0312, 0.233, 0.008], [0.0312, 0.2435],
  ]);
  g.add(mesh(rev(body, 96), coat, 'body'));

  // Bare steel band where the cap screws on.
  const [ring] = profile([[0.0298, 0.2425], [0.0318, 0.2432, 0.0007], [0.0318, 0.2515, 0.0007], [0.0298, 0.2522]], 4);
  g.add(mesh(rev(ring, 96), steel, 'neck'));

  // Cap with grip ribs on the lower part.
  const [cap] = profile([[0.029, 0.2512], [0.0336, 0.2512, 0.0016], [0.0336, 0.2838, 0.006], [0.02, 0.2884, 0.012], [0, 0.289]]);
  g.add(mesh(ribbed(cap, 40, 0.0009, 0.2535, 0.2765), capMat, 'cap'));
  // Carry loop arching over the cap.
  const loop = sweep(
    [v3(-0.0165, 0.2855, 0), v3(-0.0172, 0.297, 0), v3(-0.0118, 0.3075, 0), v3(0, 0.3112, 0), v3(0.0118, 0.3075, 0), v3(0.0172, 0.297, 0), v3(0.0165, 0.2855, 0)],
    { width: 0.0095, thickness: 0.0046, side: v3(0, 0, 1), round: 3.2, segments: 40, radial: 20 },
  );
  g.add(mesh(loop, capMat, 'loop'));
  for (const s of [-1, 1]) {
    const boss = mesh(new THREE.CylinderGeometry(0.0055, 0.0062, 0.004, 24), capMat, 'loop-boss');
    boss.position.set(s * 0.0166, 0.2885, 0);
    g.add(boss);
  }

  // Small printed wordmark on the front.
  const ink = luminance(c.primary) > 0.45 ? c.accent : '#f4f4f2';
  const arc = 0.056, h = 0.026;
  const W = 640, H = Math.round((W * h) / arc);
  const print = canvasTexture(W, H, (gx, w, hh) => {
    gx.clearRect(0, 0, w, hh);
    gx.fillStyle = ink;
    gx.textAlign = 'center';
    gx.textBaseline = 'middle';
    gx.font = font(700, 58);
    spacedText(gx, 'THERMOSTEEL', w / 2, hh * 0.36, 9);
    gx.globalAlpha = 0.85;
    gx.fillRect(w / 2 - 70, hh * 0.62, 140, 3);
    gx.font = font(500, 34);
    spacedText(gx, '1.0 L', w / 2, hh * 0.8, 6);
  });
  g.add(decal(R + 0.0003, 0.07, 0.07 + h, arc, print, { roughness: 0.55, turn: LABEL_TURN }));
  return grounded(g);
};

// ------------------------------------------------------------------ mugs

/** One 350 ml stoneware mug (geometry shared by the set), handle on local +x. */
function mugMaker(c: ItemColorway) {
  const light = luminance(c.primary) > 0.55;
  const speck = speckleTexture(c.accent, 7);
  const speckInside = speckleTexture(c.accent, 11, 512, 256, 0.7);
  const glaze = named(new THREE.MeshPhysicalMaterial({ color: c.primary, map: speck, roughness: 0.32, clearcoat: 0.75, clearcoatRoughness: 0.18 }), 'upper');
  const inside = new THREE.MeshPhysicalMaterial({ color: light ? c.primary : c.secondary, map: speckInside, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const rim = new THREE.MeshPhysicalMaterial({ color: c.secondary, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const clay = mat.matte(mix(c.secondary, c.primary, 0.35), 0.92);

  // Outer wall line (0.0432, 0.007) -> (0.0455, 0.093); inner wall (0.0400, 0.096) -> (0.0378, 0.012).
  const outerAt = (y: number) => 0.0432 + ((y - 0.007) * 0.0023) / 0.086;
  const innerAt = (y: number) => 0.04 - ((0.096 - y) * 0.0022) / 0.084;
  const [foot, outside, lip, interior] = profile([
    [0, 0.0035], [0.031, 0.0035, 0.0015], [0.0335, 0, 0.0015], [0.0398, 0, 0.003], [0.0432, 0.007, 0.004],
    [outerAt(0.0115), 0.0115, 0, true],
    [outerAt(0.0905), 0.0905, 0, true],
    [0.0455, 0.096, 0.0024], [0.04, 0.096, 0.0024],
    [innerAt(0.0915), 0.0915, 0, true],
    [0.0378, 0.012, 0.012], [0, 0.0102],
  ]);
  const geos = {
    foot: rev(foot, 72), outside: rev(outside, 72), lip: rev(lip, 72), interior: rev(interior, 72),
    handle: sweep(
      [v3(0.0405, 0.0795, 0), v3(0.052, 0.0818, 0), v3(0.0662, 0.0776, 0), v3(0.0738, 0.0638, 0), v3(0.0738, 0.0452, 0), v3(0.0672, 0.0322, 0), v3(0.0545, 0.0252, 0), v3(0.0412, 0.0238, 0)],
      { width: (t) => 0.0128 - 0.0016 * Math.sin(t * Math.PI), thickness: 0.0088, side: v3(0, 0, 1), round: 2.4, segments: 48, radial: 18, uvScale: [0.12, 1.05] },
    ),
  };
  return () => {
    const m = new THREE.Group();
    m.add(mesh(geos.foot, clay, 'foot'));
    m.add(mesh(geos.outside, glaze, 'glaze'));
    m.add(mesh(geos.lip, rim, 'rim'));
    m.add(mesh(geos.interior, inside, 'inside'));
    m.add(mesh(geos.handle, glaze, 'handle'));
    return m;
  };
}

/** Set of four mugs in a staggered cluster (all four read from the front and 3/4 views). */
const mugs: Builder = (c) => {
  const g = new THREE.Group();
  const make = mugMaker(c);
  const layout: [number, number, number][] = [
    [-0.085, 0.0425, Math.PI + 0.15],
    [-0.034, -0.053, 2.3],
    [0.0255, 0.06, -0.15],
    [0.085, -0.036, 0.4],
  ];
  for (const [x, z, yaw] of layout) {
    const m = make();
    m.position.set(x, 0, z);
    m.rotation.y = yaw;
    g.add(m);
  }
  return grounded(g);
};

// ------------------------------------------------------------------ fry pan

/** 26 cm non-stick pan with riveted bracket and a cool-touch handle with hanging hole. */
const frypan: Builder = (c) => {
  const g = new THREE.Group();
  const outsideMat = named(new THREE.MeshPhysicalMaterial({ color: c.primary, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.35 }), 'upper');
  const rimMat = mat.metal(c.accent, 0.28);
  const steel = mat.metal(c.accent, 0.22);
  const handleMat = new THREE.MeshPhysicalMaterial({ color: c.secondary, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6 });

  // Granite-look non-stick coating with faint machining rings (planar UVs over 0.27 m).
  const coating = canvasTexture(1024, 1024, (gx, w, h) => {
    gx.fillStyle = c.secondary;
    gx.fillRect(0, 0, w, h);
    const r = rng(26);
    const base = new THREE.Color(c.secondary);
    for (let i = 0; i < 9000; i++) {
      const l = 0.18 + r() * 0.5;
      const col = base.clone().lerp(new THREE.Color('#ffffff'), l);
      gx.fillStyle = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${0.25 + r() * 0.5})`;
      gx.beginPath();
      gx.arc(r() * w, r() * h, 0.4 + r() * 1.1, 0, TAU);
      gx.fill();
    }
    gx.strokeStyle = 'rgba(255,255,255,0.025)';
    gx.lineWidth = 1.2;
    for (let rad = 6; rad < w * 0.5; rad += 5) {
      gx.beginPath();
      gx.arc(w / 2, h / 2, rad, 0, TAU);
      gx.stroke();
    }
  }, true);
  const insideMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: coating, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 });

  // Outer wall (0.1025, 0.0008) -> (0.1295, 0.0462); inner wall (0.1258, 0.047) -> (0.0995, 0.0055).
  const [outside, rim, inside] = profile([
    [0, 0.0008], [0.1025, 0.0008, 0.014],
    [0.1264, 0.041, 0, true],
    [0.1295, 0.0462, 0.0022], [0.1302, 0.0478, 0.0012], [0.1269, 0.0481, 0.0012], [0.1258, 0.047, 0.0012],
    [0.12422, 0.0445, 0, true],
    [0.0995, 0.0055, 0.016], [0, 0.0055],
  ], 8);
  g.add(mesh(rev(outside, 128), outsideMat, 'body'));
  g.add(mesh(rev(rim, 128), rimMat, 'rim'));
  g.add(mesh(planarUV(rev(inside, 128), 0.27), insideMat, 'coating'));
  // Induction plate under the base.
  const [plate] = profile([[0, 0], [0.084, 0, 0.0008], [0.0846, 0.0012]], 3);
  g.add(mesh(rev(plate, 96), steel, 'induction-plate'));

  // Handle assembly, built along +x then swung towards the back right.
  const h = new THREE.Group();
  // Bracket: follows the slanted wall on the inside, flat at the handle end.
  const bracketShape = new THREE.Shape([
    new THREE.Vector2(0.1168, 0.0262), new THREE.Vector2(0.15, 0.0262), new THREE.Vector2(0.15, 0.0398), new THREE.Vector2(0.1252, 0.0398),
  ]);
  const bracket = new THREE.ExtrudeGeometry(bracketShape, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.0018, bevelSegments: 3, curveSegments: 4 });
  bracket.translate(0, 0, -0.009);
  h.add(mesh(smooth(bracket), steel, 'bracket'));
  // Rivet heads inside the pan.
  const wallN = v3(-0.845, 0.535, 0);
  for (const z of [-0.011, 0.011]) {
    const rv = mesh(new THREE.SphereGeometry(0.0042, 18, 10, 0, TAU, 0, Math.PI / 2), steel, 'rivet');
    rv.position.set(0.1165, 0.0328, z);
    rv.quaternion.setFromUnitVectors(v3(0, 1, 0), wallN.clone().normalize());
    rv.scale.set(1, 0.42, 1);
    h.add(rv);
  }
  // Grip: top-view outline with a hanging hole, extruded in y with rounded edges.
  const bevel = 0.0052;
  const L = 0.172;
  const grip = new THREE.Shape();
  grip.moveTo(0, -0.0085);
  grip.splineThru([new THREE.Vector2(0.045, -0.0078), new THREE.Vector2(0.12, -0.0112), new THREE.Vector2(L - 0.006, -0.0124)]);
  grip.absarc(L, 0, 0.0124, -Math.PI / 2, Math.PI / 2, false);
  grip.splineThru([new THREE.Vector2(0.12, 0.0112), new THREE.Vector2(0.045, 0.0078), new THREE.Vector2(0, 0.0085)]);
  grip.closePath();
  const hole = new THREE.Path();
  hole.absarc(L - 0.002, 0, 0.0062 + bevel, 0, TAU, true);
  grip.holes.push(hole);
  const core = 0.02 - 2 * bevel;
  const gripGeo = new THREE.ExtrudeGeometry(grip, { depth: core, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 28 });
  gripGeo.translate(0, 0, -core / 2);
  gripGeo.rotateX(-Math.PI / 2);
  const gripMesh = mesh(smooth(gripGeo), handleMat, 'handle');
  gripMesh.position.set(0.142, 0.033, 0);
  gripMesh.rotation.z = 0.15;
  h.add(gripMesh);
  // Steel ferrule where the grip meets the bracket.
  const ferrule = mesh(new THREE.CylinderGeometry(0.0128, 0.0124, 0.01, 32).rotateZ(Math.PI / 2).scale(1, 0.82, 1.08), steel, 'ferrule');
  ferrule.position.set(0.147, 0.0334, 0);
  ferrule.rotation.z = 0.15;
  h.add(ferrule);
  h.rotation.y = -0.22;
  g.add(h);
  return grounded(g);
};

// ------------------------------------------------------------------ lamp

/** Dome table lamp (~34 cm): flared weighted base, brass stem, metal dome, glowing diffuser. */
const lamp: Builder = (c) => {
  const g = new THREE.Group();
  const paint = named(new THREE.MeshPhysicalMaterial({ color: c.primary, roughness: 0.5, metalness: 0.05, clearcoat: 0.18, clearcoatRoughness: 0.45 }), 'upper');
  const brass = mat.metal(c.secondary, 0.26);
  const rubber = mat.rubber('#1c1c1c');
  const reflector = new THREE.MeshStandardMaterial({ color: '#fbf7ef', roughness: 0.6, emissive: new THREE.Color(c.accent), emissiveIntensity: 0.35 });
  const glow = mat.emissive(c.accent, 1.6);

  // Flared base: a concave trumpet from r 0.078 down to the stem.
  const lift = 0.002;
  const flare: PV[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = 0.008 + t * 0.092;
    flare.push([0.0095 + 0.0655 * Math.pow(1 - t, 2.6), y + lift]);
  }
  const [base] = profile([[0, lift], [0.078, lift, 0.002], [0.078, lift + 0.006, 0.003], ...flare, [0, 0.1 + lift]]);
  g.add(mesh(rev(base, 96), paint, 'base'));
  const [pad] = profile([[0.05, 0], [0.072, 0, 0.0008], [0.072, lift + 0.0005]], 3);
  g.add(mesh(rev(pad, 64), rubber, 'pad'));
  // Brass collar, stem and touch dimmer dot.
  const [collar] = profile([[0.0088, 0.096], [0.0112, 0.097, 0.001], [0.0112, 0.106, 0.003], [0.0068, 0.109]], 4);
  g.add(mesh(rev(collar, 48), brass, 'collar'));
  // One stem from the collar up through the diffuser to the socket under the finial.
  const stem = mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.241, 32), brass, 'stem');
  stem.position.y = 0.105 + 0.1205;
  g.add(stem);
  const dot = mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0016, 24), brass, 'touch');
  // On the flare slope, facing up and forward.
  const ty = 0.03;
  const tr = 0.0095 + 0.0655 * Math.pow(1 - (ty - lift - 0.008) / 0.092, 2.6);
  dot.position.set(0, ty, tr - 0.0004);
  dot.rotation.x = 0.67;
  g.add(dot);

  // Dome shade: elliptical shell with a rolled rim.
  const rimY = 0.232, Rw = 0.124, Hd = 0.112, th = 0.0028;
  const outer: PV[] = [];
  const inner: PV[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    const r = Rw * Math.cos(a) ** 0.92;
    outer.push([r, rimY + Hd * Math.sin(a)]);
    inner.push([Math.max(0, (Rw - th) * Math.cos(a) ** 0.92), rimY + (Hd - th) * Math.sin(a)]);
  }
  // Inside: from the top down to the rim; rim lip; outside: from the rim up to the top.
  const innerDown = inner.slice().reverse().filter(([r]) => r > 0.0055);
  const [ins] = profile([...innerDown.map(([r, y]) => [r, y] as PV), [Rw - th, rimY]], 4);
  const [lipP] = profile([[Rw - th, rimY], [Rw - th, rimY - 0.0015, 0.0012], [Rw + 0.0006, rimY - 0.0015, 0.0012], [Rw, rimY]], 4);
  const [out] = profile([...outer.map(([r, y]) => [r, y] as PV)], 4);
  g.add(mesh(rev(ins, 128), reflector, 'reflector'));
  g.add(mesh(rev(lipP, 128), paint, 'shade-rim'));
  g.add(mesh(rev(out, 128), paint, 'shade'));
  // Brass finial on top.
  const [fin] = profile([[0.0, rimY + Hd + 0.0085], [0.007, rimY + Hd + 0.0075, 0.004], [0.0095, rimY + Hd - 0.0005]], 5);
  const finial = mesh(rev(fin.slice().reverse(), 48), brass, 'finial');
  g.add(finial);
  // Frosted acrylic diffuser across the opening (faces down), with the stem through it.
  const [diff] = profile([[0.0065, rimY + 0.012], [0.06, rimY + 0.009], [Rw - th - 0.0004, rimY + 0.003]], 4);
  g.add(mesh(rev(diff, 128), glow, 'diffuser'));
  return grounded(g);
};

// ------------------------------------------------------------------ planters

interface PotSpec { D: number; H: number; B: number }

/** Profile pieces for a tapered pot with a rounded rim (outside, rim, inside). */
function potProfile({ D, H, B }: PotSpec, wall: number) {
  const outAt = (y: number) => B / 2 + ((D - B) / 2) * (y / H);
  const floor = 0.012;
  return profile([
    [0, 0.004], [B / 2 - 0.012, 0.004, 0.002], [B / 2 - 0.009, 0, 0.002], [B / 2, 0, 0.004],
    [outAt(H - 0.006), H - 0.006, 0, true],
    [D / 2, H, 0.003], [D / 2 - wall, H, 0.003],
    [outAt(H - 0.006) - wall, H - 0.006, 0, true],
    [B / 2 - wall + ((D - B) / 2) * (floor / H), floor, 0.01], [0, floor],
  ]);
}

/** Echeveria-style rosette of fleshy leaves. */
function rosette(color: string, seed: number, scale = 1) {
  const g = new THREE.Group();
  const r = rng(seed);
  const leafGeo = new THREE.SphereGeometry(1, 18, 12);
  leafGeo.scale(0.26, 0.1, 0.5).translate(0, 0, 0.42);
  const tones = [shade(color, -0.04), color, shade(color, 0.05), shade(color, 0.1)].map((col) => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#e8f2ec') }));
  const rings = [
    { n: 11, len: 0.024, tilt: 0.25, w: 1.0 },
    { n: 9, len: 0.019, tilt: 0.6, w: 0.95 },
    { n: 7, len: 0.014, tilt: 0.95, w: 0.9 },
    { n: 5, len: 0.009, tilt: 1.25, w: 0.85 },
  ];
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const leaf = mesh(leafGeo, tones[Math.min(ri, tones.length - 1)], 'leaf');
      const s = ring.len * scale * (0.9 + r() * 0.2);
      leaf.scale.set(s * ring.w, s, s);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = (i / ring.n) * TAU + ri * 0.4 + r() * 0.15;
      leaf.rotation.x = -ring.tilt - r() * 0.08;
      leaf.position.y = ri * 0.0035 * scale;
      g.add(leaf);
    }
  });
  return g;
}

/** Snake plant: upright sword-shaped blades. */
function snakePlant(color: string, seed: number) {
  const g = new THREE.Group();
  const r = rng(seed);
  const mats = [shade(color, -0.07), shade(color, -0.02), shade(color, 0.04)].map((col) => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4 }));
  const edge = new THREE.MeshPhysicalMaterial({ color: mix(color, '#d9d27a', 0.55), roughness: 0.55 });
  const blades = 8;
  for (let i = 0; i < blades; i++) {
    const yaw = (i / blades) * TAU + r() * 0.5;
    const dir = v3(Math.sin(yaw), 0, Math.cos(yaw));
    const dist = 0.008 + r() * 0.018;
    const h = 0.17 + r() * 0.1 - (dist > 0.018 ? 0.03 : 0);
    const lean = 0.012 + dist * 0.9 + r() * 0.02;
    const base = dir.clone().multiplyScalar(dist);
    const pts = [0, 0.3, 0.6, 0.85, 1].map((t) => base.clone().addScaledVector(dir, lean * Math.pow(t, 1.7)).add(v3(0, h * t - 0.012, 0)));
    const side = v3(Math.cos(yaw + 0.5 * (r() - 0.5)), 0, -Math.sin(yaw + 0.5 * (r() - 0.5)));
    const width = (t: number) => 0.034 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.22 + t * 0.78)), 0.75) + 0.0006;
    const blade = sweep(pts, { width, thickness: (t) => 0.0042 * (1 - t * 0.6) + 0.0005, side, round: 2, segments: 28, radial: 14 });
    g.add(mesh(blade, mats[i % mats.length], 'blade'));
    // Pale margin: a slightly wider, thinner copy peeking out at the edges.
    const rim = sweep(pts, { width: (t) => width(t) + 0.0016, thickness: (t) => 0.0018 * (1 - t * 0.6), side, round: 2, segments: 28, radial: 14 });
    g.add(mesh(rim, edge, 'blade-edge'));
  }
  return g;
}

/** Three graduated ceramic planters (10, 13, 16 cm) on saucers, two of them planted. */
const planters: Builder = (c) => {
  const g = new THREE.Group();
  const glaze = named(new THREE.MeshPhysicalMaterial({ color: c.primary, roughness: 0.72, clearcoat: 0.08, clearcoatRoughness: 0.6 }), 'upper');
  const inside = new THREE.MeshPhysicalMaterial({ color: shade(c.primary, -0.05), roughness: 0.8 });
  const saucerMat = mat.matte(c.secondary, 0.82);
  // Potting mix: dark crumbs with a few lighter grains (planar UVs, 0.16 m per tile).
  const soilTex = canvasTexture(384, 384, (gx, w, h) => {
    gx.fillStyle = '#3a2a1f';
    gx.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 5200; i++) {
      const l = r();
      gx.fillStyle = l < 0.55 ? `rgba(22,13,8,${0.35 + r() * 0.45})` : l < 0.93 ? `rgba(104,78,58,${0.25 + r() * 0.35})` : `rgba(190,176,150,${0.5 + r() * 0.4})`;
      gx.beginPath();
      gx.arc(r() * w, r() * h, 0.6 + r() * 1.5, 0, TAU);
      gx.fill();
    }
  }, true);
  soilTex.wrapS = soilTex.wrapT = THREE.RepeatWrapping;
  const soil = new THREE.MeshStandardMaterial({ color: '#ffffff', map: soilTex, roughness: 1 });

  const specs: (PotSpec & { x: number; z: number; plant: 'snake' | 'rosette' | null })[] = [
    { D: 0.16, H: 0.14, B: 0.124, x: -0.075, z: -0.06, plant: 'snake' },
    { D: 0.13, H: 0.114, B: 0.1, x: 0.105, z: -0.035, plant: null },
    { D: 0.1, H: 0.088, B: 0.078, x: 0.0, z: 0.095, plant: 'rosette' },
  ];
  const wall = 0.0065;
  const floorY = 0.004;
  for (const s of specs) {
    const pot = new THREE.Group();
    const [outside, rim, inner] = potProfile(s, wall);
    const po = new THREE.Group();
    po.add(mesh(rev(outside, 96), glaze, 'pot'));
    po.add(mesh(rev(rim, 96), glaze, 'pot-rim'));
    po.add(mesh(rev(inner, 96), inside, 'pot-inside'));
    po.position.y = floorY;
    pot.add(po);
    // Saucer.
    const sR = s.B / 2 + 0.014;
    const [saucer] = profile([[0, 0], [sR - 0.003, 0, 0.003], [sR, 0.015, 0.0025], [sR - 0.0045, 0.0155, 0.002], [sR - 0.0075, floorY, 0.003], [0, floorY]], 5);
    pot.add(mesh(rev(saucer, 96), saucerMat, 'saucer'));
    if (s.plant) {
      const ys = floorY + s.H - 0.022;
      const rIn = s.B / 2 - wall + ((s.D - s.B) / 2) * ((ys - floorY) / s.H) + 0.0006;
      const [dirt] = profile([[rIn, ys - 0.002], [rIn * 0.7, ys + 0.0015, 0.01], [0, ys + 0.003]], 4);
      pot.add(mesh(planarUV(rev(dirt, 64), 0.16), soil, 'soil'));
      const plant = s.plant === 'snake' ? snakePlant(c.accent, 3) : rosette(mix(c.accent, '#a9cdb8', 0.45), 9, 1.45);
      plant.position.y = ys + 0.002;
      pot.add(plant);
    }
    pot.position.set(s.x, 0, s.z);
    g.add(pot);
  }
  return grounded(g);
};

// ------------------------------------------------------------------ serum

/** 30 ml amber glass dropper bottle with a paper label, black collar and rubber bulb. */
const serum: Builder = (c) => {
  const g = new THREE.Group();
  const R = 0.0166;
  const glass = named(new THREE.MeshPhysicalMaterial({
    color: c.primary, roughness: 0.06, metalness: 0, transmission: 0.82, thickness: 0.006, ior: 1.5,
    attenuationColor: new THREE.Color(shade(c.primary, -0.12)), attenuationDistance: 0.02, clearcoat: 1, clearcoatRoughness: 0.04,
  }), 'upper');
  const liquid = new THREE.MeshPhysicalMaterial({ color: shade(c.primary, -0.18, 0.05), roughness: 0.2, clearcoat: 0.5 });
  const black = mat.plastic(c.accent, 0.38);
  const bulbMat = mat.rubber(shade(c.accent, 0.02));

  // Boston round: body, curved shoulder, neck with bead.
  const [bottleP] = profile([
    [0, 0.002], [R - 0.004, 0.002, 0.002], [R - 0.002, 0, 0.0015], [R, 0.0018, 0.002],
    [R, 0.05, 0.011], [0.0088, 0.0615, 0.003], [0.0088, 0.0655, 0.0008], [0.0096, 0.0665, 0.0008], [0.0096, 0.069, 0.0008], [0.0084, 0.0695],
  ]);
  g.add(mesh(rev(bottleP, 96), glass, 'glass'));
  // Serum inside (opaque, seen through the glass).
  const [fill] = profile([[0, 0.0035], [R - 0.0022, 0.0035, 0.002], [R - 0.0022, 0.047, 0.004], [0, 0.048]]);
  g.add(mesh(rev(fill, 64), liquid, 'serum'));
  // Glass pipette inside, visible through the shoulder.
  const pipette = mesh(new THREE.CylinderGeometry(0.0028, 0.0022, 0.06, 20), new THREE.MeshStandardMaterial({ color: '#c8b8a2', roughness: 0.2 }), 'pipette');
  pipette.position.y = 0.038;
  g.add(pipette);

  // Ribbed screw collar and rubber bulb.
  const [collarP] = profile([[0.0082, 0.0668], [0.0108, 0.0668, 0.001], [0.0108, 0.083, 0.0018], [0.0062, 0.0838, 0.001], [0.0058, 0.0838]]);
  g.add(mesh(ribbed(collarP, 36, 0.0006, 0.0685, 0.0815), black, 'collar'));
  const bulb: PV[] = [[0.0062, 0.083], [0.0068, 0.0842, 0.001], [0.0066, 0.0875, 0.003], [0.0058, 0.0905, 0.003], [0.0072, 0.095, 0.004], [0.0074, 0.101, 0.004], [0.0058, 0.1064, 0.004], [0, 0.1076]];
  const [bulbP] = profile(bulb, 6);
  g.add(mesh(rev(bulbP, 48), bulbMat, 'bulb'));

  // Paper label wrapping 70 % of the body; the front panel is kept within about +-45 deg
  // so it reads on the curve, with small print towards the sides.
  const y0 = 0.011, y1 = 0.043;
  const span = 0.7 * TAU;
  const W = 1536, H = Math.round((W * (y1 - y0)) / (R * span));
  const label = canvasTexture(W, H, (gx, w, h) => {
    gx.fillStyle = c.secondary;
    gx.fillRect(0, 0, w, h);
    gx.fillStyle = c.accent;
    gx.textAlign = 'center';
    gx.textBaseline = 'middle';
    gx.font = font(700, 62);
    spacedText(gx, 'HYDRAGLOW', w / 2, h * 0.22, 11);
    gx.fillRect(w / 2 - 55, h * 0.36, 110, 3);
    gx.font = font(400, 58);
    gx.fillText('Face Serum', w / 2, h * 0.5);
    gx.font = font(500, 23);
    spacedText(gx, 'HYALURONIC ACID + GLYCERIN', w / 2, h * 0.67, 3);
    gx.font = font(500, 27);
    gx.fillText('30 ml', w / 2, h * 0.84);
    // Drop motif either side of the name.
    for (const sx of [-1, 1]) {
      const x = w / 2 + sx * 250, y = h * 0.5;
      gx.beginPath();
      gx.moveTo(x, y - 30);
      gx.bezierCurveTo(x + 22, y - 4, x + 19, y + 22, x, y + 22);
      gx.bezierCurveTo(x - 19, y + 22, x - 22, y - 4, x, y - 30);
      gx.fillStyle = c.primary;
      gx.fill();
    }
    // Small print (directions / ingredients) suggested by fine grey lines.
    gx.fillStyle = 'rgba(30,30,30,0.4)';
    const r = rng(30);
    for (const cx of [w * 0.17, w * 0.83]) {
      for (let i = 0; i < 8; i++) {
        const lw = 150 + r() * 110;
        gx.fillRect(cx - 130, h * 0.24 + i * 46, lw, 9);
      }
    }
  });
  const labelGeo = rev([[R + 0.00025, y0], [R + 0.00025, y1]], 64, TAU - span / 2 + LABEL_TURN, span);
  g.add(mesh(labelGeo, new THREE.MeshPhysicalMaterial({ map: label, roughness: 0.75 }), 'label'));
  return grounded(g);
};

// ------------------------------------------------------------------ lotion

/** 200 ml pump bottle: glossy cylinder, ribbed collar, actuator with spout, printed front. */
const lotion: Builder = (c) => {
  const g = new THREE.Group();
  const R = 0.0262;
  const bodyMat = named(new THREE.MeshPhysicalMaterial({ color: c.primary, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.15 }), 'upper');
  const pumpMat = mat.plastic(c.secondary, 0.35);
  const stemMat = mat.plastic(shade(c.secondary, -0.05), 0.3);

  const [bodyP] = profile([
    [0, 0.003], [R - 0.006, 0.003, 0.002], [R - 0.003, 0, 0.002], [R, 0.004, 0.004],
    [R, 0.124, 0.014], [0.0125, 0.137, 0.003], [0.0125, 0.142],
  ]);
  g.add(mesh(rev(bodyP, 96), bodyMat, 'bottle'));
  // Ribbed screw collar.
  const [collarP] = profile([[0.0118, 0.1355], [0.0152, 0.1355, 0.0012], [0.0152, 0.1525, 0.0025], [0.006, 0.155], [0.0055, 0.155]]);
  g.add(mesh(ribbed(collarP, 44, 0.0007, 0.1375, 0.1505), pumpMat, 'collar'));
  // Pump stem and actuator head.
  const stem = mesh(new THREE.CylinderGeometry(0.0052, 0.0056, 0.016, 28), stemMat, 'stem');
  stem.position.y = 0.162;
  g.add(stem);
  const [headP] = profile([[0.0048, 0.1665], [0.0128, 0.1665, 0.0015], [0.0128, 0.1795, 0.0035], [0.007, 0.1838, 0.006], [0, 0.1845]]);
  g.add(mesh(rev(headP, 64), pumpMat, 'actuator'));
  const spout = sweep(
    [v3(0.004, 0.1772, 0), v3(0.014, 0.178, 0), v3(0.026, 0.1792, 0), v3(0.036, 0.1784, 0), v3(0.0405, 0.1758, 0)],
    { width: (t) => 0.0088 - 0.0026 * t, thickness: (t) => 0.0078 - 0.0022 * t, side: v3(0, 0, 1), round: 2.8, segments: 28, radial: 18, capEnd: true },
  );
  g.add(mesh(spout, pumpMat, 'spout'));
  const tip = mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.0035, 16), mat.matte(shade(c.secondary, -0.3)), 'nozzle');
  tip.position.set(0.0409, 0.1752, 0);
  tip.rotation.z = Math.PI / 3;
  g.add(tip);

  // Screen-printed front panel.
  const y0 = 0.024, y1 = 0.116, arc = 0.05;
  const W = 560, H = Math.round((W * (y1 - y0)) / arc);
  const print = canvasTexture(W, H, (gx, w, h) => {
    gx.clearRect(0, 0, w, h);
    gx.textAlign = 'center';
    gx.textBaseline = 'middle';
    leafGlyph(gx, w / 2 - 22, h * 0.13, 70, c.secondary, c.primary, -0.5);
    leafGlyph(gx, w / 2 + 24, h * 0.14, 56, shade(c.secondary, -0.12), c.primary, 0.55);
    gx.fillStyle = c.accent;
    gx.font = font(600, 34);
    spacedText(gx, 'DAILY', w / 2, h * 0.27, 10);
    gx.font = font(700, 74);
    gx.fillText('Moisturising', w / 2, h * 0.37);
    gx.font = font(300, 84);
    gx.fillText('Lotion', w / 2, h * 0.48);
    gx.fillStyle = c.secondary;
    gx.fillRect(w / 2 - 70, h * 0.565, 140, 4);
    gx.fillStyle = c.accent;
    gx.font = font(500, 30);
    gx.fillText('shea butter + aloe vera', w / 2, h * 0.63);
    gx.font = font(400, 28);
    gx.fillText('face & body · light feel', w / 2, h * 0.69);
    gx.font = font(600, 32);
    gx.fillText('200 ml', w / 2, h * 0.9);
  });
  g.add(decal(R + 0.0003, y0, y1, arc, print, { roughness: 0.3, clearcoat: 0.4, turn: LABEL_TURN }));
  return grounded(g);
};

// ------------------------------------------------------------------ body wash

/** 250 ml oval bottle with a flip-top cap and a wrap-around label band. */
const bodywash: Builder = (c) => {
  const g = new THREE.Group();
  const R = 0.034, SZ = 0.6; // oval: full radius across x, 60 % front-to-back
  const bodyMat = named(new THREE.MeshPhysicalMaterial({ color: c.primary, roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.12 }), 'upper');
  const capMat = mat.plastic(c.secondary, 0.32);
  const seam = mat.matte(mix(c.secondary, '#2a2a2a', 0.55), 0.6);

  const [bodyP] = profile([
    [0, 0.003], [R - 0.008, 0.003, 0.003], [R - 0.004, 0, 0.003], [R, 0.005, 0.006],
    [R, 0.128, 0.022], [0.0226, 0.1525, 0.004], [0.0212, 0.155],
  ]);
  g.add(mesh(rev(bodyP, 96).scale(1, 1, SZ), bodyMat, 'bottle'));

  // Flip-top cap: base, hinge seam, lid with a thumb tab.
  const capR = 0.0232;
  const [capBase] = profile([[0.019, 0.1515], [capR, 0.1515, 0.0012], [capR, 0.1715]], 4);
  g.add(mesh(rev(capBase, 96).scale(1, 1, SZ), capMat, 'cap'));
  const [seamP] = profile([[capR - 0.0006, 0.1715], [capR - 0.0006, 0.1728]], 2);
  g.add(mesh(rev(seamP, 96).scale(1, 1, SZ), seam, 'cap-seam'));
  const [lidP] = profile([[capR, 0.1728], [capR, 0.181, 0.0045], [0.011, 0.1838, 0.01], [0, 0.1842]], 6);
  g.add(mesh(rev(lidP, 96).scale(1, 1, SZ), capMat, 'lid'));
  const tab = mesh(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI), capMat, 'tab');
  tab.scale.set(0.0078, 0.0024, 0.0032);
  tab.position.set(0, 0.1722, capR * SZ - 0.0008);
  g.add(tab);

  // Label band wrapping the whole body. Lathe u is linear in angle, so the front panel is
  // drawn squeezed by the ratio of mean to front arc length to look undistorted.
  const y0 = 0.034, y1 = 0.114;
  const W = 1536;
  const meanR = Math.sqrt((R * R + (R * SZ) ** 2) / 2);
  const H = Math.round((W * (y1 - y0)) / (TAU * meanR));
  const squeeze = (W / TAU / R) / (H / (y1 - y0));
  const label = canvasTexture(W, H, (gx, w, h) => {
    gx.fillStyle = c.secondary;
    gx.fillRect(0, 0, w, h);
    // Thin accent rules top and bottom.
    gx.fillStyle = c.accent;
    gx.fillRect(0, 10, w, 5);
    gx.fillRect(0, h - 15, w, 5);
    gx.save();
    gx.translate(w / 2, 0);
    gx.scale(squeeze, 1);
    // Orange slice.
    const sx = -175, sy = h * 0.5, sr = 88;
    gx.fillStyle = c.primary;
    gx.beginPath();
    gx.arc(sx, sy, sr, 0, TAU);
    gx.fill();
    gx.fillStyle = '#fff3d6';
    gx.beginPath();
    gx.arc(sx, sy, sr * 0.84, 0, TAU);
    gx.fill();
    gx.fillStyle = shade(c.primary, 0.05);
    for (let i = 0; i < 9; i++) {
      const a0 = (i / 9) * TAU + 0.06, a1 = ((i + 1) / 9) * TAU - 0.06;
      gx.beginPath();
      gx.moveTo(sx, sy);
      gx.arc(sx, sy, sr * 0.78, a0, a1);
      gx.closePath();
      gx.fill();
    }
    leafGlyph(gx, sx + 70, sy - 82, 64, c.accent, c.secondary, 0.7);
    // Wordmark.
    gx.fillStyle = c.accent;
    gx.textAlign = 'left';
    gx.textBaseline = 'middle';
    gx.font = font(800, 78);
    gx.fillText('CITRUS', -64, h * 0.3);
    gx.fillText('FRESH', -64, h * 0.5);
    gx.font = font(600, 34);
    gx.fillStyle = shade(c.primary, -0.12);
    gx.fillText('BODY WASH', -58, h * 0.68);
    gx.fillStyle = c.accent;
    gx.font = font(400, 28);
    gx.fillText('orange + lemongrass · 250 ml', -58, h * 0.8);
    gx.restore();
    // Back panel: small print blocks.
    gx.fillStyle = 'rgba(40,40,40,0.35)';
    const r = rng(4);
    for (let i = 0; i < 7; i++) {
      const lw = 140 + r() * 120;
      gx.fillRect(140 - lw / 2 + 60, h * 0.25 + i * 22, lw, 8);
      gx.fillRect(w - 200 - lw / 2 + 60, h * 0.25 + i * 22, lw, 8);
    }
  });
  const labelGeo = rev([[R + 0.0003, y0], [R + 0.0003, y1]], 128, Math.PI + LABEL_TURN * 0.4).scale(1, 1, SZ);
  g.add(mesh(labelGeo, new THREE.MeshPhysicalMaterial({ map: label, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 }), 'label'));
  return grounded(g);
};

export const BUILDERS = {
  bottle,
  mugs,
  frypan,
  lamp,
  planters,
  serum,
  lotion,
  bodywash,
};
