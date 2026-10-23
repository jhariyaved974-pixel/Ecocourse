'use client';

import * as React from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Float, PresentationControls } from '@react-three/drei';
import { FitCamera, ModelBoundary, StudioLights, useFittedModel, useInView } from './scene-kit';
import type { HeroModel } from './hero-models';

/**
 * Half-size of the square that holds the arrangement (each model stays within
 * its radius however it turns), used to frame the camera.
 */
function compositionRadius(models: HeroModel[]) {
  return Math.max(1, ...models.map((m) => Math.max(Math.abs(m.position[0]), Math.abs(m.position[1])) + m.radius));
}

function FloatingModel({ model, index, motion, onLoaded }: { model: HeroModel; index: number; motion: boolean; onLoaded: () => void }) {
  const { object } = useFittedModel(model.url, model.radius);
  const spin = React.useRef<THREE.Group>(null);
  // Alternate directions and speeds so the products never move in lockstep.
  const speed = (index % 2 === 0 ? 1 : -1) * (0.12 + (index % 3) * 0.05);

  React.useEffect(() => {
    onLoaded();
  }, [onLoaded]);

  useFrame((_, delta) => {
    if (motion && spin.current) spin.current.rotation.y += speed * delta;
  });

  const inner = (
    <group ref={spin}>
      <primitive object={object} />
    </group>
  );
  return (
    <group position={model.position} rotation={model.rotation}>
      {motion ? (
        <Float speed={1.1 + index * 0.18} rotationIntensity={0.25} floatIntensity={0.6} floatingRange={[-0.06, 0.08]}>
          {inner}
        </Float>
      ) : (
        inner
      )}
    </group>
  );
}

function Composition({ models, motion, scrollRef, onSettled }: { models: HeroModel[]; motion: boolean; scrollRef?: React.RefObject<number>; onSettled: (ok: boolean, index: number) => void }) {
  const group = React.useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!group.current) return;
    const scroll = scrollRef?.current ?? 0;
    const sway = motion ? Math.sin(state.clock.elapsedTime * 0.25) * 0.12 : 0;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, sway + scroll * 0.9, 3, delta);
  });
  return (
    <group ref={group}>
      {models.map((m, i) => (
        // Each product loads on its own: a missing or broken model leaves a gap, never a broken hero.
        <ModelBoundary key={m.url} onError={() => onSettled(false, i)}>
          <React.Suspense fallback={null}>
            <FloatingModel model={m} index={i} motion={motion} onLoaded={() => onSettled(true, i)} />
          </React.Suspense>
        </ModelBoundary>
      ))}
    </group>
  );
}

export interface HeroStageProps {
  models: HeroModel[];
  /** Floating, spinning and scroll-linked movement (off for reduced motion). */
  motion?: boolean;
  /** 0..1 scroll progress through the hero. */
  scrollRef?: React.RefObject<number>;
  /** Called once when the composition is worth showing (all models settled, or a few loaded). */
  onReady?: () => void;
  /** Called when no model could be loaded at all. */
  onFail?: () => void;
  className?: string;
}

/** Homepage 3D composition: several product models floating together. */
export function HeroStage({ models, motion = true, scrollRef, onReady, onFail, className }: HeroStageProps) {
  const wrapper = React.useRef<HTMLDivElement>(null);
  const visible = useInView(wrapper);
  const radius = React.useMemo(() => compositionRadius(models), [models]);
  const settled = React.useRef(new Map<number, boolean>());
  const announced = React.useRef(false);

  const onSettled = React.useCallback(
    (ok: boolean, index: number) => {
      if (settled.current.has(index)) return;
      settled.current.set(index, ok);
      const loaded = [...settled.current.values()].filter(Boolean).length;
      if (announced.current) return;
      if (settled.current.size === models.length) {
        announced.current = true;
        if (loaded > 0) onReady?.();
        else onFail?.();
      } else if (loaded >= Math.min(3, models.length)) {
        announced.current = true;
        onReady?.();
      }
    },
    [models.length, onReady, onFail],
  );

  return (
    <div ref={wrapper} className={className}>
      <Canvas
        dpr={[1, 1.5]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: [0, 0, 9], fov: 30 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping, powerPreference: 'high-performance' }}
        aria-hidden
      >
        <FitCamera radius={radius} margin={1.08} />
        <StudioLights dark />
        <PresentationControls global={false} cursor snap speed={1.2} zoom={1} polar={[-0.2, 0.3]} azimuth={[-0.9, 0.9]}>
          <Composition models={models} motion={motion} scrollRef={scrollRef} onSettled={onSettled} />
        </PresentationControls>
        <ContactShadows position={[0, -radius * 0.82, 0]} opacity={0.45} scale={radius * 2.6} blur={3} far={radius} resolution={256} color="#000000" />
      </Canvas>
    </div>
  );
}
