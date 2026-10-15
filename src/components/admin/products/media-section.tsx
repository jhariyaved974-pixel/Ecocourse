'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Input, NativeSelect } from '@/components/ui/form-controls';
import { MediaPicker } from '@/components/admin/media-picker';
import { Panel } from '@/components/admin/ui';
import { Thumb } from '@/components/admin/catalog/thumb';
import { moveItem } from '@/components/admin/catalog/list-utils';
import type { ProductFormMedia, ProductFormState } from '@/lib/admin/products';
import { cn } from '@/lib/utils';

type SetForm = React.Dispatch<React.SetStateAction<ProductFormState>>;

export function MediaSection({ form, setForm, errors }: { form: ProductFormState; setForm: SetForm; errors: Record<string, string> }) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const media = form.media;

  const updateMedia = (fn: (media: ProductFormMedia[]) => ProductFormMedia[]) => setForm((f) => ({ ...f, media: fn(f.media) }));
  const patch = (index: number, value: Partial<ProductFormMedia>) =>
    updateMedia((list) => list.map((m, i) => (i === index ? { ...m, ...value } : m)));
  const setCover = (index: number) => updateMedia((list) => list.map((m, i) => ({ ...m, isCover: i === index })));
  const remove = (index: number) =>
    updateMedia((list) => {
      const next = list.filter((_, i) => i !== index);
      if (list[index]?.isCover) {
        const firstImage = next.findIndex((m) => m.kind === 'image');
        return next.map((m, i) => ({ ...m, isCover: i === firstImage }));
      }
      return next;
    });

  return (
    <Panel
      title="Media"
      description="Images and videos shown in the gallery. Assign images to a colour so the gallery switches with the colour picker. Publishing needs at least one image."
      actions={
        <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
          <ImagePlus /> Add media
        </Button>
      }
    >
      {media.length === 0 ? (
        <EmptyState
          className="py-10"
          icon={<ImagePlus className="size-5" />}
          title="No media yet"
          description="Choose images or videos from the media library, or upload new ones."
          action={
            <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
              Choose media
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Product media">
          {media.map((m, i) => {
            const error = errors[`media.${i}.colorKey`] ?? errors[`media.${i}.assetId`] ?? errors[`media.${i}.altText`];
            return (
              <li key={m.assetId} className={cn('rounded-xl border bg-paper p-3', m.isCover ? 'border-ink' : 'border-line')}>
                <div className="flex gap-3">
                  <Thumb url={m.url} kind={m.kind} size={64} alt={m.altText || m.assetAlt || m.label || ''} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-muted tabular-nums">#{i + 1}</span>
                      {m.kind !== 'image' ? <Badge tone="info">{m.kind}</Badge> : null}
                      {m.isCover ? <Badge tone="dark">Cover</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-ink-2" title={m.label ?? undefined}>
                      {m.label || m.assetAlt || 'Untitled asset'}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 border-t border-line pt-2">
                  {m.kind === 'image' ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant={m.isCover ? 'primary' : 'ghost'}
                      aria-pressed={m.isCover}
                      aria-label={m.isCover ? 'Cover image' : `Use media ${i + 1} as cover`}
                      title={m.isCover ? 'Cover image' : 'Use as cover'}
                      onClick={() => setCover(i)}
                    >
                      <Star />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move media ${i + 1} earlier`}
                    disabled={i === 0}
                    onClick={() => updateMedia((list) => moveItem(list, i, i - 1))}
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move media ${i + 1} later`}
                    disabled={i === media.length - 1}
                    onClick={() => updateMedia((list) => moveItem(list, i, i + 1))}
                  >
                    <ArrowRight />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Remove media ${i + 1}`} onClick={() => remove(i)}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-medium text-ink-2" htmlFor={`media-color-${i}`}>
                    Colour
                  </label>
                  <NativeSelect
                    id={`media-color-${i}`}
                    className="h-9 text-xs"
                    value={m.colorKey ?? ''}
                    onChange={(e) => patch(i, { colorKey: e.target.value || null })}
                    disabled={form.colors.length === 0}
                  >
                    <option value="">All colours</option>
                    {form.colors.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name || 'Unnamed colour'}
                      </option>
                    ))}
                  </NativeSelect>
                  <label className="block text-xs font-medium text-ink-2" htmlFor={`media-alt-${i}`}>
                    Alt text
                  </label>
                  <Input
                    id={`media-alt-${i}`}
                    className="h-9 text-xs"
                    value={m.altText}
                    maxLength={300}
                    placeholder={m.assetAlt || 'Describe the image for screen readers'}
                    onChange={(e) => patch(i, { altText: e.target.value })}
                  />
                  {!m.altText && !m.assetAlt && m.kind === 'image' ? <p className="text-[11px] text-warning">No alt text: the product name will be used.</p> : null}
                  {error ? (
                    <p className="text-xs font-medium text-danger" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple
        kinds={['image', 'video']}
        uploadFolder="products"
        title="Add product media"
        onSelect={(assets) => {
          updateMedia((list) => {
            const existing = new Set(list.map((m) => m.assetId));
            const added: ProductFormMedia[] = assets
              .filter((a) => (a.kind === 'image' || a.kind === 'video') && !existing.has(a.id))
              .map((a) => ({
                assetId: a.id,
                kind: a.kind,
                url: a.url,
                label: a.label,
                assetAlt: a.altText,
                altText: '',
                colorKey: null,
                isCover: false,
              }));
            const next = [...list, ...added];
            if (!next.some((m) => m.isCover)) {
              const firstImage = next.findIndex((m) => m.kind === 'image');
              return next.map((m, i) => ({ ...m, isCover: i === firstImage }));
            }
            return next;
          });
          setPickerOpen(false);
        }}
      />
    </Panel>
  );
}
