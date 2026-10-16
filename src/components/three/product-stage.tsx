'use client';

import * as React from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, PresentationControls } from '@react-three/drei';
import { FitCamera, StudioLights, useFittedModel, useInView, useTint } from './scene-kit';

export interface ProductStageProps {
  url: string;
  /** Hex colour applied to the material named "upper" (our models follow this convention). */
  tint?: string | null;
  autoRotate?: boolean;
  interactive?: boolean;
  dark?: boolean;
  onReady?: () => void;
  className?: string;
}

const FOV = 30;

function Scene({ url, tint, autoRotate, interactive, onReady }: Pick<ProductStageProps, 'url' | 'tint' | 'autoRotate' | 'interactive' | 'onReady'>) {
  const { object, halfHeight } = useFittedModel(url, 1);
  const group = React.useRef<THREE.Group>(null);
  useTint(object, tint);

  React.useEffect(() => {
    onReady?.();
  }, [onReady]);

  useFrame((state, delta) => {
    if (!group.current) return;
    const target = -0.55 + (autoRotate ? Math.sin(state.clock.elapsedTime * 0.35) * 0.35 : 0);
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, target, autoRotate ? 3 : 4, delta);
  });

  const model = (
    <group ref={group} rotation={[0.08, -0.55, 0]}>
      <primitive object={object} />
    </group>
  );

  return (
    <>
      {interactive ? (
        <PresentationControls global={false} cursor snap speed={1.4} zoom={1} polar={[-0.3, 0.4]} azimuth={[-Math.PI, Math.PI]}>
          {model}
        </PresentationControls>
      ) : (
        model
      )}
      {/* Outside the controls so the floor stays level while the model turns. */}
      <ContactShadows position={[0, -halfHeight - 0.04, 0]} opacity={0.35} scale={3.2} blur={2.6} far={1.2} resolution={512} color="#000000" />
    </>
  );
}

/** Interactive 3D view of one product model, framed from the model's own bounds. */
export function ProductStage({ url, tint, autoRotate = false, interactive = true, dark = false, onReady, className }: ProductStageProps) {
  const wrapper = React.useRef<HTMLDivElement>(null);
  const visible = useInView(wrapper);
  return (
    <div ref={wrapper} className={className}>
      <Canvas
        dpr={[1, 1.75]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: [0, 0.3, 4], fov: FOV }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping, powerPreference: 'high-performance' }}
        aria-hidden
      >
        <FitCamera radius={1} height={0.3} margin={1.05} />
        <StudioLights dark={dark} />
        <React.Suspense fallback={null}>
          <Scene url={url} tint={tint} autoRotate={autoRotate} interactive={interactive} onReady={onReady} />
        </React.Suspense>
      </Canvas>
    </div>
  );
}
