import type { OnboardingData } from '@/lib/types';
import { ONBOARDING_SERVICES } from '@/lib/constants';
import { FileButtons } from './files';

// Read-only view of a submitted onboarding, used by the client and in the admin panel.
export function OnboardingSummary({ data }: { data: OnboardingData }) {
  const p = data.personal ?? {}, s = data.services ?? {}, b = data.brief ?? {}, a = data.assets ?? {};
  const sections: [string, [string, string | undefined][]][] = [
    ['Personal information', [['Name', p.full_name], ['Company', p.company], ['Email', p.email], ['Phone', p.phone], ['Country', p.country], ['Website', p.website]]],
    ['Services', [['Selected', (s.selected ?? []).map(x => ONBOARDING_SERVICES.find(o => o.value === x)?.label ?? x).join(', ')], ['Custom', s.custom]]],
    ['Project brief', [['Business', b.business], ['Objectives', b.objectives], ['Audience', b.audience], ['Competitors', b.competitors], ['Features', b.features], ['Design references', b.references], ['Special requirements', b.special]]],
  ];
  return (
    <div className="space-y-5">
      {sections.map(([title, rows]) => (
        <section key={title} className="card">
          <h3 className="border-b border-line px-6 py-3.5 text-[14px] font-semibold">{title}</h3>
          <dl className="divide-y divide-line/60 px-6">
            {rows.filter(([, v]) => v !== undefined).map(([k, v]) => (
              <div key={k} className="grid gap-1 py-3 text-[13.5px] sm:grid-cols-[180px_1fr]"><dt className="text-fg-muted">{k}</dt><dd className="whitespace-pre-line text-fg-soft">{v || <span className="text-fg-faint">Not provided</span>}</dd></div>
            ))}
          </dl>
        </section>
      ))}
      <section className="card">
        <h3 className="border-b border-line px-6 py-3.5 text-[14px] font-semibold">Brand assets</h3>
        {(a.files ?? []).length ? (
          <ul className="divide-y divide-line/60">
            {a.files!.map(f => (
              <li key={f.id} className="flex items-center gap-3 px-6 py-3 text-[13.5px]">
                <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11.5px] text-fg-muted">{f.category}</span>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {f.path && <FileButtons path={f.path} name={f.name} />}
              </li>
            ))}
          </ul>
        ) : <p className="px-6 py-4 text-[13.5px] text-fg-faint">No files uploaded</p>}
        {a.notes && <p className="border-t border-line px-6 py-3 text-[13.5px] whitespace-pre-line text-fg-soft">{a.notes}</p>}
      </section>
    </div>
  );
}
