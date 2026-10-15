'use client';

import * as React from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MediaPicker, type MediaPickerProps } from '@/components/admin/media-picker';
import type { MediaAssetSummary } from '@/lib/admin/types';
import { Thumb } from './thumb';

/** A single media asset chosen through the media library picker (category image, OG image, 3D model…). */
export function AssetField({
  label,
  value,
  onChange,
  kinds = ['image'],
  uploadFolder = 'products',
  hint,
  pickerTitle,
  error,
}: {
  label: string;
  value: MediaAssetSummary | null;
  onChange: (asset: MediaAssetSummary | null) => void;
  kinds?: MediaAssetSummary['kind'][];
  uploadFolder?: MediaPickerProps['uploadFolder'];
  hint?: React.ReactNode;
  pickerTitle?: string;
  error?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <fieldset className="space-y-1.5" aria-describedby={hint || error ? `${id}-hint` : undefined}>
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className="flex items-center gap-3">
        <Thumb url={value?.url ?? null} kind={value?.kind ?? 'image'} size={56} alt={value ? value.altText || value.label || label : ''} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink-2">{value ? value.label || value.altText || 'Selected file' : 'Nothing selected'}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
              <ImagePlus /> {value ? 'Replace' : 'Choose'}
            </Button>
            {value ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
                <X /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {error ? (
        <p id={`${id}-hint`} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        kinds={kinds}
        uploadFolder={uploadFolder}
        title={pickerTitle ?? label}
        onSelect={(assets) => {
          const asset = assets.find((a) => kinds.includes(a.kind));
          if (asset) onChange(asset);
          setOpen(false);
        }}
      />
    </fieldset>
  );
}
