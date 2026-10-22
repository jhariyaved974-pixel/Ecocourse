import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Award, BadgeCheck, Clock, Heart, Leaf, Package, RefreshCw, Ruler, ShieldCheck, Sparkles, Star, Truck } from 'lucide-react';
import { getStoreSettings, type HomeSection } from '@/lib/content/queries';
import { getCategoryTree, getFacets, getFeaturedReviews, getProductsByIds, getProductsBySource } from '@/lib/catalog/queries';
import type { ProductCardData } from '@/lib/catalog/types';
import { ProductCard } from '@/components/store/product-card';
import { NewsletterForm, Reveal } from '@/components/store/chrome';
import { Price, Stars } from '@/components/store/product-bits';
import { ShoeArt, shoeTint, shoeTypeFor } from '@/components/store/shoe-art';
import { FallbackImage } from '@/components/store/fallback-image';
import { DepartmentIcon } from '@/components/store/department-icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Hero } from './hero';
import { ShowcaseHero } from './showcase-hero';
import { CopyCode } from './copy-code';

const ICONS = { truck: Truck, refresh: RefreshCw, shield: ShieldCheck, sparkles: Sparkles, ruler: Ruler, leaf: Leaf, award: Award, heart: Heart, clock: Clock, 'badge-check': BadgeCheck, package: Package, star: Star } as const;

