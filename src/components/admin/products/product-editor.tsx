'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Eye, MoreHorizontal, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Notice } from '@/components/ui/misc';
import { Checkbox, Field, Input, NativeSelect, Switch, Textarea } from '@/components/ui/form-controls';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menus';
import { PageHeader, Panel } from '@/components/admin/ui';
import { AssetField } from '@/components/admin/catalog/asset-field';
import { MarkdownField } from '@/components/admin/catalog/markdown-field';
import { moveItem, newKey } from '@/components/admin/catalog/list-utils';
import { MediaSection } from './media-section';
import { VariantsSection } from './variants-section';
import { DeleteProductDialog } from './delete-product-dialog';
import { checkProductIdentifiers, duplicateProduct, saveProduct } from '@/app/admin/(panel)/products/actions';
import {
  GENDERS,
  GENDER_TEXT,
  PRODUCT_FLAGS,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_TEXT,
  PRODUCT_STATUS_TONE,
  defaultSlugFor,
  describeIssuePath,
  parseTags,
  productFormSchema,
  type ProductFormState,
  type ProductStatus,
} from '@/lib/admin/products';
import { zodFieldErrors } from '@/lib/errors';
import { cn, formatDateTime, formatMoney, rupeesToPaise } from '@/lib/utils';

export interface EditorLookups {
  categories: { id: string; name: string; depth: number; isVisible: boolean }[];
  brands: { id: string; name: string }[];
  collections: { id: string; name: string; isVisible: boolean }[];
  sizeGuides: { id: string; name: string; isDefault: boolean }[];
}

export interface EditorMeta {
  id: string;
  slug: string;
  status: ProductStatus;
  publishedAt: string | null;
  updatedAt: string;
}

const PUBLISH_HINTS: Record<string, string> = {
  publish_requires_image: 'Add at least one image in the Media section, then publish again.',
  publish_requires_variant: 'Add at least one active size in Colours & sizes, then publish again.',
};

