'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Notice } from '@/components/ui/misc';
import { Field, Input, NativeSelect, Switch } from '@/components/ui/form-controls';
import { Panel } from '@/components/admin/ui';
import { moveItem, newKey } from '@/components/admin/catalog/list-utils';
import {
  COLOR_FAMILIES,
  DEFAULT_VARIANT_LABEL,
  HEX_RE,
  OPTION_VALUE_MAX,
  STANDARD_OPTION,
  VARIANT_LABEL_MAX,
  VARIANT_PRESETS,
  detectVariantPreset,
  isStandardOption,
  suggestVariantSku,
  type ProductFormColor,
  type ProductFormState,
  type ProductFormVariant,
  type VariantPreset,
} from '@/lib/admin/products';
import { titleCase } from '@/lib/utils';

type SetForm = React.Dispatch<React.SetStateAction<ProductFormState>>;

/** "S, M, L" → ["S", "M", "L"]. With shoe sizes, bare numbers become UK sizes ("7" → "UK 7"). */
function parseOptionList(input: string, ukNumbers: boolean): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,;\n]/)) {
    const token = raw.trim().replace(/\s+/g, ' ');
    if (!token) continue;
    const label = ukNumbers && /^\d+(\.\d+)?$/.test(token) ? `UK ${token}` : token;
    if (!out.some((l) => l.toLowerCase() === label.toLowerCase())) out.push(label.slice(0, OPTION_VALUE_MAX));
  }
  return out;
}

/** Inserts variants right after the last variant of the same colour (keeps each colour's options together). */
function insertForColor(variants: ProductFormVariant[], colorKey: string | null, fresh: ProductFormVariant[]): ProductFormVariant[] {
  const lastIndex = variants.map((v) => v.colorKey).lastIndexOf(colorKey);
  const next = [...variants];
  next.splice(lastIndex >= 0 ? lastIndex + 1 : next.length, 0, ...fresh);
  return next;
}

function makeVariant(productSku: string, color: ProductFormColor | null, sizeLabel: string): ProductFormVariant {
  return {
    key: newKey('variant'),
    id: null,
    colorKey: color?.key ?? null,
    sizeLabel,
    sku: suggestVariantSku(productSku || 'SKU', color?.name ?? null, sizeLabel),
    isActive: true,
    initialStock: '0',
    stockOnHand: null,
    stockReserved: null,
  };
}

