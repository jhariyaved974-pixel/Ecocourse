'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Notice } from '@/components/ui/misc';
import { Input, NativeSelect, Switch } from '@/components/ui/form-controls';
import { Panel } from '@/components/admin/ui';
import { moveItem, newKey } from '@/components/admin/catalog/list-utils';
import {
  COLOR_FAMILIES,
  HEX_RE,
  suggestVariantSku,
  type ProductFormColor,
  type ProductFormState,
  type ProductFormVariant,
} from '@/lib/admin/products';
import { titleCase } from '@/lib/utils';

type SetForm = React.Dispatch<React.SetStateAction<ProductFormState>>;

/** "6, 7, 8" → ["UK 6", "UK 7", "UK 8"]; other labels are kept as typed. */
function parseSizeList(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,;\n]/)) {
    const token = raw.trim().replace(/\s+/g, ' ');
    if (!token) continue;
    const label = /^\d+(\.\d+)?$/.test(token) ? `UK ${token}` : token;
    if (!out.some((l) => l.toLowerCase() === label.toLowerCase())) out.push(label.slice(0, 20));
  }
  return out;
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
  const colorKeys = new Set(form.colors.map((c) => c.key));
  const unassigned = form.colors.length ? form.variants.filter((v) => v.colorKey === null || !colorKeys.has(v.colorKey)) : [];

  const updateColors = (fn: (c: ProductFormColor[]) => ProductFormColor[]) => setForm((f) => ({ ...f, colors: fn(f.colors) }));
  const patchColor = (key: string, value: Partial<ProductFormColor>) =>
    updateColors((list) => list.map((c) => (c.key === key ? { ...c, ...value } : c)));

  const addColor = () =>
    setForm((f) => {
      const color: ProductFormColor = { key: newKey('color'), id: null, name: '', hex: '#111111', family: 'black' };
      // The first colour adopts sizes that were added without a colour.
      const variants = f.colors.length === 0 ? f.variants.map((v) => ({ ...v, colorKey: color.key })) : f.variants;
      return { ...f, colors: [...f.colors, color], variants };
    });

  const removeColor = (key: string) => {
    const color = form.colors.find((c) => c.key === key);
    const sizes = form.variants.filter((v) => v.colorKey === key);
    if (sizes.some((v) => v.id) && !window.confirm(`Remove “${color?.name || 'this colour'}” and its ${sizes.length} size(s)? Sizes with order history cannot be removed; deactivate them instead.`)) return;
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

  const addSizes = (color: ProductFormColor | null, labels: string[]) => {
    setForm((f) => {
      const existing = new Set(f.variants.filter((v) => v.colorKey === (color?.key ?? null)).map((v) => v.sizeLabel.toLowerCase()));
      const fresh = labels.filter((l) => !existing.has(l.toLowerCase())).map((l) => makeVariant(f.sku, color, l));
      // Keep each colour's sizes together.
      const lastIndex = f.variants.map((v) => v.colorKey).lastIndexOf(color?.key ?? null);
      const variants = [...f.variants];
      variants.splice(lastIndex >= 0 ? lastIndex + 1 : variants.length, 0, ...fresh);
      return { ...f, variants };
    });
  };

  const copySizesToAll = (from: ProductFormColor) =>
    setForm((f) => {
      const labels = f.variants.filter((v) => v.colorKey === from.key).map((v) => v.sizeLabel);
      let variants = [...f.variants];
      for (const color of f.colors) {
        if (color.key === from.key) continue;
        const have = new Set(variants.filter((v) => v.colorKey === color.key).map((v) => v.sizeLabel.toLowerCase()));
        const fresh = labels.filter((l) => l && !have.has(l.toLowerCase())).map((l) => makeVariant(f.sku, color, l));
        const lastIndex = variants.map((v) => v.colorKey).lastIndexOf(color.key);
        variants = [...variants];
        variants.splice(lastIndex >= 0 ? lastIndex + 1 : variants.length, 0, ...fresh);
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

  const totalSizes = form.variants.length;
  const activeSizes = form.variants.filter((v) => v.isActive).length;

  return (
    <Panel
      title="Colours & sizes"
      description={`${form.colors.length} colour(s), ${totalSizes} size(s), ${activeSizes} active. Stock of saved sizes is managed in Inventory; new sizes can start with an initial stock.`}
      actions={
        <Button type="button" size="sm" variant="outline" onClick={addColor}>
          <Plus /> Add colour
        </Button>
      }
    >
      <div className="space-y-5">
        {form.colors.length === 0 ? (
          <>
            <Notice tone="neutral">
              No colours yet. Add colours if this product comes in several colourways; otherwise the sizes below apply to the product as a whole.
            </Notice>
            <SizeGroup
              color={null}
              variants={form.variants.filter((v) => v.colorKey === null)}
              allVariants={form.variants}
              errors={errors}
              onPatch={patchVariant}
              onRemove={removeVariant}
              onMove={moveVariant}
              onAdd={(labels) => addSizes(null, labels)}
              onFillSkus={() => fillSkus(null)}
            />
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
                  {form.colors.length > 1 ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Copy sizes of ${color.name || 'this colour'} to the other colours`}
                      title="Copy these sizes to the other colours"
                      onClick={() => copySizesToAll(color)}
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
              <div className="p-4">
                <SizeGroup
                  color={color}
                  variants={form.variants.filter((v) => v.colorKey === color.key)}
                  allVariants={form.variants}
                  errors={errors}
                  onPatch={patchVariant}
                  onRemove={removeVariant}
                  onMove={moveVariant}
                  onAdd={(labels) => addSizes(color, labels)}
                  onFillSkus={() => fillSkus(color.key)}
                />
              </div>
            </section>
          );
        })}

        {unassigned.length ? (
          <section className="rounded-xl border border-warning/40 bg-warning/5 p-4" aria-label="Sizes without a colour">
            <p className="mb-3 text-sm font-medium">Sizes without a colour</p>
            <p className="mb-3 text-xs text-ink-2">Customers only see sizes of the selected colour. Assign each of these sizes to a colour.</p>
            <ul className="space-y-2">
              {unassigned.map((v) => (
                <li key={v.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-24 font-medium">{v.sizeLabel}</span>
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

function SizeGroup({
  color,
  variants,
  allVariants,
  errors,
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
  onPatch: (key: string, value: Partial<ProductFormVariant>) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onAdd: (labels: string[]) => void;
  onFillSkus: () => void;
}) {
  const [sizeInput, setSizeInput] = React.useState('');
  const groupId = color?.key ?? 'none';
  const add = () => {
    const labels = parseSizeList(sizeInput);
    if (!labels.length) return toast.error('Type one or more sizes, e.g. 6, 7, 8 or S, M, L.');
    onAdd(labels);
    setSizeInput('');
  };

  return (
    <div className="space-y-3">
      {variants.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="pr-2 pb-2 font-medium">Size</th>
                <th scope="col" className="pr-2 pb-2 font-medium">Size SKU</th>
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
                const label = v.sizeLabel || `row ${i + 1}`;
                return (
                  <React.Fragment key={v.key}>
                    <tr className="align-middle">
                      <td className="py-1 pr-2">
                        <label className="sr-only" htmlFor={`size-${v.key}`}>
                          Size label
                        </label>
                        <Input
                          id={`size-${v.key}`}
                          className="h-9 w-28"
                          value={v.sizeLabel}
                          maxLength={20}
                          aria-invalid={err('sizeLabel') ? true : undefined}
                          onChange={(e) => onPatch(v.key, { sizeLabel: e.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <label className="sr-only" htmlFor={`sku-${v.key}`}>
                          SKU for size {label}
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
                              Initial stock for size {label}
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
                        <Switch checked={v.isActive} onCheckedChange={(on) => onPatch(v.key, { isActive: on })} aria-label={`Size ${label} is active`} />
                      </td>
                      <td className="py-1">
                        <div className="flex justify-end gap-0.5">
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move size ${label} up`} disabled={i === 0} onClick={() => onMove(v.key, -1)}>
                            <ArrowUp />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move size ${label} down`}
                            disabled={i === variants.length - 1}
                            onClick={() => onMove(v.key, 1)}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove size ${label}`}
                            title={v.id ? 'Sizes with order history are deactivated instead of deleted' : 'Remove size'}
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
        <p className="text-sm text-muted">No sizes yet{color ? ` for ${color.name || 'this colour'}` : ''}.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor={`add-sizes-${groupId}`}>
            Add sizes{color?.name ? ` to ${color.name}` : ''}
          </label>
          <Input
            id={`add-sizes-${groupId}`}
            className="h-9"
            value={sizeInput}
            placeholder="6, 7, 8, 9, 10  (numbers become UK sizes)"
            onChange={(e) => setSizeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={add} aria-label={`Add sizes${color?.name ? ` to ${color.name}` : ''}`}>
          <Plus /> Add
        </Button>
        {variants.some((v) => !v.id) ? (
          <Button type="button" size="sm" variant="ghost" onClick={onFillSkus} title="Regenerate SKUs of new sizes from the product SKU, colour and size">
            <Wand2 /> Regenerate new SKUs
          </Button>
        ) : null}
      </div>
    </div>
  );
}
