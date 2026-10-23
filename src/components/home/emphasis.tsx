import * as React from 'react';

/**
 * Renders a CMS heading where *asterisks* mark words to set in italics, e.g.
 * "Silk, zari and *the patience of the loom.*" Unpaired asterisks are kept.
 */
export function Emphasis({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\*[^*]+\*$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : <React.Fragment key={i}>{part}</React.Fragment>,
      )}
    </>
  );
}

/** The heading text without emphasis markers (for aria labels and metadata). */
export const plainHeading = (text: string) => text.replace(/\*([^*]+)\*/g, '$1');
