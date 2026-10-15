'use client';

import { deleteSubscriber, setCustomerBlocked } from '@/app/admin/(panel)/customers/actions';
import { ConfirmActionButton } from '@/components/admin/client-ui';

export function BlockCustomerButton({ id, blocked }: { id: string; blocked: boolean }) {
  return blocked ? (
    <ConfirmActionButton title="Unblock this customer?" description="They will be able to place orders again." confirmLabel="Unblock" action={() => setCustomerBlocked({ id, blocked: false })} success="Customer unblocked">
      Unblock
    </ConfirmActionButton>
  ) : (
    <ConfirmActionButton
      title="Block this customer?"
      description="Blocked customers can still sign in and see past orders, but cannot place new orders."
      reason={{ label: 'Reason (internal)', required: true, minLength: 5, placeholder: 'e.g. Repeated fraudulent payment proofs' }}
      confirmLabel="Block customer"
      danger
      variant="danger-outline"
      action={(reason) => setCustomerBlocked({ id, blocked: true, reason })}
      success="Customer blocked"
    >
      Block
    </ConfirmActionButton>
  );
}

export function DeleteSubscriberButton({ id, email }: { id: string; email: string }) {
  return (
    <ConfirmActionButton title={`Remove ${email}?`} description="Deletes the subscription record (use for erasure requests)." confirmLabel="Remove" danger variant="ghost" action={() => deleteSubscriber(id)} success="Subscriber removed">
      Remove
    </ConfirmActionButton>
  );
}
