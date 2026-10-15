import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  CircleGeometry,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TorusKnotGeometry,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type Palette = { bg: string; surface: string; text: string; muted: string; primary: string; onPrimary: string; accent: string };
type SceneData = { mode: "floating-cards" | "product-spin" | "orbits" | "terrain" | "none"; palette: Palette; model: string | null };
type Tick = (t: number, dt: number) => void;

/**
 * Lightweight hero scenes. Rendering pauses when off-screen or when the tab is hidden, pixel ratio is
 * capped, and any WebGL failure leaves the CSS fallback visible.
 */
export function mount(el: HTMLElement, data: SceneData, onReady: () => void, onFail: () => void) {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    onFail();
    return;
  }
  const p = data.palette;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  el.appendChild(renderer.domElement);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 9);
  scene.add(new HemisphereLight(new Color(p.surface), new Color(p.bg), 1.2));
  const key = new DirectionalLight(new Color("#ffffff"), 2.2);
  key.position.set(4, 6, 5);
  scene.add(key);
  const rim = new DirectionalLight(new Color(p.accent), 1.4);
  rim.position.set(-5, -2, -4);
  scene.add(rim);

  const root = new Group();
  scene.add(root);
  const ticks: Tick[] = [];
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const drag = { active: false, lastX: 0, velocity: 0, rotation: 0 };

  const build = { "floating-cards": floatingCards, "product-spin": productSpin, orbits, terrain, none: () => undefined }[data.mode] ?? floatingCards;
  build(root, p, ticks, data, drag);

  const resize = () => {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 0.9 ? 12 : 9;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  const onPointer = (e: PointerEvent) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    if (drag.active) {
      drag.velocity = (e.clientX - drag.lastX) * 0.006;
      drag.lastX = e.clientX;
    }
  };
  window.addEventListener("pointermove", onPointer, { passive: true });
  if (data.mode === "product-spin") {
    el.style.pointerEvents = "auto";
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", (e) => {
      drag.active = true;
      drag.lastX = e.clientX;
      el.style.cursor = "grabbing";
    });
    window.addEventListener("pointerup", () => {
      drag.active = false;
      el.style.cursor = "grab";
    });
  }

  let visible = true;
  const io = new IntersectionObserver((entries) => (visible = entries.some((e) => e.isIntersecting)));
  io.observe(el);

  const clock = new Clock();
  let first = true;
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    onFail();
  });

  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden) {
      clock.getDelta();
      return;
    }
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    // Smooth camera drift that follows the pointer and the scroll position.
    const scroll = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1);
    camera.position.x = pointer.x * 0.8;
    camera.position.y = -pointer.y * 0.5 - scroll * 0.8;
    camera.lookAt(new Vector3(0, -scroll * 0.4, 0));
    for (const tick of ticks) tick(t, dt);
    renderer.render(scene, camera);
    if (first) {
      first = false;
      onReady();
    }
  });

  window.addEventListener("pagehide", () => {
    renderer.setAnimationLoop(null);
    ro.disconnect();
    io.disconnect();
    renderer.dispose();
    pmrem.dispose();
  });
}

const physical = (color: string, extra: Partial<ConstructorParameters<typeof MeshPhysicalMaterial>[0]> = {}) =>
  new MeshPhysicalMaterial({ color: new Color(color), roughness: 0.28, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15, ...extra });

function floatingCards(root: Group, p: Palette, ticks: Tick[]) {
  const colors = [p.primary, p.accent, p.surface, p.primary, p.surface, p.accent, p.primary];
  const geo = new RoundedBoxGeometry(1.7, 1.1, 0.08, 4, 0.1);
  const cards: { m: Mesh; base: Vector3; phase: number; spin: number }[] = [];
  colors.forEach((c, i) => {
    const m = new Mesh(geo, physical(c, { metalness: i % 3 === 0 ? 0.35 : 0.05 }));
    const angle = (i / colors.length) * Math.PI * 2;
    const base = new Vector3(Math.cos(angle) * 2.8, Math.sin(angle * 1.3) * 1.6, -1 - (i % 3) * 1.4);
    m.position.copy(base);
    m.rotation.set(Math.random() * 0.6 - 0.3, Math.random() * 0.8 - 0.4, Math.random() * 0.4 - 0.2);
    root.add(m);
    cards.push({ m, base, phase: i * 0.9, spin: 0.1 + Math.random() * 0.15 });
  });
  ticks.push((t) => {
    root.rotation.y = Math.sin(t * 0.15) * 0.25;
    for (const c of cards) {
      c.m.position.y = c.base.y + Math.sin(t * 0.8 + c.phase) * 0.18;
      c.m.rotation.y += 0.002 * c.spin * 10;
      c.m.rotation.x = Math.sin(t * 0.5 + c.phase) * 0.15;
    }
  });
}

