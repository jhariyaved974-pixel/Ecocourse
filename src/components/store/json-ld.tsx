/** Renders schema.org structured data. Content is JSON-encoded with `<` escaped so it can never break out of the script tag. */
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
