import Link from 'next/link';
import { Mail, Phone, MapPin } from 'lucide-react';
import type { StoreSettings } from '@/lib/content/queries';
import { NewsletterForm } from './chrome';
import { Wordmark } from './wordmark';

function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9Z" />
    </svg>
  );
}

function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
    </svg>
  );
}

function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M17.75 3h3.07l-6.71 7.67L22 21h-6.18l-4.84-6.33L5.44 21H2.37l7.18-8.2L2 3h6.33l4.38 5.79L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58l11.09 14.47Z" />
    </svg>
  );
}

export function Footer({ settings, groups }: { settings: StoreSettings; groups: { title: string; links: { id: string; label: string; href: string; newTab: boolean }[] }[] }) {
  const socials = [
    { href: settings.instagram_url, label: 'Instagram', Icon: InstagramIcon },
    { href: settings.facebook_url, label: 'Facebook', Icon: FacebookIcon },
    { href: settings.x_url, label: 'X', Icon: XIcon },
    { href: settings.youtube_url, label: 'YouTube', Icon: YoutubeIcon },
  ].filter((s) => s.href);

  return (
    <footer data-surface="dark" className="mt-24">
      <div className="container-x grid gap-12 py-16 lg:grid-cols-12 lg:py-20">
        <div className="space-y-6 lg:col-span-5">
          <p>
            <Wordmark name={settings.store_name} className="gap-3 text-3xl" markClassName="size-9" />
          </p>
          {settings.tagline ? <p className="-mt-3 text-sm text-dark-ink/85">{settings.tagline}</p> : null}
          <p className="max-w-sm text-sm leading-relaxed text-dark-muted">{settings.footer_about}</p>
          <div>
            <p className="eyebrow mb-3 text-dark-muted">Newsletter</p>
            <NewsletterForm dark />
          </div>
        </div>
        <nav className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7" aria-label="Footer">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="eyebrow mb-4 text-dark-muted">{g.title}</p>
              <ul className="space-y-2.5 text-sm">
                {g.links.map((l) => (
                  <li key={l.id}>
                    <Link href={l.href} className="text-dark-ink/85 transition-colors hover:text-white" target={l.newTab ? '_blank' : undefined} rel={l.newTab ? 'noopener noreferrer' : undefined}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {settings.support_email || settings.support_phone || settings.address ? (
            <div>
              <p className="eyebrow mb-4 text-dark-muted">Contact</p>
              <ul className="space-y-2.5 text-sm text-dark-ink/85">
                {settings.support_email ? (
                  <li className="flex items-center gap-2">
                    <Mail className="size-3.5 shrink-0" aria-hidden />
                    <a href={`mailto:${settings.support_email}`} className="hover:text-white">{settings.support_email}</a>
                  </li>
                ) : null}
                {settings.support_phone ? (
                  <li className="flex items-center gap-2">
                    <Phone className="size-3.5 shrink-0" aria-hidden />
                    <a href={`tel:${settings.support_phone.replace(/\s/g, '')}`} className="hover:text-white">{settings.support_phone}</a>
                  </li>
                ) : null}
                {settings.address ? (
                  <li className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{settings.address}</span>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-4 py-6 text-xs text-dark-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {settings.legal_name ?? settings.store_name}. {settings.footer_note}
          </p>
          {socials.length ? (
            <ul className="flex items-center gap-1">
              {socials.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a href={href!} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid size-9 place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-white">
                    <Icon className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
