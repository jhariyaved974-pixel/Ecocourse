'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch, Textarea } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useActionRunner } from '@/components/admin/client-ui';
import { AssetField } from './asset-field';
import { saveCollection } from '@/app/admin/(panel)/collections/actions';
import type { MediaAssetSummary } from '@/lib/admin/types';
import { defaultSlugFor } from '@/lib/admin/products';

export interface CollectionFormValue {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: MediaAssetSummary | null;
  isVisible: boolean;
  sortOrder: number;
  seoTitle: string;
  seoDescription: string;
}

/** Collection details form (inline on the edit page, or in the "new collection" dialog). */
export function CollectionForm({
  collection,
  defaultSortOrder = 0,
  onSaved,
  submitLabel,
}: {
  collection: CollectionFormValue | null;
  defaultSortOrder?: number;
  onSaved?: (id: string) => void;
  submitLabel?: string;
}) {
  const { run, pending } = useActionRunner();
  const [name, setName] = React.useState(collection?.name ?? '');
  const [slug, setSlug] = React.useState(collection?.slug ?? '');
  const [slugTouched, setSlugTouched] = React.useState(Boolean(collection));
  const [description, setDescription] = React.useState(collection?.description ?? '');
  const [image, setImage] = React.useState<MediaAssetSummary | null>(collection?.image ?? null);
  const [isVisible, setIsVisible] = React.useState(collection?.isVisible ?? true);
  const [sortOrder, setSortOrder] = React.useState(String(collection?.sortOrder ?? defaultSortOrder));
  const [seoTitle, setSeoTitle] = React.useState(collection?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = React.useState(collection?.seoDescription ?? '');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const id = collection?.id ?? 'new';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run(
      () =>
        saveCollection({
          id: collection?.id ?? null,
          name,
          slug,
          description,
          imageAssetId: image?.id ?? null,
          isVisible,
          sortOrder,
          seoTitle,
          seoDescription,
        }),
      { onSuccess: (d) => onSaved?.(d.id) },
    );
    setErrors(res.ok ? {} : res.fieldErrors ?? {});
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor={`col-name-${id}`} required error={errors.name}>
        <Input
          id={`col-name-${id}`}
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(defaultSlugFor(e.target.value));
          }}
          aria-invalid={errors.name ? true : undefined}
        />
      </Field>
      <Field label="Slug" htmlFor={`col-slug-${id}`} required error={errors.slug} hint={`/collections/${slug || '…'}`}>
        <div className="flex gap-2">
          <Input
            id={`col-slug-${id}`}
            value={slug}
            maxLength={120}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
            }}
            aria-invalid={errors.slug ? true : undefined}
          />
          <Button type="button" variant="ghost" size="icon" aria-label="Generate slug from name" onClick={() => setSlug(defaultSlugFor(name))}>
            <RefreshCw />
          </Button>
        </div>
      </Field>
      <Field label="Description" htmlFor={`col-desc-${id}`} error={errors.description} hint={`${description.length}/2000`} className="sm:col-span-2">
        <Textarea id={`col-desc-${id}`} rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <AssetField label="Image" value={image} onChange={setImage} kinds={['image']} uploadFolder="content" hint="Banner on the collection page and homepage tiles." error={errors.imageAssetId} />
      </div>
      <Field label="Sort order" htmlFor={`col-sort-${id}`} error={errors.sortOrder} hint="Lower numbers come first.">
        <Input id={`col-sort-${id}`} inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ''))} />
      </Field>
      <div className="flex items-center justify-between gap-3 self-end rounded-lg border border-line px-3.5 py-2.5">
        <label htmlFor={`col-visible-${id}`} className="text-sm">
          <span className="font-medium">Visible in the shop</span>
          <span className="block text-xs text-muted">Hidden collections return “not found”.</span>
        </label>
        <Switch id={`col-visible-${id}`} checked={isVisible} onCheckedChange={setIsVisible} />
      </div>
      <Field label="SEO title" htmlFor={`col-seo-title-${id}`} error={errors.seoTitle} hint={`${seoTitle.length}/70`}>
        <Input id={`col-seo-title-${id}`} maxLength={70} value={seoTitle} placeholder={name} onChange={(e) => setSeoTitle(e.target.value)} />
      </Field>
      <Field label="SEO description" htmlFor={`col-seo-desc-${id}`} error={errors.seoDescription} hint={`${seoDescription.length}/170`}>
        <Input id={`col-seo-desc-${id}`} maxLength={170} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={pending}>
          {submitLabel ?? (collection ? 'Save details' : 'Create collection')}
        </Button>
      </div>
    </form>
  );
}

export function NewCollectionButton({ defaultSortOrder }: { defaultSortOrder: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> New collection
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>Create the collection, then add products to it.</DialogDescription>
          </DialogHeader>
          {open ? (
            <CollectionForm
              collection={null}
              defaultSortOrder={defaultSortOrder}
              submitLabel="Create and add products"
              onSaved={(id) => {
                setOpen(false);
                router.push(`/admin/collections/${id}`);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
