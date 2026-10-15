import type { Metadata } from 'next';
import Link from 'next/link';
import { getFaqs } from '@/lib/content/queries';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/menus';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { JsonLd } from '@/components/store/json-ld';
import { Markdown } from '@/components/store/markdown';

export const metadata: Metadata = {
  title: 'Frequently asked questions',
  description: 'Sizing, delivery, UPI payments, returns and exchanges — answers to common questions.',
  alternates: { canonical: '/faq' },
};

export default async function FaqPage() {
  const faqs = await getFaqs();
  const groups = new Map<string, typeof faqs>();
  for (const f of faqs) groups.set(f.group_name, [...(groups.get(f.group_name) ?? []), f]);
  return (
    <div className="container-x max-w-3xl py-10 md:py-16">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
        }}
      />
      <Breadcrumbs items={[{ label: 'FAQ' }]} />
      <h1 className="mt-6 font-display text-5xl md:text-6xl">Questions, answered</h1>
      <p className="mt-4 text-muted">
        Can&apos;t find what you need? <Link href="/orders/track" className="underline underline-offset-4">Track an order</Link> or read our{' '}
        <Link href="/pages/returns-and-exchanges" className="underline underline-offset-4">returns policy</Link>.
      </p>
      <div className="mt-12 space-y-12">
        {[...groups.entries()].map(([group, items]) => (
          <section key={group} aria-labelledby={`faq-${group}`}>
            <h2 id={`faq-${group}`} className="eyebrow text-muted">{group}</h2>
            <Accordion type="multiple" className="mt-4 border-t border-line">
              {items.map((f) => (
                <AccordionItem key={f.id} value={f.id}>
                  <AccordionTrigger>{f.question}</AccordionTrigger>
                  <AccordionContent>
                    <Markdown>{f.answer}</Markdown>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}
      </div>
    </div>
  );
}
