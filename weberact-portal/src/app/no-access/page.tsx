import { Logo } from '@/components/ui/logo';
export default function NoAccess() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">Your access is paused</h1>
      <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-fg-muted">This account is not linked to an active client workspace. If you think this is a mistake, contact your WeberAct project manager.</p>
      <form action="/auth/signout" method="post" className="mt-8"><button className="rounded-xl border border-line-strong px-5 py-2.5 text-sm text-fg-muted hover:text-fg">Sign out</button></form>
    </div>
  );
}
