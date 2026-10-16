'use client';

import * as React from 'react';
import { Award, BadgeCheck, Clock, Heart, Leaf, Package, Plus, RefreshCw, Ruler, ShieldCheck, Sparkles, Star, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, RadioGroup, RadioItem, Switch, Textarea } from '@/components/ui/form-controls';
import { AssetField } from '@/components/admin/catalog/asset-field';
import type { MediaAssetSummary } from '@/lib/admin/types';
import {
  HREF_HINT,
  PRODUCT_SOURCES,
  SECTION_LIMITS,
  SECTION_TYPES,
  USP_ICONS,
  type CatalogOption,
  type EditorSection,
  type ProductOption,
  type SectionField,
  type SectionType,
  type SectionValuesInput,
} from '@/lib/admin/content';
import { ProductPicker } from './product-picker';
import { DragHandle, SortableList, orderBy } from './sortable';

const ICONS = { truck: Truck, refresh: RefreshCw, shield: ShieldCheck, sparkles: Sparkles, ruler: Ruler, leaf: Leaf, award: Award, heart: Heart, clock: Clock, 'badge-check': BadgeCheck, package: Package, star: Star } as const;

export interface UspItemValue {
  key: string;
  title: string;
  body: string;
  icon: string;
}

/** Editable values of one section (strings for inputs; converted on save). */
export interface SectionFormValues {
  eyebrow: string;
  heading: string;
  subheading: string;
  body: string;
  cta_label: string;
  cta_href: string;
  secondary_cta_label: string;
  secondary_cta_href: string;
  image: MediaAssetSummary | null;
  mobileImage: MediaAssetSummary | null;
  model: MediaAssetSummary | null;
  show_3d: boolean;
  product_source: string;
  category_id: string;
  collection_id: string;
  product_limit: string;
  layout: string;
  theme: string;
  coupon_code: string;
  uspItems: UspItemValue[];
  products: ProductOption[];
}

export function sectionToForm(section: EditorSection): SectionFormValues {
  const meta = SECTION_TYPES[section.type];
  const theme = meta.themes && !meta.themes.some((t) => t.value === section.theme) ? meta.themes[0].value : section.theme;
  const layout = meta.layouts && !meta.layouts.some((l) => l.value === section.layout) ? meta.layouts[0].value : section.layout;
  return {
    eyebrow: section.eyebrow ?? '',
    heading: section.heading ?? '',
    subheading: section.subheading ?? '',
    body: section.body ?? '',
    cta_label: section.cta_label ?? '',
    cta_href: section.cta_href ?? '',
    secondary_cta_label: section.secondary_cta_label ?? '',
    secondary_cta_href: section.secondary_cta_href ?? '',
    image: section.image,
    mobileImage: section.mobileImage,
    model: section.model,
    show_3d: section.show_3d,
    product_source: section.product_source ?? '',
    category_id: section.category_id ?? '',
    collection_id: section.collection_id ?? '',
    product_limit: String(section.product_limit),
    layout,
    theme,
    coupon_code: section.coupon_code ?? '',
    uspItems: section.type === 'usp_strip' ? section.items.map((i, index) => ({ key: `item-${index}`, title: i.title ?? '', body: i.body ?? '', icon: i.icon ?? 'sparkles' })) : [],
    products: section.products,
  };
}

/** Only the fields this section type renders are sent; the server keeps the rest of the row as it is. */
export function formToPayload(type: SectionType, v: SectionFormValues): SectionValuesInput {
  const fields = new Set<SectionField>(SECTION_TYPES[type].fields);
  const out: SectionValuesInput = {};
  if (fields.has('eyebrow')) out.eyebrow = v.eyebrow;
  if (fields.has('heading')) out.heading = v.heading;
  if (fields.has('subheading')) out.subheading = v.subheading;
  if (fields.has('body')) out.body = v.body;
  if (fields.has('cta')) Object.assign(out, { cta_label: v.cta_label, cta_href: v.cta_href });
  if (fields.has('secondaryCta')) Object.assign(out, { secondary_cta_label: v.secondary_cta_label, secondary_cta_href: v.secondary_cta_href });
  if (fields.has('image')) out.image_asset_id = v.image?.id ?? null;
  if (fields.has('mobileImage')) out.mobile_image_asset_id = v.mobileImage?.id ?? null;
  if (fields.has('model')) out.model_asset_id = v.model?.id ?? null;
  if (fields.has('show3d')) out.show_3d = v.show_3d;
  if (fields.has('productSource')) {
    Object.assign(out, {
      product_source: v.product_source as SectionValuesInput['product_source'],
      category_id: v.category_id || null,
      collection_id: v.collection_id || null,
      product_limit: v.product_limit,
      items: v.product_source === 'manual' ? v.products.map((p) => ({ title: null, body: null, icon: null, product_id: p.id })) : [],
    });
  }
  if (fields.has('layout')) out.layout = v.layout as SectionValuesInput['layout'];
  if (fields.has('theme')) out.theme = v.theme as SectionValuesInput['theme'];
  if (fields.has('collection')) out.collection_id = v.collection_id || null;
  if (fields.has('couponCode')) out.coupon_code = v.coupon_code;
  if (fields.has('uspItems')) {
    out.items = v.uspItems.map((i) => ({ title: i.title, body: i.body, icon: i.icon as NonNullable<SectionValuesInput['items']>[number]['icon'], product_id: null }));
  }
  return out;
}

