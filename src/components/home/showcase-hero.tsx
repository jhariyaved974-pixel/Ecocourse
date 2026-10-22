import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import type { HomeSection } from '@/lib/content/queries';
import type { ProductCardData } from '@/lib/catalog/types';
import { Price } from '@/components/store/product-bits';
import { ShoeArt, shoeTint, shoeTypeFor } from '@/components/store/shoe-art';
import { DepartmentIcon } from '@/components/store/department-icon';
import { Button } from '@/components/ui/button';
import { cn, discountPercent, formatMoney } from '@/lib/utils';

export interface HeroDepartment {
  slug: string;
  name: string;
}

/** A product's photo, its drawing (shoes without photos) or its department icon. */
function Visual({ product, sizes, priority, className }: { product: ProductCardData; sizes: string; priority?: boolean; className?: string }) {
  if (product.image) {
    return <Image src={product.image} alt="" fill priority={priority} sizes={sizes} className={cn('object-cover', className)} />;
  }
  const art = shoeTypeFor({ name: product.name, categorySlug: product.categorySlug });
  const color = product.colors[0]?.hex ?? '#1d2a4a';
  return (
    <div className="absolute inset-0 grid place-items-center px-[10%]" style={{ background: shoeTint(color) }}>
      {art ? <ShoeArt type={art} color={color} className={className} /> : <DepartmentIcon slug={product.categorySlug ?? ''} className="size-1/3 text-ink-2" strokeWidth={1.2} />}
    </div>
  );
}

/**
 * Light hero in the original Save The Money style: a two-line capitalised
 * headline ("Everything you need. / Honest prices.") beside a deal board of
 * real products on a yellow disc, with a quick row of departments below.
 * Used when the hero has no photo or 3D scene.
 */
export function ShowcaseHero({
  section,
  products,
  departments,
  returnDays,
}: {
  section: HomeSection;
  products: ProductCardData[];
  departments: HeroDepartment[];
  returnDays: number;
}) {
  // The headline's second sentence is set in the brand green.
  const [lead, ...rest] = section.heading.split(/(?<=[.!?])\s+/);
  const accentLine = rest.join(' ');
  const [main, ...side] = products;
  const off = main ? discountPercent(main.price, main.finalPrice) : 0;

  return (
    <section className="relative overflow-hidden border-b border-line" aria-labelledby="hero-heading">
      <div className="pointer-events-none absolute -top-48 -left-48 size-[560px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_70%)]" aria-hidden />
      <div className="pointer-events-none absolute -right-40 -bottom-56 size-[520px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--highlight)_22%,transparent),transparent_70%)]" aria-hidden />
      <div className="container-x relative grid items-center gap-12 pt-10 pb-10 md:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pt-16 lg:pb-14">
        <div className="relative z-10 max-w-2xl">
          {section.eyebrow ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-highlight px-3.5 py-1.5 text-[11px] font-bold tracking-[0.16em] text-highlight-ink uppercase">
              <span className="size-1.5 rounded-full bg-highlight-ink" aria-hidden />
              {section.eyebrow}
            </p>
          ) : null}
          <h1 id="hero-heading" className="font-display mt-6 text-[clamp(2.75rem,6.6vw,6rem)] leading-[0.9] text-balance">
            <span className="block">{lead}</span>
            {accentLine ? <span className="block text-accent-text">{accentLine}</span> : null}
          </h1>
          {section.subheading ? <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-2 md:text-lg">{section.subheading}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            {section.ctaLabel && section.ctaHref ? (
              <Button asChild size="xl">
                <Link href={section.ctaHref}>
                  {section.ctaLabel} <ArrowRight />
                </Link>
              </Button>
            ) : null}
            {section.secondaryCtaLabel && section.secondaryCtaHref ? (
              <Button asChild size="xl" variant="outline">
                <Link href={section.secondaryCtaHref}>{section.secondaryCtaLabel}</Link>
              </Button>
            ) : null}
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-ink-2">
            <li className="inline-flex items-center gap-2"><BadgeCheck className="size-4 text-accent-text" aria-hidden /> MRP shown on every item</li>
            <li className="inline-flex items-center gap-2"><RefreshCw className="size-4 text-accent-text" aria-hidden /> {returnDays}-day easy returns</li>
            <li className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-accent-text" aria-hidden /> Verified UPI payments</li>
          </ul>
        </div>

        {main ? (
          <div className="relative mx-auto aspect-square w-full max-w-[580px]">
            <div className="absolute inset-[6%] rounded-full bg-highlight" aria-hidden />
            <div className="absolute inset-[15%] rounded-full border-2 border-dashed border-highlight-ink/15" aria-hidden />
            <Link
              href={`/products/${main.slug}`}
              aria-label={`${main.name}, ${formatMoney(main.finalPrice)}`}
              className="group absolute top-1/2 left-1/2 aspect-square w-[58%] -translate-x-1/2 -translate-y-1/2 -rotate-3 overflow-hidden rounded-[calc(var(--radius)*1.5)] border-4 border-surface bg-surface-2 shadow-[0_30px_60px_-30px_rgba(17,17,17,0.55)] transition-transform duration-500 hover:rotate-0"
            >
              <Visual product={main} priority sizes="(min-width: 1024px) 30vw, 60vw" className="transition-transform duration-700 group-hover:scale-105" />
            </Link>
            {off ? (
              <span className="font-display absolute top-[5%] right-[6%] grid size-20 rotate-12 place-items-center rounded-full bg-sale text-center text-lg leading-none text-white shadow-lg md:size-24 md:text-2xl">
                −{off}%
              </span>
            ) : null}
            <div className="absolute bottom-[3%] left-0 w-[64%] max-w-72 rounded-2xl border border-line bg-surface p-4 shadow-[0_18px_40px_-20px_rgba(17,17,17,0.35)] sm:left-[2%]">
              <p className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{main.categoryName ?? 'Featured'}</p>
              <p className="mt-0.5 line-clamp-1 font-semibold">{main.name}</p>
              <Price price={main.price} finalPrice={main.finalPrice} className="mt-1.5" />
            </div>
            {side.slice(0, 2).map((p, i) => (
              <Link
                key={p.id}
                href={`/products/${p.slug}`}
                className={cn(
                  'absolute hidden w-[38%] max-w-52 items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 pr-3 shadow-[0_18px_40px_-22px_rgba(17,17,17,0.4)] transition-transform hover:-translate-y-1 sm:flex',
                  i === 0 ? 'top-[14%] -left-[2%] -rotate-2' : 'right-[-2%] bottom-[22%] rotate-2',
                )}
              >
                <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                  <Visual product={p} sizes="48px" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{p.name}</span>
                  <span className="mt-0.5 block text-xs">
                    <span className="font-bold text-sale">{formatMoney(p.finalPrice)}</span>
                    {p.finalPrice < p.price ? <span className="ml-1.5 text-muted line-through">{formatMoney(p.price)}</span> : null}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {departments.length ? (
        <nav aria-label="Departments" className="container-x relative pb-8">
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {departments.map((d) => (
              <li key={d.slug} className="shrink-0">
                <Link
                  href={`/category/${d.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-2 pr-4 pl-2 text-sm font-semibold transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-ink">
                    <DepartmentIcon slug={d.slug} className="size-4" />
                  </span>
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}
