import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthFrame } from '@/components/auth/auth-frame';
import { LoginForm } from '@/components/auth/login-form';
import { SITE_URL, supabaseConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Sign in' };
export default function LoginPage() {
  return (
    <AuthFrame title="Welcome back" description="Sign in to your WeberAct portal.">
      {supabaseConfigured ? <Suspense><LoginForm siteUrl={SITE_URL} /></Suspense> : (
        <div className="card p-5 text-[14px] leading-relaxed text-fg-muted">
          <p className="font-medium text-fg">The portal is not connected to its database yet.</p>
          <p className="mt-2">Set <code className="text-coral-400">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="text-coral-400">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, then redeploy. See README.md.</p>
        </div>
      )}
    </AuthFrame>
  );
}
