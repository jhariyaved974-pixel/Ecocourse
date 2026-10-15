import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Award, BadgeCheck, Clock, Heart, Leaf, Package, RefreshCw, Ruler, ShieldCheck, Sparkles, Star, Truck } from 'lucide-react';
import type { HomeSection } from '@/lib/content/queries';
import { getCategories, getFeaturedReviews, getProductsByIds, getProductsBySource } from '@/lib/catalog/queries';
import { ProductCard } from '@/components/store/product-card';
import { NewsletterForm, Reveal } from '@/components/store/chrome';
import { Stars } from '@/components/store/product-bits';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Hero } from './hero';
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

async function ProductRail({ section }: { section: HomeSection }) {
  const products =
    section.productSource === 'manual'
      ? await getProductsByIds(section.items.map((i) => i.productId).filter((id): id is string => Boolean(id)))
      : await getProductsBySource(section.productSource, { limit: section.productLimit, collectionSlug: section.collectionSlug, categorySlug: section.categorySlug });
  if (products.length === 0) return null;
  const carousel = section.layout === 'carousel';
  return (
    <section className="py-16 md:py-24" aria-labelledby={`h-${section.id}`}>
      <div className="container-x">
        <Reveal>
          <div id={`h-${section.id}`}>
            <SectionHeading section={section} />
          </div>
        </Reveal>
        {carousel ? (
          <div className="scrollbar-none -mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" tabIndex={0} aria-label={`${section.heading} products`}>
            {products.map((p) => (
              <ProductCard key={p.id} product={p} className="w-[70vw] shrink-0 snap-start sm:w-[42vw] md:w-[30vw] lg:w-[23vw] xl:w-[19vw]" />
            ))}
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
            {products.slice(0, section.productLimit).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

async function CategoryGrid({ section }: { section: HomeSection }) {
  const categories = (await getCategories()).filter((c) => !c.parentId);
  if (!categories.length) return null;
  return (
    <section className="py-16 md:py-24" aria-label={section.heading || 'Categories'}>
      <div className="container-x">
        <Reveal>
          <SectionHeading section={section} />
        </Reveal>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-7">
          {categories.map((c, i) => (
            <Reveal as="li" key={c.id} delay={i * 0.04}>
              <Link href={`/category/${c.slug}`} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius)] bg-surface-2">
                  {c.image ? (
                    <Image src={c.image} alt={c.imageAlt} fill sizes="(min-width: 1024px) 14vw, (min-width: 768px) 25vw, 50vw" className="scale-[1.35] object-cover transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.45]" />
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-medium">{c.name}</span>
                  <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function UspStrip({ section }: { section: HomeSection }) {
  if (!section.items.length) return null;
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
                <h2 className="font-display text-4xl leading-[1.05] md:text-6xl">{section.heading}</h2>
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
          <h2 className="font-display text-4xl leading-[1.05] md:text-6xl">{section.heading}</h2>
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
          <div className="relative overflow-hidden rounded-[calc(var(--radius)*2)] bg-accent px-8 py-12 text-accent-ink md:px-14 md:py-16">
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

export function HomeSections({ sections }: { sections: HomeSection[] }) {
  return (
    <>
      {sections.map((section, index) => {
        switch (section.type) {
          case 'hero':
            return <Hero key={section.id} section={section} priority={index === 0} />;
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
