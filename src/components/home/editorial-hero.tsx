import Image from 'next/image';
import Link from 'next/link';
import type { HomeSection } from '@/lib/content/queries';
import { Button } from '@/components/ui/button';
import { Emphasis } from './emphasis';

/**
 * Photographic hero: the headline set large on paper beside a tall image that
 * runs to the edge of the screen. Phones get the image first, then the text.
 */
export function EditorialHero({ section, priority }: { section: HomeSection; priority?: boolean }) {
  const image = section.image ?? section.mobileImage;
  return (
    <section className="relative border-b border-line" aria-labelledby="hero-heading">
      <div className="grid lg:min-h-[calc(100svh-161px)] lg:grid-cols-12">
        {image ? (
          <div className="relative aspect-[9/11] overflow-hidden bg-surface-2 sm:aspect-[4/3] lg:order-2 lg:col-span-7 lg:aspect-auto">
            {section.mobileImage ? (
              <Image src={section.mobileImage} alt={section.imageAlt} fill priority={priority} sizes="100vw" className="animate-[hero-zoom_2.4s_var(--ease-out-expo)_both] object-cover sm:hidden" />
            ) : null}
            {section.image ? (
              <Image
                src={section.image}
                alt={section.imageAlt}
                fill
                priority={priority}
                sizes="(min-width: 1024px) 58vw, 100vw"
                className={`animate-[hero-zoom_2.4s_var(--ease-out-expo)_both] object-cover ${section.mobileImage ? 'hidden sm:block' : ''}`}
              />
            ) : null}
          </div>
        ) : null}
        <div className="container-x flex flex-col justify-center py-12 sm:py-16 lg:order-1 lg:col-span-5 lg:py-20 lg:pr-12 xl:pr-16 xl:pl-[max(2.5rem,calc((100vw-1440px)/2+2.5rem))]">
          {section.eyebrow ? (
            <p className="eyebrow flex animate-fade-up items-center gap-3 text-muted">
              <span className="h-px w-10 bg-zari" aria-hidden />
              {section.eyebrow}
            </p>
          ) : null}
          <h1 id="hero-heading" className="font-display mt-6 animate-fade-up text-[clamp(2.9rem,5.4vw,5.9rem)] leading-[0.98] [animation-delay:120ms] text-balance">
            <Emphasis text={section.heading} />
          </h1>
          {section.subheading ? (
            <p className="mt-7 max-w-md animate-fade-up text-[1.05rem] leading-relaxed text-ink-2 [animation-delay:260ms]">{section.subheading}</p>
          ) : null}
          <div className="mt-10 flex animate-fade-up flex-wrap items-center gap-x-8 gap-y-4 [animation-delay:380ms]">
            {section.ctaLabel && section.ctaHref ? (
              <Button asChild size="xl">
                <Link href={section.ctaHref}>{section.ctaLabel}</Link>
              </Button>
            ) : null}
            {section.secondaryCtaLabel && section.secondaryCtaHref ? (
              <Link href={section.secondaryCtaHref} className="label-caps link-rule">
                {section.secondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
