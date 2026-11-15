export const STAGES = [
  { n: 1, name: 'Discovery', text: 'Understanding the business, buyers and the one result.' },
  { n: 2, name: 'Strategy', text: 'Scope, structure, messaging and the plan agreed in writing.' },
  { n: 3, name: 'Design', text: 'Visual direction and layouts on real content.' },
  { n: 4, name: 'Development', text: 'Build, integrations and automations on a staging link.' },
  { n: 5, name: 'Review', text: 'Your review of the complete build.' },
  { n: 6, name: 'Revisions', text: 'Agreed changes from the review.' },
  { n: 7, name: 'Final Delivery', text: 'Launch, handover and training.' },
  { n: 8, name: 'Completed', text: 'Delivered and accepted.' },
] as const;
export const stageName = (n: number) => STAGES[Math.min(Math.max(n, 1), 8) - 1]!.name;
export const stageLabel = (n: number) => `${String(n).padStart(2, '0')} — ${stageName(n)}`;

export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'CAD', 'AUD'] as const;
export const COUNTRIES = ['India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Canada', 'Australia', 'Germany', 'Singapore', 'Saudi Arabia', 'Other'] as const;

export type Tone = 'neutral' | 'coral' | 'ok' | 'warn' | 'bad' | 'info';
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  // projects
  active: { label: 'Active', tone: 'coral' }, on_hold: { label: 'On hold', tone: 'warn' }, completed: { label: 'Completed', tone: 'ok' }, cancelled: { label: 'Cancelled', tone: 'neutral' },
  // organizations and people
  inactive: { label: 'Inactive', tone: 'neutral' }, invited: { label: 'Invited', tone: 'info' },
  // invoices
  draft: { label: 'Draft', tone: 'neutral' }, issued: { label: 'Issued', tone: 'info' }, void: { label: 'Void', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'ok' }, pending: { label: 'Pending', tone: 'warn' }, overdue: { label: 'Overdue', tone: 'bad' }, partially_paid: { label: 'Partially paid', tone: 'info' },
  // contracts
  sent: { label: 'Awaiting acceptance', tone: 'warn' }, accepted: { label: 'Accepted', tone: 'ok' }, expired: { label: 'Expired', tone: 'neutral' },
  // onboarding
  submitted: { label: 'Submitted', tone: 'info' }, in_review: { label: 'In review', tone: 'warn' }, approved: { label: 'Approved', tone: 'ok' },
  // requests
  open: { label: 'Open', tone: 'coral' }, in_progress: { label: 'In progress', tone: 'info' }, resolved: { label: 'Resolved', tone: 'ok' }, closed: { label: 'Closed', tone: 'neutral' },
  // seo
  published: { label: 'Published', tone: 'ok' },
};

export const REQUEST_TYPES = [
  { value: 'revision', label: 'Revision request' },
  { value: 'support', label: 'Support' },
  { value: 'question', label: 'Question' },
  { value: 'feedback', label: 'Feedback' },
] as const;

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' },
  { value: 'razorpay', label: 'Razorpay' }, { value: 'stripe', label: 'Stripe' }, { value: 'cash', label: 'Cash' }, { value: 'other', label: 'Other' },
] as const;

export const FILE_KINDS = [
  { value: 'deliverable', label: 'Deliverable' }, { value: 'document', label: 'Document' },
  { value: 'contract', label: 'Contract' }, { value: 'client_upload', label: 'Client upload' },
] as const;

export const ONBOARDING_SERVICES = [
  { value: 'website', label: 'Website Development', text: 'A premium website or web system' },
  { value: 'seo', label: 'SEO', text: 'Technical and on-page search optimisation' },
  { value: 'aeo', label: 'AEO', text: 'Visibility in AI answers and answer engines' },
  { value: 'automation', label: 'AI Automation', text: 'Workflows, CRM and AI-assisted operations' },
  { value: 'custom', label: 'Custom Services', text: 'Something else: tell us in the brief' },
] as const;
