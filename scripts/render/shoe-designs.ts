// Parametric, original shoe designs for the AUREN sample catalogue.
// Each design is a set of SDF parts (sole, upper, stitched overlay panels,
// lining) plus lace/eyelet anchor data. Coordinates: x heel(-) -> toe(+),
// y up from the ground, z lateral(+)/medial(-). Length is ~1 unit.

import {
  type SDF, clamp, extrude, mix, sdCapsule, sdEllipse2, sdEllipsoid, sdRoundBox, smax, smin, smoothstep,
} from './sdf';

export type Silhouette = 'runner' | 'trainer' | 'court' | 'basketball' | 'high' | 'oxford' | 'slipon' | 'boot' | 'slide';
export type MaterialName = 'upper' | 'accent' | 'overlay' | 'sole' | 'outsole' | 'lining' | 'laces' | 'metal';

export interface Part {
  name: string;
  material: MaterialName;
  sdf: SDF;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export interface LaceSpec {
  rows: number;
  /** Throat line as [x, height-above-sole] points inside the upper, toe-most row first. */
  start: [number, number];
  end: [number, number];
  /** Ray direction tilt (radians from vertical, towards the toe) at the first/last row. */
  tiltStart: number;
  tiltEnd: number;
  halfWidthStart: number;
  halfWidthEnd: number;
  style: 'cross' | 'bar';
  radius: number;
}

export interface ShoeDesign {
  silhouette: Silhouette;
  parts: Part[];
  upper: SDF;
  scene: SDF;
  laces?: LaceSpec;
  base: (x: number) => number;
  height: number;
}

interface Params {
  silhouette: Silhouette;
  heel: { x: number; r: number };
  fore: { x: number; z: number; rx: number; rz: number };
  waist: number;
  pointedToe?: { x: number; rx: number; rz: number };
  outsoleH: number;
  heelTop: number;
  foreTop: number;
  heelBlock?: number;
  toeSpring: number;
  soleRound: number;
  lugs?: boolean;
  wallInset: number;
  wallTaper: number;
  toe: [number, number, number, number, number]; // cx, cy(from base), rx, ry, rz
  vamp: [number, number, number, number, number];
  heelBox: [number, number, number, number, number];
  shaft?: [number, number, number, number, number];
  shaftTop?: number;
  collarSlope?: number;
  blend: number;
  opening: [number, number, number, number, number, number]; // cx, cy, rx, ry, rz, k
  tongue?: { x: number; y: number; hx: number; hy: number; hz: number; tilt: number };
  laces?: LaceSpec;
  overlays: {
    heelCounter?: { x: number; slope: number; top: number };
    toeCap?: { x: number; slope: number; top: number; material?: MaterialName };
    stripe?: { x0: number; h0: number; x1: number; h1: number; sag: number; width: number };
    eyestay?: { x0: number; x1: number; halfWidth: number; minH: number };
    mudguard?: { height: number };
    anklePatch?: { x: number; h: number; r: number };
    collar?: { width: number };
  };
  strap?: { x: number; rx: number; ry: number; rz: number; width: number; thickness: number };
  footbed?: boolean;
}

const rot = (a: number, b: number, angle: number): [number, number] => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [a * c - b * s, a * s + b * c];
};

