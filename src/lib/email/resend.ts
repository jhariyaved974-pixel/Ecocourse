// Minimal Resend REST client (https://resend.com/docs/api-reference/emails/send-email).
// No SDK: one fetch call, with an idempotency key so a retried send of the same
// outbox row is not delivered twice.

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  replyTo?: string | null;
  headers?: Record<string, string>;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendWithResend(
  email: OutgoingEmail,
  config: { apiKey: string; from: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  if (!config.apiKey || !config.from) return { ok: false, error: 'Email is not configured.' };
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': email.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        ...(email.headers && Object.keys(email.headers).length ? { headers: email.headers } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (res.ok && data?.id) return { ok: true, id: data.id };
    // Never echo the API key; the provider's error message is safe to log.
    return { ok: false, error: `Resend ${res.status}: ${data?.message ?? data?.name ?? res.statusText}`.slice(0, 300) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : 'Network error' };
  }
}
