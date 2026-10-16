// Plain data (no three.js import) so the homepage can read it without pulling
// the 3D bundle in before it is needed.

export interface HeroModel {
  url: string;
  /** Centre of the model in the composition (world units). */
  position: [number, number, number];
  /** Bounding-sphere radius the model is scaled to. */
  radius: number;
  /** Starting rotation (radians) so each product shows a flattering angle. */
  rotation?: [number, number, number];
}

/** A few products from different departments, arranged around a sneaker. */
export const DEFAULT_HERO_MODELS: HeroModel[] = [
  { url: '/models/velocity-runner-x.glb', position: [0, -0.2, 0.5], radius: 1.25, rotation: [0.12, -0.6, 0.05] },
  { url: '/models/orbit-over-ear-headphones.glb', position: [-1.5, 1.05, -0.3], radius: 0.85, rotation: [0.2, 0.5, -0.1] },
  { url: '/models/stride-smartwatch-2.glb', position: [1.5, 1.05, -0.2], radius: 0.7, rotation: [0.5, -0.35, 0.08] },
  { url: '/models/thermosteel-bottle-1l.glb', position: [-1.6, -1.0, 0], radius: 0.85, rotation: [0.05, 0.4, 0.12] },
  { url: '/models/pulse-wireless-earbuds.glb', position: [1.55, -1.0, 0.2], radius: 0.68, rotation: [0.45, -0.3, 0] },
];
