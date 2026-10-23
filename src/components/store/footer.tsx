import Link from 'next/link';
import { Mail, Phone, MapPin } from 'lucide-react';
import type { StoreSettings } from '@/lib/content/queries';
import { NewsletterForm } from './chrome';
import { BrandMark } from './wordmark';

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
    <footer data-surface="dark" className="mt-28">
      <div className="container-x grid gap-14 pt-20 pb-14 lg:grid-cols-12 lg:gap-10 lg:pt-24">
        <div className="lg:col-span-5 lg:pr-10">
          <p className="eyebrow text-zari">Letters from the loom</p>
          <p className="font-display mt-4 max-w-sm text-[2.1rem] leading-[1.1]">New weaves and the stories behind them, a few times a season.</p>
          <div className="mt-8">
            <NewsletterForm dark />
          </div>
        </div>
        <nav className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:col-span-7" aria-label="Footer">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="eyebrow mb-5 text-dark-muted">{g.title}</p>
              <ul className="space-y-3 text-[14px]">
                {g.links.map((l) => (
                  <li key={l.id}>
                    <Link href={l.href} className="link-draw text-dark-ink/85 transition-colors hover:text-white" target={l.newTab ? '_blank' : undefined} rel={l.newTab ? 'noopener noreferrer' : undefined}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {settings.support_email || settings.support_phone || settings.address ? (
            <div>
              <p className="eyebrow mb-5 text-dark-muted">Write to us</p>
              <ul className="space-y-3 text-[14px] text-dark-ink/85">
                {settings.support_email ? (
                  <li className="flex items-center gap-2">
                    <Mail className="size-3.5 shrink-0 opacity-70" aria-hidden />
                    <a href={`mailto:${settings.support_email}`} className="link-draw hover:text-white">{settings.support_email}</a>
                  </li>
                ) : null}
                {settings.support_phone ? (
                  <li className="flex items-center gap-2">
                    <Phone className="size-3.5 shrink-0 opacity-70" aria-hidden />
                    <a href={`tel:${settings.support_phone.replace(/\s/g, '')}`} className="link-draw hover:text-white">{settings.support_phone}</a>
                  </li>
                ) : null}
                {settings.address ? (
                  <li className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
                    <span>{settings.address}</span>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </nav>
      </div>
      <div className="container-x" aria-hidden>
        <div className="ornament text-zari/80"><BrandMark className="size-4" /></div>
        {/* Decorative: the name drawn across the full width (an SVG so it scales to fit exactly). */}
        <svg viewBox="0 0 1000 150" className="mt-8 block w-full text-dark-ink/[0.07] select-none" role="presentation" focusable="false">
          <text x="500" y="128" textAnchor="middle" textLength="980" lengthAdjust="spacing" fill="currentColor" className="font-display uppercase" style={{ fontSize: 150 }}>
            {settings.store_name}
          </text>
        </svg>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-4 py-6 text-xs text-dark-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {settings.legal_name ?? settings.store_name}. {settings.footer_note}
          </p>
          {settings.tagline ? <p className="font-display hidden text-sm italic lg:block">{settings.tagline}</p> : null}
          {socials.length ? (
            <ul className="flex items-center gap-1">
              {socials.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a href={href!} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid size-9 place-items-center transition-colors hover:text-white">
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
