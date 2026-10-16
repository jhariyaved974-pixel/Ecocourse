'use client';

import * as React from 'react';
import Image, { type ImageProps } from 'next/image';

/**
 * next/image that swaps to `fallback` when the file cannot be loaded (a
 * deleted media asset, or site artwork that has not been uploaded yet), so a
 * tile never shows a broken-image icon.
 */
export function FallbackImage({ fallback = null, ...props }: ImageProps & { fallback?: React.ReactNode }) {
  const [failedSrc, setFailedSrc] = React.useState<ImageProps['src'] | null>(null);
  if (failedSrc === props.src) return <>{fallback}</>;
  // eslint-disable-next-line jsx-a11y/alt-text -- alt is passed through props
  return <Image {...props} onError={() => setFailedSrc(props.src)} />;
}
