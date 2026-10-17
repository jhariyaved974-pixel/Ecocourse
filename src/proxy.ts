import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refreshes the Supabase session cookie on pages that read the signed-in
 * user, so Server Components always see a valid session. Authorisation is
 * NOT decided here: every page, action and RLS policy checks again.
 */
// APP_MODE splits one codebase into two deployments: 'store' hides the admin
// panel, 'admin' serves only the admin panel (plus the APIs and auth callback
// it needs). Unset serves both, as in development.
const ADMIN_MODE_ALLOWED = /^\/(admin|api|auth|_next|images|models|favicon\.ico|icon|robots\.txt)(\/|$|\.)/;
const SESSION_PATHS = /^\/(account|admin|checkout|orders|login|signup|reset-password)(\/|$)/;

export async function proxy(request: NextRequest) {
  const mode = process.env.APP_MODE;
  const path = request.nextUrl.pathname;
  if (mode === 'store' && /^\/admin(\/|$)/.test(path)) {
    return new NextResponse('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
  }
  if (mode === 'admin' && !ADMIN_MODE_ALLOWED.test(path)) {
    const target = request.nextUrl.clone();
    target.pathname = '/admin';
    target.search = '';
    return NextResponse.redirect(target);
  }
  if (!SESSION_PATHS.test(path)) return NextResponse.next();

  // Order links from emails carry the guest access token as ?t=. Move it into
  // an httpOnly cookie and redirect to the clean URL so the token does not
  // linger in the address bar, history or Referer headers.
  const orderMatch = /^\/orders\/([A-Za-z]{2,4}-[0-9]{6}-[0-9A-Za-z]{5})$/.exec(request.nextUrl.pathname);
  const token = request.nextUrl.searchParams.get('t');
  if (orderMatch && token) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete('t');
    const response = NextResponse.redirect(clean);
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
      response.cookies.set(`au_ord_${orderMatch[1].toUpperCase()}`, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 120,
      });
    }
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  // getClaims verifies the JWT (refreshing it when expired) without an extra round trip when possible.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Everything except static assets, so APP_MODE can be enforced; the session
  // refresh itself only runs on SESSION_PATHS.
  matcher: ['/((?!_next/static|_next/image|images/|models/|favicon.ico).*)'],
};
