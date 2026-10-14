// Prints env lines with anon/service keys for the LOCAL stack only.
// Signed with the well-known Supabase CLI local secret; useless anywhere else.
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode('super-secret-jwt-token-with-at-least-32-characters-long');
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;

async function key(role) {
  return new SignJWT({ role, iss: 'supabase-local' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);
}

const anon = await key('anon');
const service = await key('service_role');
console.log(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`);
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${service}`);
