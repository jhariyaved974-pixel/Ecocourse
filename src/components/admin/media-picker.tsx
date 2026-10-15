'use client';

// CONTRACT (implemented by the media-library work): a dialog that lets staff
// choose existing assets from the media library or upload new ones, then
// returns the chosen assets. Editors (products, homepage, collections) import
// this component; keep the props stable.

import type { MediaAssetSummary } from '@/lib/admin/types';

export interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen assets when the user confirms. */
  onSelect: (assets: MediaAssetSummary[]) => void;
  /** Allow choosing several assets at once (default false). */
  multiple?: boolean;
  /** Restrict to these kinds (default: all). */
  kinds?: MediaAssetSummary['kind'][];
  /** Storage folder for new uploads, e.g. 'products' | 'content' | 'brand' | 'models' | 'library'. */
  uploadFolder?: 'products' | 'content' | 'brand' | 'models' | 'library';
  title?: string;
}

export function MediaPicker(props: MediaPickerProps) {
  void props;
  return null;
}
