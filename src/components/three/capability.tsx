'use client';

import * as React from 'react';

let cached: boolean | null = null;
const noopSubscribe = () => () => {};

/** True when the device can comfortably render the 3D scene (evaluated once). */
export function canRender3D(): boolean {
  if (typeof window === 'undefined') return false;
  if (cached === null) cached = detect();
  return cached;
}

/** Hydration-safe hook: false on the server and first paint, then the real capability. */
export function useCanRender3D(): boolean {
  return React.useSyncExternalStore(noopSubscribe, canRender3D, () => false);
}

function detect(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if (nav.connection?.effectiveType && /(^|-)2g$/.test(nav.connection.effectiveType)) return false;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 3) return false;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency < 4) return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

export class StageErrorBoundary extends React.Component<{ children: React.ReactNode; onError?: () => void }, { failed: boolean }> {
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
