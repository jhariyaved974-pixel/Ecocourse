import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { integrations } from '@/lib/env.server';
import { getClientIpHash, rateLimit } from '@/lib/security';
import { getStoreSettings } from '@/lib/content/queries';
import { AFFILIATE_COOKIE, normalizeAffiliateCode, safeLandingPath } from '@/lib/affiliates';

/**
 * Referral link: /r/<code>?to=/products/... — remembers the affiliate in a
 * cookie and sends the visitor on to the shop. A click is counted at most once
 * a day per visitor; unknown or inactive codes just redirect.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const url = new URL(request.url);
  const target = new URL(safeLandingPath(url.searchParams.get('to')), url.origin);
  const response = NextResponse.redirect(target, 307);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex');

  const code = normalizeAffiliateCode((await params).code);
  if (!code || !integrations.serviceRole) return response;

  const count = await rateLimit('aff_click', `${await getClientIpHash()}:${code}`, 1, 86_400);
  const { data: valid } = await createSupabaseServiceClient().rpc('record_affiliate_click', { p_code: code, p_count: count });
  if (valid !== true) return response;

  const settings = await getStoreSettings();
  response.cookies.set(AFFILIATE_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * settings.affiliate_cookie_days,
  });
  return response;
}
