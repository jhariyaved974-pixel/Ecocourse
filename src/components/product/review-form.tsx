'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { Star } from 'lucide-react';
import { submitReview } from '@/app/(store)/products/[slug]/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form-controls';
import { cn } from '@/lib/utils';

export function ReviewForm({ productId, productName }: { productId: string; productName: string }) {
  const [state, action, pending] = useActionState(submitReview, null);
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Write a review</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review {productName}</DialogTitle>
          <DialogDescription>Reviews are checked by our team before they appear. Purchases are marked as verified automatically.</DialogDescription>
        </DialogHeader>
        {state?.ok ? (
          <div className="space-y-4">
            <p className="text-sm text-success" role="status">{state.message}</p>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="rating" value={rating} />
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Your rating</legend>
              <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} type="button" onClick={() => setRating(i)} onMouseEnter={() => setHover(i)} aria-label={`${i} star${i > 1 ? 's' : ''}`} aria-pressed={rating === i}>
                    <Star className={cn('size-7 transition-colors', i <= (hover || rating) ? 'fill-ink text-ink' : 'text-line-strong')} />
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="Name shown with your review" htmlFor="authorName" required>
              <Input id="authorName" name="authorName" maxLength={60} required autoComplete="given-name" />
            </Field>
            <Field label="Title" htmlFor="title">
              <Input id="title" name="title" maxLength={120} />
            </Field>
            <Field label="Your review" htmlFor="body" required hint="Fit, comfort, quality — what should others know?">
              <Textarea id="body" name="body" minLength={10} maxLength={2000} required rows={5} />
            </Field>
            {state && !state.ok ? (
              <p className="text-sm text-danger" role="alert">
                {state.error}{' '}
                {state.code === 'auth_required' ? <Link href="/login" className="underline">Sign in</Link> : null}
              </p>
            ) : null}
            <Button type="submit" loading={pending} className="w-full">Submit review</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
