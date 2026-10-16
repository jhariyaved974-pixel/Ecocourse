-- -----------------------------------------------------------------------------
-- Payment plans, part 1 of 2: enum changes (docs/PAYMENTS.md, "Payment plans").
--
-- A value added with ALTER TYPE ... ADD VALUE cannot be used by later statements
-- in the same transaction, and migrations run one file per transaction, so the
-- new payment status is committed here before 20261016100100_payment_plans.sql
-- uses it in constraints, indexes and functions.
-- -----------------------------------------------------------------------------

-- "Advance received — balance due": the advance of a half-prepaid order was
-- verified (order confirmed, stock consumed); the balance is still outstanding.
alter type public.payment_status add value if not exists 'partially_paid' before 'verified_paid';

-- How the shopper pays: everything at checkout, or an advance at checkout and
-- the balance online before dispatch. There is no cash on delivery.
create type public.payment_plan as enum ('prepaid', 'half_prepaid');
comment on type public.payment_plan is
  'prepaid = 100% at checkout; half_prepaid = advance (payment_settings.advance_percent) at checkout, balance online before dispatch.';