function SectionHeading({ section, align = 'left', dark }: { section: HomeSection; align?: 'left' | 'center'; dark?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', align === 'center' && 'items-center text-center md:flex-col md:items-center')}>
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {section.eyebrow ? <p className={cn('eyebrow mb-3', dark ? 'text-dark-muted' : 'text-muted')}>{section.eyebrow}</p> : null}
        {section.heading ? <h2 className="font-display text-4xl leading-[1.05] md:text-5xl">{section.heading}</h2> : null}
        {section.subheading ? <p className={cn('mt-3 text-base', dark ? 'text-dark-muted' : 'text-muted')}>{section.subheading}</p> : null}
      </div>
      {section.ctaLabel && section.ctaHref && align === 'left' ? (
        <Link href={section.ctaHref} className="group inline-flex items-center gap-2 text-sm font-medium">
          {section.ctaLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      ) : null}
    </div>
  );
}

/** Product photo, or the drawn shoe when there is no photo yet. */
function ProductVisual({ product, sizes, className }: { product: ProductCardData; sizes: string; className?: string }) {
  if (product.image) return <Image src={product.image} alt="" fill sizes={sizes} className={cn('object-cover', className)} />;
  const art = shoeTypeFor({ name: product.name, categorySlug: product.categorySlug });
  return (
    <div className="absolute inset-0 grid place-items-center px-[10%]">
      {art ? (
        <ShoeArt type={art} color={product.colors[0]?.hex ?? '#1d2a4a'} className={className} />
      ) : (
        <DepartmentIcon slug={product.categorySlug ?? ''} className="size-1/3 text-ink-2" strokeWidth={1.2} />
      )}
    </div>
  );
}

/** One product, large: used for a product rail limited to a single product. */
function FeatureProduct({ section, product }: { section: HomeSection; product: ProductCardData }) {
  const tint = product.colors[0]?.hex ?? '#f2c230';
  return (
    <section className="py-16 md:py-24" aria-labelledby={`h-${section.id}`}>
      <div className="container-x">
        <Reveal>
          <div className="grid overflow-hidden rounded-[calc(var(--radius)*2)] border border-line bg-surface md:grid-cols-2">
            <Link href={`/products/${product.slug}`} className="group relative block aspect-square md:aspect-auto md:min-h-[460px]" style={{ background: product.image ? undefined : shoeTint(tint) }} aria-label={product.name}>
              <div className="pointer-events-none absolute top-1/2 left-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" aria-hidden />
              <ProductVisual product={product} sizes="(min-width: 768px) 50vw, 100vw" className="mx-auto max-w-[86%] drop-shadow-xl transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:-rotate-6 group-hover:scale-105" />
            </Link>
            <div className="flex flex-col justify-center gap-5 p-8 md:p-12 lg:p-16">
              {section.eyebrow ? <p className="eyebrow text-muted">{section.eyebrow}</p> : null}
              <h2 id={`h-${section.id}`} className="font-display text-4xl leading-[1.02] md:text-5xl">{section.heading || product.name}</h2>
              {section.heading ? <p className="text-lg font-semibold">{product.name}{product.categoryName ? <span className="font-normal text-muted"> · {product.categoryName}</span> : null}</p> : null}
              {section.subheading ? <p className="max-w-md text-base leading-relaxed text-ink-2">{section.subheading}</p> : null}
              <Price price={product.price} finalPrice={product.finalPrice} size="lg" />
              {product.colors.length ? (
                <div className="flex items-center gap-2" aria-label={`${product.colors.length} colours`}>
                  {product.colors.map((c) => (
                    <span key={c.name} title={c.name} className="size-6 rounded-full border-2 border-surface shadow-[0_0_0_1px_var(--line-strong)]" style={{ backgroundColor: c.hex }} />
                  ))}
                  <span className="ml-1 text-sm text-muted">{product.colors.map((c) => c.name).join(' · ')}</span>
                </div>
              ) : null}
              <div>
                <Button asChild size="lg">
                  <Link href={`/products/${product.slug}`}>
                    {section.ctaLabel || 'View this pair'} <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

async function ProductRail({ section }: { section: HomeSection }) {
  const products =
    section.productSource === 'manual'
      ? await getProductsByIds(section.items.map((i) => i.productId).filter((id): id is string => Boolean(id)))
      : await getProductsBySource(section.productSource, { limit: section.productLimit, collectionSlug: section.collectionSlug, categorySlug: section.categorySlug });
  if (products.length === 0) return null;
  if (section.productLimit === 1) return <FeatureProduct section={section} product={products[0]} />;
  const carousel = section.layout === 'carousel';
  // Deals sit on a yellow panel, like the original "Flash deals" strip.
  const deals = section.productSource === 'on_sale';
  const list = carousel ? (
    <div className="scrollbar-none relative -mx-4 mt-10 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-10 lg:scroll-px-10 lg:px-10" tabIndex={0} aria-label={`${section.heading} products`}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} className="w-[70vw] shrink-0 snap-start sm:w-[42vw] md:w-[30vw] lg:w-[23vw] xl:w-[19vw]" />
      ))}
    </div>
  ) : (
    <div className={cn('mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3', Math.min(products.length, section.productLimit) !== 3 && 'xl:grid-cols-4')}>
      {products.slice(0, section.productLimit).map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
  if (deals) {
    return (
      <section className="py-10 md:py-16" aria-labelledby={`h-${section.id}`}>
        <div className="container-x">
          <div className="overflow-hidden rounded-[calc(var(--radius)*2)] bg-highlight px-5 py-8 text-highlight-ink sm:px-8 md:px-10 md:py-12">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div id={`h-${section.id}`}>
                {section.eyebrow ? (
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-sale px-3 py-1 text-[11px] font-bold tracking-[0.16em] text-white uppercase">
                    <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden />
                    {section.eyebrow}
                  </p>
                ) : null}
                {section.heading ? <h2 className="font-display text-4xl leading-[1.02] md:text-5xl">{section.heading}</h2> : null}
                {section.subheading ? <p className="mt-2 text-sm font-medium opacity-80 md:text-base">{section.subheading}</p> : null}
              </div>
              {section.ctaLabel && section.ctaHref ? (
                <Link href={section.ctaHref} className="group inline-flex items-center gap-2 text-sm font-bold">
                  {section.ctaLabel}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              ) : null}
            </div>
            <div className="[&_article]:rounded-[var(--radius)] [&_article]:bg-surface [&_article]:p-2.5 [&_article]:pb-4">{list}</div>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="py-16 md:py-24" aria-labelledby={`h-${section.id}`}>
      <div className="container-x">
        <Reveal>
          <div id={`h-${section.id}`}>
            <SectionHeading section={section} />
          </div>
        </Reveal>
        {list}
      </div>
    </section>
  );
}

/** Bold department tiles in the store's colours (dark text on the light ones). */
const DEPARTMENT_COLORS = [
  { bg: '#f2c230', fg: '#111111' },
  { bg: '#0b6b47', fg: '#ffffff' },
  { bg: '#111111', fg: '#f4f2ee' },
  { bg: '#c0352b', fg: '#ffffff' },
  { bg: '#1d2a4a', fg: '#ffffff' },
  { bg: '#e7e1d4', fg: '#111111' },
  { bg: '#2f6b4a', fg: '#ffffff' },
  { bg: '#a8703a', fg: '#ffffff' },
];

async function CategoryGrid({ section }: { section: HomeSection }) {
  const [departments, facets] = await Promise.all([getCategoryTree(), getFacets()]);
  if (!departments.length) return null;
  const counts = new Map<string, number>();
  for (const c of facets.categories) {
    const dept = c.parentSlug ?? c.slug;
    counts.set(dept, (counts.get(dept) ?? 0) + c.productCount);
  }
  return (
    <section className="py-16 md:py-24" aria-label={section.heading || 'Departments'}>
      <div className="container-x">
        <Reveal>
          <SectionHeading section={section} />
        </Reveal>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {departments.map((d, i) => {
            const color = DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length];
            const count = counts.get(d.slug) ?? 0;
            return (
              <Reveal as="li" key={d.id} delay={i * 0.04}>
                <Link
                  href={`/category/${d.slug}`}
                  className="group relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-[var(--radius)] p-4 transition-transform duration-300 hover:-translate-y-1 sm:aspect-square sm:p-5"
                  style={{ backgroundColor: color.bg, color: color.fg }}
                >
                  {d.image ? (
                    <>
                      <FallbackImage src={d.image} alt={d.imageAlt} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
                    </>
                  ) : (
                    <span className="pointer-events-none absolute -right-[18%] -bottom-[18%] grid size-[78%] place-items-center rounded-full bg-white/12 transition-transform duration-500 group-hover:scale-110" aria-hidden>
                      <DepartmentIcon slug={d.slug} className="size-[46%] opacity-90" strokeWidth={1.3} />
                    </span>
                  )}
                  <span className="relative flex items-start justify-between gap-2" style={d.image ? { color: '#ffffff' } : undefined}>
                    <span className="rounded-full border border-current/25 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] uppercase">
                      {count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'Shop'}
                    </span>
                    <span className="grid size-8 place-items-center rounded-full bg-current/15 transition-transform group-hover:translate-x-0.5">
                      <ArrowRight className="size-4" aria-hidden />
                    </span>
                  </span>
                  <span className="relative max-w-[92%] sm:max-w-[85%]" style={d.image ? { color: '#ffffff' } : undefined}>
                    <span className="font-display block text-[1.05rem] leading-[0.95] [overflow-wrap:anywhere] sm:text-2xl md:text-[1.7rem]">{d.name}</span>
                    {d.children.length ? <span className="mt-2 line-clamp-2 block text-xs font-medium opacity-80">{d.children.map((c) => c.name).join(' · ')}</span> : null}
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const TILE_STYLES = ['bg-highlight text-highlight-ink', 'bg-accent text-accent-ink', 'bg-ink text-paper', 'bg-sale text-white'];

/** Big coloured link tiles ("Pick your price", "Shop for"): a benefits strip whose items all have links. */
function LinkTiles({ section }: { section: HomeSection }) {
  return (
    <section className="py-16 md:py-24" aria-label={section.heading || 'Shop'}>
      <div className="container-x">
        <Reveal>
          <SectionHeading section={section} />
        </Reveal>
        <ul className={cn('mt-10 grid grid-cols-2 gap-3 sm:gap-4', section.items.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4')}>
          {section.items.map((item, i) => (
            <Reveal as="li" key={item.id} delay={i * 0.05}>
              <Link
                href={item.href!}
                className={cn(
                  'group relative flex min-h-36 flex-col justify-between overflow-hidden rounded-[var(--radius)] p-5 transition-transform hover:-translate-y-1 md:min-h-44 md:p-6',
                  TILE_STYLES[i % TILE_STYLES.length],
                )}
              >
                <span className="pointer-events-none absolute -right-8 -bottom-8 size-32 rounded-full bg-white/10" aria-hidden />
                <span className="font-display relative text-3xl leading-[0.95] md:text-4xl">{item.title}</span>
                <span className="relative mt-4 flex items-center justify-between gap-2 text-sm font-semibold opacity-90">
                  {item.body || 'Shop now'}
                  <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** "Our promise": a benefits strip with a heading becomes a row of cards. */
function PromiseCards({ section }: { section: HomeSection }) {
  return (
    <section className="py-16 md:py-24" aria-label={section.heading || 'Our promise'}>
      <div className="container-x">
        <Reveal>
          <SectionHeading section={section} />
        </Reveal>
        <ul className={cn('mt-10 grid gap-4', section.items.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3')}>
          {section.items.map((item, i) => {
            const Icon = ICONS[(item.icon ?? 'sparkles') as keyof typeof ICONS] ?? Sparkles;
            return (
              <Reveal as="li" key={item.id} delay={i * 0.05} className="rounded-[var(--radius)] border border-line bg-surface p-7">
                <span className="grid size-12 place-items-center rounded-full bg-highlight text-highlight-ink">
                  <Icon className="size-5" aria-hidden />
                </span>
                <p className="font-display mt-5 text-2xl leading-tight">{item.title}</p>
                {item.body ? <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.body}</p> : null}
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function UspStrip({ section }: { section: HomeSection }) {
  if (!section.items.length) return null;
  if (section.heading && section.items.every((i) => i.href)) return <LinkTiles section={section} />;
  if (section.heading) return <PromiseCards section={section} />;
  return (
    <section className="border-y border-line bg-surface" aria-label="Why shop with us">
      <ul className="container-x grid grid-cols-2 lg:grid-cols-4">
        {section.items.map((item, i) => {
          const Icon = ICONS[(item.icon ?? 'sparkles') as keyof typeof ICONS] ?? Sparkles;
          return (
            <li key={item.id} className={cn('flex items-center gap-3.5 py-6 pr-4', i % 2 === 1 && 'pl-4 lg:pl-0', i > 0 && 'lg:border-l lg:border-line lg:pl-8')}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted">{item.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PromoBanner({ section }: { section: HomeSection }) {
  const dark = section.theme === 'dark';
  return (
    <section className="py-8 md:py-12">
      <div className="container-x">
        <Reveal>
          <div data-surface={dark ? 'dark' : undefined} className={cn('relative overflow-hidden rounded-[calc(var(--radius)*2)]', !dark && 'bg-surface-2')}>
            {/* Phones: image above the text (text never sits on the product). Larger screens: full-bleed with an overlay. */}
            {section.image ? (
              <div className="relative aspect-[4/3] md:absolute md:inset-0 md:aspect-auto">
                <Image src={section.image} alt={section.imageAlt} fill sizes="(min-width: 768px) 100vw, 100vw" className="object-cover" />
              </div>
            ) : null}
            <div className={cn('relative flex flex-col justify-end p-6 sm:p-8 md:min-h-[520px] md:p-14 lg:items-end lg:justify-center lg:text-right', !section.image && 'min-h-[320px]', dark && 'md:bg-gradient-to-t md:from-black/75 md:via-black/25 md:to-transparent lg:bg-gradient-to-l lg:from-black/85 lg:via-black/35')}>
              <div className="max-w-md lg:max-w-sm">
                {section.eyebrow ? <p className="eyebrow mb-4 opacity-75">{section.eyebrow}</p> : null}
                <h2 className="font-display text-4xl leading-[1.05] md:text-5xl">{section.heading}</h2>
                {section.subheading ? <p className="mt-4 text-sm leading-relaxed opacity-80 md:text-base">{section.subheading}</p> : null}
                {section.ctaLabel && section.ctaHref ? (
                  <Button asChild size="lg" variant={dark ? 'primary' : 'primary'} className="mt-8">
                    <Link href={section.ctaHref}>
                      {section.ctaLabel} <ArrowRight />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function EditorialStory({ section }: { section: HomeSection }) {
  return (
    <section className={cn('py-16 md:py-28', section.theme === 'muted' && 'bg-surface-2')}>
      <div className="container-x grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <Reveal className="relative aspect-[4/5] overflow-hidden rounded-[calc(var(--radius)*2)] bg-surface">
          {section.image ? <Image src={section.image} alt={section.imageAlt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" /> : null}
        </Reveal>
        <Reveal delay={0.1} className="max-w-lg">
          {section.eyebrow ? <p className="eyebrow mb-4 text-muted">{section.eyebrow}</p> : null}
          <h2 className="font-display text-4xl leading-[1.05] md:text-5xl">{section.heading}</h2>
          {section.body ? <p className="mt-6 text-base leading-relaxed text-ink-2">{section.body}</p> : null}
          {section.ctaLabel && section.ctaHref ? (
            <Button asChild variant="outline" size="lg" className="mt-8">
              <Link href={section.ctaHref}>{section.ctaLabel}</Link>
            </Button>
          ) : null}
        </Reveal>
      </div>
    </section>
  );
}

function DiscountBanner({ section }: { section: HomeSection }) {
  return (
    <section className="py-8 md:py-12">
      <div className="container-x">
        <Reveal>
          <div className={cn('relative overflow-hidden rounded-[calc(var(--radius)*2)] px-8 py-12 md:px-14 md:py-16', section.theme === 'light' ? 'bg-highlight text-highlight-ink' : 'bg-accent text-accent-ink')}>
            <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-2xl" aria-hidden />
            <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
              <div>
                {section.eyebrow ? <p className="eyebrow mb-3 opacity-80">{section.eyebrow}</p> : null}
                <h2 className="font-display text-4xl leading-tight md:text-5xl">{section.heading}</h2>
                {section.subheading ? <p className="mt-3 max-w-xl text-sm opacity-90 md:text-base">{section.subheading}</p> : null}
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                {section.couponCode ? <CopyCode code={section.couponCode} /> : null}
                {section.ctaLabel && section.ctaHref ? (
                  <Link href={section.ctaHref} className="inline-flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline">
                    {section.ctaLabel} <ArrowRight className="size-4" />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

async function CollectionSpotlight({ section }: { section: HomeSection }) {
  const products = section.collectionSlug
    ? await getProductsBySource('collection', { limit: 4, collectionSlug: section.collectionSlug })
    : [];
  return (
    <section className="py-16 md:py-24">
      <div className="container-x grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <Reveal className="relative min-h-[360px] overflow-hidden rounded-[calc(var(--radius)*2)] bg-surface-2 lg:min-h-full">
          {section.image ? <Image src={section.image} alt={section.imageAlt} fill sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" /> : null}
          <div className="absolute inset-x-0 bottom-0 p-8 md:p-10">
            {section.eyebrow ? <p className="eyebrow mb-3 text-ink-2">{section.eyebrow}</p> : null}
            <h2 className="font-display max-w-md text-4xl leading-[1.05] md:text-5xl">{section.heading}</h2>
            {section.ctaLabel && section.ctaHref ? (
              <Button asChild className="mt-6">
                <Link href={section.ctaHref}>{section.ctaLabel}</Link>
              </Button>
            ) : null}
          </div>
        </Reveal>
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 self-center">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

async function Testimonials({ section }: { section: HomeSection }) {
  const reviews = await getFeaturedReviews(6);
  // Only genuine, approved customer reviews are shown; no placeholder testimonials.
  if (!reviews.length) return null;
  return (
    <section className="py-16 md:py-24">
      <div className="container-x">
        <Reveal>
          <SectionHeading section={section} align="center" />
        </Reveal>
        <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r, i) => (
            <Reveal as="li" key={r.id} delay={i * 0.05} className="flex flex-col rounded-[calc(var(--radius)*1.5)] border border-line bg-surface p-7">
              <Stars rating={r.rating} />
              {r.title ? <p className="mt-4 font-medium">{r.title}</p> : null}
              <blockquote className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">“{r.body}”</blockquote>
              <div className="mt-6 flex items-center justify-between text-xs text-muted">
                <span className="font-medium text-ink">{r.authorName}</span>
                {r.isVerifiedPurchase ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <BadgeCheck className="size-3.5" /> Verified purchase
                  </span>
                ) : null}
              </div>
              {r.productSlug ? (
                <Link href={`/products/${r.productSlug}`} className="mt-3 text-xs text-muted underline-offset-4 hover:underline">
                  {r.productName}
                </Link>
              ) : null}
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function NewsletterSection({ section }: { section: HomeSection }) {
  return (
    <section className="py-8 md:py-12">
      <div className="container-x">
        <Reveal>
          <div data-surface="dark" className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 rounded-[calc(var(--radius)*2)] px-6 py-12 sm:px-8 sm:py-14 md:grid-cols-2 md:px-14 md:py-20">
            <div>
              {section.eyebrow ? <p className="eyebrow mb-3 text-dark-muted">{section.eyebrow}</p> : null}
              <h2 className="font-display text-4xl leading-tight md:text-5xl">{section.heading}</h2>
              {section.subheading ? <p className="mt-3 text-sm text-dark-muted md:text-base">{section.subheading}</p> : null}
            </div>
            <div className="md:justify-self-end">
              <NewsletterForm dark source="homepage" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

async function ShowcaseHeroSection({ section }: { section: HomeSection }) {
  const [featured, deals, bestsellers, departments, settings] = await Promise.all([
    getProductsBySource('featured', { limit: 3 }),
    getProductsBySource('on_sale', { limit: 12 }),
    getProductsBySource('bestsellers', { limit: 6 }),
    getCategoryTree(),
    getStoreSettings(),
  ]);
  // Featured products lead; the biggest in-stock savings fill the deal board.
  const bySaving = [...deals].sort((a, b) => b.price - b.finalPrice - (a.price - a.finalPrice));
  const seen = new Set<string>();
  const board = [...featured, ...bySaving, ...bestsellers].filter((p) => p.inStock && !seen.has(p.id) && seen.add(p.id)).slice(0, 3);
  return (
    <ShowcaseHero
      section={section}
      products={board}
      departments={departments.map((d) => ({ slug: d.slug, name: d.name }))}
      returnDays={settings.free_returns_days}
    />
  );
}

export function HomeSections({ sections }: { sections: HomeSection[] }) {
  return (
    <>
      {sections.map((section, index) => {
        switch (section.type) {
          case 'hero':
            return section.show3d || section.image || section.model ? (
              <Hero key={section.id} section={section} priority={index === 0} />
            ) : (
              <ShowcaseHeroSection key={section.id} section={section} />
            );
          case 'usp_strip':
            return <UspStrip key={section.id} section={section} />;
          case 'product_rail':
            return <ProductRail key={section.id} section={section} />;
          case 'category_grid':
            return <CategoryGrid key={section.id} section={section} />;
          case 'promo_banner':
            return <PromoBanner key={section.id} section={section} />;
          case 'editorial_story':
            return <EditorialStory key={section.id} section={section} />;
          case 'discount_banner':
            return <DiscountBanner key={section.id} section={section} />;
          case 'collection_spotlight':
            return <CollectionSpotlight key={section.id} section={section} />;
          case 'testimonials':
            return <Testimonials key={section.id} section={section} />;
          case 'newsletter':
            return <NewsletterSection key={section.id} section={section} />;
          default:
            return null;
        }
      })}
    </>
  );
}
