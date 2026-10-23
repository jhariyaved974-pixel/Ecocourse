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

/** The 3D hero shows the model chosen in the CMS, centred. */
export const heroModelsFor = (url: string): HeroModel[] => [{ url, position: [0, 0, 0], radius: 1.6, rotation: [0.12, -0.6, 0.05] }];
