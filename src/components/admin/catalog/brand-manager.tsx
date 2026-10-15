'use client';

import * as React from 'react';
import { BadgeCheck, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { Field, Input, Switch, Textarea } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Panel, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { AssetField } from './asset-field';
import { Thumb } from './thumb';
import { deleteBrand, saveBrand } from '@/app/admin/(panel)/categories/actions';
import type { MediaAssetSummary } from '@/lib/admin/types';
import { defaultSlugFor } from '@/lib/admin/products';

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo: MediaAssetSummary | null;
  isVisible: boolean;
  sortOrder: number;
  productCount: number;
}

export function BrandManager({ brands }: { brands: BrandRow[] }) {
  const [editing, setEditing] = React.useState<BrandRow | 'new' | null>(null);
  const [blocked, setBlocked] = React.useState<BrandRow | null>(null);
  return (
    <Panel
      title="Brands"
      description="Optional. Products without a brand are shown under the store name."
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
          <Plus /> New brand
        </Button>
      }
      className="overflow-hidden"
    >
      {brands.length === 0 ? (
        <EmptyState icon={<BadgeCheck className="size-5" />} title="No brands yet" description="Add brands if you sell labels other than your own." />
      ) : (
        <TableWrap className="-m-5 rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th>Brand</Th>
                <Th className="text-right">Products</Th>
                <Th>Visibility</Th>
                <Th className="text-right">Sort</Th>
                <Th className="w-24">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="hover:bg-surface-2/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Thumb url={b.logo?.url ?? null} size={36} />
                      <div>
                        <button type="button" className="font-medium hover:underline" onClick={() => setEditing(b)}>
                          {b.name}
                        </button>
                        <p className="text-xs text-muted">{b.slug}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">{b.productCount}</Td>
                  <Td>{b.isVisible ? <Badge tone="success">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>}</Td>
                  <Td className="text-right tabular-nums text-muted">{b.sortOrder}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${b.name}`} onClick={() => setEditing(b)}>
                        <Pencil />
                      </Button>
                      {b.productCount > 0 ? (
                        <Button size="icon-sm" variant="ghost" aria-label={`Delete ${b.name}`} onClick={() => setBlocked(b)}>
                          <Trash2 />
                        </Button>
                      ) : (
                        <ConfirmActionButton
                          title={`Delete “${b.name}”?`}
                          description="This cannot be undone."
                          confirmLabel="Delete"
                          danger
                          variant="ghost"
                          size="icon-sm"
                          action={() => deleteBrand(b.id)}
                        >
                          <Trash2 aria-hidden />
                          <span className="sr-only">Delete {b.name}</span>
                        </ConfirmActionButton>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          {editing !== null ? (
            <BrandForm key={editing === 'new' ? 'new' : editing.id} brand={editing === 'new' ? null : editing} brands={brands} onDone={() => setEditing(null)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={blocked !== null} onOpenChange={(o) => !o && setBlocked(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>“{blocked?.name}” cannot be deleted yet</DialogTitle>
          </DialogHeader>
          <Notice tone="warning">
            {blocked?.productCount} product(s) use this brand. Change their brand in the product editor first, or hide the brand instead.
          </Notice>
          <DialogFooter>
            <Button onClick={() => setBlocked(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function BrandForm({ brand, brands, onDone }: { brand: BrandRow | null; brands: BrandRow[]; onDone: () => void }) {
  const { run, pending } = useActionRunner();
  const [name, setName] = React.useState(brand?.name ?? '');
  const [slug, setSlug] = React.useState(brand?.slug ?? '');
  const [slugTouched, setSlugTouched] = React.useState(Boolean(brand));
  const [description, setDescription] = React.useState(brand?.description ?? '');
  const [logo, setLogo] = React.useState<MediaAssetSummary | null>(brand?.logo ?? null);
  const [isVisible, setIsVisible] = React.useState(brand?.isVisible ?? true);
  const [sortOrder, setSortOrder] = React.useState(String(brand?.sortOrder ?? Math.max(0, ...brands.map((b) => b.sortOrder)) + 1));
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run(
      () => saveBrand({ id: brand?.id ?? null, name, slug, description, logoAssetId: logo?.id ?? null, isVisible, sortOrder }),
      { onSuccess: onDone },
    );
    setErrors(res.ok ? {} : res.fieldErrors ?? {});
  };

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{brand ? `Edit “${brand.name}”` : 'New brand'}</DialogTitle>
        <DialogDescription>Brand names appear on product pages and in structured data for search engines.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="brand-name" required error={errors.name}>
          <Input
            id="brand-name"
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(defaultSlugFor(e.target.value));
            }}
            aria-invalid={errors.name ? true : undefined}
          />
        </Field>
        <Field label="Slug" htmlFor="brand-slug" required error={errors.slug}>
          <div className="flex gap-2">
            <Input
              id="brand-slug"
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
        <Field label="Description" htmlFor="brand-desc" error={errors.description} hint={`${description.length}/1000`} className="sm:col-span-2">
          <Textarea id="brand-desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <AssetField label="Logo" value={logo} onChange={setLogo} kinds={['image']} uploadFolder="brand" error={errors.logoAssetId} />
        </div>
        <Field label="Sort order" htmlFor="brand-sort" error={errors.sortOrder}>
          <Input id="brand-sort" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ''))} />
        </Field>
        <div className="flex items-center justify-between gap-3 self-end rounded-lg border border-line px-3.5 py-2.5">
          <label htmlFor="brand-visible" className="text-sm font-medium">
            Visible
          </label>
          <Switch id="brand-visible" checked={isVisible} onCheckedChange={setIsVisible} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {brand ? 'Save brand' : 'Create brand'}
        </Button>
      </DialogFooter>
    </form>
  );
}