let itemCounter = 0;
function newItemKey() {
  itemCounter += 1;
  return `new-${Date.now().toString(36)}-${itemCounter}`;
}

function TextField({
  id,
  label,
  value,
  onChange,
  max,
  error,
  hint,
  required,
  rows,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  const counter = (
    <span className="tabular-nums">
      {value.length}/{max}
    </span>
  );
  return (
    <Field label={label} htmlFor={id} required={required} error={error} hint={hint ? <>{hint} · {counter}</> : counter}>
      {rows ? (
        <Textarea id={id} rows={rows} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} />
      ) : (
        <Input id={id} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} />
      )}
    </Field>
  );
}

function Group({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

export function SectionForm({
  section,
  values,
  onChange,
  errors,
  categories,
  collections,
}: {
  section: EditorSection;
  values: SectionFormValues;
  onChange: (next: SectionFormValues) => void;
  errors: Record<string, string>;
  categories: CatalogOption[];
  collections: CatalogOption[];
}) {
  const meta = SECTION_TYPES[section.type];
  const has = (f: SectionField) => meta.fields.includes(f);
  const required = new Set(meta.required ?? []);
  const set = <K extends keyof SectionFormValues>(key: K, value: SectionFormValues[K]) => onChange({ ...values, [key]: value });
  const pid = `sec-${section.id.slice(0, 8)}`;
  const hasText = has('eyebrow') || has('heading') || has('subheading') || has('body');
  const hasMedia = has('image') || has('mobileImage') || has('model');

  return (
    <div className="space-y-6">
      {hasText ? (
        <Group title="Text" description="Plain text only — formatting and HTML are not rendered. Placeholders like {return_days} are filled in.">
          <div className="grid gap-4 sm:grid-cols-2">
            {has('eyebrow') ? (
              <TextField id={`${pid}-eyebrow`} label="Eyebrow" hint="Small label above the heading" value={values.eyebrow} onChange={(v) => set('eyebrow', v)} max={SECTION_LIMITS.eyebrow} error={errors.eyebrow} />
            ) : null}
            {has('heading') ? (
              <TextField
                id={`${pid}-heading`}
                label="Heading"
                required={required.has('heading')}
                value={values.heading}
                onChange={(v) => set('heading', v)}
                max={SECTION_LIMITS.heading}
                error={errors.heading}
              />
            ) : null}
          </div>
          {has('subheading') ? (
            <TextField id={`${pid}-subheading`} label="Subheading" rows={2} value={values.subheading} onChange={(v) => set('subheading', v)} max={SECTION_LIMITS.subheading} error={errors.subheading} />
          ) : null}
          {has('body') ? (
            <TextField id={`${pid}-body`} label="Story text" hint="Shown as one paragraph" rows={5} value={values.body} onChange={(v) => set('body', v)} max={SECTION_LIMITS.body} error={errors.body} />
          ) : null}
        </Group>
      ) : null}

      {has('uspItems') ? (
        <Group title="Benefits" description={`Up to ${SECTION_LIMITS.uspItems}. Four fit one row on desktop; two per row on phones.`}>
          <UspItemsEditor id={pid} items={values.uspItems} onChange={(items) => set('uspItems', items)} error={errors.items} />
        </Group>
      ) : null}

      {has('productSource') ? (
        <Group title="Products">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Show" htmlFor={`${pid}-source`} required error={errors.product_source}>
              <NativeSelect id={`${pid}-source`} value={values.product_source} onChange={(e) => set('product_source', e.target.value)} aria-invalid={errors.product_source ? true : undefined}>
                <option value="" disabled>
                  Choose…
                </option>
                {PRODUCT_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Number of products"
              htmlFor={`${pid}-limit`}
              error={errors.product_limit}
              hint={values.product_source === 'manual' ? 'Grid layout shows at most this many; the carousel shows every picked product.' : '1–24'}
            >
              <Input id={`${pid}-limit`} inputMode="numeric" value={values.product_limit} onChange={(e) => set('product_limit', e.target.value.replace(/\D/g, '').slice(0, 2))} aria-invalid={errors.product_limit ? true : undefined} />
            </Field>
            {values.product_source === 'category' ? (
              <Field label="Category" htmlFor={`${pid}-category`} required error={errors.category_id} className="sm:col-span-2">
                <NativeSelect id={`${pid}-category`} value={values.category_id} onChange={(e) => set('category_id', e.target.value)} aria-invalid={errors.category_id ? true : undefined}>
                  <option value="">Choose a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isVisible ? '' : ' (hidden)'}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            {values.product_source === 'collection' ? (
              <CollectionSelect id={`${pid}-collection`} collections={collections} value={values.collection_id} onChange={(v) => set('collection_id', v)} error={errors.collection_id} className="sm:col-span-2" />
            ) : null}
          </div>
          {values.product_source === 'manual' ? <ProductPicker id={pid} value={values.products} onChange={(p) => set('products', p)} error={errors.items} /> : null}
        </Group>
      ) : null}

      {has('collection') ? (
        <Group title="Collection" description="Four products from this collection appear beside the image.">
          <CollectionSelect id={`${pid}-collection`} collections={collections} value={values.collection_id} onChange={(v) => set('collection_id', v)} error={errors.collection_id} required />
        </Group>
      ) : null}

      {has('couponCode') ? (
        <Group title="Coupon">
          <Field label="Coupon code" htmlFor={`${pid}-coupon`} error={errors.coupon_code} hint="Shown with a copy button. Capital letters, numbers, - and _.">
            <Input
              id={`${pid}-coupon`}
              value={values.coupon_code}
              maxLength={32}
              autoCapitalize="characters"
              placeholder="WELCOME10"
              className="font-mono uppercase"
              onChange={(e) => set('coupon_code', e.target.value.toUpperCase().replace(/\s/g, ''))}
              aria-invalid={errors.coupon_code ? true : undefined}
            />
          </Field>
        </Group>
      ) : null}

      {has('cta') || has('secondaryCta') ? (
        <Group title="Buttons" description={`Leave both fields empty to hide a button. ${HREF_HINT}`}>
          {has('cta') ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id={`${pid}-cta-label`} label={has('secondaryCta') ? 'Main button label' : 'Button label'} value={values.cta_label} onChange={(v) => set('cta_label', v)} max={SECTION_LIMITS.ctaLabel} error={errors.cta_label} />
              <Field label={has('secondaryCta') ? 'Main button link' : 'Button link'} htmlFor={`${pid}-cta-href`} error={errors.cta_href}>
                <Input id={`${pid}-cta-href`} value={values.cta_href} maxLength={500} placeholder="/shop" onChange={(e) => set('cta_href', e.target.value)} aria-invalid={errors.cta_href ? true : undefined} />
              </Field>
            </div>
          ) : null}
          {has('secondaryCta') ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id={`${pid}-cta2-label`} label="Second button label" value={values.secondary_cta_label} onChange={(v) => set('secondary_cta_label', v)} max={SECTION_LIMITS.ctaLabel} error={errors.secondary_cta_label} />
              <Field label="Second button link" htmlFor={`${pid}-cta2-href`} error={errors.secondary_cta_href}>
                <Input id={`${pid}-cta2-href`} value={values.secondary_cta_href} maxLength={500} placeholder="/collections/new-season" onChange={(e) => set('secondary_cta_href', e.target.value)} aria-invalid={errors.secondary_cta_href ? true : undefined} />
              </Field>
            </div>
          ) : null}
        </Group>
      ) : null}

      {hasMedia ? (
        <Group title="Media" description="Alt text comes from the media library — set it there for accessibility.">
          <div className="grid gap-5 sm:grid-cols-2">
            {has('image') ? (
              <AssetField
                label={section.type === 'hero' ? 'Poster image' : 'Image'}
                value={values.image}
                onChange={(a) => set('image', a)}
                kinds={['image']}
                uploadFolder="content"
                error={errors.image_asset_id}
                hint={section.type === 'hero' ? 'Shown before (or instead of) the 3D scene.' : 'Large, landscape images work best.'}
              />
            ) : null}
            {has('mobileImage') ? (
              <AssetField label="Phone image (optional)" value={values.mobileImage} onChange={(a) => set('mobileImage', a)} kinds={['image']} uploadFolder="content" error={errors.mobile_image_asset_id} hint="Used on small screens instead of the poster image." />
            ) : null}
            {has('model') ? (
              <AssetField label="3D model (optional)" value={values.model} onChange={(a) => set('model', a)} kinds={['model']} uploadFolder="models" error={errors.model_asset_id} hint="A single .glb product model. When empty, the default scene of several products is shown." />
            ) : null}
          </div>
          {has('show3d') ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3.5 py-3">
              <label htmlFor={`${pid}-3d`} className="text-sm">
                <span className="font-medium">Interactive 3D scene</span>
                <span className="block text-xs text-muted">Loads after the page is idle on capable devices; the poster image is always shown first.</span>
              </label>
              <Switch id={`${pid}-3d`} checked={values.show_3d} onCheckedChange={(v) => set('show_3d', v)} />
            </div>
          ) : null}
        </Group>
      ) : null}

      {(has('layout') && meta.layouts) || (has('theme') && meta.themes) ? (
        <Group title="Style">
          <div className="grid gap-5 sm:grid-cols-2">
            {has('layout') && meta.layouts ? (
              <ChoiceGroup id={`${pid}-layout`} label="Layout" value={values.layout} onChange={(v) => set('layout', v)} options={meta.layouts} error={errors.layout} />
            ) : null}
            {has('theme') && meta.themes ? (
              <ChoiceGroup id={`${pid}-theme`} label="Colour style" value={values.theme} onChange={(v) => set('theme', v)} options={meta.themes} error={errors.theme} />
            ) : null}
          </div>
        </Group>
      ) : null}
    </div>
  );
}

function CollectionSelect({
  id,
  collections,
  value,
  onChange,
  error,
  required,
  className,
}: {
  id: string;
  collections: CatalogOption[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <Field label="Collection" htmlFor={id} required={required ?? true} error={error} className={className}>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}>
        <option value="">Choose a collection…</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.isVisible ? '' : ' (hidden)'}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

function ChoiceGroup({ id, label, value, onChange, options, error }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; error?: string }) {
  return (
    <div className="space-y-2">
      <p id={`${id}-label`} className="text-sm font-medium">
        {label}
      </p>
      <RadioGroup value={value} onValueChange={onChange} aria-labelledby={`${id}-label`}>
        {options.map((o) => (
          <label key={o.value} htmlFor={`${id}-${o.value}`} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm has-[[data-state=checked]]:border-ink">
            <RadioItem id={`${id}-${o.value}`} value={o.value} />
            {o.label}
          </label>
        ))}
      </RadioGroup>
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function UspItemsEditor({ id, items, onChange, error }: { id: string; items: UspItemValue[]; onChange: (items: UspItemValue[]) => void; error?: string }) {
  const update = (key: string, patch: Partial<UspItemValue>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const withId = items.map((i) => ({ ...i, id: i.key }));
  return (
    <div className="space-y-3">
      {items.length ? (
        <SortableList
          label="Benefits"
          items={withId}
          itemLabel={(i) => i.title || 'Untitled benefit'}
          onReorder={(ids) => onChange(orderBy(withId, ids).map(({ key, title, body, icon }) => ({ key, title, body, icon })))}
          className="space-y-2"
          renderItem={(item, handle, index) => {
            const Icon = ICONS[item.icon as keyof typeof ICONS] ?? Sparkles;
            return (
              <div className="flex items-start gap-2 rounded-lg border border-line bg-surface p-2.5">
                <DragHandle handle={handle} label={`Reorder benefit ${index + 1}`} className="mt-6" />
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]">
                  <Field label="Icon" htmlFor={`${id}-icon-${item.key}`}>
                    <div className="flex items-center gap-2">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2" aria-hidden>
                        <Icon className="size-4" />
                      </span>
                      <NativeSelect id={`${id}-icon-${item.key}`} value={item.icon} onChange={(e) => update(item.key, { icon: e.target.value })} className="h-9 text-xs">
                        {USP_ICONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </Field>
                  <Field label={`Title ${index + 1}`} htmlFor={`${id}-title-${item.key}`}>
                    <Input id={`${id}-title-${item.key}`} className="h-9" value={item.title} maxLength={SECTION_LIMITS.itemTitle} placeholder="Free delivery" onChange={(e) => update(item.key, { title: e.target.value })} />
                  </Field>
                  <Field label="Short text" htmlFor={`${id}-body-${item.key}`}>
                    <Input id={`${id}-body-${item.key}`} className="h-9" value={item.body} maxLength={SECTION_LIMITS.itemBody} placeholder="On orders over {free_shipping_over}" onChange={(e) => update(item.key, { body: e.target.value })} />
                  </Field>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" className="mt-6" aria-label={`Remove benefit ${index + 1}`} onClick={() => onChange(items.filter((i) => i.key !== item.key))}>
                  <Trash2 />
                </Button>
              </div>
            );
          }}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">No benefits yet.</p>
      )}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={items.length >= SECTION_LIMITS.uspItems}
        onClick={() => onChange([...items, { key: newItemKey(), title: '', body: '', icon: 'sparkles' }])}
      >
        <Plus /> Add benefit
      </Button>
    </div>
  );
}
