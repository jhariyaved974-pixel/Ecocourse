// Signed-distance-field toolkit used to model the original AUREN sample shoes.
// Shapes are composed from analytic primitives with smooth unions, then meshed
// with Surface Nets and shaded with SDF ambient occlusion. Runs in the browser
// (headless Chromium) during asset generation; not shipped to the storefront.

export type SDF = (x: number, y: number, z: number) => number;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Polynomial smooth minimum (union). */
export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
/** Smooth maximum (intersection). */
export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

export function sdEllipsoid(px: number, py: number, pz: number, rx: number, ry: number, rz: number) {
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

export function sdEllipse2(px: number, pz: number, rx: number, rz: number) {
  const k0 = Math.hypot(px / rx, pz / rz);
  const k1 = Math.hypot(px / (rx * rx), pz / (rz * rz));
  return k1 === 0 ? -Math.min(rx, rz) : (k0 * (k0 - 1)) / k1;
}

export function sdRoundBox(px: number, py: number, pz: number, bx: number, by: number, bz: number, r: number) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  const qz = Math.abs(pz) - bz + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qy, qz), 0) - r;
}

export function sdCapsule(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number,
) {
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

/** Extrude a 2D distance along y between y0 and y1 with rounded edges. */
export function extrude(d2: number, y: number, y0: number, y1: number, round: number) {
  const half = (y1 - y0) / 2;
  const wy = Math.abs(y - (y0 + half)) - half + round;
  const wx = d2 + round;
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - round;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

function gradient(f: SDF, x: number, y: number, z: number, e = 0.0007): [number, number, number] {
  const gx = f(x + e, y, z) - f(x - e, y, z);
  const gy = f(x, y + e, z) - f(x, y - e, z);
  const gz = f(x, y, z + e) - f(x, y, z - e);
  const len = Math.hypot(gx, gy, gz) || 1;
  return [gx / len, gy / len, gz / len];
}

/**
 * Naive Surface Nets: one vertex per surface-crossing cell (placed at the mean
 * of edge crossings, then projected onto the surface), quads across every
 * sign-changing grid edge. Normals come from the SDF gradient.
 */
export function surfaceNets(f: SDF, bounds: Bounds, cell: number): MeshData {
  const nx = Math.ceil((bounds.max[0] - bounds.min[0]) / cell) + 1;
  const ny = Math.ceil((bounds.max[1] - bounds.min[1]) / cell) + 1;
  const nz = Math.ceil((bounds.max[2] - bounds.min[2]) / cell) + 1;
  const ox = bounds.min[0], oy = bounds.min[1], oz = bounds.min[2];
  const field = new Float32Array(nx * ny * nz);
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        field[idx(i, j, k)] = f(ox + i * cell, oy + j * cell, oz + k * cell);
      }
    }
  }

  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const positions: number[] = [];
  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const vals = new Float32Array(8);

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = field[idx(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
          vals[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          const va = vals[a], vb = vals[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
          sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
          sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
          n++;
        }
        let px = ox + (i + sx / n) * cell;
        let py = oy + (j + sy / n) * cell;
        let pz = oz + (k + sz / n) * cell;
        // Project onto the surface (two Newton steps) for crisper shapes.
        for (let s = 0; s < 2; s++) {
          const d = f(px, py, pz);
          const g = gradient(f, px, py, pz);
          px -= g[0] * d;
          py -= g[1] * d;
          pz -= g[2] * d;
        }
        cellVertex[cidx(i, j, k)] = positions.length / 3;
        positions.push(px, py, pz);
      }
    }
  }

  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const inside = field[idx(i, j, k)] < 0;
        // x-edge (i,j,k)-(i+1,j,k): cells sharing it vary in j-1..j, k-1..k
        if (i < nx - 1 && inside !== field[idx(i + 1, j, k)] < 0) {
          quad(cellVertex[cidx(i, j - 1, k - 1)], cellVertex[cidx(i, j, k - 1)], cellVertex[cidx(i, j, k)], cellVertex[cidx(i, j - 1, k)], !inside);
        }
        if (j < ny - 1 && inside !== field[idx(i, j + 1, k)] < 0) {
          quad(cellVertex[cidx(i - 1, j, k - 1)], cellVertex[cidx(i - 1, j, k)], cellVertex[cidx(i, j, k)], cellVertex[cidx(i, j, k - 1)], !inside);
        }
        if (k < nz - 1 && inside !== field[idx(i, j, k + 1)] < 0) {
          quad(cellVertex[cidx(i - 1, j - 1, k)], cellVertex[cidx(i, j - 1, k)], cellVertex[cidx(i, j, k)], cellVertex[cidx(i - 1, j, k)], !inside);
        }
      }
    }
  }

  const normals = new Float32Array(positions.length);
  for (let v = 0; v < positions.length; v += 3) {
    const g = gradient(f, positions[v], positions[v + 1], positions[v + 2]);
    normals[v] = g[0];
    normals[v + 1] = g[1];
    normals[v + 2] = g[2];
  }
  return { positions: new Float32Array(positions), normals, indices: new Uint32Array(indices) };
}

/** Classic SDF ambient occlusion sampled along the normal. Returns 0..1 (1 = unoccluded). */
export function ambientOcclusion(scene: SDF, mesh: MeshData, strength = 1): Float32Array {
  const out = new Float32Array(mesh.positions.length / 3);
  for (let v = 0; v < out.length; v++) {
    const px = mesh.positions[v * 3], py = mesh.positions[v * 3 + 1], pz = mesh.positions[v * 3 + 2];
    const nx = mesh.normals[v * 3], ny = mesh.normals[v * 3 + 1], nz = mesh.normals[v * 3 + 2];
    let occ = 0;
    let weight = 1;
    for (let s = 1; s <= 5; s++) {
      const h = 0.006 * s;
      const d = scene(px + nx * h, py + ny * h, pz + nz * h);
      occ += (h - Math.max(d, 0)) * weight;
      weight *= 0.6;
    }
    // Ground contact darkening.
    const ground = clamp(py / 0.02, 0, 1);
    out[v] = clamp(1 - strength * 9 * occ, 0.25, 1) * mix(0.8, 1, ground);
  }
  return out;
}

/** Highest y where the SDF is inside, searching downward at (x, z). */
export function surfaceHeight(f: SDF, x: number, z: number, top = 0.8): number | null {
  let prevY = top;
  let prevD = f(x, top, z);
  for (let y = top; y > -0.05; y -= 0.003) {
    const d = f(x, y, z);
    if (d < 0 && prevD >= 0) {
      let lo = y, hi = prevY;
      for (let it = 0; it < 24; it++) {
        const mid = (lo + hi) / 2;
        if (f(x, mid, z) < 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prevY = y;
    prevD = d;
  }
  return null;
}
