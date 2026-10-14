'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useMotionValueEvent } from 'motion/react';
import { ArrowRight, Move3d } from 'lucide-react';
import type { HomeSection } from '@/lib/content/queries';
import { Button } from '@/components/ui/button';
import { canRender3D, StageErrorBoundary } from '@/components/three/capability';
import { cn } from '@/lib/utils';

const ShoeStage = dynamic(() => import('@/components/three/shoe-stage').then((m) => m.ShoeStage), { ssr: false });

const DEFAULT_MODEL = '/models/velocity-runner-x.glb';

export function Hero({ section, priority }: { section: HomeSection; priority?: boolean }) {
  const reduceMotion = useReducedMotion();
  const ref = React.useRef<HTMLElement>(null);
  const scrollValue = React.useRef(0);
  const [mount3D, setMount3D] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    scrollValue.current = v;
  });

  React.useEffect(() => {
    if (!section.show3d || !canRender3D()) return;
    // Defer the 3D bundle until the browser is idle so it never delays shopping.
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = idle ? idle(() => setMount3D(true), { timeout: 2500 }) : window.setTimeout(() => setMount3D(true), 1200);
    return () => {
      if (!idle) window.clearTimeout(handle);
    };
  }, [section.show3d]);

  React.useEffect(() => {
    if (!priority) return;
    document.documentElement.dataset.heroOverlay = '1';
    return () => {
      delete document.documentElement.dataset.heroOverlay;
    };
  }, [priority]);

  const words = section.heading.split(' ');

  return (
    <section ref={ref} data-surface="dark" className={cn('relative overflow-hidden', priority && '-mt-16 lg:-mt-[72px]')} aria-labelledby="hero-heading">
      {priority ? <script dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.heroOverlay='1'" }} /> : null}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-1/3 right-[-10%] size-[70vw] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_28%,transparent),transparent_65%)] blur-2xl" />
        <div className="absolute bottom-0 left-0 h-1/2 w-full bg-gradient-to-t from-black/40 to-transparent" />
      </div>
      <div className="container-x relative grid min-h-[min(100svh,980px)] items-center gap-6 pt-24 pb-12 lg:grid-cols-[1.05fr_1fr] lg:pt-28">
        <div className="relative z-10 order-2 max-w-2xl lg:order-1">
          {section.eyebrow ? (
            <motion.p
              className="eyebrow mb-6 inline-flex items-center gap-3 text-dark-muted"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="h-px w-8 bg-current" aria-hidden />
              {section.eyebrow}
            </motion.p>
          ) : null}
          <h1 id="hero-heading" className="font-display text-[clamp(3rem,8vw,7rem)] leading-[0.95]">
            {words.map((w, i) => (
              <motion.span
                key={`${w}-${i}`}
                className="mr-[0.22em] inline-block"
                initial={reduceMotion ? false : { opacity: 0, y: '0.4em' }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              >
                {w}
              </motion.span>
            ))}
          </h1>
          {section.subheading ? (
            <motion.p
              className="mt-6 max-w-lg text-base leading-relaxed text-dark-muted md:text-lg"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.45 }}
            >
              {section.subheading}
            </motion.p>
          ) : null}
          <motion.div
            className="mt-9 flex flex-wrap gap-3"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            {section.ctaLabel && section.ctaHref ? (
              <Button asChild size="xl" className="bg-white text-ink hover:bg-white/90">
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
          </motion.div>
        </div>

        <div className="relative order-1 aspect-square w-full lg:order-2 lg:aspect-[4/4.2]">
          {/* Poster: always present so the hero is complete without WebGL. */}
          {section.image || section.mobileImage ? (
            <div className={cn('absolute inset-0 transition-opacity duration-1000', ready && 'opacity-0')}>
              {section.mobileImage ? (
                <Image src={section.mobileImage} alt={section.imageAlt} fill priority={priority} sizes="100vw" className="object-cover object-center lg:hidden" />
              ) : null}
              {section.image ? (
                <Image
                  src={section.image}
                  alt={section.imageAlt}
                  fill
                  priority={priority}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className={cn('object-cover object-[78%_50%]', section.mobileImage && 'hidden lg:block')}
                />
              ) : null}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,var(--dark)_85%)]" />
            </div>
          ) : null}
          {mount3D ? (
            <StageErrorBoundary onError={() => setReady(false)}>
              <ShoeStage
                url={section.model ?? DEFAULT_MODEL}
                autoRotate={!reduceMotion}
                scrollRef={reduceMotion ? undefined : scrollValue}
                onReady={() => setReady(true)}
                className={cn('absolute inset-0 transition-opacity duration-1000', ready ? 'opacity-100' : 'opacity-0')}
              />
            </StageErrorBoundary>
          ) : null}
          {ready ? (
            <p className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] tracking-wide text-dark-muted backdrop-blur">
              <Move3d className="size-3.5" aria-hidden /> Drag to rotate
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