export function VariantsSection({ form, setForm, errors }: { form: ProductFormState; setForm: SetForm; errors: Record<string, string> }) {
  const [preset, setPreset] = React.useState<VariantPreset | ''>(() => detectVariantPreset(form.variantLabel, form.variants));
  const noOptions = preset === 'none';
  const optionName = form.variantLabel.trim() || DEFAULT_VARIANT_LABEL;
  const presetDef = VARIANT_PRESETS.find((p) => p.value === preset);
  const colorKeys = new Set(form.colors.map((c) => c.key));
  const unassigned = form.colors.length ? form.variants.filter((v) => v.colorKey === null || !colorKeys.has(v.colorKey)) : [];

  /**
   * Switches the option type. Presets with values (shoe/clothing sizes) add the
   * missing values to every colour; "No options" leaves one Standard variant per
   * colour. Removing saved variants asks first (those with order history are
   * deactivated by the save instead of deleted).
   */
  const applyPreset = (value: VariantPreset) => {
    const def = VARIANT_PRESETS.find((p) => p.value === value);
    if (!def) return;
    const groups: (ProductFormColor | null)[] = form.colors.length ? form.colors : [null];
    if (value === 'none') {
      const removed = form.variants.filter((v) => !isStandardOption(v.sizeLabel));
      if (removed.some((v) => v.id) && !window.confirm(`Switch to a single variant per colour? ${removed.length} option value(s) will be removed when you save; saved ones with order history are deactivated instead.`)) return;
      setForm((f) => {
        let variants = f.variants.filter((v) => isStandardOption(v.sizeLabel));
        for (const color of groups) {
          const key = color?.key ?? null;
          if (!variants.some((v) => v.colorKey === key)) variants = insertForColor(variants, key, [makeVariant(f.sku, color, STANDARD_OPTION)]);
        }
        return { ...f, variantLabel: def.variantLabel, variants };
      });
    } else {
      const standard = form.variants.filter((v) => isStandardOption(v.sizeLabel));
      if (standard.some((v) => v.id) && !window.confirm('Remove the single variant so this product can have options? It is removed when you save; if it has order history it is deactivated instead.')) return;
      setForm((f) => {
        let variants = f.variants.filter((v) => !isStandardOption(v.sizeLabel));
        for (const color of groups) {
          const key = color?.key ?? null;
          const have = new Set(variants.filter((v) => v.colorKey === key).map((v) => v.sizeLabel.toLowerCase()));
          const fresh = def.values.filter((l) => !have.has(l.toLowerCase())).map((l) => makeVariant(f.sku, color, l));
          if (fresh.length) variants = insertForColor(variants, key, fresh);
        }
        // Custom keeps a typed name, but not the "Option" placeholder of "No options".
        const keepName = f.variantLabel.trim() && f.variantLabel.trim() !== 'Option';
        const variantLabel = def.variantLabel || (keepName ? f.variantLabel : '');
        return { ...f, variantLabel, variants };
      });
    }
    setPreset(value);
    if (value === 'custom') window.setTimeout(() => document.getElementById('p-variant-label')?.focus(), 0);
  };

  const updateColors = (fn: (c: ProductFormColor[]) => ProductFormColor[]) => setForm((f) => ({ ...f, colors: fn(f.colors) }));
  const patchColor = (key: string, value: Partial<ProductFormColor>) =>
    updateColors((list) => list.map((c) => (c.key === key ? { ...c, ...value } : c)));

  const addColor = () =>
    setForm((f) => {
      const color: ProductFormColor = { key: newKey('color'), id: null, name: '', hex: '#111111', family: 'black' };
      // The first colour adopts variants that were added without a colour.
      let variants = f.colors.length === 0 ? f.variants.map((v) => ({ ...v, colorKey: color.key })) : f.variants;
      // Without options every colour is one variant.
      if (noOptions && !variants.some((v) => v.colorKey === color.key)) variants = [...variants, makeVariant(f.sku, color, STANDARD_OPTION)];
      return { ...f, colors: [...f.colors, color], variants };
    });

  const removeColor = (key: string) => {
    const color = form.colors.find((c) => c.key === key);
    const own = form.variants.filter((v) => v.colorKey === key);
    if (own.some((v) => v.id) && !window.confirm(`Remove “${color?.name || 'this colour'}” and its ${own.length} variant(s)? Variants with order history cannot be removed; they are deactivated instead.`)) return;
    setForm((f) => ({
        ...f,
        colors: f.colors.filter((c) => c.key !== key),
        variants: f.variants.filter((v) => v.colorKey !== key),
        media: f.media.map((m) => (m.colorKey === key ? { ...m, colorKey: null } : m)),
    }));
  };

  const moveColor = (index: number, to: number) => updateColors((list) => moveItem(list, index, to));

  const patchVariant = (key: string, value: Partial<ProductFormVariant>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) => (v.key === key ? { ...v, ...value } : v)) }));

  const removeVariant = (key: string) => setForm((f) => ({ ...f, variants: f.variants.filter((v) => v.key !== key) }));

  const moveVariant = (key: string, direction: -1 | 1) =>
    setForm((f) => {
      const v = f.variants.find((x) => x.key === key);
      if (!v) return f;
      const group = f.variants.filter((x) => x.colorKey === v.colorKey);
      const pos = group.indexOf(v);
      const target = group[pos + direction];
      if (!target) return f;
      return { ...f, variants: moveItem(f.variants, f.variants.indexOf(v), f.variants.indexOf(target)) };
    });

  const addOptions = (color: ProductFormColor | null, labels: string[]) => {
    setForm((f) => {
      const existing = new Set(f.variants.filter((v) => v.colorKey === (color?.key ?? null)).map((v) => v.sizeLabel.toLowerCase()));
      const fresh = labels.filter((l) => !existing.has(l.toLowerCase())).map((l) => makeVariant(f.sku, color, l));
      return { ...f, variants: insertForColor(f.variants, color?.key ?? null, fresh) };
    });
  };

  const copyOptionsToAll = (from: ProductFormColor) =>
    setForm((f) => {
      const labels = f.variants.filter((v) => v.colorKey === from.key).map((v) => v.sizeLabel);
      let variants = [...f.variants];
      for (const color of f.colors) {
        if (color.key === from.key) continue;
        const have = new Set(variants.filter((v) => v.colorKey === color.key).map((v) => v.sizeLabel.toLowerCase()));
        const fresh = labels.filter((l) => l && !have.has(l.toLowerCase())).map((l) => makeVariant(f.sku, color, l));
        variants = insertForColor(variants, color.key, fresh);
      }
      return { ...f, variants };
    });

  const fillSkus = (colorKey: string | null) =>
    setForm((f) => {
      const color = f.colors.find((c) => c.key === colorKey) ?? null;
      return {
        ...f,
        variants: f.variants.map((v) =>
          v.colorKey === colorKey && !v.id ? { ...v, sku: suggestVariantSku(f.sku || 'SKU', color?.name ?? null, v.sizeLabel) } : v,
        ),
      };
    });

  // New products start without an option type: ask for one before offering values.
  const choosing = preset === '' && form.variants.length === 0;
  const chooseFirst = <p className="text-sm text-muted">Choose a variant option above, then add its values here.</p>;

  const groupProps = (color: ProductFormColor | null) => ({
    color,
    variants: form.variants.filter((v) => v.colorKey === (color?.key ?? null)),
    allVariants: form.variants,
    errors,
    optionName,
    noOptions,
    ukNumbers: preset === 'shoe',
    placeholder: presetDef?.placeholder || 'Type values separated by commas',
    onPatch: patchVariant,
    onRemove: removeVariant,
    onMove: moveVariant,
    onAdd: (labels: string[]) => addOptions(color, labels),
    onFillSkus: () => fillSkus(color?.key ?? null),
  });

  const totalVariants = form.variants.length;
  const activeVariants = form.variants.filter((v) => v.isActive).length;

  return (
    <Panel
      title="Colours & options"
      description={`${form.colors.length} colour(s), ${totalVariants} variant(s), ${activeVariants} active. Stock of saved variants is managed in Inventory; new variants can start with an initial stock.`}
      actions={
        <Button type="button" size="sm" variant="outline" onClick={addColor}>
          <Plus /> Add colour
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 rounded-xl border border-line bg-surface-2/40 p-4 sm:grid-cols-2">
          <Field
            label="Variant option"
            htmlFor="p-variant-preset"
            hint="What shoppers choose besides the colour. Presets fill in common values."
          >
            <NativeSelect id="p-variant-preset" value={preset} onChange={(e) => e.target.value && applyPreset(e.target.value as VariantPreset)}>
              {preset === '' ? <option value="">Choose…</option> : null}
              {VARIANT_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {preset === 'custom' ? (
            <Field label="Option name" htmlFor="p-variant-label" error={errors.variantLabel} hint="Shown to shoppers, e.g. Strap size, Pack size or Length. Empty uses “Size”.">
              <Input
                id="p-variant-label"
                value={form.variantLabel}
                maxLength={VARIANT_LABEL_MAX}
                placeholder="e.g. Strap size"
                aria-invalid={errors.variantLabel ? true : undefined}
                onChange={(e) => setForm((f) => ({ ...f, variantLabel: e.target.value }))}
              />
            </Field>
          ) : (
            <p className="self-center text-sm text-ink-2">
              {noOptions ? (
                <>
                  <strong className="font-medium text-ink">No options (single variant).</strong> Shoppers only pick a colour, if there are several; each
                  colour is one variant with its own SKU and stock.
                </>
              ) : preset ? (
                <>
                  Shoppers choose a <strong className="font-medium text-ink">{optionName.toLowerCase()}</strong>. It appears on the product page, in the
                  cart and on orders as “{optionName}: value”.
                </>
              ) : (
                'Choose how this product varies. Use “No options” for items sold in one version.'
              )}
            </p>
          )}
          {errors.variantLabel && preset !== 'custom' ? (
            <p className="text-xs font-medium text-danger sm:col-span-2" role="alert">
              {errors.variantLabel}
            </p>
          ) : null}
        </div>

        {form.colors.length === 0 ? (
          <>
            <Notice tone="neutral">
              No colours yet. Add colours if this product comes in several colourways; otherwise the {noOptions ? 'variant' : 'options'} below apply to
              the product as a whole.
            </Notice>
            {choosing ? chooseFirst : <OptionGroup {...groupProps(null)} />}
          </>
        ) : null}

        {form.colors.map((color, ci) => {
          const colorErrors = ['name', 'hex', 'family', 'key'].map((k) => errors[`colors.${ci}.${k}`]).filter(Boolean);
          return (
            <section key={color.key} className="rounded-xl border border-line bg-paper" aria-label={`Colour ${color.name || ci + 1}`}>
              <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
                <div className="flex items-end gap-2">
                  <label className="sr-only" htmlFor={`color-picker-${color.key}`}>
                    Pick colour {ci + 1}
                  </label>
                  <input
                    id={`color-picker-${color.key}`}
                    type="color"
                    value={HEX_RE.test(color.hex) ? color.hex : '#000000'}
                    onChange={(e) => patchColor(color.key, { hex: e.target.value.toUpperCase() })}
                    className="size-10 cursor-pointer rounded-lg border border-line-strong bg-surface p-1"
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor={`color-hex-${color.key}`}>
                      Hex
                    </label>
                    <Input
                      id={`color-hex-${color.key}`}
                      className="h-10 w-28 font-mono text-xs uppercase"
                      value={color.hex}
                      maxLength={7}
                      aria-invalid={errors[`colors.${ci}.hex`] ? true : undefined}
                      onChange={(e) => patchColor(color.key, { hex: e.target.value.trim() })}
                    />
                  </div>
                </div>
                <div className="min-w-40 flex-1">
                  <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor={`color-name-${color.key}`}>
                    Colour name <span className="text-danger" aria-hidden>*</span>
                  </label>
                  <Input
                    id={`color-name-${color.key}`}
                    className="h-10"
                    value={color.name}
                    maxLength={40}
                    placeholder="e.g. Midnight Black"
                    aria-invalid={errors[`colors.${ci}.name`] ? true : undefined}
                    onChange={(e) => patchColor(color.key, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor={`color-family-${color.key}`}>
                    Colour family (filters)
                  </label>
                  <NativeSelect
                    id={`color-family-${color.key}`}
                    className="h-10 w-36"
                    value={color.family}
                    onChange={(e) => patchColor(color.key, { family: e.target.value as ProductFormColor['family'] })}
                  >
                    {COLOR_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {titleCase(f)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Move colour up" disabled={ci === 0} onClick={() => moveColor(ci, ci - 1)}>
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Move colour down"
                    disabled={ci === form.colors.length - 1}
                    onClick={() => moveColor(ci, ci + 1)}
                  >
                    <ArrowDown />
                  </Button>
                  {form.colors.length > 1 && !noOptions ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Copy the ${optionName.toLowerCase()} values of ${color.name || 'this colour'} to the other colours`}
                      title={`Copy these ${optionName.toLowerCase()} values to the other colours`}
                      onClick={() => copyOptionsToAll(color)}
                    >
                      <Copy />
                    </Button>
                  ) : null}
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove colour ${color.name || ci + 1}`} onClick={() => removeColor(color.key)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {colorErrors.length ? (
                <p className="px-4 pt-2 text-xs font-medium text-danger" role="alert">
                  {colorErrors.join(' ')}
                </p>
              ) : null}
              <div className="p-4">{choosing ? chooseFirst : <OptionGroup {...groupProps(color)} />}</div>
            </section>
          );
        })}

        {unassigned.length ? (
          <section className="rounded-xl border border-warning/40 bg-warning/5 p-4" aria-label="Variants without a colour">
            <p className="mb-3 text-sm font-medium">Variants without a colour</p>
            <p className="mb-3 text-xs text-ink-2">Customers only see the variants of the selected colour. Assign each of these variants to a colour.</p>
            <ul className="space-y-2">
              {unassigned.map((v) => (
                <li key={v.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-24 font-medium">{isStandardOption(v.sizeLabel) ? 'Single variant' : v.sizeLabel}</span>
                  <span className="font-mono text-xs text-muted">{v.sku}</span>
                  <label className="sr-only" htmlFor={`assign-${v.key}`}>
                    Colour for {v.sizeLabel}
                  </label>
                  <NativeSelect
                    id={`assign-${v.key}`}
                    className="h-9 w-48"
                    value=""
                    onChange={(e) => e.target.value && patchVariant(v.key, { colorKey: e.target.value })}
                  >
                    <option value="">Assign to colour…</option>
                    {form.colors.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name || 'Unnamed colour'}
                      </option>
                    ))}
                  </NativeSelect>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Panel>
  );
}

function OptionGroup({
  color,
  variants,
  allVariants,
  errors,
  optionName,
  noOptions,
  ukNumbers,
  placeholder,
  onPatch,
  onRemove,
  onMove,
  onAdd,
  onFillSkus,
}: {
  color: ProductFormColor | null;
  variants: ProductFormVariant[];
  allVariants: ProductFormVariant[];
  errors: Record<string, string>;
  optionName: string;
  noOptions: boolean;
  ukNumbers: boolean;
  placeholder: string;
  onPatch: (key: string, value: Partial<ProductFormVariant>) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onAdd: (labels: string[]) => void;
  onFillSkus: () => void;
}) {
  const [optionInput, setOptionInput] = React.useState('');
  const groupId = color?.key ?? 'none';
  const lower = optionName.toLowerCase();
  const add = () => {
    const labels = parseOptionList(optionInput, ukNumbers);
    if (!labels.length) return toast.error(`Type one or more ${lower} values separated by commas.`);
    onAdd(labels);
    setOptionInput('');
  };

  return (
    <div className="space-y-3">
      {variants.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="pr-2 pb-2 font-medium">{noOptions ? 'Variant' : optionName}</th>
                <th scope="col" className="pr-2 pb-2 font-medium">SKU</th>
                <th scope="col" className="pr-2 pb-2 font-medium">Stock</th>
                <th scope="col" className="pr-2 pb-2 font-medium">Active</th>
                <th scope="col" className="pb-2">
                  <span className="sr-only">Row actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => {
                const index = allVariants.indexOf(v);
                const err = (field: string) => errors[`variants.${index}.${field}`];
                const rowError = err('sizeLabel') ?? err('sku') ?? err('initialStock') ?? err('colorKey');
                const single = noOptions && isStandardOption(v.sizeLabel);
                const label = single ? 'single variant' : `${lower} ${v.sizeLabel || `row ${i + 1}`}`;
                return (
                  <React.Fragment key={v.key}>
                    <tr className="align-middle">
                      <td className="py-1 pr-2">
                        {single ? (
                          <span className="inline-flex h-9 items-center text-sm text-ink-2">Single variant</span>
                        ) : (
                          <>
                            <label className="sr-only" htmlFor={`size-${v.key}`}>
                              {optionName} value
                            </label>
                            <Input
                              id={`size-${v.key}`}
                              className="h-9 w-28"
                              value={v.sizeLabel}
                              maxLength={OPTION_VALUE_MAX}
                              aria-invalid={err('sizeLabel') ? true : undefined}
                              onChange={(e) => onPatch(v.key, { sizeLabel: e.target.value })}
                            />
                          </>
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <label className="sr-only" htmlFor={`sku-${v.key}`}>
                          SKU for {label}
                        </label>
                        <Input
                          id={`sku-${v.key}`}
                          className="h-9 w-full min-w-48 font-mono text-xs uppercase"
                          value={v.sku}
                          maxLength={60}
                          aria-invalid={err('sku') ? true : undefined}
                          onChange={(e) => onPatch(v.key, { sku: e.target.value.toUpperCase().replace(/\s+/g, '-') })}
                        />
                      </td>
                      <td className="py-1 pr-2 whitespace-nowrap">
                        {v.id ? (
                          <div className="text-xs">
                            <span className="font-medium tabular-nums">{v.stockOnHand ?? 0}</span> on hand
                            {v.stockReserved ? <span className="text-muted"> · {v.stockReserved} reserved</span> : null}
                            <Link href={`/admin/inventory?q=${encodeURIComponent(v.sku)}`} className="ml-2 text-muted underline underline-offset-2 hover:text-ink">
                              Adjust
                            </Link>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <label className="sr-only" htmlFor={`stock-${v.key}`}>
                              Initial stock for {label}
                            </label>
                            <Input
                              id={`stock-${v.key}`}
                              className="h-9 w-20 tabular-nums"
                              inputMode="numeric"
                              value={v.initialStock}
                              maxLength={6}
                              aria-invalid={err('initialStock') ? true : undefined}
                              onChange={(e) => onPatch(v.key, { initialStock: e.target.value.replace(/\D/g, '') })}
                            />
                            <Badge tone="info">new</Badge>
                          </div>
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <Switch checked={v.isActive} onCheckedChange={(on) => onPatch(v.key, { isActive: on })} aria-label={`${single ? 'Single variant' : `${optionName} ${v.sizeLabel || i + 1}`} is active`} />
                      </td>
                      <td className="py-1">
                        <div className="flex justify-end gap-0.5">
                          {noOptions ? null : (
                            <>
                              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => onMove(v.key, -1)}>
                                <ArrowUp />
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Move ${label} down`}
                                disabled={i === variants.length - 1}
                                onClick={() => onMove(v.key, 1)}
                              >
                                <ArrowDown />
                              </Button>
                            </>
                          )}
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove ${label}`}
                            title={v.id ? 'Variants with order history are deactivated instead of deleted' : 'Remove variant'}
                            onClick={() => onRemove(v.key)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {rowError ? (
                      <tr>
                        <td colSpan={5} className="pb-1 text-xs font-medium text-danger" role="alert">
                          {rowError}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {noOptions ? 'No variant yet' : `No ${lower} values yet`}
          {color ? ` for ${color.name || 'this colour'}` : ''}.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {noOptions ? (
          variants.length === 0 ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => onAdd([STANDARD_OPTION])}>
              <Plus /> Add the single variant
            </Button>
          ) : null
        ) : (
          <>
            <div className="min-w-56 flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor={`add-sizes-${groupId}`}>
                Add {lower} values{color?.name ? ` to ${color.name}` : ''}
              </label>
              <Input
                id={`add-sizes-${groupId}`}
                className="h-9"
                value={optionInput}
                placeholder={placeholder}
                onChange={(e) => setOptionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    add();
                  }
                }}
              />
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={add} aria-label={`Add ${lower} values${color?.name ? ` to ${color.name}` : ''}`}>
              <Plus /> Add
            </Button>
          </>
        )}
        {variants.some((v) => !v.id) ? (
          <Button type="button" size="sm" variant="ghost" onClick={onFillSkus} title="Regenerate SKUs of new variants from the product SKU, colour and option value">
            <Wand2 /> Regenerate new SKUs
          </Button>
        ) : null}
      </div>
    </div>
  );
}