export function ProductEditor({
  initial,
  meta,
  lookups,
  canSeeCost,
  canDelete,
  defaultLowStock,
}: {
  initial: ProductFormState;
  meta: EditorMeta | null;
  lookups: EditorLookups;
  canSeeCost: boolean;
  canDelete: boolean;
  defaultLowStock: number;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<ProductFormState>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(initial.id));
  const [saving, startSaving] = React.useTransition();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const leaving = React.useRef(false);

  const initialJson = React.useMemo(() => JSON.stringify(initial), [initial]);
  const dirty = JSON.stringify(form) !== initialJson;
  const isNew = !meta;

  // Warn before losing unsaved changes (reload/close tab and in-app links).
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm('You have unsaved changes. Leave this page and discard them?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  const set = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as string]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key as string];
        return next;
      });
    }
  };

  const onNameChange = (name: string) => {
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : defaultSlugFor(name) }));
  };

  const checkIdentifiers = async () => {
    if (!form.slug && !form.sku) return;
    const res = await checkProductIdentifiers({ id: form.id, slug: form.slug, sku: form.sku });
    if (!res.ok) return;
    setErrors((e) => {
      const next = { ...e };
      if (res.data.slug) next.slug = res.data.slug;
      else if (next.slug?.includes('already used')) delete next.slug;
      if (res.data.sku) next.sku = res.data.sku;
      else if (next.sku?.includes('already used')) delete next.sku;
      return next;
    });
  };

  const save = (statusOverride?: ProductStatus) => {
    const draft = statusOverride ? { ...form, status: statusOverride } : form;
    setFormError(null);
    const parsed = productFormSchema.safeParse(draft);
    if (!parsed.success) {
      const fieldErrors = zodFieldErrors(parsed.error.issues);
      setErrors(fieldErrors);
      toast.error('Please fix the highlighted fields.');
      return;
    }
    startSaving(async () => {
      const res = await saveProduct(draft);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        if (!res.fieldErrors) setFormError({ message: res.error, hint: res.code ? PUBLISH_HINTS[res.code] : undefined });
        toast.error(res.error);
        return;
      }
      setErrors({});
      toast.success(res.message ?? 'Saved');
      leaving.current = true;
      if (isNew) {
        router.replace(`/admin/products/${res.data.id}`);
      } else {
        if (statusOverride) setForm((f) => ({ ...f, status: statusOverride }));
        router.refresh();
        // The page remounts the editor with the saved data (keyed by updated_at).
        window.setTimeout(() => {
          leaving.current = false;
        }, 1500);
      }
    });
  };

  const issueList = Object.entries(errors).map(([path, message]) => {
    const where = describeIssuePath(
      path.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)),
      form,
    );
    return { path, text: where ? `${where}: ${message}` : message };
  });

  const hasImage = form.media.some((m) => m.kind === 'image');
  const hasActiveSize = form.variants.some((v) => v.isActive);
  const pricePaise = rupeesToPaise(form.price);
  const salePaise = rupeesToPaise(form.salePrice);
  const costPaise = rupeesToPaise(form.costPrice);
  const sellPaise = salePaise ?? pricePaise;
  const margin = canSeeCost && costPaise !== null && sellPaise ? Math.round(((sellPaise - costPaise) / sellPaise) * 1000) / 10 : null;
  const tags = parseTags(form.tags);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
    >
      <PageHeader
        back={{ href: '/admin/products', label: 'Products' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {isNew ? 'New product' : initial.name || 'Untitled product'}
            {meta ? <Badge tone={PRODUCT_STATUS_TONE[meta.status]}>{PRODUCT_STATUS_TEXT[meta.status]}</Badge> : null}
            {dirty ? <Badge tone="warning">Unsaved changes</Badge> : null}
          </span>
        }
        description={meta ? `Last saved ${formatDateTime(meta.updatedAt)}${meta.publishedAt ? ` · first published ${formatDateTime(meta.publishedAt)}` : ''}` : 'Fill in the basics, then add media, colours and sizes.'}
        actions={
          <>
            {meta ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/products/${meta.id}/preview`} target="_blank" rel="noopener">
                  <Eye /> Preview
                </Link>
              </Button>
            ) : null}
            {meta ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon-sm" aria-label="More product actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {meta.status === 'published' ? (
                    <DropdownMenuItem asChild>
                      <a href={`/products/${meta.slug}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> View on store
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={async () => {
                      if (dirty && !window.confirm('Duplicate the last saved version? Your unsaved changes are not included.')) return;
                      const res = await duplicateProduct(meta.id);
                      if (!res.ok) return void toast.error(res.error);
                      toast.success(res.message ?? 'Duplicated');
                      leaving.current = true;
                      router.push(`/admin/products/${res.data.id}`);
                    }}
                  >
                    <Copy /> Duplicate as draft
                  </DropdownMenuItem>
                  {canDelete ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                        <Trash2 /> Delete…
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button type="submit" size="sm" loading={saving}>
              {saving ? null : <Save />} {isNew ? 'Create product' : 'Save changes'}
            </Button>
          </>
        }
      />

      {formError ? (
        <Notice tone="danger" title="The product was not saved" className="mb-6">
          {formError.message}
          {formError.hint ? <span className="block">{formError.hint}</span> : null}
        </Notice>
      ) : null}
      {issueList.length ? (
        <Notice tone="danger" title={`Fix ${issueList.length} problem${issueList.length === 1 ? '' : 's'} before saving`} className="mb-6">
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {issueList.slice(0, 12).map((i) => (
              <li key={i.path}>{i.text}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Basics">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name" htmlFor="p-name" required error={errors.name} className="md:col-span-2">
                <Input
                  id="p-name"
                  value={form.name}
                  maxLength={140}
                  onChange={(e) => onNameChange(e.target.value)}
                  aria-invalid={errors.name ? true : undefined}
                  placeholder="e.g. Velocity Runner X"
                />
              </Field>
              <Field
                label="URL slug"
                htmlFor="p-slug"
                required
                error={errors.slug}
                hint={
                  <>
                    /products/{form.slug || '…'}
                    {meta && form.slug !== meta.slug && meta.status === 'published' ? ' · the old URL will redirect here' : ''}
                  </>
                }
              >
                <div className="flex gap-2">
                  <Input
                    id="p-slug"
                    value={form.slug}
                    maxLength={120}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'));
                    }}
                    onBlur={checkIdentifiers}
                    aria-invalid={errors.slug ? true : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Generate slug from name"
                    title="Generate from name"
                    onClick={() => set('slug', defaultSlugFor(form.name))}
                  >
                    <RefreshCw />
                  </Button>
                </div>
              </Field>
              <Field label="Product SKU" htmlFor="p-sku" required error={errors.sku} hint="Base SKU; size SKUs are suggested from it.">
                <Input
                  id="p-sku"
                  value={form.sku}
                  maxLength={40}
                  className="font-mono uppercase"
                  onChange={(e) => set('sku', e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                  onBlur={checkIdentifiers}
                  aria-invalid={errors.sku ? true : undefined}
                  placeholder="AU-VRX"
                />
              </Field>
              <Field
                label="Short description"
                htmlFor="p-short"
                error={errors.shortDescription}
                hint={`Shown near the price and in search results. ${form.shortDescription.length}/300`}
                className="md:col-span-2"
              >
                <Textarea id="p-short" rows={2} maxLength={300} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <MarkdownField
                  id="p-description"
                  label="Full description"
                  value={form.description}
                  onChange={(v) => set('description', v)}
                  maxLength={8000}
                  error={errors.description}
                  placeholder={'Engineered knit upper…\n\n- Breathable mesh\n- Cushioned midsole'}
                />
              </div>
              <Field label="Tags" htmlFor="p-tags" error={errors.tags} hint="Comma separated; used by search." className="md:col-span-2">
                <Input id="p-tags" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="running, knit, cushioned" />
              </Field>
              {tags.length ? (
                <div className="-mt-2 flex flex-wrap gap-1 md:col-span-2" aria-label="Tags preview">
                  {tags.map((t) => (
                    <Badge key={t} tone="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </Panel>

          <MediaSection form={form} setForm={setForm} errors={errors} />
          <VariantsSection form={form} setForm={setForm} errors={errors} />
          <AttributesPanel form={form} setForm={setForm} errors={errors} />

          <Panel title="Search engine listing" description="Defaults to the product name and short description when empty.">
            <div className="space-y-4">
              <Field label="SEO title" htmlFor="p-seo-title" error={errors.seoTitle} hint={`${form.seoTitle.length}/70`}>
                <Input id="p-seo-title" value={form.seoTitle} maxLength={70} placeholder={form.name} onChange={(e) => set('seoTitle', e.target.value)} />
              </Field>
              <Field label="SEO description" htmlFor="p-seo-desc" error={errors.seoDescription} hint={`${form.seoDescription.length}/170`}>
                <Textarea
                  id="p-seo-desc"
                  rows={2}
                  value={form.seoDescription}
                  maxLength={170}
                  placeholder={form.shortDescription}
                  onChange={(e) => set('seoDescription', e.target.value)}
                />
              </Field>
              <AssetField
                label="Social share image (Open Graph)"
                value={form.ogImage}
                onChange={(a) => set('ogImage', a)}
                kinds={['image']}
                hint="Optional. Defaults to the cover image. 1200×1200 works well."
              />
              <div className="rounded-lg border border-line bg-paper p-4" aria-label="Search result preview">
                <p className="truncate text-xs text-success">/products/{form.slug || 'product-url'}</p>
                <p className="mt-0.5 truncate text-base text-info">{form.seoTitle || form.name || 'Product title'}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{form.seoDescription || form.shortDescription || 'Product description…'}</p>
              </div>
            </div>
          </Panel>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <Panel title="Status">
            <div className="space-y-4">
              <Field label="Visibility" htmlFor="p-status" error={errors.status}>
                <NativeSelect id="p-status" value={form.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PRODUCT_STATUS_TEXT[s]}
                      {s === 'draft' ? ' — hidden' : s === 'published' ? ' — visible in the store' : ' — hidden, kept for history'}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <ul className="space-y-1.5 text-sm" aria-label="Publishing checklist">
                <ChecklistItem ok={hasImage}>At least one image</ChecklistItem>
                <ChecklistItem ok={hasActiveSize}>At least one active size</ChecklistItem>
                <ChecklistItem ok={pricePaise !== null && pricePaise > 0}>Price set</ChecklistItem>
              </ul>
              <div className="flex flex-col gap-2">
                <Button type="submit" loading={saving} className="w-full">
                  {isNew ? 'Create product' : 'Save changes'}
                </Button>
                {form.status !== 'published' && meta?.status !== 'published' ? (
                  <Button type="button" variant="outline" className="w-full" disabled={saving || !hasImage || !hasActiveSize} onClick={() => save('published')}>
                    Save &amp; publish
                  </Button>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title="Pricing">
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (₹)" htmlFor="p-price" required error={errors.price}>
                  <Input id="p-price" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="4999" aria-invalid={errors.price ? true : undefined} />
                </Field>
                <Field label="Sale price (₹)" htmlFor="p-sale" error={errors.salePrice}>
                  <Input id="p-sale" inputMode="decimal" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} placeholder="—" aria-invalid={errors.salePrice ? true : undefined} />
                </Field>
              </div>
              {pricePaise ? (
                <p className="-mt-2 text-xs text-muted">
                  Customers pay {formatMoney(salePaise && salePaise < pricePaise ? salePaise : pricePaise)}
                  {salePaise && salePaise < pricePaise ? ` (${Math.round(((pricePaise - salePaise) / pricePaise) * 100)}% off${form.saleStartsAt || form.saleEndsAt ? ' during the sale window' : ''})` : ''}
                </p>
              ) : null}
              <Field label="Sale starts (IST)" htmlFor="p-sale-start" error={errors.saleStartsAt} hint="Optional. Empty starts the sale immediately.">
                <Input id="p-sale-start" type="datetime-local" value={form.saleStartsAt} onChange={(e) => set('saleStartsAt', e.target.value)} />
              </Field>
              <Field label="Sale ends (IST)" htmlFor="p-sale-end" error={errors.saleEndsAt} hint="Optional. Empty keeps the sale running.">
                <Input id="p-sale-end" type="datetime-local" value={form.saleEndsAt} onChange={(e) => set('saleEndsAt', e.target.value)} />
              </Field>
              {canSeeCost ? (
                <Field
                  label="Cost price (₹)"
                  htmlFor="p-cost"
                  error={errors.costPrice}
                  hint={margin !== null ? `Margin ${margin}% at the current selling price. Visible to owners and admins only.` : 'Visible to owners and admins only.'}
                >
                  <Input id="p-cost" inputMode="decimal" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} placeholder="—" />
                </Field>
              ) : null}
            </div>
          </Panel>

          <Panel title="Organisation">
            <div className="grid gap-4">
              <Field label="Category" htmlFor="p-category" error={errors.categoryId}>
                <NativeSelect id="p-category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">No category</option>
                  {lookups.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.depth ? '— '.repeat(c.depth) : ''}
                      {c.name}
                      {c.isVisible ? '' : ' (hidden)'}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Brand" htmlFor="p-brand" error={errors.brandId}>
                  <NativeSelect id="p-brand" value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>
                    <option value="">Store brand</option>
                    {lookups.brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Gender" htmlFor="p-gender">
                  <NativeSelect id="p-gender" value={form.gender} onChange={(e) => set('gender', e.target.value as ProductFormState['gender'])}>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {GENDER_TEXT[g]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Size guide" htmlFor="p-size-guide" hint="Empty uses the category's guide, then the store default.">
                <NativeSelect id="p-size-guide" value={form.sizeGuideId} onChange={(e) => set('sizeGuideId', e.target.value)}>
                  <option value="">Category / store default</option>
                  {lookups.sizeGuides.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Collections</legend>
                {lookups.collections.length ? (
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {lookups.collections.map((c) => {
                      const checked = form.collectionIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              set('collectionIds', v === true ? [...form.collectionIds, c.id] : form.collectionIds.filter((id) => id !== c.id))
                            }
                          />
                          {c.name}
                          {c.isVisible ? null : <span className="text-xs text-muted">(hidden)</span>}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    No collections yet. <Link href="/admin/collections" className="underline">Create one</Link>.
                  </p>
                )}
              </fieldset>
            </div>
          </Panel>

          <Panel title="Merchandising">
            <div className="space-y-3">
              {PRODUCT_FLAGS.map((flag) => (
                <label key={flag.field} className="flex items-center justify-between gap-3 text-sm">
                  {flag.label}
                  <Switch checked={form[flag.field]} onCheckedChange={(v) => set(flag.field, v)} />
                </label>
              ))}
              <Field label="Low stock alert at" htmlFor="p-low-stock" error={errors.lowStockThreshold} hint={`Units per size. Empty uses the store default (${defaultLowStock}).`}>
                <Input
                  id="p-low-stock"
                  inputMode="numeric"
                  value={form.lowStockThreshold}
                  placeholder={String(defaultLowStock)}
                  onChange={(e) => set('lowStockThreshold', e.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="3D model">
            <AssetField
              label="Interactive 3D model (.glb)"
              value={form.model}
              onChange={(a) => set('model', a)}
              kinds={['model']}
              uploadFolder="models"
              hint="Optional. Shown as a 3D viewer on capable devices."
            />
          </Panel>
        </aside>
      </div>

      {meta ? (
        <DeleteProductDialog
          product={deleteOpen ? { id: meta.id, name: initial.name, status: meta.status } : null}
          onOpenChange={setDeleteOpen}
          redirectTo="/admin/products"
        />
      ) : null}
    </form>
  );
}

function ChecklistItem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-2', ok ? 'text-ink-2' : 'text-muted')}>
      <span className={cn('grid size-4 place-items-center rounded-full', ok ? 'bg-success text-white' : 'border border-line-strong')} aria-hidden>
        {ok ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      {children}
      <span className="sr-only">{ok ? '(done)' : '(missing)'}</span>
    </li>
  );
}

function AttributesPanel({
  form,
  setForm,
  errors,
}: {
  form: ProductFormState;
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  errors: Record<string, string>;
}) {
  const update = (fn: (a: ProductFormState['attributes']) => ProductFormState['attributes']) => setForm((f) => ({ ...f, attributes: fn(f.attributes) }));
  return (
    <Panel
      title="Specifications"
      description="Label and value pairs shown in the product details, e.g. Upper: Engineered knit."
      actions={
        <Button type="button" size="sm" variant="outline" onClick={() => update((a) => [...a, { key: newKey('attr'), label: '', value: '' }])}>
          <Plus /> Add specification
        </Button>
      }
    >
      {form.attributes.length === 0 ? (
        <p className="text-sm text-muted">No specifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {form.attributes.map((a, i) => {
            const error = errors[`attributes.${i}.label`] ?? errors[`attributes.${i}.value`];
            return (
              <li key={a.key}>
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <label className="sr-only" htmlFor={`attr-label-${a.key}`}>
                    Specification {i + 1} label
                  </label>
                  <Input
                    id={`attr-label-${a.key}`}
                    className="h-9 sm:w-48"
                    value={a.label}
                    maxLength={60}
                    placeholder="Label"
                    aria-invalid={errors[`attributes.${i}.label`] ? true : undefined}
                    onChange={(e) => update((list) => list.map((x) => (x.key === a.key ? { ...x, label: e.target.value } : x)))}
                  />
                  <label className="sr-only" htmlFor={`attr-value-${a.key}`}>
                    Specification {i + 1} value
                  </label>
                  <Input
                    id={`attr-value-${a.key}`}
                    className="h-9 flex-1"
                    value={a.value}
                    maxLength={300}
                    placeholder="Value"
                    aria-invalid={errors[`attributes.${i}.value`] ? true : undefined}
                    onChange={(e) => update((list) => list.map((x) => (x.key === a.key ? { ...x, value: e.target.value } : x)))}
                  />
                  <div className="flex">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move specification ${i + 1} up`} disabled={i === 0} onClick={() => update((list) => moveItem(list, i, i - 1))}>
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move specification ${i + 1} down`}
                      disabled={i === form.attributes.length - 1}
                      onClick={() => update((list) => moveItem(list, i, i + 1))}
                    >
                      <ArrowDown />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove specification ${i + 1}`} onClick={() => update((list) => list.filter((x) => x.key !== a.key))}>
                      <X />
                    </Button>
                  </div>
                </div>
                {error ? (
                  <p className="mt-1 text-xs font-medium text-danger" role="alert">
                    {error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
