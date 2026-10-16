import { NextResponse, type NextRequest } from 'next/server';
import { applyOptOut, optOutPageUrl, parseOptOut } from '@/lib/email/optout';
import { rateLimitByIp } from '@/lib/security';

/**
 * RFC 8058 one-click unsubscribe target for the List-Unsubscribe header. Mail
 * providers POST here cross-site, so instead of an origin check the request is
 * authorised by the signed token in the URL, and it can only turn emails off.
 */
export async function POST(request: NextRequest) {
  const optOut = parseOptOut(Object.fromEntries(request.nextUrl.searchParams));
  if (!optOut) return NextResponse.json({ ok: false, error: 'Invalid or expired link.' }, { status: 400 });
  if (!(await rateLimitByIp('unsubscribe', 30, 3600))) return NextResponse.json({ ok: false }, { status: 429 });
  try {
    await applyOptOut(optOut);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('unsubscribe failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/** A plain visit goes to the confirmation page instead of changing anything. */
export async function GET(request: NextRequest) {
  const optOut = parseOptOut(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.redirect(optOut ? optOutPageUrl(optOut) : new URL('/email/preferences', request.nextUrl), 303);
}
