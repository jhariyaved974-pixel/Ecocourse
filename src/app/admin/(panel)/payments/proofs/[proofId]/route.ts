import { NextResponse, type NextRequest } from 'next/server';
import { getStaff, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { isUuid, PROOF_URL_TTL_SECONDS } from '@/lib/admin/orders';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Opens a customer's payment proof for an owner/admin. The file is never
// proxied: this mints a fresh short-lived signed URL with the staff member's
// own session (the storage policy only lets owners/admins sign) and redirects
// to it. The bucket stays private.

const NO_STORE = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

function plain(status: number, text: string) {
  return new NextResponse(text, { status, headers: { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ proofId: string }> }) {
  const { proofId } = await params;
  const staff = await getStaff();
  if (!staff) return NextResponse.redirect(new URL('/admin/login', request.url), { status: 303, headers: NO_STORE });
  if (!roleAllowed(staff.role, ROLE_GROUPS.admin)) return plain(403, 'Only owners and admins can view payment proofs.');
  if (!isUuid(proofId)) return plain(404, 'Not found');

  const supabase = await createSupabaseServerClient();
  const { data: proof } = await supabase.from('payment_proofs').select('file_path').eq('id', proofId).maybeSingle();
  if (!proof?.file_path) return plain(404, 'This proof has no file.');

  const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(proof.file_path, PROOF_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return plain(404, 'The file could not be found in storage.');
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: NO_STORE });
}
