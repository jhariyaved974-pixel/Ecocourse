'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteProduct, setProductStatus } from '@/app/admin/(panel)/products/actions';
import type { ProductStatus } from '@/lib/admin/products';

/**
 * Confirms a permanent delete. Products that appear in orders cannot be
 * deleted (the database refuses with hint `has_orders`); in that case the
 * dialog offers archiving instead.
 */
export function DeleteProductDialog({
  product,
  onOpenChange,
  redirectTo,
}: {
  product: { id: string; name: string; status: ProductStatus } | null;
  onOpenChange: (open: boolean) => void;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [blocked, setBlocked] = React.useState<{ id: string; message: string; code?: string } | null>(null);
  const blockedMessage = blocked && product && blocked.id === product.id ? blocked : null;

  const close = (open: boolean) => {
    if (!open) setBlocked(null);
    onOpenChange(open);
  };

  const remove = () =>
    startTransition(async () => {
      if (!product) return;
      const res = await deleteProduct(product.id);
      if (res.ok) {
        toast.success(res.message ?? 'Deleted');
        close(false);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
        return;
      }
      if (res.code === 'has_orders' || res.code === 'has_reservations') {
        setBlocked({ id: product.id, message: res.error, code: res.code });
      } else {
        toast.error(res.error);
      }
    });

  const archive = () =>
    startTransition(async () => {
      if (!product) return;
      const res = await setProductStatus(product.id, 'archived');
      if (res.ok) {
        toast.success(`“${product.name}” was archived`);
        close(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });

  return (
    <Dialog open={product !== null} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{product?.name}”?</DialogTitle>
          <DialogDescription>
            This permanently removes the product with its colours, sizes, stock history and media links. Media files stay in the library.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {blockedMessage ? (
          <Notice tone="warning" title="This product cannot be deleted">
            {blockedMessage.message}
            {blockedMessage.code === 'has_orders' && product?.status !== 'archived'
              ? ' Archiving hides it from the store and keeps every order intact.'
              : null}
          </Notice>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          {blockedMessage?.code === 'has_orders' && product?.status !== 'archived' ? (
            <Button loading={pending} onClick={archive}>
              Archive instead
            </Button>
          ) : (
            <Button variant="danger" loading={pending} disabled={Boolean(blockedMessage)} onClick={remove}>
              Delete permanently
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
