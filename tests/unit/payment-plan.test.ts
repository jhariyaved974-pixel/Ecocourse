import { describe, expect, it } from 'vitest';
import { outstandingBalance, paymentDue, pendingVerification, type PaymentState } from '@/lib/orders/payment-plan';
import { buildUpiUri, upiReference } from '@/lib/payments/upi';
import { mapQuote } from '@/lib/orders/quote';

// ₹999.99 at 50%: advance ₹500, balance ₹499.99 (amounts as the database returns them).
const unpaidHalf: PaymentState = {
  paymentStatus: 'unpaid',
  orderStatus: 'pending_payment',
  expired: false,
  paymentPlan: 'half_prepaid',
  total: 99999,
  advanceAmount: 50000,
  amountPaid: 0,
  amountDue: 50000,
  duePurpose: 'advance',
};
const advancePaid: PaymentState = { ...unpaidHalf, paymentStatus: 'partially_paid', orderStatus: 'confirmed', amountPaid: 50000, amountDue: 49999, duePurpose: 'balance' };
const unpaidPrepaid: PaymentState = { ...unpaidHalf, paymentPlan: 'prepaid', advanceAmount: 99999, amountDue: 99999, duePurpose: 'full' };

describe('paymentDue', () => {
  it('asks for the advance (half prepaid) or the full amount (prepaid) while the order awaits payment', () => {
    expect(paymentDue(unpaidHalf)).toEqual({ purpose: 'advance', amount: 50000, late: false });
    expect(paymentDue(unpaidPrepaid)).toEqual({ purpose: 'full', amount: 99999, late: false });
    // After a resubmission request the same amount is due again.
    expect(paymentDue({ ...unpaidHalf, paymentStatus: 'rejected' })).toEqual({ purpose: 'advance', amount: 50000, late: false });
  });

  it('asks for the balance once the advance is verified, while confirmed or packed', () => {
    expect(paymentDue(advancePaid)).toEqual({ purpose: 'balance', amount: 49999, late: false });
    expect(paymentDue({ ...advancePaid, orderStatus: 'processing' })).toEqual({ purpose: 'balance', amount: 49999, late: false });
  });

  it('asks for nothing while a proof is under review, once fully paid, or after a cancellation', () => {
    expect(paymentDue({ ...unpaidHalf, paymentStatus: 'proof_submitted', orderStatus: 'payment_review' })).toBeNull();
    expect(paymentDue({ ...advancePaid, paymentStatus: 'proof_submitted' })).toBeNull();
    expect(paymentDue({ ...advancePaid, paymentStatus: 'verification_pending' })).toBeNull();
    expect(paymentDue({ ...advancePaid, paymentStatus: 'verified_paid', amountPaid: 99999, amountDue: 0, duePurpose: null })).toBeNull();
    expect(paymentDue({ ...advancePaid, orderStatus: 'cancelled', paymentStatus: 'refund_pending', amountDue: 0, duePurpose: null })).toBeNull();
    expect(paymentDue({ ...unpaidHalf, orderStatus: 'cancelled', amountDue: 0, duePurpose: null })).toBeNull();
  });

  it('lets a late payment for an expired order be reported for the advance only', () => {
    const expired = { ...unpaidHalf, orderStatus: 'cancelled' as const, expired: true, amountDue: 0, duePurpose: null };
    expect(paymentDue(expired)).toEqual({ purpose: 'advance', amount: 50000, late: true });
    expect(paymentDue({ ...unpaidPrepaid, orderStatus: 'cancelled', expired: true, amountDue: 0, duePurpose: null })).toEqual({ purpose: 'full', amount: 99999, late: true });
  });
});

describe('pendingVerification', () => {
  it('uses the proof purpose and expected amount from the database', () => {
    const latestProof = { purpose: 'balance' as const, expectedAmount: 49999 };
    expect(pendingVerification({ ...advancePaid, paymentStatus: 'proof_submitted', latestProof })).toEqual({ purpose: 'balance', amount: 49999 });
    expect(pendingVerification({ ...unpaidHalf, paymentStatus: 'verification_pending', latestProof: null })).toEqual({ purpose: 'advance', amount: 50000 });
    expect(pendingVerification({ ...advancePaid, latestProof })).toBeNull();
  });
});

describe('outstandingBalance', () => {
  it('is the balance until it is paid, and 0 for prepaid orders', () => {
    expect(outstandingBalance(unpaidHalf)).toBe(49999);
    expect(outstandingBalance(advancePaid)).toBe(49999);
    expect(outstandingBalance({ ...advancePaid, amountPaid: 99999 })).toBe(0);
    expect(outstandingBalance(unpaidPrepaid)).toBe(0);
  });
});

describe('balance UPI reference', () => {
  it('adds -BAL to the order number for the balance only', () => {
    expect(upiReference('STM-261016-7K2QD', 'balance')).toBe('STM-261016-7K2QD-BAL');
    expect(upiReference('STM-261016-7K2QD', 'advance')).toBe('STM-261016-7K2QD');
    expect(upiReference('STM-261016-7K2QD', 'full')).toBe('STM-261016-7K2QD');
  });

  it('builds a balance link for the exact balance with the -BAL note', () => {
    const uri = buildUpiUri({ payeeVpa: 'sadiajay4311@ybl', payeeName: 'Save The Money', amountPaise: 49999, orderNumber: upiReference('STM-261016-7K2QD', 'balance'), includeTransactionRef: true });
    const params = new URLSearchParams(uri.slice('upi://pay?'.length));
    expect(params.get('am')).toBe('499.99');
    expect(params.get('tn')).toBe('Order STM-261016-7K2QD-BAL');
    expect(params.get('tr')).toBe('STM-261016-7K2QD-BAL');
  });
});

describe('quote payment plan keys', () => {
  it('maps the half-prepaid amounts from compute_quote', () => {
    const q = mapQuote({ total: 99999, advance_percent: 50, half_prepaid_advance: 50000, half_prepaid_balance: 49999, half_prepaid_available: true });
    expect(q).toMatchObject({ total: 99999, advancePercent: 50, halfPrepaidAdvance: 50000, halfPrepaidBalance: 49999, halfPrepaidAvailable: true });
    expect(mapQuote({ total: 100, half_prepaid_advance: 100, half_prepaid_balance: 0, half_prepaid_available: false }).halfPrepaidAvailable).toBe(false);
    expect(mapQuote(null).halfPrepaidAvailable).toBe(false);
  });
});
