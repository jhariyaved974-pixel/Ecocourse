import 'server-only';
import { SITE_URL } from '@/lib/env';

// Email through Resend's HTTP API. Without RESEND_API_KEY and EMAIL_FROM nothing is sent and the
// in-app notifications still work.
const KEY = process.env.RESEND_API_KEY ?? '', FROM = process.env.EMAIL_FROM ?? '';
export const emailConfigured = () => Boolean(KEY && FROM);
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  if (!emailConfigured()) return { skipped: true };
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to, subject, html, text }) });
  if (!r.ok) throw new Error(`Email failed (${r.status})`);
  return { skipped: false };
}

export function digestEmail(name: string, items: { title: string; body: string | null; link: string | null }[]) {
  const rows = items.map(i => `<tr><td style="padding:14px 0;border-bottom:1px solid #eee"><a href="${SITE_URL}${i.link ?? '/'}" style="color:#111;text-decoration:none;font-weight:600">${esc(i.title)}</a>${i.body ? `<div style="color:#666;font-size:14px;margin-top:4px">${esc(i.body)}</div>` : ''}</td></tr>`).join('');
  return {
    subject: items.length === 1 ? items[0]!.title : `${items.length} updates in your WeberAct portal`,
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111">
      <div style="height:3px;background:#ef7650;margin-bottom:28px"></div><p style="font-size:20px;font-weight:700;margin:0 0 6px">WeberAct</p>
      <p style="color:#555;margin:0 0 20px">Hi ${esc(name)}, here is what changed in your portal.</p><table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="margin-top:28px"><a href="${SITE_URL}" style="background:#ef7650;color:#111;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Open the portal</a></p>
      <p style="color:#999;font-size:12px;margin-top:28px">You can turn these emails off in Settings in the portal.</p></div>`,
    text: `Hi ${name}, here is what changed in your WeberAct portal:\n\n${items.map(i => `- ${i.title}${i.body ? `: ${i.body}` : ''}`).join('\n')}\n\nOpen the portal: ${SITE_URL}`,
  };
}
