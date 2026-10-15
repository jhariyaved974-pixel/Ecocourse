export function AuthShell({ title, description, children, footer }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="container-x flex min-h-[70vh] items-start justify-center py-12 md:py-20">
      <div className="w-full max-w-md">
        <h1 className="font-display text-5xl">{title}</h1>
        {description ? <p className="mt-3 text-muted">{description}</p> : null}
        <div className="mt-8 rounded-[var(--radius)] border border-line bg-surface p-6 md:p-8">{children}</div>
        {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
      </div>
    </div>
  );
}
