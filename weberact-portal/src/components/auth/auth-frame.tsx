import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';

// Shared frame for sign-in screens: brand panel on large screens, the form on the right.
export function AuthFrame({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-line bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="pointer-events-none absolute inset-0 glow" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-coral-500/10 blur-[120px]" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" aria-hidden />
        <Logo sub="Client portal" className="relative" />
        <div className="relative max-w-lg">
          <p className="eyebrow mb-5 !text-coral-400">Build. Automate. Accelerate.</p>
          <h2 className="text-[44px] font-semibold leading-[1.04] tracking-[-0.035em]">Every project, contract and result, in one private place.</h2>
          <p className="mt-6 text-[15px] leading-relaxed text-fg-muted">Follow each stage as it happens, review and accept contracts, settle invoices, download deliverables and talk to the team that builds for you.</p>
          <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {[['Live', 'project stages'], ['Private', 'files and contracts'], ['Direct', 'line to the team']].map(([a, b]) => (
              <div key={a} className="bg-ink-900/90 px-5 py-4"><p className="text-[15px] font-semibold">{a}</p><p className="mt-1 text-[12px] text-fg-faint">{b}</p></div>
            ))}
          </div>
        </div>
        <p className="relative text-[12px] text-fg-faint">© {new Date().getFullYear()} WeberAct. Access is by invitation only.</p>
      </section>
      <section className="relative flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 glow lg:hidden" aria-hidden />
        <div className="relative mx-auto w-full max-w-[400px]">
          <div className="mb-10 lg:hidden"><Logo sub="Client portal" /></div>
          <h1 className="text-[28px] font-semibold tracking-[-0.025em]">{title}</h1>
          {description && <p className="mt-2.5 text-[14.5px] leading-relaxed text-fg-muted">{description}</p>}
          <div className="mt-9">{children}</div>
        </div>
      </section>
    </div>
  );
}
