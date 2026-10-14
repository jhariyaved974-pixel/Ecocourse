'use client';

import * as React from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Float, Lightformer, PresentationControls, useGLTF } from '@react-three/drei';

export interface ShoeStageProps {
  url: string;
  /** Hex colour applied to the material named "upper" (our models follow this convention). */
  tint?: string | null;
  autoRotate?: boolean;
  interactive?: boolean;
  dark?: boolean;
  /** 0..1 progress used to rotate the shoe while scrolling. */
  scrollRef?: React.RefObject<number>;
  onReady?: () => void;
  className?: string;
  cameraZ?: number;
}

function Model({ url, tint, autoRotate, scrollRef, onReady }: Pick<ShoeStageProps, 'url' | 'tint' | 'autoRotate' | 'scrollRef' | 'onReady'>) {
  const { scene } = useGLTF(url, false, true);
  const group = React.useRef<THREE.Group>(null);
  const model = React.useMemo(() => {
    const clone = scene.clone(true);
    // Centre and normalise size so any uploaded model frames consistently.
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const scale = 1.6 / Math.max(size.x, size.y, size.z);
    clone.position.set(-centre.x * scale, -box.min.y * scale - 0.35, -centre.z * scale);
    clone.scale.setScalar(scale);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.material = (o.material as THREE.Material).clone();
      }
    });
    return clone;
  }, [scene]);

  React.useEffect(() => {
    if (!tint) return;
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        if (m.name === 'upper' && m.color) m.color.set(tint);
      }
    });
  }, [model, tint]);

  React.useEffect(() => {
    onReady?.();
  }, [onReady]);

  useFrame((state, delta) => {
    if (!group.current) return;
    const scroll = scrollRef?.current ?? 0;
    const base = -0.55 + scroll * 1.4;
    if (autoRotate) {
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, base + Math.sin(state.clock.elapsedTime * 0.35) * 0.35, 3, delta);
    } else {
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, base, 4, delta);
    }
  });

  return (
    <group ref={group} rotation={[0.08, -0.55, 0.04]}>
      <primitive object={model} />
    </group>
  );
}

export function ShoeStage({ url, tint, autoRotate = true, interactive = true, dark = true, scrollRef, onReady, className, cameraZ = 3.1 }: ShoeStageProps) {
  const [visible, setVisible] = React.useState(true);
  const wrapper = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = wrapper.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const inner = (
    <Model url={url} tint={tint} autoRotate={autoRotate} scrollRef={scrollRef} onReady={onReady} />
  );

  return (
    <div ref={wrapper} className={className}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: [0, 0.35, cameraZ], fov: 32 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping, powerPreference: 'high-performance' }}
        aria-hidden
      >
        <ambientLight intensity={dark ? 0.15 : 0.4} />
        <directionalLight position={[-3, 5, 3]} intensity={dark ? 2.2 : 1.6} castShadow />
        <spotLight position={[3.5, 2.5, -2.5]} angle={0.5} penumbra={1} intensity={dark ? 60 : 20} color={dark ? '#f97316' : '#ffffff'} />
        <React.Suspense fallback={null}>
          <Float speed={autoRotate ? 1.4 : 0} rotationIntensity={autoRotate ? 0.15 : 0} floatIntensity={autoRotate ? 0.5 : 0} floatingRange={[-0.04, 0.06]}>
            {interactive ? (
              <PresentationControls global={false} cursor snap speed={1.4} zoom={1} polar={[-0.25, 0.35]} azimuth={[-Math.PI, Math.PI]}>
                {inner}
              </PresentationControls>
            ) : (
              inner
            )}
          </Float>
          <ContactShadows position={[0, -0.42, 0]} opacity={dark ? 0.7 : 0.4} scale={4} blur={2.6} far={1.4} resolution={512} color="#000000" />
          <Environment resolution={256}>
            <Lightformer form="rect" intensity={2.4} position={[0, 3, 2]} scale={[6, 2, 1]} />
            <Lightformer form="rect" intensity={1.2} position={[-4, 1, 0]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
            <Lightformer form="rect" intensity={1.2} position={[4, 1, 0]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
            <Lightformer form="ring" intensity={dark ? 1.5 : 0.6} color={dark ? '#fb923c' : '#ffffff'} position={[2, 2, -3]} scale={2} />
          </Environment>
        </React.Suspense>
      </Canvas>
    </div>
  );
}

