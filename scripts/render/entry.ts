// Browser entry for asset generation. Bundled by scripts/render/run.mjs and
// executed in headless Chromium; exposes window.runJob for the Node driver.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildShoe, type Colorway } from './build-shoe';
import type { Silhouette } from './shoe-designs';
import type { ItemColorway, ItemModel } from './catalog';
import { ITEM_BUILDERS } from './items';

type View = 'hero34' | 'side' | 'top' | 'back34' | 'float' | 'detail';

/** What to build: a procedural shoe or a procedural product (scripts/render/items). */
export type Subject =
  | { type: 'shoe'; silhouette: Silhouette; colorway: Colorway }
  | { type: 'item'; model: ItemModel; colorway: ItemColorway };

export type Job =
  | { kind: 'glb'; subject: Subject }
  | {
      kind: 'photo';
      subject: Subject;
      view: View;
      width: number;
      height: number;
      background: string;
      floor?: string;
      dark?: boolean;
    }
  | {
      kind: 'scene';
      width: number;
      height: number;
      background: string;
      dark?: boolean;
      items: {
        subject: Subject;
        position: [number, number, number];
        rotation: [number, number, number];
        scale?: number;
        /** false: no soft contact shadow under this item (it still casts a shadow-map shadow). */
        shadow?: boolean;
        /**
         * Centre the item on `position` and scale it so its bounding sphere has this
         * radius (like the homepage 3D hero, src/components/three/hero-stage.tsx);
         * `scale` then multiplies that.
         */
        fitRadius?: number;
      }[];
      camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
      accentLight?: string;
      fill?: number;
      /** Fraction of the half-frame to move the subject right (negative: left). */
      offsetX?: number;
      /** Fraction of the half-frame to move the subject up (negative: down). */
      offsetY?: number;
      /** Put every contact shadow on the floor (y = 0), fading with height, for floating compositions. */
      groundShadows?: boolean;
      /** Soft radial glow painted into the backdrop behind the subject (CSS colour). */
      glow?: string;
    };

// Scene jobs reuse built subjects (several site images share products), cloned
// so each scene gets its own transform; geometry and materials are shared.
const subjectCache = new Map<string, THREE.Group>();
function cachedSubject(subject: Subject): THREE.Group {
  const key = JSON.stringify(subject);
  let g = subjectCache.get(key);
  if (!g) {
    g = buildSubject(subject);
    subjectCache.set(key, g);
  }
  return g.clone();
}

function buildSubject(subject: Subject): THREE.Group {
  if (subject.type === 'shoe') return buildShoe(subject.silhouette, subject.colorway).group;
  const builder = ITEM_BUILDERS[subject.model];
  if (!builder) throw new Error(`No builder for item model ${subject.model}`);
  return builder(subject.colorway);
}

let renderer: THREE.WebGLRenderer | null = null;
let envTexture: THREE.Texture | null = null;

function getRenderer(width: number, height: number) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  return renderer;
}

