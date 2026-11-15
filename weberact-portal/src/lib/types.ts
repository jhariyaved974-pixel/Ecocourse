export type Role = 'admin' | 'manager' | 'client';

export interface Organization {
  id: string; name: string; legal_name: string | null; website: string | null; country: string | null; industry: string | null;
  tax_id: string | null; billing_address: string | null; currency: string; status: 'active' | 'inactive';
  gsc_site_url: string | null; ga4_property_id: string | null; notes: string | null; is_demo: boolean; created_at: string; updated_at: string;
}
export interface Profile {
  id: string; email: string; full_name: string | null; phone: string | null; avatar_url: string | null; role: Role;
  organization_id: string | null; is_active: boolean; email_notifications: boolean; created_at: string;
}
export interface ClientContact {
  id: string; organization_id: string; full_name: string; email: string; phone: string | null; job_title: string | null;
  is_primary: boolean; status: 'invited' | 'active' | 'inactive'; user_id: string | null; invited_at: string; created_at: string;
}
export interface TeamMember { id: string; full_name: string; email: string; title: string | null; role: 'admin' | 'manager'; user_id: string | null; is_active: boolean; created_at: string }
export interface Service { id: string; slug: string; name: string; description: string | null; is_active: boolean; sort: number }
export interface Project {
  id: string; organization_id: string; name: string; description: string | null; scope: string | null; deliverables: string[];
  manager_id: string | null; stage: number; status: 'active' | 'on_hold' | 'completed' | 'cancelled'; progress: number;
  start_date: string | null; due_date: string | null; completed_at: string | null; value: number | null; currency: string;
  is_demo: boolean; created_at: string; updated_at: string;
  organization?: Pick<Organization, 'id' | 'name'> | null; manager?: Pick<TeamMember, 'id' | 'full_name' | 'title' | 'email'> | null;
  project_services?: { service: Pick<Service, 'id' | 'name' | 'slug'> | null }[];
}
export interface ProjectStage { id: string; project_id: string; position: number; name: string; status: 'pending' | 'in_progress' | 'done'; notes: string | null; started_at: string | null; completed_at: string | null }
export interface Onboarding {
  id: string; organization_id: string; project_id: string | null; status: 'draft' | 'submitted' | 'in_review' | 'approved'; current_step: number;
  data: OnboardingData; submitted_at: string | null; reviewed_at: string | null; admin_notes: string | null; created_at: string; updated_at: string;
  organization?: Pick<Organization, 'id' | 'name'> | null;
}
export interface OnboardingAsset { id: string; name: string; category: string; size?: number; path?: string }
export interface OnboardingData {
  personal?: { full_name?: string; company?: string; email?: string; phone?: string; country?: string; website?: string };
  services?: { selected?: string[]; custom?: string };
  brief?: { business?: string; objectives?: string; audience?: string; competitors?: string; features?: string; references?: string; special?: string };
  assets?: { files?: OnboardingAsset[]; notes?: string };
  confirm?: { agreed?: boolean };
}
export interface Contract {
  id: string; organization_id: string; project_id: string | null; title: string; scope: string | null; payment_terms: string | null;
  start_date: string | null; end_date: string | null; value: number | null; currency: string;
  status: 'draft' | 'sent' | 'accepted' | 'expired' | 'void'; file_path: string | null; file_name: string | null; file_sha256: string | null;
  sent_at: string | null; accepted_at: string | null; accepted_by: string | null; accepted_name: string | null; accepted_email: string | null;
  accepted_ip: string | null; accepted_user_agent: string | null; accepted_document_sha256: string | null; created_at: string; updated_at: string;
  organization?: Pick<Organization, 'id' | 'name' | 'legal_name' | 'billing_address' | 'country'> | null; project?: Pick<Project, 'id' | 'name'> | null;
}
export type PaymentStatus = 'draft' | 'void' | 'paid' | 'overdue' | 'partially_paid' | 'pending';
export interface Invoice {
  id: string; number: string | null; organization_id: string; project_id: string | null; status: 'draft' | 'issued' | 'void';
  issue_date: string; due_date: string; currency: string; notes: string | null; subtotal: number; tax_total: number; total: number;
  amount_paid: number; balance: number; payment_status: PaymentStatus; organization_name: string; issued_at: string | null; created_at: string;
}
export interface InvoiceItem { id: string; invoice_id: string; position: number; description: string; quantity: number; unit_price: number; tax_rate: number; amount: number }
export interface Payment {
  id: string; invoice_id: string; organization_id: string; amount: number; paid_at: string; method: string; reference: string | null;
  provider: string | null; notes: string | null; created_at: string; invoice?: { number: string | null; currency: string } | null;
  organization?: Pick<Organization, 'id' | 'name'> | null;
}
export interface ProjectFile {
  id: string; organization_id: string; project_id: string | null; folder: string; kind: 'deliverable' | 'document' | 'client_upload' | 'contract';
  name: string; description: string | null; storage_path: string; size_bytes: number | null; mime_type: string | null; uploaded_by: string | null; created_at: string;
  project?: Pick<Project, 'id' | 'name'> | null; organization?: Pick<Organization, 'id' | 'name'> | null;
}
export interface Conversation { id: string; organization_id: string; project_id: string | null; subject: string; created_at: string; last_message_at: string; organization?: Pick<Organization, 'id' | 'name'> | null; project?: Pick<Project, 'id' | 'name'> | null }
export interface Attachment { path: string; name: string; size?: number; type?: string }
export interface Message { id: string; conversation_id: string; organization_id: string; sender_id: string | null; body: string; attachments: Attachment[]; created_at: string }
export interface Notification { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export interface Activity { id: string; organization_id: string | null; project_id: string | null; actor_id: string | null; action: string; summary: string; visibility: string; created_at: string; organization?: Pick<Organization, 'id' | 'name'> | null }
export interface SupportRequest {
  id: string; organization_id: string; project_id: string | null; type: 'revision' | 'support' | 'feedback' | 'question'; title: string; details: string | null;
  rating: number | null; priority: 'low' | 'normal' | 'high'; status: 'open' | 'in_progress' | 'resolved' | 'closed'; assigned_to: string | null;
  resolution: string | null; created_by: string | null; resolved_at: string | null; created_at: string;
  organization?: Pick<Organization, 'id' | 'name'> | null; project?: Pick<Project, 'id' | 'name'> | null;
}
export interface Announcement { id: string; organization_id: string | null; title: string; body: string; created_at: string; organization?: Pick<Organization, 'id' | 'name'> | null }
export interface Keyword { keyword: string; position: number | null; previous?: number | null; url?: string; volume?: number | null }
export interface SeoIssue { title: string; severity: 'high' | 'medium' | 'low'; status: 'open' | 'fixed' }
export interface SeoReport {
  id: string; organization_id: string; project_id: string | null; period: string; clicks: number | null; impressions: number | null; ctr: number | null;
  avg_position: number | null; organic_sessions: number | null; indexed_pages: number | null; health_score: number | null; backlinks: number | null;
  referring_domains: number | null; keywords: Keyword[]; issues: SeoIssue[]; summary: string | null; source: string; status: 'draft' | 'published'; updated_at: string;
}
export interface PerfSnapshot {
  id: string; organization_id: string; url: string; strategy: 'mobile' | 'desktop'; performance: number | null; accessibility: number | null;
  best_practices: number | null; seo: number | null; lcp_ms: number | null; fcp_ms: number | null; tbt_ms: number | null; cls: number | null; inp_ms: number | null;
  field_data: boolean; fetched_at: string;
}
export interface PortalSettings {
  agency_name: string; legal_name: string | null; address: string | null; email: string | null; phone: string | null; website: string | null;
  tax_id: string | null; pan: string | null; invoice_prefix: string; default_currency: string; default_tax_rate: number; payment_terms_days: number;
  payment_instructions: string | null; invoice_footer: string | null;
}
