// Shared helpers for procedural product models (scripts/render/items/*).
// Conventions for every builder:
//   - Real-world scale in METRES (e.g. a 1 L bottle is ~0.28 m tall).
//   - The model rests on the ground plane (min y = 0) and is roughly centred on x/z.
//   - Front of the product faces +z; the 'hero34' camera looks from +x/+z.
//   - Every mesh casts shadows (use mesh() below) and uses MeshPhysicalMaterial /
//     MeshStandardMaterial only, so it exports cleanly to glTF.
//   - No textures loaded from disk; use CanvasTexture for printed details if needed.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ItemColorway } from '../catalog';

export type Builder = (c: ItemColorway) => THREE.Group;

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name?: string) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

export const mat = {
  plastic: (color: string, roughness = 0.45) => new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  matte: (color: string, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }),
  metal: (color: string, roughness = 0.3) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 1 }),
  glossy: (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
  fabric: (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35) }),
  ceramic: (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
  glass: (color: string, opacity = 0.55) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0, transmission: 0.6, thickness: 0.01, transparent: true, opacity }),
  rubber: (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }),
  emissive: (color: string, intensity = 1.2) => new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4 }),
};

export function roundedBox(w: number, h: number, d: number, radius: number, segments = 5) {
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, w / 2, h / 2, d / 2));
}

/** Revolves a profile [radius, height][] around the y axis (bottles, mugs, jars, shades). */
export function lathe(profile: [number, number][], segments = 64) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Puts a finished model on the ground, centred on x/z. */
export function grounded(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  group.position.x -= c.x;
  group.position.z -= c.z;
  group.position.y -= box.min.y;
  const wrapper = new THREE.Group();
  wrapper.add(group);
  return wrapper;
}

/** Placeholder used until a real builder exists: a labelled rounded box. */
export function placeholder(c: ItemColorway, size: [number, number, number] = [0.16, 0.16, 0.16]) {
  const g = new THREE.Group();
  const m = mesh(roundedBox(size[0], size[1], size[2], 0.02), mat.plastic(c.primary));
  m.position.y = size[1] / 2;
  g.add(m);
  return grounded(g);
}
