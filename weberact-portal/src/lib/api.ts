import 'server-only';
import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export async function apiViewer() { return getViewer(); }
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export function pdfResponse(bytes: Uint8Array, filename: string, download: boolean) {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename.replace(/[^\w.\- ]+/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
