import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { JsonLd } from './json-ld';
import { absoluteUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

export function Breadcrumbs({ items, className }: { items: { label: string; href?: string }[]; className?: string }) {
  const all = [{ label: 'Home', href: '/' }, ...items];
  return (
    <>
      <nav aria-label="Breadcrumb" className={cn('text-xs text-muted', className)}>
        <ol className="flex flex-wrap items-center gap-1.5">
          {all.map((item, i) => (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
              {item.href && i < all.length - 1 ? (
                <Link href={item.href} className="hover:text-ink">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={i === all.length - 1 ? 'page' : undefined} className={i === all.length - 1 ? 'text-ink' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: all.map((item, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: item.label,
            item: item.href ? absoluteUrl(item.href) : undefined,
          })),
        }}
      />
    </>
  );
}
