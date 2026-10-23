import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BadgeCheck } from 'lucide-react';
import type { HomeSection } from '@/lib/content/queries';
import { getCategoryTree, getFacets, getFeaturedReviews, getProductsByIds, getProductsBySource } from '@/lib/catalog/queries';
import type { CategoryNode, ProductCardData } from '@/lib/catalog/types';
import { ProductCard } from '@/components/store/product-card';
import { NewsletterForm, Reveal } from '@/components/store/chrome';
import { Price, Stars } from '@/components/store/product-bits';
import { FallbackImage } from '@/components/store/fallback-image';
import { BrandMark } from '@/components/store/wordmark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Hero } from './hero';
import { EditorialHero } from './editorial-hero';
import { CopyCode } from './copy-code';
import { Emphasis, plainHeading } from './emphasis';

/** Text call to action: small capitals with a rule under them. */
function CtaLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn('label-caps link-rule group inline-flex items-center gap-2 whitespace-nowrap', className)}>
      {children}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
    </Link>
  );
}

function SectionHeading({ section, align = 'left', dark, id }: { section: HomeSection; align?: 'left' | 'center'; dark?: boolean; id?: string }) {
  const center = align === 'center';
  return (
    <div className={cn('flex flex-col gap-6 md:flex-row md:items-end md:justify-between', center && 'items-center text-center md:flex-col md:items-center')}>
      <div className={cn('max-w-2xl', center && 'mx-auto')}>
        {section.eyebrow ? (
          <p className={cn('eyebrow mb-4 flex items-center gap-3', center && 'justify-center', dark ? 'text-dark-muted' : 'text-muted')}>
            <BrandMark className="size-2.5" />
            {section.eyebrow}
          </p>
        ) : null}
        {section.heading ? (
          <h2 id={id} className="font-display text-[2.4rem] leading-[1.04] text-balance md:text-[3.3rem]">
            <Emphasis text={section.heading} />
          </h2>
        ) : null}
        {section.subheading ? <p className={cn('mt-4 max-w-xl text-[15px] leading-relaxed', center && 'mx-auto', dark ? 'text-dark-muted' : 'text-ink-2')}>{section.subheading}</p> : null}
      </div>
      {section.ctaLabel && section.ctaHref && !center ? <CtaLink href={section.ctaHref}>{section.ctaLabel}</CtaLink> : null}
    </div>
  );
}

