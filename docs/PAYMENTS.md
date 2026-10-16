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
   credit of **exactly** the expected amount shown on the proof (the order total for prepaid
   orders; the advance or the balance for half-prepaid orders, see *Payment plans* below), with
   the UTR the customer entered and a matching time.
3. Approve with **Verify & mark paid**: tick the confirmation that you saw the credit in your
   own records, enter the verified amount and the UTR you matched. The database refuses the
   approval if the box is not ticked, the amount differs from the proof's expected amount, the reference is
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

## Payment plans (Prepaid / Half prepaid)

There is **no cash on delivery**. Every order is paid online before it ships, with one of two
plans chosen at checkout. Both plans work with manual UPI and with Razorpay.

| Plan | Paid at checkout | Paid later |
| --- | --- | --- |
| **Prepaid** (`prepaid`) | 100% of the total | — (the flow described above, unchanged) |
| **Half prepaid** (`half_prepaid`) | The **advance**: *Advance %* of the total, rounded **up** to a whole rupee | The **balance** (total − advance), online, after the order is confirmed and **before dispatch** |

Example: a ₹999.99 order at 50% → advance ₹500.00, balance ₹499.99. Amounts are always
computed by the database; the shopper cannot change them. A half-prepaid order whose balance
would be ₹0 is stored as prepaid.

**Settings (Admin → Payment settings):** *Advance %* (10–90, default 50) and *Balance due within*
(1–30 days, default 7). Changing them affects new orders only; every order keeps the percentage it
was placed with.

### What the shopper sees
- Checkout offers "Prepaid — pay the full amount now" and "Half prepaid — pay the advance now,
  the balance before dispatch". The totals show **Due now**.
- After the advance is verified the order page shows the plan, **paid so far**, the **balance due**
  and its **due date**, with a "Pay balance" panel (UPI QR/deep link for the balance amount with
  the note `<order number>-BAL`, or Razorpay for Razorpay orders).

### Verifying the advance (manual UPI)
Exactly like a prepaid payment, except the amount you look for is the **advance**. The proof shows
its purpose (**Advance**) and the **expected amount**. Find a credit of exactly that amount in your
own bank statement or UPI merchant app with the customer's UTR, then *Verify & mark paid* entering
that amount. The database refuses any other amount (no partial or different payments).

On approval: stock is deducted **once**, the order becomes **Confirmed**, the payment status
becomes **Advance received — balance due** (`partially_paid`), *paid so far* = the advance, and the
balance due date is set (today + *Balance due within*). The customer gets an "advance received"
email with the balance amount, due date and a link to pay. Unpaid advances expire with the
reservation window exactly like prepaid orders (and late advances are handled the same way).

### Verifying the balance (manual UPI)
1. The customer pays the balance and uploads a proof from the order page. The proof's purpose is
   **Balance** and its expected amount is the outstanding balance. The payment status moves to
   *Proof submitted* / *Verification pending*; the **order status does not change** (it stays
   Confirmed or Processing, so packing can continue).
2. Match a **separate** credit of exactly the balance in your bank records. The balance UTR must
   differ from the advance UTR (the database refuses to reuse it).
3. *Verify & mark paid* with the balance amount. The order becomes **Verified & paid**, *paid so
   far* = the total, and the customer gets a "balance received" email.
4. If you cannot find the money, *Request new screenshot/UTR* or *Reject*: the order returns to
   **Advance received — balance due**; the advance stays valid, nothing is cancelled and no stock
   moves. The reason is shown to the customer.

Approving twice (double click, two tabs) never deducts stock or counts money twice.

### What blocks dispatch
- **Packed / Processing** is allowed as soon as the advance is verified.
- **Shipped** and **Delivered** require the payment status **Verified & paid** — the database
  refuses them while any balance is outstanding or under review. Collect the balance first.

### Overdue balances
When the due date passes without a verified balance, the order is flagged **Balance payment
overdue.** (Needs attention) and the customer gets **one** reminder email. Overdue orders are
**never cancelled automatically**, because money was received. Contact the customer; once you have
dealt with it you may clear the flag (it is not raised again for that order). The balance can still
be paid and verified at any time. If the order will not go ahead, cancel it (below).

### Cancellations and refunds
- Cancelling a half-prepaid order refunds **everything received** (`amount_paid`: the advance, or
  advance + balance) as one **pending refund**, and puts the deducted stock back. Send the money
  back from your bank/UPI app (or the Razorpay dashboard), then record the refund on the order.
- Refunds can never exceed the money actually received (*paid so far*).
- *Record payment & refund* also works for a balance that arrives for an order you cannot fulfil:
  it records the balance, cancels the order (restocking) and queues a refund of everything received.

### Razorpay
A Razorpay order is always created for the **amount due at that moment**: the advance (or the
total for prepaid) while unpaid, the balance once the advance is verified. A captured payment is
applied only if it equals that amount; any other amount is flagged for attention and not applied.
Duplicate provider events are ignored. A second, different payment for something already paid is
never counted and is flagged so you can refund it in the Razorpay dashboard. An advance captured
after the order expired and its stock was sold, or a balance captured after you cancelled the
order, becomes a pending refund.

### Reports
Dashboard revenue counts **money received** (`amount_paid`), not order value: an advance counts
when it is verified and the balance when it is verified. *Balance outstanding* shows money still to
collect on confirmed half-prepaid orders.

## Razorpay (optional)

Disabled until `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are set
**and** it is enabled in Payment settings. The flow:

1. The server creates a Razorpay order for the exact order total (paise) and records it.
2. Razorpay Checkout collects the payment (card data never touches this server).
3. The browser's success callback is only a hint: the server verifies the signature and fetches
   the payment from Razorpay; the signed webhook (`/api/webhooks/razorpay`) is authoritative.
   Both paths are idempotent (each provider event is processed once) and check the amount.
4. A payment captured after the order already expired (stock released) is not silently
   accepted: the order is flagged for attention with a pending refund.
5. Refunds for Razorpay payments are issued in the Razorpay dashboard and then recorded on the
   order in Admin → Orders (the app does not call the refund API itself).

The shopper pays from the order page ("Pay online"), which opens Razorpay Checkout on demand.

Test with Razorpay **test mode** keys and a test webhook before switching to live keys.