const DESIGNS: Record<Silhouette, Params> = {
  runner: {
    silhouette: 'runner',
    heel: { x: -0.35, r: 0.128 }, fore: { x: 0.17, z: 0.01, rx: 0.33, rz: 0.158 }, waist: 0.2,
    outsoleH: 0.012, heelTop: 0.078, foreTop: 0.046, toeSpring: 0.04, soleRound: 0.012,
    wallInset: 0.007, wallTaper: 0.26,
    toe: [0.27, 0.032, 0.24, 0.072, 0.148], vamp: [0.03, 0.075, 0.33, 0.145, 0.152], heelBox: [-0.3, 0.1, 0.19, 0.17, 0.128],
    blend: 0.09,
    opening: [-0.215, 0.232, 0.125, 0.058, 0.088, 0.022],
    tongue: { x: -0.09, y: 0.215, hx: 0.055, hy: 0.014, hz: 0.06, tilt: -0.75 },
    laces: { rows: 6, start: [0.17, 0.05], end: [-0.055, 0.1], tiltStart: 0, tiltEnd: 0.15, halfWidthStart: 0.045, halfWidthEnd: 0.06, style: 'cross', radius: 0.0042 },
    overlays: {
      heelCounter: { x: -0.29, slope: 0.25, top: 0.12 },
      toeCap: { x: 0.37, slope: 0.6, top: 0.045 },
      stripe: { x0: 0.15, h0: 0.035, x1: -0.27, h1: 0.155, sag: -0.03, width: 0.022 },
      eyestay: { x0: -0.06, x1: 0.19, halfWidth: 0.07, minH: 0.1 },
      collar: { width: 0.016 },
    },
  },
  trainer: {
    silhouette: 'trainer',
    heel: { x: -0.35, r: 0.132 }, fore: { x: 0.165, z: 0.012, rx: 0.335, rz: 0.168 }, waist: 0.19,
    outsoleH: 0.012, heelTop: 0.058, foreTop: 0.042, toeSpring: 0.028, soleRound: 0.01,
    wallInset: 0.007, wallTaper: 0.24,
    toe: [0.27, 0.034, 0.24, 0.074, 0.152], vamp: [0.03, 0.075, 0.33, 0.145, 0.156], heelBox: [-0.3, 0.1, 0.19, 0.165, 0.13],
    blend: 0.09,
    opening: [-0.215, 0.228, 0.125, 0.058, 0.09, 0.022],
    tongue: { x: -0.09, y: 0.212, hx: 0.055, hy: 0.014, hz: 0.062, tilt: -0.72 },
    laces: { rows: 6, start: [0.17, 0.05], end: [-0.055, 0.1], tiltStart: 0, tiltEnd: 0.15, halfWidthStart: 0.046, halfWidthEnd: 0.062, style: 'cross', radius: 0.0042 },
    overlays: {
      heelCounter: { x: -0.27, slope: 0.1, top: 0.16 },
      toeCap: { x: 0.33, slope: 0.4, top: 0.05 },
      stripe: { x0: 0.08, h0: 0.03, x1: -0.12, h1: 0.12, sag: 0.0, width: 0.03 },
      eyestay: { x0: -0.08, x1: 0.2, halfWidth: 0.08, minH: 0.085 },
      collar: { width: 0.018 },
    },
  },
  court: {
    silhouette: 'court',
    heel: { x: -0.35, r: 0.13 }, fore: { x: 0.16, z: 0.008, rx: 0.34, rz: 0.162 }, waist: 0.17,
    outsoleH: 0.014, heelTop: 0.044, foreTop: 0.04, toeSpring: 0.014, soleRound: 0.006,
    wallInset: 0.005, wallTaper: 0.22,
    toe: [0.27, 0.03, 0.25, 0.07, 0.15], vamp: [0.02, 0.072, 0.34, 0.14, 0.154], heelBox: [-0.3, 0.095, 0.19, 0.16, 0.13],
    blend: 0.08,
    opening: [-0.215, 0.222, 0.125, 0.056, 0.088, 0.02],
    tongue: { x: -0.09, y: 0.21, hx: 0.055, hy: 0.015, hz: 0.06, tilt: -0.7 },
    laces: { rows: 6, start: [0.16, 0.05], end: [-0.05, 0.1], tiltStart: 0, tiltEnd: 0.15, halfWidthStart: 0.046, halfWidthEnd: 0.06, style: 'bar', radius: 0.0045 },
    overlays: {
      heelCounter: { x: -0.27, slope: 0.35, top: 0.13 },
      toeCap: { x: 0.31, slope: 0.25, top: 0.06 },
      stripe: { x0: 0.12, h0: 0.025, x1: -0.2, h1: 0.11, sag: 0.02, width: 0.026 },
      eyestay: { x0: -0.08, x1: 0.19, halfWidth: 0.08, minH: 0.08 },
      collar: { width: 0.02 },
    },
  },
  basketball: {
    silhouette: 'basketball',
    heel: { x: -0.35, r: 0.135 }, fore: { x: 0.165, z: 0.01, rx: 0.335, rz: 0.17 }, waist: 0.18,
    outsoleH: 0.014, heelTop: 0.064, foreTop: 0.05, toeSpring: 0.022, soleRound: 0.012,
    wallInset: 0.006, wallTaper: 0.2,
    toe: [0.27, 0.034, 0.24, 0.074, 0.156], vamp: [0.03, 0.08, 0.33, 0.13, 0.16], heelBox: [-0.29, 0.1, 0.19, 0.16, 0.135],
    shaft: [-0.2, 0.2, 0.158, 0.15, 0.122], shaftTop: 0.29, collarSlope: -0.2,
    blend: 0.09,
    opening: [-0.2, 0.4, 0.11, 0.24, 0.084, 0.015],
    tongue: { x: -0.065, y: 0.255, hx: 0.075, hy: 0.016, hz: 0.064, tilt: -1.0 },
    laces: { rows: 7, start: [0.16, 0.06], end: [-0.06, 0.24], tiltStart: 0, tiltEnd: 0.8, halfWidthStart: 0.046, halfWidthEnd: 0.062, style: 'cross', radius: 0.0045 },
    overlays: {
      heelCounter: { x: -0.27, slope: 0.2, top: 0.18 },
      toeCap: { x: 0.33, slope: 0.4, top: 0.055 },
      stripe: { x0: 0.13, h0: 0.035, x1: -0.22, h1: 0.2, sag: -0.02, width: 0.03 },
      eyestay: { x0: -0.12, x1: 0.19, halfWidth: 0.08, minH: 0.09 },
      collar: { width: 0.03 },
    },
  },
  high: {
    silhouette: 'high',
    heel: { x: -0.35, r: 0.128 }, fore: { x: 0.165, z: 0.006, rx: 0.335, rz: 0.155 }, waist: 0.17,
    outsoleH: 0.012, heelTop: 0.036, foreTop: 0.034, toeSpring: 0.012, soleRound: 0.006,
    wallInset: 0.005, wallTaper: 0.2,
    toe: [0.27, 0.026, 0.25, 0.062, 0.145], vamp: [0.03, 0.068, 0.33, 0.12, 0.15], heelBox: [-0.29, 0.1, 0.19, 0.16, 0.128],
    shaft: [-0.2, 0.24, 0.15, 0.2, 0.112], shaftTop: 0.36, collarSlope: -0.22,
    blend: 0.08,
    opening: [-0.2, 0.46, 0.105, 0.27, 0.078, 0.015],
    tongue: { x: -0.06, y: 0.3, hx: 0.085, hy: 0.015, hz: 0.06, tilt: -1.15 },
    laces: { rows: 8, start: [0.16, 0.05], end: [-0.07, 0.31], tiltStart: 0, tiltEnd: 1.0, halfWidthStart: 0.044, halfWidthEnd: 0.056, style: 'cross', radius: 0.004 },
    overlays: {
      toeCap: { x: 0.36, slope: 0.6, top: 0.04, material: 'sole' },
      heelCounter: { x: -0.3, slope: 0.1, top: 0.09 },
      anklePatch: { x: -0.2, h: 0.2, r: 0.034 },
      eyestay: { x0: -0.14, x1: 0.19, halfWidth: 0.075, minH: 0.08 },
      collar: { width: 0.022 },
    },
  },
  oxford: {
    silhouette: 'oxford',
    heel: { x: -0.36, r: 0.115 }, fore: { x: 0.12, z: 0.008, rx: 0.3, rz: 0.142 }, waist: 0.2,
    pointedToe: { x: 0.33, rx: 0.17, rz: 0.088 },
    outsoleH: 0.008, heelTop: 0.016, foreTop: 0.014, heelBlock: 0.028, toeSpring: 0.022, soleRound: 0.004,
    wallInset: 0.004, wallTaper: 0.1,
    toe: [0.27, 0.03, 0.27, 0.066, 0.128], vamp: [0.02, 0.07, 0.34, 0.14, 0.142], heelBox: [-0.31, 0.09, 0.18, 0.135, 0.118],
    blend: 0.08,
    opening: [-0.225, 0.19, 0.12, 0.045, 0.085, 0.016],
    tongue: { x: -0.08, y: 0.18, hx: 0.045, hy: 0.01, hz: 0.04, tilt: -0.55 },
    laces: { rows: 5, start: [0.1, 0.06], end: [-0.05, 0.1], tiltStart: 0, tiltEnd: 0.2, halfWidthStart: 0.022, halfWidthEnd: 0.03, style: 'bar', radius: 0.0032 },
    overlays: {
      toeCap: { x: 0.25, slope: 0.12, top: 0.2 },
      heelCounter: { x: -0.32, slope: 0.15, top: 0.2 },
      eyestay: { x0: -0.05, x1: 0.14, halfWidth: 0.048, minH: 0.085 },
    },
  },
  slipon: {
    silhouette: 'slipon',
    heel: { x: -0.35, r: 0.128 }, fore: { x: 0.17, z: 0.01, rx: 0.33, rz: 0.158 }, waist: 0.2,
    outsoleH: 0.01, heelTop: 0.058, foreTop: 0.04, toeSpring: 0.03, soleRound: 0.014,
    wallInset: 0.007, wallTaper: 0.26,
    toe: [0.27, 0.03, 0.24, 0.07, 0.148], vamp: [0.03, 0.07, 0.33, 0.14, 0.152], heelBox: [-0.3, 0.095, 0.19, 0.15, 0.128],
    blend: 0.1,
    opening: [-0.215, 0.212, 0.13, 0.055, 0.084, 0.03],
    overlays: {
      heelCounter: { x: -0.31, slope: 0.3, top: 0.14 },
      collar: { width: 0.02 },
    },
  },
  boot: {
    silhouette: 'boot',
    heel: { x: -0.35, r: 0.135 }, fore: { x: 0.165, z: 0.01, rx: 0.335, rz: 0.168 }, waist: 0.19,
    outsoleH: 0.022, heelTop: 0.05, foreTop: 0.036, toeSpring: 0.03, soleRound: 0.008, lugs: true,
    wallInset: 0.006, wallTaper: 0.18,
    toe: [0.27, 0.036, 0.24, 0.078, 0.155], vamp: [0.03, 0.08, 0.33, 0.135, 0.158], heelBox: [-0.29, 0.1, 0.19, 0.16, 0.135],
    shaft: [-0.19, 0.26, 0.155, 0.2, 0.12], shaftTop: 0.4, collarSlope: -0.2,
    blend: 0.09,
    opening: [-0.19, 0.5, 0.105, 0.28, 0.082, 0.015],
    tongue: { x: -0.065, y: 0.34, hx: 0.09, hy: 0.017, hz: 0.068, tilt: -1.15 },
    laces: { rows: 7, start: [0.15, 0.06], end: [-0.07, 0.34], tiltStart: 0, tiltEnd: 1.05, halfWidthStart: 0.05, halfWidthEnd: 0.06, style: 'cross', radius: 0.0052 },
    overlays: {
      mudguard: { height: 0.045 },
      heelCounter: { x: -0.25, slope: 0.15, top: 0.17 },
      eyestay: { x0: -0.15, x1: 0.19, halfWidth: 0.082, minH: 0.09 },
      collar: { width: 0.04 },
    },
  },
  slide: {
    silhouette: 'slide',
    heel: { x: -0.35, r: 0.13 }, fore: { x: 0.16, z: 0.01, rx: 0.34, rz: 0.165 }, waist: 0.18,
    outsoleH: 0.008, heelTop: 0.042, foreTop: 0.032, toeSpring: 0.012, soleRound: 0.016,
    wallInset: 0, wallTaper: 0,
    toe: [0, 0, 0.01, 0.01, 0.01], vamp: [0, 0, 0.01, 0.01, 0.01], heelBox: [0, 0, 0.01, 0.01, 0.01],
    blend: 0,
    opening: [0, 0, 0.01, 0.01, 0.01, 0],
    strap: { x: 0.1, rx: 0.34, ry: 0.15, rz: 0.168, width: 0.3, thickness: 0.014 },
    footbed: true,
    overlays: {},
  },
};

