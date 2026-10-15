'use client';

import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { ConfirmActionButton } from '@/components/admin/client-ui';
import { deleteCollection } from '@/app/admin/(panel)/collections/actions';

export function DeleteCollectionButton({ id, name, productCount }: { id: string; name: string; productCount: number }) {
  const router = useRouter();
  return (
    <ConfirmActionButton
      title={`Delete “${name}”?`}
      description={`The collection page stops working${productCount ? ` and its ${productCount} product(s) are removed from it (the products themselves are kept)` : ''}. This cannot be undone.`}
      confirmLabel="Delete collection"
      danger
      variant="danger-outline"
      action={async () => {
        const res = await deleteCollection(id);
        if (res.ok) router.push('/admin/collections');
        return res;
      }}
    >
      <Trash2 /> Delete
    </ConfirmActionButton>
  );
}
