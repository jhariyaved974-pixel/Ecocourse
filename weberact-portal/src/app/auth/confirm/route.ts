import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// For email templates that link with a token hash ({{ .TokenHash }}): works across devices and browsers.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const n = url.searchParams.get('next');
  const next = n && n.startsWith('/') && !n.startsWith('//') ? n : type === 'invite' || type === 'recovery' ? '/set-password' : '/';
  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
