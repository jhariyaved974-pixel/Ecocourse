import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC = [/^\/login/, /^\/forgot-password/, /^\/auth\//, /^\/no-access/, /^\/api\/payments\/(razorpay|stripe)\/webhook/, /^\/api\/cron\//, /^\/api\/health/];

// Refreshes the Supabase session cookie on every request and sends signed-out visitors to the
// login page. Roles are checked again in each layout and, above all, by row level security.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: list => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && !PUBLIC.some(r => r.test(path))) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const to = request.nextUrl.clone();
    to.pathname = '/login';
    to.search = path !== '/' ? `?next=${encodeURIComponent(path + request.nextUrl.search)}` : '';
    return NextResponse.redirect(to);
  }
  if (user && path === '/login') {
    const to = request.nextUrl.clone(); to.pathname = '/'; to.search = '';
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)'],
};
