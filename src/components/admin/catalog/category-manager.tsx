'use client';

import * as React from 'react';
import Link from 'next/link';
import { FolderTree, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { Field, Input, NativeSelect, Switch, Textarea } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Panel, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { AssetField } from './asset-field';
import { Thumb } from './thumb';
import { deleteCategory, saveCategory } from '@/app/admin/(panel)/categories/actions';
import type { MediaAssetSummary } from '@/lib/admin/types';
import { defaultSlugFor } from '@/lib/admin/products';
import { cn } from '@/lib/utils';

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  depth: number;
  image: MediaAssetSummary | null;
  sizeGuideId: string | null;
  isVisible: boolean;
  sortOrder: number;
  seoTitle: string;
  seoDescription: string;
  productCount: number;
  childCount: number;
}

type SizeGuideOption = { id: string; name: string };

export function CategoryManager({ categories, sizeGuides }: { categories: CategoryRow[]; sizeGuides: SizeGuideOption[] }) {
  const [editing, setEditing] = React.useState<CategoryRow | { parentId: string | null } | null>(null);
  const [blocked, setBlocked] = React.useState<CategoryRow | null>(null);
  const guideName = (id: string | null) => sizeGuides.find((g) => g.id === id)?.name;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const departments = categories.filter((c) => !c.parentId).length;

  return (
    <Panel
      title="Categories"
      description={`Two levels: ${departments} department${departments === 1 ? '' : 's'} (top level) and their sub-categories. A department page at /category/slug lists the products of all its sub-categories; assign products to a sub-category.`}
      actions={
        <Button size="sm" onClick={() => setEditing({ parentId: null })}>
          <Plus /> New category
        </Button>
      }
      className="overflow-hidden"
    >
      {categories.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="size-5" />}
          title="No categories yet"
          description="Create departments such as Electronics or Home & Kitchen, then sub-categories such as Audio or Kitchen & Dining."
        />
      ) : (
        <TableWrap className="-m-5 rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th className="text-right">Products</Th>
                <Th>Size guide</Th>
                <Th>Visibility</Th>
                <Th className="text-right">Sort</Th>
                <Th className="w-24">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const parent = c.parentId ? byId.get(c.parentId) : undefined;
                const ownGuide = guideName(c.sizeGuideId);
                const inherited = !ownGuide && parent ? guideName(parent.sizeGuideId) : undefined;
                const isDepartment = !c.parentId;
                // The product list filter for a department includes its sub-categories, so show the same total.
                const total = c.productCount + (isDepartment ? categories.filter((x) => x.parentId === c.id).reduce((n, x) => n + x.productCount, 0) : 0);
                return (
                <tr key={c.id} className={cn('hover:bg-surface-2/40', isDepartment && 'bg-surface-2/30')}>
                  <Td>
                    <div className="flex items-center gap-3" style={{ paddingLeft: c.depth * 24 }}>
                      {c.depth ? <span className="text-muted" aria-hidden>↳</span> : null}
                      <Thumb url={c.image?.url ?? null} size={36} />
                      <div className="min-w-0">
                        <button type="button" className={cn('text-left hover:underline', isDepartment ? 'font-semibold' : 'font-medium')} onClick={() => setEditing(c)}>
                          {c.name}
                        </button>
                        <p className="text-xs text-muted">
                          {isDepartment ? (c.childCount ? `Department · ${c.childCount} sub-categor${c.childCount === 1 ? 'y' : 'ies'}` : 'Department') : `in ${parent?.name ?? '—'}`} · /category/
                          {c.slug}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">
                    <Link href={`/admin/products?category=${c.id}`} className="hover:underline" title={isDepartment && c.childCount ? 'Including its sub-categories' : undefined}>
                      {total}
                    </Link>
                  </Td>
                  <Td className="text-xs text-ink-2">
                    {ownGuide ?? (inherited ? <span className="text-muted">{inherited} (from {parent?.name})</span> : <span className="text-muted">None</span>)}
                  </Td>
                  <Td>{c.isVisible ? <Badge tone="success">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>}</Td>
                  <Td className="text-right tabular-nums text-muted">{c.sortOrder}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {isDepartment ? (
                        <Button size="icon-sm" variant="ghost" aria-label={`Add a sub-category to ${c.name}`} title="Add a sub-category" onClick={() => setEditing({ parentId: c.id })}>
                          <Plus />
                        </Button>
                      ) : null}
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                        <Pencil />
                      </Button>
                      {c.productCount > 0 || c.childCount > 0 ? (
                        <Button size="icon-sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setBlocked(c)}>
                          <Trash2 />
                        </Button>
                      ) : (
                        <ConfirmActionButton
                          title={`Delete “${c.name}”?`}
                          description="The category is removed from the shop. This cannot be undone."
                          confirmLabel="Delete"
                          danger
                          variant="ghost"
                          size="icon-sm"
                          action={() => deleteCategory(c.id)}
                        >
                          <Trash2 aria-hidden />
                          <span className="sr-only">Delete {c.name}</span>
                        </ConfirmActionButton>
                      )}
                    </div>
                  </Td>
                </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          {editing !== null ? (
            <CategoryForm
              key={'id' in editing ? editing.id : `new-${editing.parentId ?? 'top'}`}
              category={'id' in editing ? editing : null}
              defaultParentId={'id' in editing ? null : editing.parentId}
              categories={categories}
              sizeGuides={sizeGuides}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={blocked !== null} onOpenChange={(o) => !o && setBlocked(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>“{blocked?.name}” cannot be deleted yet</DialogTitle>
            <DialogDescription>Categories that still contain products or sub-categories are kept so nothing ends up uncategorised by accident.</DialogDescription>
          </DialogHeader>
          <Notice tone="warning">
            {blocked && blocked.productCount > 0 ? (
              <p>
                It has {blocked.productCount} product(s). Move them to another category first (filter the product list by this category, select all and use
                the bulk action “Set category”), or hide the category instead.
              </p>
            ) : null}
            {blocked && blocked.childCount > 0 ? <p>It has {blocked.childCount} sub-categor{blocked.childCount === 1 ? 'y' : 'ies'}. Move them to another department or delete them first.</p> : null}
          </Notice>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBlocked(null)}>
              Close
            </Button>
            {blocked && blocked.productCount > 0 ? (
              <Button asChild>
                <Link href={`/admin/products?category=${blocked.id}`}>View its products</Link>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function CategoryForm({
  category,
  defaultParentId,
  categories,
  sizeGuides,
  onDone,
}: {
  category: CategoryRow | null;
  defaultParentId: string | null;
  categories: CategoryRow[];
  sizeGuides: SizeGuideOption[];
  onDone: () => void;
}) {
  const { run, pending } = useActionRunner();
  const [name, setName] = React.useState(category?.name ?? '');
  const [slug, setSlug] = React.useState(category?.slug ?? '');
  const [slugTouched, setSlugTouched] = React.useState(Boolean(category));
  const [description, setDescription] = React.useState(category?.description ?? '');
  const [parentId, setParentId] = React.useState(category?.parentId ?? defaultParentId ?? '');
  const [image, setImage] = React.useState<MediaAssetSummary | null>(category?.image ?? null);
  const [sizeGuideId, setSizeGuideId] = React.useState(category?.sizeGuideId ?? '');
  const [isVisible, setIsVisible] = React.useState(category?.isVisible ?? true);
  // New categories go last among their siblings.
  const [sortOrder, setSortOrder] = React.useState(() =>
    String(category?.sortOrder ?? Math.max(0, ...categories.filter((c) => (c.parentId ?? '') === (defaultParentId ?? '')).map((c) => c.sortOrder)) + 1),
  );
  const [seoTitle, setSeoTitle] = React.useState(category?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = React.useState(category?.seoDescription ?? '');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  // Two levels: only departments can be parents, never the category itself;
  // a department with sub-categories cannot move under another department.
  const hasChildren = (category?.childCount ?? 0) > 0;
  const departments = categories.filter((c) => !c.parentId && c.id !== category?.id);
  const parent = categories.find((c) => c.id === parentId);
  const parentGuide = parent ? sizeGuides.find((g) => g.id === parent.sizeGuideId) : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run(
      () =>
        saveCategory({
          id: category?.id ?? null,
          name,
          slug,
          description,
          parentId: parentId || null,
          imageAssetId: image?.id ?? null,
          sizeGuideId: sizeGuideId || null,
          isVisible,
          sortOrder,
          seoTitle,
          seoDescription,
        }),
      { onSuccess: onDone },
    );
    setErrors(res.ok ? {} : res.fieldErrors ?? {});
  };

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{category ? `Edit “${category.name}”` : parent ? `New sub-category in ${parent.name}` : 'New category'}</DialogTitle>
        <DialogDescription>Changes appear in the shop straight after saving.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="cat-name" required error={errors.name}>
          <Input
            id="cat-name"
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(defaultSlugFor(e.target.value));
            }}
            aria-invalid={errors.name ? true : undefined}
          />
        </Field>
        <Field label="Slug" htmlFor="cat-slug" required error={errors.slug} hint={`/category/${slug || '…'}`}>
          <div className="flex gap-2">
            <Input
              id="cat-slug"
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
        <Field label="Description" htmlFor="cat-desc" error={errors.description} hint={`${description.length}/2000`} className="sm:col-span-2">
          <Textarea id="cat-desc" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field
          label="Department"
          htmlFor="cat-parent"
          error={errors.parentId}
          hint={
            hasChildren
              ? `It has ${category?.childCount} sub-categor${category?.childCount === 1 ? 'y' : 'ies'}, so it stays a department.`
              : parentId
                ? 'This is a sub-category; it is listed on the department page too.'
                : 'Top level: shown in the main menu and on the homepage category grid.'
          }
        >
          <NativeSelect id="cat-parent" value={parentId} disabled={hasChildren} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None — this is a department</option>
            {departments.map((c) => (
              <option key={c.id} value={c.id}>
                Sub-category of {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Size guide"
          htmlFor="cat-guide"
          error={errors.sizeGuideId}
          hint={
            parent
              ? `Optional. Products here use it unless they choose their own${parentGuide ? `; empty uses ${parent.name}'s guide.` : '.'}`
              : 'Optional. Used by products in this department and its sub-categories (unless they set their own). Leave empty for products without sizes.'
          }
        >
          <NativeSelect id="cat-guide" value={sizeGuideId} onChange={(e) => setSizeGuideId(e.target.value)}>
            <option value="">{parentGuide ? `Use ${parent?.name}'s guide (${parentGuide.name})` : 'No size guide'}</option>
            {sizeGuides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="sm:col-span-2">
          <AssetField label="Image" value={image} onChange={setImage} kinds={['image']} uploadFolder="content" hint="Used on category tiles and banners. Portrait (4:5) images work best for department tiles." error={errors.imageAssetId} />
        </div>
        <Field label="Sort order" htmlFor="cat-sort" error={errors.sortOrder} hint="Lower numbers come first within the same level.">
          <Input id="cat-sort" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ''))} />
        </Field>
        <div className="flex items-center justify-between gap-3 self-end rounded-lg border border-line px-3.5 py-2.5">
          <label htmlFor="cat-visible" className="text-sm">
            <span className="font-medium">Visible in the shop</span>
            <span className="block text-xs text-muted">Hidden categories keep their products.</span>
          </label>
          <Switch id="cat-visible" checked={isVisible} onCheckedChange={setIsVisible} />
        </div>
        <Field label="SEO title" htmlFor="cat-seo-title" error={errors.seoTitle} hint={`${seoTitle.length}/70`}>
          <Input id="cat-seo-title" maxLength={70} value={seoTitle} placeholder={name} onChange={(e) => setSeoTitle(e.target.value)} />
        </Field>
        <Field label="SEO description" htmlFor="cat-seo-desc" error={errors.seoDescription} hint={`${seoDescription.length}/170`}>
          <Input id="cat-seo-desc" maxLength={170} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} className={cn(pending && 'pointer-events-none')}>
          {category ? 'Save category' : 'Create category'}
        </Button>
      </DialogFooter>
    </form>
  );
}
