"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Box, ChevronLeft, ChevronRight, Expand, Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StageErrorBoundary, useCanRender3D } from "@/components/three/capability";
import type { ProductMediaData } from "@/lib/catalog/types";
import { ShoeArt, shoeTint, type ShoeType } from "@/components/store/shoe-art";
import { cn } from "@/lib/utils";

const ProductStage = dynamic(
  () => import("@/components/three/product-stage").then((m) => m.ProductStage),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-sm text-muted">
        Loading 3D view…
      </div>
    ),
  },
);

type Slide = { type: "media"; media: ProductMediaData } | { type: "3d" };

function ZoomImage({
  media,
  priority,
  onOpen,
}: {
  media: ProductMediaData;
  priority?: boolean;
  onOpen: () => void;
}) {
  const [origin, setOrigin] = React.useState("50% 50%");
  const [zoom, setZoom] = React.useState(false);
  return (
    <button
      type="button"
      className="group relative block h-full w-full cursor-zoom-in overflow-hidden"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setOrigin(
          `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`,
        );
      }}
      onMouseEnter={() => setZoom(true)}
      onMouseLeave={() => setZoom(false)}
      onClick={onOpen}
      aria-label={`Open full-screen image: ${media.alt}`}
    >
      <Image
        src={media.url}
        alt={media.alt}
        fill
        priority={priority}
        sizes="(min-width: 1024px) 55vw, 100vw"
        className="object-cover transition-transform duration-300 ease-out"
        style={{
          transformOrigin: origin,
          transform: zoom ? "scale(1.9)" : "scale(1)",
        }}
      />
      <span
        className="absolute right-4 bottom-4 grid size-10 place-items-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        aria-hidden
      >
        <Expand className="size-4" />
      </span>
    </button>
  );
}

function VideoSlide({ media }: { media: ProductMediaData }) {
  const [playing, setPlaying] = React.useState(false);
  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="group relative h-full w-full"
        aria-label="Play product video"
      >
        {media.posterUrl ? (
          <Image
            src={media.posterUrl}
            alt={media.alt}
            fill
            sizes="55vw"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-dark" />
        )}
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-16 place-items-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-105">
            <Play className="ml-1 size-6 fill-ink" />
          </span>
        </span>
      </button>
    );
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={media.url}
      poster={media.posterUrl ?? undefined}
      controls
      autoPlay
      playsInline
      preload="metadata"
      className="h-full w-full bg-black object-contain"
    />
  );
}

