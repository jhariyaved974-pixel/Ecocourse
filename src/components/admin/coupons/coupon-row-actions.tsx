'use client';

import { deleteCoupon, setCouponActive } from '@/app/admin/(panel)/coupons/actions';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';

export function CouponRowActions({ id, code, active, used }: { id: string; code: string; active: boolean; used: number }) {
  const { run, pending } = useActionRunner();
  return (
    <>
      <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => setCouponActive(id, !active))}>
        {active ? 'Deactivate' : 'Activate'}
      </Button>
      {used === 0 ? (
        <ConfirmActionButton title={`Delete ${code}?`} description="The coupon has never been used, so it can be deleted permanently." confirmLabel="Delete" danger variant="ghost" action={() => deleteCoupon(id)} success="Coupon deleted">
          Delete
        </ConfirmActionButton>
      ) : null}
    </>
  );
}