/** One product, large: used for a product rail limited to a single product. */
function FeatureProduct({ section, product }: { section: HomeSection; product: ProductCardData }) {
  return (
    <section className="py-20 md:py-28" aria-labelledby={`h-${section.id}`}>
      <div className="container-x">
        <Reveal className="grid items-center gap-10 md:grid-cols-12 md:gap-16">
          <Link href={`/products/${product.slug}`} className="group relative block aspect-[4/5] overflow-hidden bg-surface-2 md:col-span-6" aria-label={product.name}>
            {product.image ? (
              <Image src={product.image} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-[1400ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.03]" />
            ) : null}
          </Link>
          <div className="md:col-span-5 md:col-start-8">
            {section.eyebrow ? <p className="eyebrow text-muted">{section.eyebrow}</p> : null}
            <h2 id={`h-${section.id}`} className="font-display mt-4 text-[2.6rem] leading-[1.04] md:text-[3.3rem]">
              <Emphasis text={section.heading || product.name} />
            </h2>
            {section.heading ? <p className="font-display mt-6 text-2xl italic">{product.name}</p> : null}
            {section.subheading ? <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-2">{section.subheading}</p> : null}
            <Price price={product.price} finalPrice={product.finalPrice} size="lg" className="mt-6" />
            <Button asChild size="xl" className="mt-10">
              <Link href={`/products/${product.slug}`}>{section.ctaLabel || 'View the piece'}</Link>
            </Button>
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
  const shown = products.slice(0, section.productLimit);
  return (
    <section className="py-20 md:py-28" aria-labelledby={`h-${section.id}`}>
      <div className="container-x">
        <Reveal>
          <SectionHeading section={section} id={`h-${section.id}`} />
        </Reveal>
        {carousel ? (
          <div
            className="scrollbar-none relative -mx-4 mt-12 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-10 lg:scroll-px-10 lg:gap-7 lg:px-10"
            tabIndex={0}
            aria-label={`${plainHeading(section.heading)} products`}
          >
            {shown.map((p) => (
              <ProductCard key={p.id} product={p} className="w-[68vw] shrink-0 snap-start sm:w-[40vw] md:w-[29vw] lg:w-[22.5vw] xl:w-[20vw]" />
            ))}
          </div>
        ) : (
          <div className={cn('mt-12 grid grid-cols-2 gap-x-5 gap-y-12 lg:gap-x-7', shown.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4')}>
            {shown.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The weaves: a numbered row of portrait tiles. A store with only a couple of
 * departments shows their sub-categories instead, so the row stays rich.
 */
async function CategoryGrid({ section }: { section: HomeSection }) {
  const [departments, facets] = await Promise.all([getCategoryTree(), getFacets()]);
  if (!departments.length) return null;
  const counts = new Map<string, number>();
  for (const c of facets.categories) {
    counts.set(c.slug, (counts.get(c.slug) ?? 0) + c.productCount);
    if (c.parentSlug) counts.set(c.parentSlug, (counts.get(c.parentSlug) ?? 0) + c.productCount);
  }
  type Tile = CategoryNode & { parentName: string | null };
  const tiles: Tile[] =
    departments.length < 4
      ? departments.flatMap((d): Tile[] => (d.children.length ? d.children.map((c) => ({ ...c, parentName: d.name })) : [{ ...d, parentName: null }]))
      : departments.map((d) => ({ ...d, parentName: null }));
  return (
    <section className="py-20 md:py-28" aria-labelledby={`h-${section.id}`}>
      <div className="container-x">
        <Reveal>
          <SectionHeading section={section} id={`h-${section.id}`} />
        </Reveal>
      </div>
      <ul className="scrollbar-none mt-12 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 pb-4 sm:scroll-px-6 sm:px-6 lg:scroll-px-10 lg:gap-7 lg:px-10 xl:px-[max(2.5rem,calc((100vw-1440px)/2+2.5rem))]">
        {tiles.map((d, i) => {
          const count = counts.get(d.slug) ?? 0;
          return (
            <Reveal as="li" key={d.id} delay={Math.min(i, 5) * 0.05} className="w-[64vw] shrink-0 snap-start sm:w-[38vw] md:w-[27vw] lg:w-[19vw] xl:w-[17.5vw]">
              <Link href={`/category/${d.slug}`} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden bg-surface-2">
                  {d.image ? (
                    <FallbackImage src={d.image} alt={d.imageAlt} fill sizes="(min-width: 1024px) 19vw, 64vw" className="object-cover transition-transform duration-[1400ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.04]" />
                  ) : null}
                </div>
                <div className="mt-4 flex items-baseline gap-3 border-t border-line pt-3">
                  <span className="font-display text-sm text-zari tabular-nums italic">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-display link-draw text-[1.45rem] leading-tight">{d.name}</span>
                    <span className="mt-1 block text-[11px] tracking-[0.16em] text-muted uppercase">
                      {d.parentName ? `${d.parentName} · ` : ''}
                      {count ? `${count} ${count === 1 ? 'piece' : 'pieces'}` : 'Explore'}
                    </span>
                  </span>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

/** Link tiles: a benefits strip whose items all have links. */
function LinkTiles({ section }: { section: HomeSection }) {
  return (
    <section className="py-20 md:py-28" aria-label={plainHeading(section.heading) || 'Shop'}>
      <div className="container-x">
        <Reveal>
          <SectionHeading section={section} />
        </Reveal>
        <ul className={cn('mt-12 grid border-t border-l border-line', section.items.length === 3 ? 'md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4')}>
          {section.items.map((item) => (
            <li key={item.id} className="border-r border-b border-line">
              <Link href={item.href!} className="group flex min-h-40 flex-col justify-between p-6 transition-colors hover:bg-surface md:min-h-48 md:p-8">
                <span className="font-display text-[1.9rem] leading-[1.05]">{item.title}</span>
                <span className="label-caps mt-6 flex items-center justify-between gap-2 text-muted group-hover:text-ink">
                  {item.body || 'Shop now'}
                  <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A benefits strip with a heading: numbered columns divided by hairlines. */
function PromiseColumns({ section }: { section: HomeSection }) {
  return (
    <section className="border-y border-line bg-surface py-20 md:py-24" aria-labelledby={`h-${section.id}`}>
      <div className="container-x grid gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-3">
          {section.eyebrow ? <p className="eyebrow text-muted">{section.eyebrow}</p> : null}
          <h2 id={`h-${section.id}`} className="font-display mt-4 text-[2.4rem] leading-[1.05]">
            <Emphasis text={section.heading} />
          </h2>
        </Reveal>
        <ol className={cn('grid gap-y-10 sm:grid-cols-2 lg:col-span-9', section.items.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          {section.items.map((item, i) => (
            <Reveal as="li" key={item.id} delay={i * 0.06} className="sm:border-l sm:border-line sm:px-7 lg:first:border-l-0 lg:first:pl-0">
              <span className="font-display text-lg text-zari italic">{String(i + 1).padStart(2, '0')}</span>
              <p className="font-display mt-3 text-[1.45rem] leading-tight">{item.title}</p>
              {item.body ? <p className="mt-3 text-sm leading-relaxed text-ink-2">{item.body}</p> : null}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function UspStrip({ section }: { section: HomeSection }) {
  if (!section.items.length) return null;
  if (section.heading && section.items.every((i) => i.href)) return <LinkTiles section={section} />;
  if (section.heading) return <PromiseColumns section={section} />;
  return (
    <section className="border-y border-line" aria-label="Why shop with us">
      <ul className="container-x grid grid-cols-2 lg:grid-cols-4">
        {section.items.map((item, i) => (
          <li key={item.id} className={cn('py-6 pr-4', i % 2 === 1 && 'pl-4 lg:pl-0', i > 0 && 'lg:border-l lg:border-line lg:pl-8')}>
            <p className="label-caps">{item.title}</p>
            <p className="mt-1 text-xs text-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Image and a text panel side by side (dark theme: text over the image). */
function PromoBanner({ section }: { section: HomeSection }) {
  const dark = section.theme === 'dark';
  if (dark) {
    return (
      <section className="py-10 md:py-16">
        <Reveal className="container-x">
          <div data-surface="dark" className="relative overflow-hidden">
            {section.image ? (
              <div className="relative aspect-[4/3] md:absolute md:inset-0 md:aspect-auto">
                <Image src={section.image} alt={section.imageAlt} fill sizes="100vw" className="object-cover" />
              </div>
            ) : null}
            <div className="relative flex flex-col justify-end p-8 md:min-h-[560px] md:bg-gradient-to-r md:from-black/70 md:via-black/25 md:to-transparent md:p-16">
              <div className="max-w-md">
                {section.eyebrow ? <p className="eyebrow mb-4 text-dark-muted">{section.eyebrow}</p> : null}
                <h2 className="font-display text-[2.6rem] leading-[1.04] md:text-[3.4rem]"><Emphasis text={section.heading} /></h2>
                {section.subheading ? <p className="mt-5 text-[15px] leading-relaxed text-dark-ink/80">{section.subheading}</p> : null}
                {section.ctaLabel && section.ctaHref ? <CtaLink href={section.ctaHref} className="mt-8">{section.ctaLabel}</CtaLink> : null}
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    );
  }
  return (
    <section className="py-10 md:py-16">
      <Reveal className="container-x">
        <div className="grid overflow-hidden bg-surface-2 lg:grid-cols-12">
          {section.image ? (
            <div className="relative aspect-[2/1] lg:col-span-8 lg:aspect-auto lg:min-h-[540px]">
              <Image src={section.image} alt={section.imageAlt} fill sizes="(min-width: 1024px) 66vw, 100vw" className="object-cover" />
            </div>
          ) : null}
          <div className={cn('flex flex-col justify-center p-8 sm:p-12 lg:p-14', section.image ? 'lg:col-span-4' : 'lg:col-span-12')}>
            {section.eyebrow ? <p className="eyebrow mb-4 text-muted">{section.eyebrow}</p> : null}
            <h2 className="font-display text-[2.3rem] leading-[1.05] text-balance md:text-[2.8rem]"><Emphasis text={section.heading} /></h2>
            {section.subheading ? <p className="mt-5 text-[15px] leading-relaxed text-ink-2">{section.subheading}</p> : null}
            {section.ctaLabel && section.ctaHref ? (
              <div className="mt-9">
                <Button asChild size="lg" variant="outline">
                  <Link href={section.ctaHref}>{section.ctaLabel}</Link>
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** A story told in the display face beside a tall photograph. */
function EditorialStory({ section }: { section: HomeSection }) {
  const muted = section.theme === 'muted';
  return (
    <section className={cn('py-20 md:py-32', muted && 'bg-surface-2')}>
      <div className="container-x grid items-center gap-12 md:grid-cols-12 md:gap-8">
        <Reveal className="relative aspect-[4/5] overflow-hidden bg-surface md:col-span-6 lg:col-span-5">
          {section.image ? <Image src={section.image} alt={section.imageAlt} fill sizes="(min-width: 768px) 45vw, 100vw" className="object-cover" /> : null}
        </Reveal>
        <Reveal delay={0.1} className="md:col-span-6 md:pl-6 lg:col-span-6 lg:col-start-7 lg:pl-0">
          {section.eyebrow ? <p className="eyebrow mb-5 text-muted">{section.eyebrow}</p> : null}
          <h2 className="font-display text-[2.6rem] leading-[1.03] text-balance md:text-[3.6rem]"><Emphasis text={section.heading} /></h2>
          {section.body ? (
            <p className="font-display mt-8 max-w-xl text-[1.35rem] leading-[1.5] text-ink-2 first-letter:float-left first-letter:mt-1 first-letter:mr-3 first-letter:text-[4.2rem] first-letter:leading-[0.8] first-letter:text-accent-text">
              {section.body}
            </p>
          ) : null}
          {section.ctaLabel && section.ctaHref ? <CtaLink href={section.ctaHref} className="mt-10">{section.ctaLabel}</CtaLink> : null}
        </Reveal>
      </div>
    </section>
  );
}

function DiscountBanner({ section }: { section: HomeSection }) {
  return (
    <section className="py-10 md:py-16">
      <Reveal className="container-x">
        <div className={cn('grid items-center gap-8 border px-8 py-12 md:grid-cols-[1fr_auto] md:px-14', section.theme === 'accent' ? 'border-accent bg-accent text-accent-ink' : 'border-zari/50 bg-surface')}>
          <div>
            {section.eyebrow ? <p className="eyebrow mb-3 opacity-75">{section.eyebrow}</p> : null}
            <h2 className="font-display text-[2.2rem] leading-tight md:text-[2.8rem]"><Emphasis text={section.heading} /></h2>
            {section.subheading ? <p className="mt-3 max-w-xl text-sm opacity-85 md:text-[15px]">{section.subheading}</p> : null}
          </div>
          <div className="flex flex-col items-start gap-4 md:items-end">
            {section.couponCode ? <CopyCode code={section.couponCode} /> : null}
            {section.ctaLabel && section.ctaHref ? <CtaLink href={section.ctaHref}>{section.ctaLabel}</CtaLink> : null}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** A collection opened with a wide photograph, then four of its pieces. */
async function CollectionSpotlight({ section }: { section: HomeSection }) {
  const products = section.collectionSlug ? await getProductsBySource('collection', { limit: 4, collectionSlug: section.collectionSlug }) : [];
  return (
    <section className="py-20 md:py-28" aria-labelledby={`h-${section.id}`}>
      <div className="container-x">
        <Reveal className="relative">
          <div className="relative aspect-[4/3] overflow-hidden bg-surface-2 sm:aspect-[2/1]">
            {section.image ? <Image src={section.image} alt={section.imageAlt} fill sizes="100vw" className="object-cover" /> : null}
          </div>
          <div className="relative -mt-16 ml-4 max-w-lg bg-paper p-7 sm:-mt-28 sm:ml-10 sm:p-10 md:ml-14">
            {section.eyebrow ? <p className="eyebrow mb-4 text-muted">{section.eyebrow}</p> : null}
            <h2 id={`h-${section.id}`} className="font-display text-[2.3rem] leading-[1.05] text-balance md:text-[3rem]">
              <Emphasis text={section.heading} />
            </h2>
            {section.ctaLabel && section.ctaHref ? <CtaLink href={section.ctaHref} className="mt-7">{section.ctaLabel}</CtaLink> : null}
          </div>
        </Reveal>
        {products.length ? (
          <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-4 lg:gap-x-7">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

async function Testimonials({ section }: { section: HomeSection }) {
  const reviews = await getFeaturedReviews(6);
  // Only genuine, approved customer reviews are shown; no placeholder testimonials.
  if (!reviews.length) return null;
  return (
    <section className="py-20 md:py-28">
      <div className="container-x">
        <Reveal>
          <SectionHeading section={section} align="center" />
        </Reveal>
        <ul className="mt-14 grid gap-x-10 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r, i) => (
            <Reveal as="li" key={r.id} delay={i * 0.05} className="flex flex-col border-t border-line pt-8">
              <Stars rating={r.rating} />
              {r.title ? <p className="font-display mt-5 text-2xl leading-tight">{r.title}</p> : null}
              <blockquote className="font-display mt-3 flex-1 text-[1.15rem] leading-relaxed text-ink-2 italic">“{r.body}”</blockquote>
              <div className="mt-6 flex items-center justify-between text-xs text-muted">
                <span className="label-caps text-ink">{r.authorName}</span>
                {r.isVerifiedPurchase ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <BadgeCheck className="size-3.5" /> Verified purchase
                  </span>
                ) : null}
              </div>
              {r.productSlug ? (
                <Link href={`/products/${r.productSlug}`} className="link-draw mt-3 self-start text-xs text-muted">
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
    <section data-surface="dark" className="py-20 md:py-28">
      <Reveal className="container-x mx-auto flex max-w-2xl flex-col items-center text-center">
        <BrandMark className="size-6" />
        {section.eyebrow ? <p className="eyebrow mt-6 text-dark-muted">{section.eyebrow}</p> : null}
        <h2 className="font-display mt-4 text-[2.5rem] leading-[1.05] md:text-[3.2rem]"><Emphasis text={section.heading} /></h2>
        {section.subheading ? <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-dark-muted">{section.subheading}</p> : null}
        <div className="mt-10 w-full max-w-md text-left">
          <NewsletterForm dark source="homepage" />
        </div>
      </Reveal>
    </section>
  );
}

export function HomeSections({ sections }: { sections: HomeSection[] }) {
  return (
    <>
      {sections.map((section, index) => {
        switch (section.type) {
          case 'hero':
            // The 3D stage only when the CMS asks for it with a model; otherwise the photographic hero.
            return section.show3d && section.model ? (
              <Hero key={section.id} section={section} priority={index === 0} />
            ) : (
              <EditorialHero key={section.id} section={section} priority={index === 0} />
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
