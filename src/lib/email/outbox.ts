import 'server-only';
import { after } from 'next/server';
import { publicEnv } from '@/lib/env';
import type { Tables } from '@/lib/database.types';
import { integrations, serverEnv } from '@/lib/env.server';
import { orderUrl } from '@/lib/security';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { renderEmail, type EmailContext } from '@/lib/email/templates';
import { sendWithResend } from '@/lib/email/resend';
import { cartReminderOptOut, newsletterOptOut, optOutOneClickUrl, optOutPageUrl } from '@/lib/email/optout';

export interface DeliveryReport {
  configured: boolean;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_NUMBER = /^[A-Z0-9-]{4,40}$/;
const EMAIL = /^[^\s@<>,;]{1,64}@[^\s@<>,;]+\.[a-z]{2,}$/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends a batch of queued emails. Rows are claimed with a lease in the
 * database, so this is safe to run from several places at once (after()
 * hooks and the cron sweeper). Does nothing until Resend is configured;
 * messages stay queued (and are skipped after three days).
 */
export async function deliverQueuedEmails(limit = 20): Promise<DeliveryReport> {
  const report: DeliveryReport = { configured: integrations.email && integrations.serviceRole, claimed: 0, sent: 0, failed: 0, skipped: 0 };
  if (!report.configured) return report;

  const db = createSupabaseServiceClient();
  const { data, error } = await db.rpc('claim_email_batch', { p_limit: limit });
  if (error) throw new Error(`Could not claim emails: ${error.message}`);
  const rows = (data ?? []) as Tables<'email_outbox'>[];
  report.claimed = rows.length;
  if (!rows.length) return report;

  const { data: settings } = await db.from('store_settings').select('store_name, support_email').eq('id', true).maybeSingle();
  const base: EmailContext = {
    storeName: settings?.store_name || 'Save The Money',
    siteUrl: publicEnv.siteUrl,
    supportEmail: settings?.support_email ?? null,
  };

  for (const [index, row] of rows.entries()) {
    if (index > 0) await sleep(550); // stay under Resend's default 2 requests/second
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const ctx: EmailContext = { ...base };
    const headers: Record<string, string> = {};
    let replyTo = base.supportEmail;

    const orderId = typeof payload.order_id === 'string' && UUID.test(payload.order_id) ? payload.order_id : null;
    const orderNumber = typeof payload.order_number === 'string' && ORDER_NUMBER.test(payload.order_number) ? payload.order_number : null;
    if (orderId && orderNumber && row.template !== 'admin_proof_submitted') {
      ctx.orderLink = integrations.orderTokens ? orderUrl(orderNumber, orderId) : `${publicEnv.siteUrl}/account/orders`;
    }
    if (row.template === 'admin_proof_submitted' && orderId) {
      ctx.adminLink = `${(process.env.ADMIN_URL || publicEnv.siteUrl).replace(/\/$/, '')}/admin/payments/${orderId}`;
    }
    if (row.template === 'admin_international_lead') {
      ctx.adminLink = `${(process.env.ADMIN_URL || publicEnv.siteUrl).replace(/\/$/, '')}/admin/international`;
      // "Reply" in the owner's inbox goes straight to the interested shopper.
      if (typeof payload.email === 'string' && EMAIL.test(payload.email)) replyTo = payload.email;
    }
    if (row.template === 'cart_reminder') {
      const optOut = typeof payload.user_id === 'string' && UUID.test(payload.user_id) ? cartReminderOptOut(payload.user_id) : null;
      if (!optOut) {
        // Optional emails always carry a working opt-out link, or are not sent.
        await db.rpc('finish_email', { p_id: row.id, p_status: 'skipped', p_provider_message_id: '', p_error: 'No opt-out link available.' });
        report.skipped++;
        continue;
      }
      ctx.stopRemindersLink = optOutPageUrl(optOut);
      headers['List-Unsubscribe'] = `<${optOutOneClickUrl(optOut)}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    if (row.template === 'newsletter_welcome') {
      const optOut = newsletterOptOut(row.to_email);
      if (!optOut) {
        await db.rpc('finish_email', { p_id: row.id, p_status: 'skipped', p_provider_message_id: '', p_error: 'No opt-out link available.' });
        report.skipped++;
        continue;
      }
      ctx.unsubscribeLink = optOutPageUrl(optOut);
      headers['List-Unsubscribe'] = `<${optOutOneClickUrl(optOut)}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    const rendered = renderEmail(row.template, row.subject, payload, ctx);
    if (!rendered) {
      await db.rpc('finish_email', { p_id: row.id, p_status: 'skipped', p_provider_message_id: '', p_error: `Nothing to send for template ${row.template}.` });
      report.skipped++;
      continue;
    }
    const result = await sendWithResend(
      { to: row.to_email, subject: rendered.subject, html: rendered.html, text: rendered.text, idempotencyKey: `auren-outbox-${row.id}`, replyTo, headers },
      { apiKey: serverEnv.resendApiKey, from: serverEnv.emailFrom },
    );
    if (result.ok) {
      await db.rpc('finish_email', { p_id: row.id, p_status: 'sent', p_provider_message_id: result.id, p_error: '' });
      report.sent++;
    } else {
      console.error('email delivery failed', row.template, result.error);
      await db.rpc('finish_email', { p_id: row.id, p_status: 'failed', p_provider_message_id: '', p_error: result.error });
      report.failed++;
    }
  }
  return report;
}

/** Sends freshly queued emails right after the current response is finished. */
export function deliverEmailsSoon() {
  if (!integrations.email || !integrations.serviceRole) return;
  after(async () => {
    try {
      await deliverQueuedEmails(10);
    } catch (err) {
      console.error('email delivery error', err instanceof Error ? err.message : err);
    }
  });
}
