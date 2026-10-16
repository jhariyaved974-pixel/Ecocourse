'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Environment, Lightformer, useGLTF } from '@react-three/drei';

// Shared pieces of the product viewer and the homepage composition. Models
// are framed from their own bounds, so any product GLB (a shoe, a bottle, a
// pair of headphones) sits centred and fills the view the same way.

/**
 * Loads a GLB (meshopt-compressed models are supported) and returns a copy
 * centred on the origin and scaled so its bounding sphere has `radius`.
 * Materials are cloned so tinting one instance never affects another.
 */
export function useFittedModel(url: string, radius = 1) {
  const { scene } = useGLTF(url, false, true);
  return React.useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const scale = sphere.radius > 0 ? radius / sphere.radius : 1;
    const centre = box.getCenter(new THREE.Vector3());
    clone.position.set(-centre.x * scale, -centre.y * scale, -centre.z * scale);
    clone.scale.setScalar(scale);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : (o.material as THREE.Material).clone();
      }
    });
    const size = box.getSize(new THREE.Vector3()).multiplyScalar(scale);
    return { object: clone, halfHeight: size.y / 2 };
  }, [scene, radius]);
}

/** Recolours the material named "upper" (the convention used by our product models). */
export function useTint(object: THREE.Object3D, tint: string | null | undefined) {
  React.useEffect(() => {
    if (!tint) return;
    object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const mat = m as THREE.MeshStandardMaterial;
          if (mat.name === 'upper' && mat.color) mat.color.set(tint);
        }
      }
    });
  }, [object, tint]);
}

/** Camera distance at which a sphere of `radius` fits the view (both axes), with a margin. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = 1.08) {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  return (radius / Math.sin(Math.min(vFov, hFov) / 2)) * margin;
}

/** Keeps the camera far enough back for `radius` to fit, also when the canvas is resized. */
export function FitCamera({ radius, height = 0, margin }: { radius: number; height?: number; margin?: number }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const heightPx = useThree((s) => s.size.height);
  React.useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !heightPx) return;
    const distance = fitDistance(radius, camera.fov, width / heightPx, margin);
    camera.position.set(0, height, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, width, heightPx, radius, height, margin]);
  return null;
}

/** Soft studio lighting with a reflection environment (no HDR download). */
export function StudioLights({ dark }: { dark: boolean }) {
  return (
    <>
      <ambientLight intensity={dark ? 0.25 : 0.45} />
      <directionalLight position={[-3, 5, 3]} intensity={dark ? 2 : 1.6} />
      <spotLight position={[3.5, 2.5, -2.5]} angle={0.5} penumbra={1} intensity={dark ? 40 : 18} color={dark ? '#86efac' : '#ffffff'} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.4} position={[0, 3, 2]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-4, 1, 0]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[4, 1, 0]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="ring" intensity={dark ? 1.2 : 0.6} color={dark ? '#4ade80' : '#ffffff'} position={[2, 2, -3]} scale={2} />
      </Environment>
    </>
  );
}

/** True while the element is (nearly) on screen; used to stop rendering offscreen canvases. */
export function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

/** Error boundary for a single model inside a canvas: a missing or broken GLB renders nothing. */
export class ModelBoundary extends React.Component<{ children: React.ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