function contactShadowTexture(dark: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  grad.addColorStop(0, `rgba(0,0,0,${dark ? 0.75 : 0.42})`);
  grad.addColorStop(0.45, `rgba(0,0,0,${dark ? 0.35 : 0.18})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function studio(background: string, dark = false, accent?: string) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.environment = envTexture;
  scene.environmentIntensity = dark ? 0.45 : 0.85;

  const key = new THREE.DirectionalLight('#ffffff', dark ? 2.6 : 2.1);
  key.position.set(-1.6, 3.2, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 14;
  key.shadow.blurSamples = 24;
  key.shadow.bias = -0.0004;
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = -1.2; sc.right = 1.2; sc.top = 1.2; sc.bottom = -1.2; sc.near = 0.5; sc.far = 8;
  scene.add(key);

  const fill = new THREE.HemisphereLight('#fff7ed', dark ? '#0b0b0f' : '#d6d3d1', dark ? 0.35 : 0.75);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(accent ?? '#ffffff', dark ? 3.2 : 1.1);
  rim.position.set(2.4, 1.4, -2.6);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.ShadowMaterial({ opacity: dark ? 0.55 : 0.22, color: new THREE.Color('#000000') }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return scene;
}

function addContactShadow(scene: THREE.Scene, obj: THREE.Object3D, dark: boolean, onGround = false) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  // Floating objects (onGround): the blob sits on the floor, grows and fades with height.
  const lift = onGround ? Math.max(0, box.min.y) / Math.max(size.x, size.z, 0.05) : 0;
  const spread = 1 + lift * 0.6;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 1.25 * spread, size.z * 1.6 * spread),
    new THREE.MeshBasicMaterial({
      map: contactShadowTexture(dark), transparent: true, depthWrite: false,
      opacity: onGround ? Math.max(0.3, 1 / (1 + lift * 1.4)) : 1,
    }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(centre.x, onGround ? 0.0005 : Math.max(0.0005, box.min.y - 0.0005), centre.z);
  plane.renderOrder = -1;
  scene.add(plane);
}

/** Flat backdrop with a soft radial glow, centred where the subject sits. */
function glowBackdrop(background: string, glow: string, aspect: number, offsetX: number) {
  const c = document.createElement('canvas');
  c.height = 512;
  c.width = Math.round(512 * aspect);
  const g = c.getContext('2d')!;
  g.fillStyle = background;
  g.fillRect(0, 0, c.width, c.height);
  const cx = c.width * (0.5 + offsetX / 2);
  const grad = g.createRadialGradient(cx, c.height * 0.42, 0, cx, c.height * 0.42, c.height * 0.75);
  const rgb = new THREE.Color(glow).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const rgba = (a: number) => `rgba(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)},${a})`;
  grad.addColorStop(0, rgba(0.22));
  grad.addColorStop(0.5, rgba(0.07));
  grad.addColorStop(1, rgba(0));
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VIEWS: Record<View, { position: [number, number, number]; target: [number, number, number]; fov: number }> = {
  hero34: { position: [1.55, 0.95, 1.85], target: [0.0, 0.1, 0], fov: 24 },
  side: { position: [0.02, 0.22, 3.0], target: [0.01, 0.13, 0], fov: 24 },
  top: { position: [0.45, 2.7, 0.9], target: [0.0, 0.05, 0], fov: 23 },
  back34: { position: [-1.7, 0.85, 1.6], target: [-0.02, 0.12, 0], fov: 24 },
  float: { position: [1.2, 0.6, 2.2], target: [0, 0.32, 0], fov: 26 },
  detail: { position: [0.9, 0.5, 0.95], target: [0.12, 0.12, 0.05], fov: 22 },
};

function fitCamera(camera: THREE.PerspectiveCamera, obj: THREE.Object3D, target: THREE.Vector3, fill: number, parts?: THREE.Object3D[]) {
  // Binary-search the camera distance so the projected bounding box fills the
  // frame, then re-centre the projected box. With `parts`, each part's own box
  // is projected (a tighter fit for spread-out compositions).
  const corners: THREE.Vector3[] = [];
  for (const o of parts ?? [obj]) {
    const box = new THREE.Box3().setFromObject(o);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  }
  const dir = camera.position.clone().sub(target).normalize();
  const project = () => {
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      const p = c.clone().project(camera);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return { minX, maxX, minY, maxY };
  };
  for (let pass = 0; pass < 3; pass++) {
    let lo = 0.2, hi = 30;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      camera.position.copy(target).addScaledVector(dir, mid);
      const b = project();
      if (Math.max(-b.minX, b.maxX, -b.minY, b.maxY) > fill) lo = mid;
      else hi = mid;
    }
    camera.position.copy(target).addScaledVector(dir, hi);
    const b = project();
    // Shift target/camera so the projected box is centred.
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const dist = camera.position.distanceTo(target);
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
    const halfW = halfH * camera.aspect;
    const shift = right.multiplyScalar(((b.minX + b.maxX) / 2) * halfW).add(up.multiplyScalar(((b.minY + b.maxY) / 2) * halfH));
    target.add(shift);
    camera.position.add(shift);
  }
  camera.lookAt(target);
}

function vignette(canvas: HTMLCanvasElement, dark: boolean) {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const g = out.getContext('2d')!;
  g.drawImage(canvas, 0, 0);
  const grad = g.createRadialGradient(out.width / 2, out.height * 0.45, out.width * 0.2, out.width / 2, out.height / 2, out.width * 0.85);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, dark ? 'rgba(0,0,0,0.55)' : 'rgba(60,50,40,0.10)');
  g.fillStyle = grad;
  g.fillRect(0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

async function exportGlb(subject: Subject): Promise<string> {
  const group = buildSubject(subject);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(group, { binary: true, onlyVisible: true });
  const bytes = new Uint8Array(result as ArrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function runJob(job: Job): Promise<string> {
  if (job.kind === 'glb') return exportGlb(job.subject);

  const r = getRenderer(job.width, job.height);
  const scene = studio(job.background, job.dark, job.kind === 'scene' ? job.accentLight : undefined);
  const camera = new THREE.PerspectiveCamera(24, job.width / job.height, 0.05, 50);

  if (job.kind === 'photo') {
    const group = buildSubject(job.subject);
    // Centre the subject on the origin (x/z) so framing is consistent across silhouettes.
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    group.position.x -= c.x;
    group.position.z -= c.z;
    if (job.view === 'float') {
      group.position.y += 0.22;
      group.rotation.set(0.12, -0.35, 0.16);
    }
    scene.add(group);
    addContactShadow(scene, group, Boolean(job.dark));
    const v = VIEWS[job.view];
    camera.fov = v.fov;
    camera.position.set(...v.position);
    const target = new THREE.Vector3(...v.target);
    const fitted = new THREE.Box3().setFromObject(group);
    target.y = (fitted.min.y + fitted.max.y) / 2 + (job.view === 'top' ? 0 : -0.01);
    camera.updateProjectionMatrix();
    fitCamera(camera, group, target, job.view === 'detail' ? 1.4 : job.view === 'side' ? 0.86 : 0.8);
  } else {
    if (job.groundShadows) {
      // Floating products: their cast shadows land far below, so keep them faint.
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.ShadowMaterial) o.material.opacity *= 0.5;
      });
    }
    if (job.glow) scene.background = glowBackdrop(job.background, job.glow, job.width / job.height, job.offsetX ?? 0);
    const all = new THREE.Group();
    const shadowed: THREE.Object3D[] = [];
    for (const s of job.items) {
      let group = cachedSubject(s.subject);
      if (s.fitRadius) {
        const box = new THREE.Box3().setFromObject(group);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const k = sphere.radius > 0 ? s.fitRadius / sphere.radius : 1;
        const centre = box.getCenter(new THREE.Vector3());
        group.position.set(-centre.x * k, -centre.y * k, -centre.z * k);
        group.scale.setScalar(k);
        const wrapper = new THREE.Group();
        wrapper.add(group);
        group = wrapper;
      }
      group.position.set(...s.position);
      group.rotation.set(...s.rotation);
      group.scale.setScalar(s.scale ?? 1);
      all.add(group);
      if (s.shadow !== false) shadowed.push(group);
    }
    scene.add(all);
    all.updateMatrixWorld(true);
    for (const child of shadowed) addContactShadow(scene, child, Boolean(job.dark), Boolean(job.groundShadows));
    camera.fov = job.camera.fov;
    camera.position.set(...job.camera.position);
    const target = new THREE.Vector3(...job.camera.target);
    if (job.fill) {
      fitCamera(camera, all, target, job.fill, all.children);
      if (job.offsetX || job.offsetY) {
        // Shift the subject sideways / vertically (e.g. to leave room for copy).
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const dist = camera.position.distanceTo(target);
        const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
        const halfW = halfH * camera.aspect;
        const shift = right.multiplyScalar(-(job.offsetX ?? 0) * halfW).add(up.multiplyScalar(-(job.offsetY ?? 0) * halfH));
        camera.position.add(shift);
        target.add(shift);
      }
    }
    camera.lookAt(target);
  }
  camera.updateProjectionMatrix();
  r.render(scene, camera);
  return vignette(r.domElement, Boolean(job.dark));
}

declare global {
  interface Window {
    runJob: (job: Job) => Promise<string>;
    ready: boolean;
  }
}
window.runJob = runJob;
window.ready = true;
