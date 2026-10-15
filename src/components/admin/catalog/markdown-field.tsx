'use client';

import * as React from 'react';
import { Field, Textarea } from '@/components/ui/form-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menus';
import { Markdown } from '@/components/store/markdown';

/** Markdown textarea with a rendered preview (same renderer as the storefront). */
export function MarkdownField({
  id,
  label,
  value,
  onChange,
  maxLength,
  rows = 10,
  hint,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  hint?: React.ReactNode;
  error?: string;
  placeholder?: string;
}) {
  const [tab, setTab] = React.useState('write');
  return (
    <Field
      label={label}
      htmlFor={id}
      error={error}
      hint={
        <>
          {hint ?? 'Markdown: **bold**, *italic*, lists, [links](/shop). HTML is not rendered.'}{' '}
          <span className="tabular-nums">
            {value.length.toLocaleString('en-IN')}/{maxLength.toLocaleString('en-IN')}
          </span>
        </>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={`${label} editor mode`} className="mb-2">
          <TabsTrigger value="write" className="px-3 py-1 text-xs">
            Write
          </TabsTrigger>
          <TabsTrigger value="preview" className="px-3 py-1 text-xs">
            Preview
          </TabsTrigger>
        </TabsList>
        <TabsContent value="write" forceMount hidden={tab !== 'write'}>
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            className="font-mono text-[13px]"
          />
        </TabsContent>
        <TabsContent value="preview">
          <div className="min-h-40 rounded-lg border border-line bg-paper px-4 py-3">
            {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </Field>
  );
}
