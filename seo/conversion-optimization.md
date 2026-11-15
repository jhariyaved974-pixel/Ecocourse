# Conversion optimisation

Traffic only matters if the right buyers send enquiries. This is what the site does now, and what to
add next.

## Implemented

| Element | Where | Detail |
| --- | --- | --- |
| Enquiry form with qualification questions | /proposal.html | Five short steps: services needed (now including **B2B lead generation**), business type and city, the result wanted, budget (USD or INR) and timing, contact preference (WhatsApp, call or email). Saves progress in the visitor's browser. Honeypot spam trap. |
| Service pre-selection | Every service CTA | Buttons link to `proposal.html#websites`, `#search`, `#automations`, `#leadgen`, which tick the right service |
| Clear positioning and next steps | Service pages | Direct answer, who it is for, what is included, process, cost factors, FAQs; "What happens next" on the proposal page |
| Trust | Service pages, About | Written scope, fixed fee, launch date, ownership in the client's name, no ranking guarantees, reply within one working day; official sources for legal claims |
| WhatsApp, email and booking links | Footer on every page | Appear automatically once real details are entered in the admin panel (Contact details → WhatsApp, Email, Booking link). WhatsApp opens `wa.me/<number>`. |
| Consultation booking | Footer, "Book a call" | Paste a Cal.com or Calendly link in the admin panel |
| Enquiry dashboard | weberact-admin.vercel.app | Every enquiry with status (new, contacted, proposal sent, won, lost), notes, reply-time tracking, source (referrer, landing page, UTM) and CSV export |
| Layout stability | /proposal.html | No layout shift while the form loads (CLS 0) |

## Tracking (ready, switched on by the owner)

Google Analytics 4 is wired but off until a measurement ID is added (admin → Search engines and
analytics). When on, visitors see a consent prompt; nothing loads unless they accept.

| Event | Fires when | Use |
| --- | --- | --- |
| `generate_lead` | A proposal request is stored successfully (parameters: services, currency) | Mark as a key event (conversion) in GA4 |
| `whatsapp_click` | Any WhatsApp link | Key event |
| `email_click` | Any mailto link | Key event |
| `booking_click` | The booking link | Key event |
| `phone_click` | Any tel link | Key event |
| `cta_click` | Any link to the proposal page | Funnel analysis |

Country-wise performance comes from GA4's country dimension (consented visitors) and Search Console's
Countries report (all organic searches). Organic visitors: GA4 → Acquisition → Traffic acquisition →
"Organic Search". Qualified enquiries: the enquiry dashboard statuses (proposal sent, won).

Note: consent-first analytics under-counts visitors who decline; Search Console and the enquiry
dashboard are not affected, so use them as the source of truth for organic clicks and enquiries.

## Next improvements (in order)

1. **Real proof**: one permissioned case study with numbers; real testimonials (the current ones are
   placeholders and are never used as structured data).
2. **Contact details**: email and WhatsApp in the admin panel (they are placeholders now).
3. **Booking link** for buyers who prefer to pick a time.
4. **Service-specific proof** on each service page once case studies exist (one project per service).
5. **A/B ideas** once traffic exists (at least a few hundred visits per variant): hero call to action
   wording; showing the number of steps on the proposal button; a short "typical timeline" line under
   each service hero.
6. **Response speed**: the dashboard shows the median reply time; keep it under one working day, as
   promised on the site.
