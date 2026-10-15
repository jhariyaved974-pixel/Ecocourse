import Image from 'next/image';
import { Box, ImageOff, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Small square preview for a media asset (images rendered, other kinds shown as an icon). */
export function Thumb({
  url,
  kind = 'image',
  alt = '',
  size = 40,
  className,
}: {
  url: string | null;
  kind?: 'image' | 'video' | 'model';
  alt?: string;
  size?: number;
  className?: string;
}) {
  const box = cn('relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2 text-muted', className);
  if (!url || kind !== 'image') {
    const Icon = !url ? ImageOff : kind === 'video' ? Video : Box;
    return (
      <span className={box} style={{ width: size, height: size }} aria-hidden={alt ? undefined : true}>
        <Icon className="size-4" />
        {alt ? <span className="sr-only">{alt}</span> : null}
      </span>
    );
  }
  return (
    <span className={box} style={{ width: size, height: size }}>
      <Image src={url} alt={alt} fill sizes={`${size}px`} className="object-cover" unoptimized />
    </span>
  );
}
