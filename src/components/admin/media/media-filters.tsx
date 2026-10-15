'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SearchParamInput, SearchParamSelect } from '@/components/admin/client-ui';

/** Search and filters for the media grid (URL-driven). Render inside <Suspense>. */
export function MediaFilters() {
  const searchParams = useSearchParams();
  const active = ['q', 'kind', 'alt'].some((k) => searchParams.get(k));
  const folder = searchParams.get('folder');
  const clearHref = folder ? `/admin/media?folder=${encodeURIComponent(folder)}` : '/admin/media';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchParamInput placeholder="Search label or alt text…" className="relative block w-full sm:w-72" />
      <SearchParamSelect
        param="kind"
        label="File type"
        options={[
          { value: '', label: 'All types' },
          { value: 'image', label: 'Images' },
          { value: 'video', label: 'Videos' },
          { value: 'model', label: '3D models' },
        ]}
      />
      <SearchParamSelect
        param="alt"
        label="Alt text"
        options={[
          { value: '', label: 'Any alt text' },
          { value: 'missing', label: 'Images missing alt text' },
        ]}
      />
      {active ? (
        <Link href={clearHref} className="px-2 text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
