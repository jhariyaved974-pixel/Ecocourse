import { describe, expect, it } from 'vitest';
import { sniffFileType } from '@/lib/uploads/sniff';
import { deriveOrderAccessToken, deriveOrderId, sha256 } from '@/lib/tokens';
import { safeNextPath } from '@/lib/redirects';

const pad = (bytes: number[]) => new Uint8Array([...bytes, ...new Array(16).fill(0)]);
const text = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

describe('file type sniffing', () => {
  it('recognises allowed formats by magic bytes', () => {
    expect(sniffFileType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffFileType(pad([0x89, ...text('PNG'), 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffFileType(pad([...text('RIFF'), 0, 0, 0, 0, ...text('WEBP')]))).toBe('webp');
    expect(sniffFileType(pad(text('%PDF-1.7')))).toBe('pdf');
    expect(sniffFileType(pad(text('glTF')))).toBe('glb');
  });

  it('rejects disguised or unknown content', () => {
    expect(sniffFileType(pad(text('<html><script>')))).toBeNull();
    expect(sniffFileType(pad(text('MZ')))).toBeNull(); // Windows executable
    expect(sniffFileType(new Uint8Array([0xff, 0xd8]))).toBeNull(); // too short
  });
});

describe('order tokens', () => {
  const secret = 'test-secret-that-is-long-enough-1234567890';

  it('derives a stable, secret-dependent access token', () => {
    const id = '4b69202b-8b20-4fb3-90f2-9dc8c067c55b';
    expect(deriveOrderAccessToken(secret, id)).toBe(deriveOrderAccessToken(secret, id));
    expect(deriveOrderAccessToken(secret, id)).not.toBe(deriveOrderAccessToken(`${secret}x`, id));
    expect(deriveOrderAccessToken(secret, id)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256(deriveOrderAccessToken(secret, id))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps a retried checkout to the same order id', () => {
    const key = 'f0d1c5c6-5a7b-4a40-9d0e-1f2a3b4c5d6e';
    const a = deriveOrderId(secret, key);
    expect(a).toBe(deriveOrderId(secret, key));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deriveOrderId(secret, 'another-key')).not.toBe(a);
  });

  it('refuses to work without a secret', () => {
    expect(() => deriveOrderAccessToken('', 'x')).toThrow();
    expect(() => deriveOrderId('', 'x')).toThrow();
  });
});

describe('post-login redirects', () => {
  it('allows only same-site relative paths', () => {
    expect(safeNextPath('/account/orders')).toBe('/account/orders');
    expect(safeNextPath('https://evil.example')).toBe('/account');
    expect(safeNextPath('//evil.example')).toBe('/account');
    expect(safeNextPath('/\\evil.example')).toBe('/account');
    expect(safeNextPath(undefined)).toBe('/account');
  });
});