export function ProductGallery({
  media,
  modelUrl,
  tint,
  productName,
  activeColorId,
  artType = null,
}: {
  media: ProductMediaData[];
  modelUrl: string | null;
  tint: string | null;
  productName: string;
  activeColorId: string | null;
  /** Drawn shoe shown while a product has no photos. */
  artType?: ShoeType | null;
}) {
  // Images for the selected colour first, then shared media, then other colours.
  const ordered = React.useMemo(() => {
    const score = (m: ProductMediaData) =>
      m.colorId === activeColorId ? 0 : m.colorId === null ? 1 : 2;
    return [...media].sort((a, b) => score(a) - score(b));
  }, [media, activeColorId]);
  const visible = React.useMemo(() => {
    const forColor = ordered.filter(
      (m) => m.colorId === activeColorId || m.colorId === null,
    );
    return forColor.length ? forColor : ordered;
  }, [ordered, activeColorId]);

  const can3D = useCanRender3D();
  const [failed3D, setFailed3D] = React.useState(false);
  const supports3D = Boolean(modelUrl) && can3D && !failed3D;

  const slides: Slide[] = [
    ...visible.map((m) => ({ type: "media" as const, media: m })),
    ...(supports3D ? [{ type: "3d" as const }] : []),
  ];
  const [index, setIndex] = React.useState(0);
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  // Back to the first slide when the colour changes.
  const [indexColor, setIndexColor] = React.useState(activeColorId);
  if (indexColor !== activeColorId) {
    setIndexColor(activeColorId);
    setIndex(0);
  }
  const current = slides[Math.min(index, slides.length - 1)];

  const go = (dir: 1 | -1) =>
    setIndex((i) => (i + dir + slides.length) % slides.length);

  if (!slides.length && artType) {
    const color = tint ?? "#1d2a4a";
    return (
      <div
        className="relative grid aspect-square place-items-center overflow-hidden rounded-[var(--radius)] px-[8%]"
        style={{ background: shoeTint(color) }}
      >
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 size-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/45"
          aria-hidden
        />
        <ShoeArt
          type={artType}
          color={color}
          title={productName}
          className="relative drop-shadow-md transition-transform duration-500 hover:-rotate-3"
        />
      </div>
    );
  }

  if (!slides.length) {
    return (
      <div className="grid aspect-square place-items-center rounded-[var(--radius)] bg-surface-2 text-sm text-muted">
        No images yet
      </div>
    );
  }

  const images = visible.filter((m) => m.kind === "image");

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-start">
      <ul
        className="scrollbar-none relative flex gap-2 overflow-x-auto lg:max-h-[calc(100vh-10rem)] lg:w-20 lg:flex-col lg:overflow-y-auto"
        aria-label="Product media"
      >
        {slides.map((s, i) => (
          <li key={s.type === "3d" ? "3d" : s.media.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index}
              aria-label={
                s.type === "3d"
                  ? "View in 3D"
                  : s.media.kind === "video"
                    ? "Product video"
                    : `Image ${i + 1}`
              }
              className={cn(
                "relative block size-16 overflow-hidden rounded-lg border-2 bg-surface-2 transition-colors lg:size-20",
                i === index
                  ? "border-ink"
                  : "border-transparent hover:border-line-strong",
              )}
            >
              {s.type === "3d" ? (
                <span className="grid h-full place-items-center text-[10px] font-semibold tracking-wide">
                  <Box className="mb-0.5 size-5" />
                  3D
                </span>
              ) : s.media.kind === "video" ? (
                <>
                  {s.media.posterUrl ? (
                    <Image
                      src={s.media.posterUrl}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : null}
                  <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
                    <Play className="size-4 fill-white" />
                  </span>
                </>
              ) : (
                <Image
                  src={s.media.url}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              )}
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0 flex-1">
        <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius)] bg-surface-2">
          {current.type === "3d" ? (
            <StageErrorBoundary onError={() => setFailed3D(true)}>
              <ProductStage
                url={modelUrl!}
                tint={tint}
                dark={false}
                autoRotate={false}
                className="h-full w-full cursor-grab active:cursor-grabbing"
              />
              <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1.5 text-[11px] text-ink-2 backdrop-blur">
                Drag to rotate · Interactive 3D model
              </p>
            </StageErrorBoundary>
          ) : current.media.kind === "video" ? (
            <VideoSlide key={current.media.id} media={current.media} />
          ) : (
            <ZoomImage
              key={current.media.id}
              media={current.media}
              priority={index === 0}
              onOpen={() =>
                setLightbox(images.findIndex((m) => m.id === current.media.id))
              }
            />
          )}
          {slides.length > 1 ? (
            <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between lg:hidden">
              <button
                type="button"
                onClick={() => go(-1)}
                className="pointer-events-auto grid size-10 place-items-center rounded-full bg-white/85 shadow-sm"
                aria-label="Previous image"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="pointer-events-auto grid size-10 place-items-center rounded-full bg-white/85 shadow-sm"
                aria-label="Next image"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={lightbox !== null}
        onOpenChange={(o) => !o && setLightbox(null)}
      >
        <DialogContent
          className="max-w-[min(96vw,1200px)] p-0"
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (lightbox === null) return;
            if (e.key === "ArrowRight")
              setLightbox((lightbox + 1) % images.length);
            if (e.key === "ArrowLeft")
              setLightbox((lightbox - 1 + images.length) % images.length);
          }}
        >
          <DialogTitle className="sr-only">{productName} images</DialogTitle>
          {lightbox !== null && images[lightbox] ? (
            <div className="relative aspect-square w-full bg-surface-2 md:aspect-[4/3]">
              <Image
                src={images[lightbox].url}
                alt={images[lightbox].alt}
                fill
                sizes="96vw"
                className="object-contain"
                quality={85}
              />
              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white shadow"
                    onClick={() =>
                      setLightbox(
                        (lightbox - 1 + images.length) % images.length,
                      )
                    }
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white shadow"
                    onClick={() => setLightbox((lightbox + 1) % images.length)}
                    aria-label="Next image"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              ) : null}
              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs tabular-nums">
                {lightbox + 1} / {images.length}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
