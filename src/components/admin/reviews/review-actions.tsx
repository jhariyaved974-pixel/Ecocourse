'use client';

import { Check, Star, Trash2, X } from 'lucide-react';
import { deleteReview, moderateReview } from '@/app/admin/(panel)/reviews/actions';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';

export function ReviewActions({ id, status, featured }: { id: string; status: string; featured: boolean }) {
  const { run, pending } = useActionRunner();
  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== 'approved' ? (
        <Button size="sm" loading={pending} onClick={() => run(() => moderateReview({ id, action: 'approve' }))}>
          <Check /> Approve
        </Button>
      ) : (
        <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => moderateReview({ id, action: featured ? 'unfeature' : 'feature' }))}>
          <Star className={featured ? 'fill-current' : undefined} /> {featured ? 'Unfeature' : 'Feature'}
        </Button>
      )}
      {status !== 'rejected' ? (
        <ConfirmActionButton
          title="Reject this review?"
          description="It stays hidden from the store. The customer can edit it, which sends it back to moderation."
          reason={{ label: 'Internal note (optional)', placeholder: 'e.g. Contains personal data' }}
          confirmLabel="Reject"
          action={(note) => moderateReview({ id, action: 'reject', note })}
          success="Review rejected"
        >
          <X /> Reject
        </ConfirmActionButton>
      ) : null}
      <ConfirmActionButton title="Delete this review permanently?" confirmLabel="Delete" danger variant="ghost" action={() => deleteReview(id)} success="Review deleted">
        <Trash2 /> Delete
      </ConfirmActionButton>
    </div>
  );
}