export function buildDesign(silhouette: Silhouette): ShoeDesign {
  const P = DESIGNS[silhouette];

  // Heel disc + midfoot + forefoot lobes give a foot-shaped outsole with a gentle arch.
  const midRz = P.fore.rz * (silhouette === 'oxford' ? 0.74 : 0.8);
  const footprint = (x: number, z: number) => {
    const heel = Math.hypot(x - P.heel.x, z) - P.heel.r;
    const mid = sdEllipse2(x + 0.11, z + 0.004, 0.25, midRz);
    const fore = sdEllipse2(x - P.fore.x, z - P.fore.z, P.fore.rx, P.fore.rz);
    let d = smin(smin(heel, mid, P.waist * 0.5), fore, P.waist * 0.5);
    if (P.pointedToe) {
      const toe = sdEllipse2(x - P.pointedToe.x, z - 0.004, P.pointedToe.rx, P.pointedToe.rz);
      d = smin(d, toe, 0.12);
    }
    return d;
  };

  const spring = (x: number) => P.toeSpring * smoothstep(0.1, 0.52, x) ** 2;
  const soleTop = (x: number) => {
    let top = P.outsoleH + mix(P.heelTop, P.foreTop, smoothstep(-0.3, 0.15, x));
    if (P.heelBlock) top += P.heelBlock * smoothstep(-0.215, -0.235, x);
    return top;
  };
  const base = (x: number) => soleTop(x) + spring(x) - 0.004;

  const sole: SDF = (x, y, z) => {
    const yy = y - spring(x);
    let d = extrude(footprint(x, z), yy, 0, soleTop(x), P.soleRound);
    if (P.footbed) {
      // Contoured footbed dish.
      const dish = sdEllipsoid(x + 0.02, yy - soleTop(x) - 0.045, z, 0.46, 0.055, 0.13);
      d = smax(d, -dish, 0.02);
    }
    if (P.heelBlock) {
      // Waist cut-out between heel block and forefoot.
      const waistCut = sdRoundBox(x + 0.13, yy, z, 0.09, P.outsoleH + 0.006, 0.3, 0.004);
      d = smax(d, -waistCut, 0.006);
    }
    return d;
  };

  const outsole: SDF = (x, y, z) => {
    const yy = y - spring(x);
    let d = smax(sole(x, y, z) - 0.0008, yy - P.outsoleH, 0.002);
    if (P.lugs) {
      const period = 0.042;
      const u = x + Math.abs(z) * 0.7;
      const groove = Math.abs((((u % period) + period) % period) - period / 2) - 0.007;
      d = smax(d, -smax(groove, yy - 0.011, 0.002), 0.002);
    }
    return d;
  };
  const midsole: SDF = (x, y, z) => smax(sole(x, y, z), P.outsoleH - (y - spring(x)), 0.002);

  const opening: SDF = (x, y, z) => {
    const [cx, cy, rx, ry, rz] = P.opening;
    const b = base(x);
    const e = sdEllipsoid(x - cx, y - b - cy, z, rx, ry, rz);
    // A vertical shaft keeps the foot opening deep enough to read as an opening.
    const shaftHole = sdEllipsoid(x - cx - 0.01, y - b - cy - 0.02, z, rx * 0.6, 0.4, rz * 0.78);
    return smin(e, smax(shaftHole, (b + 0.07) - y, 0.01), 0.03);
  };

  const tongue: SDF | null = P.tongue
    ? (x, y, z) => {
        const t = P.tongue!;
        const b = base(x);
        const [qx, qy] = rot(x - t.x, y - b - t.y, t.tilt);
        return sdRoundBox(qx, qy, z, t.hx, t.hy, t.hz, Math.min(t.hy, 0.016));
      }
    : null;

  const upperCore: SDF = (x, y, z) => {
    if (silhouette === 'slide') {
      const s = P.strap!;
      const b = base(x);
      const shell = Math.abs(sdEllipsoid(x - s.x, y - b + 0.035, z, s.rx, s.ry, s.rz)) - s.thickness;
      let d = smax(shell, Math.abs(x - s.x) - s.width / 2, 0.03);
      d = smax(d, (b - 0.006) - y, 0.004);
      return d;
    }
    const b = base(x);
    const [tx, ty, trx, tr_y, trz] = P.toe;
    const [vx, vy, vrx, vry, vrz] = P.vamp;
    const [hx, hy, hrx, hry, hrz] = P.heelBox;
    let d = sdEllipsoid(x - tx, y - b - ty, z, trx, tr_y, trz);
    d = smin(d, sdEllipsoid(x - vx, y - b - vy, z, vrx, vry, vrz), P.blend);
    d = smin(d, sdEllipsoid(x - hx, y - b - hy, z, hrx, hry, hrz), P.blend);
    // Keep the body inside the sole footprint, leaning inward with height.
    const wall = footprint(x, z) + P.wallInset + Math.max(0, y - b) * P.wallTaper;
    d = smax(d, wall, 0.025);
    if (P.shaft) {
      const [sx, , srx, , srz] = P.shaft;
      const collar = (P.shaftTop ?? 0.4) + (P.collarSlope ?? 0) * (x - sx);
      // Vertical elliptic cylinder for the ankle shaft so the collar is a full ring.
      const shaft = extrude(sdEllipse2(x - sx, z, srx, srz), y - b, 0, collar, 0.035);
      d = smin(d, shaft, P.blend);
      d = smax(d, y - b - collar, 0.012);
    }
    d = smax(d, b - y, 0.006);
    d = smax(d, -opening(x, y, z), P.opening[5]);
    if (tongue) d = smin(d, tongue(x, y, z), 0.022);
    return d;
  };

  const upper: SDF = upperCore;
  const parts: Part[] = [];
  const lowBounds = (h: number): Part['bounds'] => ({ min: [-0.53, -0.01, -0.21], max: [0.55, h, 0.21] });
  const height = (P.shaftTop ?? 0.26) + 0.12;

  parts.push({ name: 'outsole', material: 'outsole', sdf: outsole, bounds: { min: [-0.53, -0.01, -0.21], max: [0.55, 0.06, 0.21] } });
  parts.push({ name: 'midsole', material: 'sole', sdf: midsole, bounds: { min: [-0.53, -0.005, -0.21], max: [0.55, 0.15, 0.21] } });
  parts.push({ name: 'upper', material: 'upper', sdf: upper, bounds: lowBounds(height) });

  const inflate = (t: number) => (x: number, y: number, z: number) => upper(x, y, z) - t;
  const O = P.overlays;

  if (silhouette !== 'slide') {
    // Lining: a skin over every surface carved by the foot opening.
    parts.push({
      name: 'lining',
      material: 'lining',
      sdf: (x, y, z) => smax(inflate(0.0012)(x, y, z), opening(x, y, z) - 0.007, 0.002),
      bounds: lowBounds(height),
    });
  }

  if (O.collar) {
    const w = O.collar.width;
    parts.push({
      name: 'collar',
      material: 'overlay',
      sdf: (x, y, z) => {
        const ring = Math.abs(opening(x, y, z)) - w;
        return smax(inflate(0.0022)(x, y, z), smax(ring, -(opening(x, y, z) - 0.006), 0.002), 0.003);
      },
      bounds: lowBounds(height),
    });
  }

  if (O.mudguard) {
    const h = O.mudguard.height;
    parts.push({
      name: 'mudguard',
      material: 'outsole',
      sdf: (x, y, z) => smax(inflate(0.0035)(x, y, z), y - base(x) - h - 0.012 * Math.sin(x * 22), 0.004),
      bounds: lowBounds(0.2),
    });
  }

  if (O.heelCounter) {
    const c = O.heelCounter;
    parts.push({
      name: 'heel_counter',
      material: 'accent',
      sdf: (x, y, z) => {
        const h = y - base(x);
        const region = smax(x - (c.x + c.slope * h), h - c.top + 0.03 * smoothstep(-0.5, -0.25, x), 0.02);
        return smax(inflate(0.0028)(x, y, z), region, 0.003);
      },
      bounds: lowBounds(height),
    });
  }

  if (O.toeCap) {
    const c = O.toeCap;
    parts.push({
      name: 'toe_cap',
      material: c.material ?? 'overlay',
      sdf: (x, y, z) => {
        const h = y - base(x);
        const region = smax(-(x - (c.x - c.slope * h)), h - c.top, 0.015);
        return smax(inflate(0.0026)(x, y, z), region, 0.003);
      },
      bounds: lowBounds(height),
    });
  }

  if (O.stripe) {
    const s = O.stripe;
    parts.push({
      name: 'stripe',
      material: 'accent',
      sdf: (x, y, z) => {
        const t = clamp((x - s.x0) / (s.x1 - s.x0), 0, 1);
        const centre = mix(s.h0, s.h1, t) + s.sag * 4 * t * (1 - t);
        const h = y - base(x);
        const band = Math.abs(h - centre) - s.width * mix(0.55, 1, t);
        const span = Math.max(x - s.x0, s.x1 - x);
        let region = smax(band, span, 0.012);
        region = smax(region, 0.05 - Math.abs(z), 0.01);
        return smax(inflate(0.0034)(x, y, z), region, 0.002);
      },
      bounds: lowBounds(height),
    });
  }

  if (O.eyestay) {
    const e = O.eyestay;
    parts.push({
      name: 'eyestay',
      material: 'overlay',
      sdf: (x, y, z) => {
        const h = y - base(x);
        let region = Math.abs(z) - e.halfWidth;
        region = smax(region, e.minH - h, 0.01);
        region = smax(region, Math.max(x - e.x1, e.x0 - x), 0.015);
        return smax(inflate(0.003)(x, y, z), region, 0.002);
      },
      bounds: lowBounds(height),
    });
  }

  if (O.anklePatch) {
    const a = O.anklePatch;
    parts.push({
      name: 'ankle_patch',
      material: 'accent',
      sdf: (x, y, z) => {
        const region = smax(Math.hypot(x - a.x, y - base(x) - a.h) - a.r, -z, 0.004);
        return smax(inflate(0.0032)(x, y, z), region, 0.002);
      },
      bounds: lowBounds(height),
    });
  }

  if (P.footbed) {
    parts.push({
      name: 'footbed',
      material: 'lining',
      sdf: (x, y, z) => {
        const yy = y - spring(x);
        return smax(sole(x, y, z) - 0.0012, soleTop(x) - 0.012 - yy, 0.002);
      },
      bounds: { min: [-0.53, 0, -0.21], max: [0.55, 0.12, 0.21] },
    });
  }

  // Pull tab at the heel (lace-ups and slip-ons).
  if (silhouette !== 'slide' && silhouette !== 'oxford') {
    const tabTop = (P.shaftTop ? P.shaftTop : P.opening[1] + P.opening[3] * 0.4);
    let backX = -0.5;
    for (let x = -0.56; x < 0; x += 0.001) {
      if (upper(x, base(x) + tabTop - 0.03, 0) < 0) {
        backX = x;
        break;
      }
    }
    parts.push({
      name: 'heel_tab',
      material: 'accent',
      sdf: (x, y, z) => {
        const b = base(backX);
        const [qx, qy] = rot(x - backX + 0.002, y - b - tabTop + 0.012, 0.25);
        return sdRoundBox(qx, qy, z, 0.008, 0.032, 0.016, 0.006);
      },
      bounds: { min: [backX - 0.06, base(backX) + tabTop - 0.1, -0.05], max: [backX + 0.05, base(backX) + tabTop + 0.06, 0.05] },
    });
  }

  const scene: SDF = (x, y, z) => {
    let d = Math.min(sole(x, y, z), upper(x, y, z));
    // The ground plane occludes too.
    d = Math.min(d, y + 0.0005);
    return d;
  };

  return { silhouette, parts, upper, scene, laces: P.laces, base, height };
}

/** Capsule helper kept for lace caps in build-shoe. */
export { sdCapsule };
