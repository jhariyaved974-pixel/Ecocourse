# Admin guide

The admin panel is at `/admin`. Staff sign in with a normal account; access comes only from
the `staff_members` table, which only owners/admins can change. Nothing in a sign-up request,
browser storage or URL can grant admin access.

## First owner (secure bootstrap)

There is no default administrator and no built-in password.

1. Create the account normally: sign up at `/signup` (and confirm the email) or create the user
   in Supabase → Authentication → Users.
2. Promote it with the service-role key, from a trusted machine:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret key> \
     node scripts/create-admin.mjs owner@yourdomain.in
   ```

   Equivalent SQL (Supabase SQL editor, which runs as a privileged role):

   ```sql
   select public.bootstrap_owner('owner@yourdomain.in');
   ```

   `bootstrap_owner` refuses to run once any owner exists, so it cannot be used to take over a
   running store.
3. Sign in at `/admin/login`, enrol TOTP when prompted, then in **Staff & security** turn on
   "Require MFA for staff".

## Roles

| Role | Can do |
| --- | --- |
| Owner | Everything, including managing other owners |
| Admin | Everything except granting/removing the owner role: payments verification, refunds, cancellations, coupons, settings, staff |
| Editor | Catalogue, inventory, media library, homepage and content |
| Support | Orders (view, fulfilment updates, notes), customers, reviews, customer requests |

Roles are enforced three times: the navigation hides what you cannot use, every page and
Server Action checks the role on the server, and the database (RLS policies + SQL functions)
rejects anything else. When MFA is required, a session without a verified second factor is
treated as not signed in.

## Adding staff

The person signs up first. Then **Settings → Staff & security → Add staff** with their email and
a role. Deactivate rather than delete when someone leaves; the last owner cannot be removed.

## Daily operations

- **UPI payments** (`/admin/payments`): verify each submitted payment against your bank/UPI
  records before approving — see the procedure in [PAYMENTS.md](PAYMENTS.md). Overdue reviews
  and late payments are highlighted.
- **Orders** (`/admin/orders`): move paid orders through processing → shipped (with tracking) →
  delivered; cancel (restocks automatically; paid orders become refund-pending); record refunds.
- **Inventory**: adjust stock with a reason; every change is recorded in the movement history.
  CSV import runs as a dry run first.
- **Products**: drafts are invisible to customers; publishing requires at least one image and one
  active variant. Use Preview to check a draft. Products with orders cannot be deleted — archive them.
- **Homepage & content**: edit the draft, preview it, then publish. Every publish creates a
  revision you can restore. Content is plain text/Markdown — HTML and scripts are not rendered.
- **Reviews**: new reviews are hidden until approved.
- **Customer requests**: data-export and account-deletion requests appear here.
- **Audit log**: who changed what and when (payments, settings, staff, catalogue, inventory).
