'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Ruler, ShieldCheck, Truck, RefreshCw } from 'lucide-react';
import type { ProductDetailData } from '@/lib/catalog/types';
import { ProductGallery } from './gallery';
import { Price, Stars, WishlistButton } from '@/components/store/product-bits';
import { QuantityStepper } from '@/components/store/cart-drawer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/menus';
import { cartStore, openCartDrawer } from '@/lib/cart/store';
import { getLiveAvailability } from '@/app/(store)/products/[slug]/actions';
import { cn, formatMoney } from '@/lib/utils';

export interface SizeGuideData {
  name: string;
  intro: string;
  notes: string;
  rows: { uk: string; us: string; eu: string; foot_length_cm: number | null }[];
}

export function ProductExperience({
  product,
  sizeGuide,
  shipping,
  returnDays,
  description,
}: {
  description: React.ReactNode;
  product: ProductDetailData;
  sizeGuide: SizeGuideData | null;
  shipping: { name: string; minDays: number; maxDays: number; fee: number; freeOver: number | null }[];
  returnDays: number;
}) {
  const router = useRouter();
  const [colorId, setColorId] = React.useState<string | null>(product.colors[0]?.id ?? null);
  const [variantId, setVariantId] = React.useState<string | null>(null);
  const [requestedQty, setQuantity] = React.useState(1);
  const [live, setLive] = React.useState<Record<string, number> | null>(null);
  const [sizeError, setSizeError] = React.useState(false);
  const color = product.colors.find((c) => c.id === colorId) ?? null;

  React.useEffect(() => {
    let cancelled = false;
    getLiveAvailability(product.id).then((a) => !cancelled && setLive(a));
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  const variants = product.variants.filter((v) => (product.colors.length ? v.colorId === colorId : true));
  const availableOf = (id: string) => live?.[id] ?? product.variants.find((v) => v.id === id)?.available ?? 0;
  const selected = variants.find((v) => v.id === variantId) ?? null;
  const selectedAvailable = selected ? availableOf(selected.id) : 0;
  const maxQty = Math.max(1, Math.min(10, selectedAvailable));
  const anyInStock = variants.some((v) => availableOf(v.id) > 0);

  const quantity = Math.min(requestedQty, maxQty);
  const selectColor = (id: string) => {
    // A new colour has different variants: clear the size and quantity.
    setColorId(id);
    setVariantId(null);
    setQuantity(1);
  };

  const cover = product.media.find((m) => m.kind === 'image' && (m.colorId === colorId || m.colorId === null)) ?? product.media.find((m) => m.kind === 'image');

  const add = (buyNow: boolean) => {
    if (!selected) {
      setSizeError(true);
      document.getElementById('size-picker')?.focus();
      return;
    }
    if (selectedAvailable < 1) {
      toast.error('That size just sold out. Please choose another.');
      return;
    }
    const added = cartStore.add(
      {
        variantId: selected.id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: cover?.url ?? null,
        colorName: color?.name ?? null,
        sizeLabel: selected.sizeLabel,
        unitPrice: product.finalPrice,
      },
      quantity,
      selectedAvailable,
    );
    if (!added) {
      toast.error('Your cart is full. Remove an item to add more.');
      return;
    }
    if (buyNow) {
      router.push('/checkout');
    } else {
      toast.success(`Added ${product.name} (${selected.sizeLabel}) to your cart`, { action: { label: 'View cart', onClick: openCartDrawer } });
      openCartDrawer();
    }
  };

  const freeOver = shipping.find((s) => s.freeOver !== null)?.freeOver ?? null;
  const fastest = shipping.length ? shipping.reduce((a, b) => (b.minDays < a.minDays ? b : a)) : null;
  const standard = shipping[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
      <ProductGallery media={product.media} modelUrl={product.modelUrl} tint={color?.hex ?? null} productName={product.name} activeColorId={colorId} />

      <div className="lg:sticky lg:top-24 lg:self-start">
        {product.category ? (
          <Link href={`/category/${product.category.slug}`} className="eyebrow text-muted hover:text-ink">
            {product.category.name}
          </Link>
        ) : null}
        <h1 className="font-display mt-3 text-4xl leading-[1.05] md:text-5xl">{product.name}</h1>
        {product.ratingCount > 0 ? (
          <a href="#reviews" className="mt-3 inline-flex">
            <Stars rating={product.ratingAvg} count={product.ratingCount} />
          </a>
        ) : null}
        <Price price={product.price} finalPrice={product.finalPrice} size="lg" className="mt-5" />
        <p className="mt-1 text-xs text-muted">Inclusive of all taxes</p>
        {product.shortDescription ? <p className="mt-5 text-sm leading-relaxed text-ink-2">{product.shortDescription}</p> : null}

        {product.colors.length ? (
          <div className="mt-8">
            <p className="text-sm">
              <span className="text-muted">Colour:</span> <span className="font-medium">{color?.name}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-3" role="radiogroup" aria-label="Colour">
              {product.colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === colorId}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => selectColor(c.id)}
                  className={cn('size-10 rounded-full border-2 border-white transition-transform hover:scale-105', c.id === colorId ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : 'shadow-[0_0_0_1px_var(--line-strong)]')}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              <span className="text-muted">Size:</span> <span className="font-medium">{selected?.sizeLabel ?? 'Select a size'}</span>
            </p>
            {sizeGuide ? (
              <Dialog>
                <DialogTrigger className="inline-flex items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline">
                  <Ruler className="size-3.5" /> Size guide
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>{sizeGuide.name}</DialogTitle>
                    <DialogDescription>{sizeGuide.intro}</DialogDescription>
                  </DialogHeader>
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Size conversions</caption>
                      <thead className="bg-surface-2 text-left text-xs text-muted">
                        <tr>
                          <th scope="col" className="px-4 py-2.5 font-medium">UK / India</th>
                          <th scope="col" className="px-4 py-2.5 font-medium">US</th>
                          <th scope="col" className="px-4 py-2.5 font-medium">EU</th>
                          <th scope="col" className="px-4 py-2.5 font-medium">Foot length</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sizeGuide.rows.map((r) => (
                          <tr key={r.uk} className="border-t border-line">
                            <th scope="row" className="px-4 py-2.5 text-left font-medium">{r.uk}</th>
                            <td className="px-4 py-2.5">{r.us}</td>
                            <td className="px-4 py-2.5">{r.eu}</td>
                            <td className="px-4 py-2.5 tabular-nums">{r.foot_length_cm ? `${r.foot_length_cm} cm` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sizeGuide.notes ? <p className="mt-4 text-xs text-muted">{sizeGuide.notes}</p> : null}
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
          <div
            id="size-picker"
            tabIndex={-1}
            role="radiogroup"
            aria-label="Size"
            aria-describedby={sizeError ? 'size-error' : undefined}
            className="mt-3 grid grid-cols-4 gap-2 outline-none sm:grid-cols-5"
          >
            {variants.map((v) => {
              const avail = availableOf(v.id);
              const out = avail < 1;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={v.id === variantId}
                  aria-disabled={out}
                  onClick={() => {
                    if (out) return;
                    setVariantId(v.id);
                    setSizeError(false);
                  }}
                  className={cn(
                    'relative h-12 rounded-xl border text-sm font-medium transition-colors',
                    v.id === variantId ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink',
                    out && 'cursor-not-allowed border-dashed text-muted line-through decoration-1 opacity-60 hover:border-line-strong',
                  )}
                >
                  {v.sizeLabel.replace(/^UK\s*/i, '')}
                  {!out && avail <= 3 ? <span className="absolute -top-1.5 -right-1.5 size-2.5 rounded-full bg-warning" aria-hidden /> : null}
                  <span className="sr-only">{out ? ' — sold out' : avail <= 3 ? ` — only ${avail} left` : ''}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 min-h-5 text-xs" aria-live="polite">
            {sizeError ? (
              <p id="size-error" className="font-medium text-danger">Please select a size.</p>
            ) : selected ? (
              selectedAvailable <= 3 ? (
                <p className="font-medium text-warning">Only {selectedAvailable} left in {selected.sizeLabel}</p>
              ) : (
                <p className="inline-flex items-center gap-1 text-success"><Check className="size-3.5" /> In stock</p>
              )
            ) : !anyInStock ? (
              <p className="font-medium text-danger">This colour is currently sold out.</p>
            ) : (
              <p className="text-muted">Sizes are UK/India. Dot = low stock.</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <QuantityStepper value={quantity} max={maxQty} onChange={(n) => setQuantity(Math.max(1, Math.min(n, maxQty)))} label={product.name} />
          <WishlistButton productId={product.id} productName={product.name} variant="inline" className="ml-auto" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button size="lg" onClick={() => add(false)} disabled={!anyInStock} className="h-14">
            {anyInStock ? 'Add to cart' : 'Sold out'}
          </Button>
          <Button size="lg" variant="accent" onClick={() => add(true)} disabled={!anyInStock} className="h-14">
            Buy now
          </Button>
        </div>

        <ul className="mt-8 space-y-3 rounded-2xl border border-line bg-surface p-5 text-sm">
          {standard ? (
            <li className="flex gap-3">
              <Truck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {standard.name}: {standard.minDays}–{standard.maxDays} business days
                {freeOver !== null ? <> · free over {formatMoney(freeOver)}</> : null}
                {fastest && fastest !== standard ? <> · {fastest.name} in {fastest.minDays}–{fastest.maxDays} days</> : null}
              </span>
            </li>
          ) : null}
          <li className="flex gap-3">
            <RefreshCw className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{returnDays}-day size exchanges on unworn pairs. <Link href="/pages/returns-and-exchanges" className="underline underline-offset-2">Details</Link></span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Pay by UPI. Every payment is verified by our team before dispatch.</span>
          </li>
        </ul>

        <Accordion type="multiple" defaultValue={['description']} className="mt-8">
          <AccordionItem value="description">
            <AccordionTrigger>Description</AccordionTrigger>
            <AccordionContent className="text-ink-2">
              {description}
            </AccordionContent>
          </AccordionItem>
          {product.attributes.length ? (
            <AccordionItem value="specs">
              <AccordionTrigger>Specifications</AccordionTrigger>
              <AccordionContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  {product.attributes.map((a) => (
                    <React.Fragment key={a.label}>
                      <dt className="text-muted">{a.label}</dt>
                      <dd className="text-ink">{a.value}</dd>
                    </React.Fragment>
                  ))}
                  <dt className="text-muted">Style code</dt>
                  <dd className="text-ink">{product.sku}</dd>
                </dl>
              </AccordionContent>
            </AccordionItem>
          ) : null}
          <AccordionItem value="shipping">
            <AccordionTrigger>Shipping & returns</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1.5">
                {shipping.map((s) => (
                  <li key={s.name}>
                    {s.name}: {s.fee === 0 ? 'Free' : formatMoney(s.fee)}
                    {s.freeOver !== null ? ` (free over ${formatMoney(s.freeOver)})` : ''} · {s.minDays}–{s.maxDays} business days
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                Orders ship once payment is verified. Read our <Link href="/pages/shipping-policy" className="underline">shipping policy</Link> and{' '}
                <Link href="/pages/returns-and-exchanges" className="underline">returns policy</Link>.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
