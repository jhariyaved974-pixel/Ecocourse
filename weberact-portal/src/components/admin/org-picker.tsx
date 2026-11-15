'use client';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/primitives';
export function OrgPicker({ orgs, value, base }: { orgs: { id: string; name: string }[]; value: string; base: string }) {
  const router = useRouter();
  return <Select value={value} onChange={e => router.push(`${base}?org=${e.target.value}`)} className="w-64" aria-label="Client">{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>;
}
