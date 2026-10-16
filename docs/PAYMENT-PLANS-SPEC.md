# Payment plans spec: Prepaid and Half prepaid

Working spec (remove once merged). There is **no cash on delivery**. Every order is paid
online before it ships, using one of two **payment plans**:

| Plan | Shopper pays | When |
| --- | --- | --- |
| **Prepaid** (`prepaid`) | 100% of the order total | At checkout (unchanged from today's flow) |
| **Half prepaid** (`half_prepaid`) | An **advance** of `advance_percent`% (default 50%) | At checkout, to confirm the order |
|  | The **balance** (total − advance) | Online, after the order is confirmed and **before it is dispatched** |

Both plans work with both payment methods: manual UPI (QR/deep link + proof + staff
verification against bank records) and Razorpay (when configured). Half prepaid is offered on
every order (no limits). The plan and method are chosen at checkout.

## Settings
`payment_settings`:
- `advance_percent integer not null default 50 check (advance_percent between 10 and 90)`
- `balance_due_days integer not null default 7 check (balance_due_days between 1 and 30)` —
  after the advance is verified, the balance is due within this many days. Overdue balances
  are flagged for staff (never auto-cancelled, because money was received).

## Amounts (all in paise, computed only in the database)
- Prepaid: `advance_amount = total`.
- Half prepaid: `advance_amount = least(total, ceil(total * advance_percent / 100 / 100.0) * 100)`
  (rounded **up to a whole rupee**), `balance = total − advance_amount`. A half-prepaid order
  whose balance would be 0 is stored as prepaid.
- `orders.amount_paid` — verified money received (advance, then balance). Refunds never exceed it.
- **Amount due now** (`amount_due`) and its **purpose**:
  - nothing verified yet → `advance_amount`; purpose `full` (prepaid) or `advance` (half prepaid)
  - advance verified, balance outstanding → `total − amount_paid`; purpose `balance`
  - fully paid / cancelled → 0

## Statuses
- New payment status **`partially_paid`** ("Advance received — balance due").
- Advance (half prepaid) follows exactly today's prepaid flow (reservation window, proof,
  review, expiry), except the expected amount is the advance. On verification: stock is
  consumed exactly once, `order_status = confirmed`, `payment_status = partially_paid`,
  `amount_paid = advance_amount`, `balance_due_at = now() + balance_due_days`.
- Balance: the shopper pays from the order page (UPI QR/deep link for the balance amount with
  reference `<order number>-BAL`, or Razorpay) and submits proof → `payment_status
  proof_submitted` → staff start review → `verification_pending` → approve →
  `verified_paid`, `amount_paid = total`. **`order_status` does not change** during balance
  payment (it stays confirmed/processing). Rejecting a balance proof returns the order to
  `partially_paid` (advance remains valid) with the reason shown to the shopper.
- Fulfilment guard: `processing` is allowed once the advance is verified; **`shipped` and
  `delivered` require `payment_status = verified_paid`** (enforced in SQL).
- Cancelling a partially paid order puts `amount_paid` into a pending refund and restocks.

## Records
- `orders.payment_plan public.payment_plan not null default 'prepaid'`, `orders.advance_amount`,
  `orders.amount_paid`, `orders.balance_due_at`.
- `payment_proofs.purpose text not null default 'full' check (purpose in ('full','advance','balance'))`
  and `payment_proofs.expected_amount integer`.
- `payment_transactions.purpose` (same values). A Razorpay order is created for the amount due
  at that moment; a captured payment is applied only if it equals that amount.
- Approval always checks that the staff-entered verified amount equals the proof's expected
  amount (bank records), and remains idempotent.

## Emails (queued by SQL; templates in `src/lib/email/templates.ts`)
- `order_placed` payload adds `payment_plan`, `amount_due`, `balance_amount`.
- `advance_received` — advance verified; order confirmed; balance amount and due date; link to pay.
- `balance_received` — balance verified; order will be dispatched.
- `balance_reminder` — once, when a balance becomes overdue.
- Existing `order_confirmed` is used for prepaid orders.

## Shopper-facing copy
- Checkout: "Prepaid — pay ₹X now" and "Half prepaid — pay ₹Y now (50%), ₹Z before dispatch".
  The totals panel shows "Due now". Never imply cash on delivery.
- Order page: plan, paid so far, balance due and due date; a "Pay balance" panel when the
  balance is due.
- Admin: plan, advance/balance/paid on orders and in the payments queue (proof purpose and
  expected amount); payment settings show the advance percentage and balance due days.
