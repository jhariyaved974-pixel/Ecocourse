import 'server-only';
import { z } from 'zod';

const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  ORDER_ACCESS_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  RAZORPAY_KEY_ID: z.string().min(5).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(5).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(5).optional(),
  IP_HASH_SALT: z.string().min(8).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Never print the values themselves.
  console.error('Invalid server environment:', parsed.error.issues.map((i) => i.path.join('.')).join(', '));
}
const env = parsed.success ? parsed.data : ({} as z.infer<typeof schema>);

export const serverEnv = {
  serviceRoleKey: env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  orderAccessSecret: env.ORDER_ACCESS_SECRET ?? '',
  cronSecret: env.CRON_SECRET ?? '',
  resendApiKey: env.RESEND_API_KEY ?? '',
  emailFrom: env.EMAIL_FROM ?? '',
  razorpayKeyId: env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? '',
  ipHashSalt: env.IP_HASH_SALT ?? env.ORDER_ACCESS_SECRET ?? 'local-dev-salt',
};

export const integrations = {
  email: Boolean(serverEnv.resendApiKey && serverEnv.emailFrom),
  razorpay: Boolean(serverEnv.razorpayKeyId && serverEnv.razorpayKeySecret && serverEnv.razorpayWebhookSecret),
  serviceRole: Boolean(serverEnv.serviceRoleKey),
  orderTokens: Boolean(serverEnv.orderAccessSecret),
};

export function requireServerSecret(name: keyof typeof serverEnv): string {
  const value = serverEnv[name];
  if (!value) {
    throw new Error(`Server is missing required configuration: ${name}`);
  }
  return value;
}