function softShadow(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, color);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  const m = new Mesh(new CircleGeometry(2.2, 48), new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

function productSpin(root: Group, p: Palette, ticks: Tick[], data: SceneData, drag: { active: boolean; velocity: number; rotation: number }) {
  const holder = new Group();
  root.add(holder);
  const shadow = softShadow("rgba(0,0,0,0.6)");
  shadow.position.y = -1.6;
  root.add(shadow);

  const fallbackProduct = () => {
    const knot = new Mesh(new TorusKnotGeometry(0.9, 0.32, 180, 24), physical(p.primary, { metalness: 0.4, roughness: 0.2 }));
    holder.add(knot);
  };
  if (data.model) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      data.model,
      (gltf) => {
        const obj: Object3D = gltf.scene;
        const bounds = new Box3().setFromObject(obj);
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        const scale = 3.2 / Math.max(size.x, size.y, size.z, 0.001);
        obj.scale.setScalar(scale);
        obj.position.copy(center).multiplyScalar(-scale);
        holder.add(obj);
      },
      undefined,
      fallbackProduct,
    );
  } else fallbackProduct();

  const rings = [p.accent, p.surface].map((c, i) => {
    const r = new Mesh(new TorusGeometry(2.3 + i * 0.5, 0.015, 8, 160), new MeshBasicMaterial({ color: new Color(c), transparent: true, opacity: 0.45 }));
    r.rotation.x = Math.PI / 2.2;
    root.add(r);
    return r;
  });
  ticks.push((t, dt) => {
    if (!drag.active) drag.velocity *= 0.95;
    drag.rotation += drag.velocity + (drag.active ? 0 : dt * 0.45);
    holder.rotation.y = drag.rotation;
    holder.position.y = Math.sin(t * 1.1) * 0.12;
    rings.forEach((r, i) => (r.rotation.z = t * (0.1 + i * 0.05)));
  });
}

function orbits(root: Group, p: Palette, ticks: Tick[]) {
  const core = new Mesh(new IcosahedronGeometry(1.1, 5), physical(p.primary, { roughness: 0.15, metalness: 0.2 }));
  root.add(core);
  const orbiters: { m: Mesh; ring: Group; speed: number; radius: number }[] = [];
  [p.accent, p.surface, p.primary].forEach((c, i) => {
    const ring = new Group();
    ring.rotation.set(Math.PI / 2.4 + i * 0.5, i * 0.7, 0);
    const radius = 2 + i * 0.75;
    ring.add(new Mesh(new TorusGeometry(radius, 0.012, 8, 200), new MeshBasicMaterial({ color: new Color(c), transparent: true, opacity: 0.5 })));
    const m = new Mesh(new SphereGeometry(0.16 + i * 0.04, 32, 32), physical(c));
    ring.add(m);
    root.add(ring);
    orbiters.push({ m, ring, speed: 0.5 - i * 0.12, radius });
  });
  root.position.x = 0.5;
  ticks.push((t) => {
    core.rotation.y = t * 0.2;
    core.scale.setScalar(1 + Math.sin(t * 1.4) * 0.02);
    for (const o of orbiters) o.m.position.set(Math.cos(t * o.speed) * o.radius, Math.sin(t * o.speed) * o.radius, 0);
  });
}

function terrain(root: Group, p: Palette, ticks: Tick[]) {
  const geo = new PlaneGeometry(16, 16, 80, 80);
  const mat = new MeshStandardMaterial({ color: new Color(p.primary), roughness: 0.85, flatShading: true });
  const plane = new Mesh(geo, mat);
  plane.rotation.x = -Math.PI / 2.3;
  plane.position.y = -2.2;
  root.add(plane);
  const sun = new Mesh(new SphereGeometry(0.9, 48, 48), new MeshBasicMaterial({ color: new Color(p.accent) }));
  sun.position.set(2.6, 1.4, -6);
  root.add(sun);
  root.parent && ((root.parent as Scene).fog = new Fog(new Color(p.bg), 8, 20));
  const pos = geo.attributes.position!;
  const base = Float32Array.from(pos.array as Float32Array);
  ticks.push((t) => {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!;
      const y = base[i * 3 + 1]!;
      pos.setZ(i, Math.sin(x * 0.6 + t * 0.6) * 0.35 + Math.cos(y * 0.5 + t * 0.4) * 0.35 + Math.sin((x + y) * 0.3) * 0.4);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    sun.position.y = 1.4 + Math.sin(t * 0.3) * 0.2;
  });
}
