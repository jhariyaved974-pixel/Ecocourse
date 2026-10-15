import { CONTENT_TOKENS, type TokenValues } from '@/lib/admin/content';
import { cn } from '@/lib/utils';

/** Documents the {token} placeholders staff can type into CMS text, with their current values. */
export function TokenHelp({ values, className, compact }: { values?: TokenValues; className?: string; compact?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface-2/50 px-3.5 py-3 text-xs', className)}>
      <p className="font-medium text-ink">Placeholders</p>
      {compact ? null : <p className="mt-0.5 text-muted">Type these exactly (with the curly braces); the store fills them in from your settings.</p>}
      <dl className="mt-2 grid gap-1.5">
        {CONTENT_TOKENS.map((t) => {
          const key = t.token.slice(1, -1) as keyof TokenValues;
          return (
            <div key={t.token} className="flex flex-wrap items-baseline gap-x-2">
              <dt>
                <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink">{t.token}</code>
              </dt>
              <dd className="text-muted">
                {t.description}
                {values ? (
                  <>
                    {' '}
                    — now <span className="font-medium text-ink-2">{values[key]}</span>
                  </>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

