# Payments

## Manual UPI (default)

Merchant UPI ID: **`sadiajay4311@ybl`** (INR). Change it any time in **Admin → Payment
settings**; nothing in the code hard-codes the ID or any amount.

### Customer flow

1. Checkout places the order. Prices, discounts, shipping and tax are computed in the database
   and the stock is **reserved** for the configured window (default 60 minutes). Re-submitting
   the same checkout returns the same order (idempotency key), so double clicks never create
   duplicates.
2. The order page shows the exact amount, the UPI ID with copy buttons, a QR code and an
   "Open UPI app" deep link. Both encode `pa` (UPI ID), `pn` (payee name), `am` (exact amount,
   two decimals), `cu=INR` and `tn` (order number); `tr` is optional (some personal UPI IDs
   reject it).
3. After paying, the customer uploads the screenshot/receipt (JPG/PNG/WebP/PDF ≤ 4 MB) and
   enters the UTR/UPI reference, payment time and optionally their UPI ID. The page explains
   that **opening the app or uploading a screenshot does not complete the payment** — only staff
   verification against bank records confirms the order.
4. The order shows **Awaiting Payment Verification** until staff decide.

The store never asks for UPI PIN, OTP, card numbers or bank passwords, and stores no card data.

### Proof handling

- Validated by content (magic bytes), not by file name or browser MIME type. Images are decoded
  and re-encoded (metadata such as GPS is dropped); PDFs with active content are refused.
- Stored in the **private** `payment-proofs` bucket under `orders/<order-id>/<random>.<ext>`.
  Only owners/admins can read them, through short-lived signed URLs in the admin panel.
- Upload attempts are rate limited, require the order's access cookie or the owning account,
  and orphaned files are deleted if the submission fails.

### Staff verification procedure (Admin → UPI payments)

1. Open the order. Read the review instructions at the top.
2. Open your **bank statement or UPI merchant app** (not the customer's screenshot) and find a
   credit of **exactly** the order total, with the UTR the customer entered and a matching time.
3. Approve with **Verify & mark paid**: tick the confirmation that you saw the credit in your
   own records, enter the verified amount and the UTR you matched. The database refuses the
   approval if the box is not ticked, the amount differs from the order total, the reference is
   missing, or the UTR already confirmed another order.
4. If you cannot find the money, choose **Request new screenshot/UTR** (the customer gets a new
   window to resubmit, stock stays reserved) or **Reject** (order is cancelled, stock released).
   The reason you type is shown to the customer.
5. Approval is idempotent: approving twice never deducts stock twice. Every decision is recorded
   in the order history and the audit log.

### Statuses

Payment status: `unpaid` → `proof_submitted` → (`verification_pending`) → `verified_paid`,
or `rejected`; after a cancellation of a paid order: `refund_pending` → `refunded`.

Order status: `pending_payment` → `payment_review` → `confirmed` → `processing` → `shipped` →
`delivered`, or `cancelled`. Fulfilment states are impossible in the database without a verified
payment.

### Edge cases

- **Reservation expired before payment.** A job (pg_cron or `/api/cron/expire-orders`) cancels
  the order as *expired* and releases the stock. If the customer still pays and submits proof,
  the order returns to review **flagged as a late payment**. Approving re-deducts stock only if
  it is still available; otherwise use *Record payment & refund* and refund the customer.
- **Review deadline passed.** Overdue reviews are flagged for attention; their stock is never
  released automatically.
- **Same UTR on two orders.** The second submission is flagged; a UTR can confirm only one order.
- **Different amount paid.** Partial or different amounts cannot be approved. Contact the
  customer; refund or ask them to pay the difference as a new payment and handle it manually.
- **Refunds.** Cancelling a paid order sets `refund_pending`; send the money back from your bank
  or UPI app, then record the refund (amount + reference) on the order.

## Razorpay (optional)

Disabled until `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are set
**and** it is enabled in Payment settings. The flow:

1. The server creates a Razorpay order for the exact order total (paise) and records it.
2. Razorpay Checkout collects the payment (card data never touches this server).
3. The browser's success callback is only a hint: the server verifies the signature and fetches
   the payment from Razorpay; the signed webhook (`/api/webhooks/razorpay`) is authoritative.
   Both paths are idempotent (each provider event is processed once) and check the amount.

Test with Razorpay **test mode** keys and a test webhook before switching to live keys.
