import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Contract, Invoice, InvoiceItem, Organization, Payment, PortalSettings, Project, SeoReport } from '@/lib/types';
import { stageLabel } from '@/lib/constants';

// Server-side PDF documents. Standard PDF fonts cover Western European text; anything outside
// that range (for example the rupee sign) is written out so the document always renders.
const W = 595.28, H = 841.89, M = 56;
const INK = rgb(0.09, 0.09, 0.11), MUTED = rgb(0.42, 0.41, 0.44), LINE = rgb(0.88, 0.87, 0.85), CORAL = rgb(0.937, 0.463, 0.314), PAPER = rgb(0.985, 0.98, 0.972);

const clean = (s: unknown) => String(s ?? '')
  .replace(/₹/g, 'INR ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[–—]/g, '-')
  .replace(/\t/g, '  ').replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, '');
export const pdfMoney = (n: number | string | null | undefined, currency: string) =>
  `${currency} ${new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0))}`;
const pdfDate = (d?: string | null) => (d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-');

class Writer {
  doc!: PDFDocument; page!: PDFPage; y = 0; regular!: PDFFont; bold!: PDFFont; title = '';
  static async create(title: string) {
    const w = new Writer(); w.title = title;
    w.doc = await PDFDocument.create();
    w.doc.setTitle(title); w.doc.setProducer('WeberAct client portal'); w.doc.setCreator('WeberAct');
    w.regular = await w.doc.embedFont(StandardFonts.Helvetica); w.bold = await w.doc.embedFont(StandardFonts.HelveticaBold);
    w.newPage(); return w;
  }
  newPage() {
    this.page = this.doc.addPage([W, H]);
    this.page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    this.page.drawRectangle({ x: 0, y: H - 4, width: W, height: 4, color: CORAL });
    this.y = H - M;
    const n = this.doc.getPageCount();
    this.page.drawText(clean(`${this.title}  ·  Page ${n}`), { x: M, y: 28, size: 8, font: this.regular, color: MUTED });
  }
  ensure(h: number) { if (this.y - h < M + 10) this.newPage(); }
  text(s: unknown, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number; gap?: number; lineHeight?: number } = {}) {
    const size = o.size ?? 10, font = o.bold ? this.bold : this.regular, x = o.x ?? M, maxW = o.maxWidth ?? W - M - x, lh = o.lineHeight ?? size * 1.45;
    for (const para of clean(s).split('\n')) {
      const words = para.split(' '); let line = '';
      const flush = () => { this.ensure(lh); this.page.drawText(line, { x, y: this.y - size, size, font, color: o.color ?? INK }); this.y -= lh; line = ''; };
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) > maxW && line) { flush(); line = w; } else line = t;
      }
      flush();
    }
    this.y -= o.gap ?? 0;
  }
  right(s: string, x: number, y: number, size = 10, bold = false, color = INK) {
    const f = bold ? this.bold : this.regular, t = clean(s);
    this.page.drawText(t, { x: x - f.widthOfTextAtSize(t, size), y, size, font: f, color });
  }
  rule(gap = 12) { this.ensure(gap * 2); this.y -= gap; this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.6, color: LINE }); this.y -= gap; }
  heading(s: string) { this.ensure(40); this.y -= 6; this.page.drawText(clean(s).toUpperCase(), { x: M, y: this.y - 8, size: 7.5, font: this.bold, color: CORAL }); this.y -= 20; }
  brand(settings: PortalSettings, docLabel: string, docRef: string) {
    this.page.drawText('WeberAct', { x: M, y: this.y - 20, size: 20, font: this.bold, color: INK });
    this.page.drawText(clean(settings.website || 'weberact.co'), { x: M, y: this.y - 34, size: 8.5, font: this.regular, color: MUTED });
    this.right(docLabel, W - M, this.y - 14, 9, true, CORAL);
    this.right(docRef, W - M, this.y - 30, 15, true);
    this.y -= 58;
  }
  async save() { return this.doc.save(); }
}

function partyBlock(w: Writer, label: string, lines: (string | null | undefined)[], x: number, top: number, width: number) {
  w.page.drawText(label.toUpperCase(), { x, y: top - 8, size: 7.5, font: w.bold, color: MUTED });
  let y = top - 24;
  lines.filter(Boolean).forEach((l, i) => {
    for (const part of clean(l).split('\n')) {
      w.page.drawText(part.slice(0, 80), { x, y, size: i === 0 ? 10.5 : 9, font: i === 0 ? w.bold : w.regular, color: i === 0 ? INK : MUTED, maxWidth: width });
      y -= i === 0 ? 15 : 12.5;
    }
  });
  return y;
}

export async function invoicePdf(inv: Invoice, items: InvoiceItem[], payments: Payment[], org: Organization, s: PortalSettings) {
  const ref = inv.number ?? 'DRAFT';
  const w = await Writer.create(`Invoice ${ref}`);
  w.brand(s, inv.status === 'draft' ? 'DRAFT INVOICE' : 'TAX INVOICE', ref);
  const top = w.y;
  const yA = partyBlock(w, 'From', [s.legal_name || s.agency_name, s.address, s.tax_id ? `Tax ID / GSTIN: ${s.tax_id}` : null, s.pan ? `PAN: ${s.pan}` : null, s.email, s.phone], M, top, 220);
  const yB = partyBlock(w, 'Bill to', [org.legal_name || org.name, org.billing_address, org.country, org.tax_id ? `Tax ID / GSTIN: ${org.tax_id}` : null], M + 250, top, 240);
  w.y = Math.min(yA, yB) - 8;
  const meta: [string, string][] = [['Issue date', pdfDate(inv.issue_date)], ['Due date', pdfDate(inv.due_date)], ['Currency', inv.currency], ['Status', inv.payment_status.replace('_', ' ')]];
  meta.forEach(([k, v], i) => {
    const x = M + i * ((W - 2 * M) / 4);
    w.page.drawText(k.toUpperCase(), { x, y: w.y - 8, size: 7, font: w.bold, color: MUTED });
    w.page.drawText(clean(v), { x, y: w.y - 22, size: 10, font: w.bold, color: INK });
  });
  w.y -= 40; w.rule(4);

  // items
  const cols = { desc: M, qty: 360, price: 440, tax: 478, amount: W - M };
  w.y -= 4;
  w.page.drawText('DESCRIPTION', { x: cols.desc, y: w.y - 8, size: 7, font: w.bold, color: MUTED });
  w.right('QTY', cols.qty, w.y - 8, 7, true, MUTED); w.right('UNIT PRICE', cols.price, w.y - 8, 7, true, MUTED);
  w.right('TAX', cols.tax + 18, w.y - 8, 7, true, MUTED); w.right('AMOUNT', cols.amount, w.y - 8, 7, true, MUTED);
  w.y -= 18;
  for (const it of items) {
    w.ensure(30);
    const rowTop = w.y;
    w.text(it.description, { size: 9.5, maxWidth: 280, lineHeight: 13 });
    w.right(String(Number(it.quantity)), cols.qty, rowTop - 9.5, 9.5);
    w.right(pdfMoney(it.unit_price, '').trim(), cols.price, rowTop - 9.5, 9.5);
    w.right(`${Number(it.tax_rate)}%`, cols.tax + 18, rowTop - 9.5, 9.5);
    w.right(pdfMoney(it.amount, '').trim(), cols.amount, rowTop - 9.5, 9.5, true);
    w.y = Math.min(w.y, rowTop - 14) - 6;
    w.page.drawLine({ start: { x: M, y: w.y + 2 }, end: { x: W - M, y: w.y + 2 }, thickness: 0.4, color: LINE });
    w.y -= 6;
  }
  // totals
  w.ensure(110); w.y -= 8;
  const tot: [string, string, boolean][] = [['Subtotal', pdfMoney(inv.subtotal, inv.currency), false], ['Tax', pdfMoney(inv.tax_total, inv.currency), false], ['Total', pdfMoney(inv.total, inv.currency), true],
    ['Paid', pdfMoney(inv.amount_paid, inv.currency), false], ['Balance due', pdfMoney(inv.balance, inv.currency), true]];
  for (const [k, v, b] of tot) {
    w.right(k, W - M - 150, w.y - 10, b ? 10.5 : 9.5, b, b ? INK : MUTED);
    w.right(v, W - M, w.y - 10, b ? 10.5 : 9.5, b, k === 'Balance due' ? CORAL : INK);
    w.y -= b ? 20 : 16;
  }
  if (payments.length) {
    w.heading('Payments received');
    for (const p of payments) w.text(`${pdfDate(p.paid_at)}  ·  ${pdfMoney(p.amount, inv.currency)}  ·  ${p.method.replace('_', ' ')}${p.reference ? `  ·  Ref ${p.reference}` : ''}`, { size: 9, color: MUTED });
  }
  if (s.payment_instructions) { w.heading('How to pay'); w.text(s.payment_instructions, { size: 9, color: MUTED }); }
  if (inv.notes) { w.heading('Notes'); w.text(inv.notes, { size: 9, color: MUTED }); }
  if (s.invoice_footer) { w.y -= 10; w.text(s.invoice_footer, { size: 8, color: MUTED }); }
  return w.save();
}

export async function contractPdf(c: Contract, org: Pick<Organization, 'name' | 'legal_name' | 'billing_address' | 'country'>, s: PortalSettings) {
  const w = await Writer.create(c.title);
  w.brand(s, 'AGREEMENT', c.status === 'accepted' ? 'Accepted' : c.status === 'draft' ? 'Draft' : 'For review');
  w.text(c.title, { size: 18, bold: true, gap: 6 });
  w.text(`Between ${s.legal_name || s.agency_name} and ${org.legal_name || org.name}`, { size: 10, color: MUTED, gap: 4 });
  w.rule();
  const facts: [string, string][] = [['Client', org.legal_name || org.name], ['Project', c.project?.name ?? '-'], ['Start date', pdfDate(c.start_date)], ['End date', pdfDate(c.end_date)],
    ['Contract value', c.value != null ? pdfMoney(c.value, c.currency) : '-']];
  for (const [k, v] of facts) { const t = w.y; w.text(k, { size: 9, color: MUTED }); w.y = t; w.text(v, { size: 9.5, bold: true, x: M + 130 }); }
  w.heading('Scope of work'); w.text(c.scope || 'As described in the statement of work.', { size: 10, lineHeight: 15 });
  w.heading('Payment terms'); w.text(c.payment_terms || '-', { size: 10, lineHeight: 15 });
  w.heading('Electronic acceptance');
  if (c.status === 'accepted') {
    w.text(`Accepted by ${c.accepted_name} (${c.accepted_email}) on ${new Date(c.accepted_at!).toUTCString()}.`, { size: 9.5 });
    w.text(`IP address: ${c.accepted_ip || 'not recorded'}`, { size: 8.5, color: MUTED });
    w.text(`Document fingerprint (SHA-256): ${c.accepted_document_sha256}`, { size: 8, color: MUTED });
    w.text('This is a record of electronic acceptance in the WeberAct client portal. It is not a certified digital signature.', { size: 8, color: MUTED });
  } else w.text('Not yet accepted. The client accepts this agreement in the WeberAct client portal.', { size: 9.5, color: MUTED });
  return w.save();
}

export async function clientReportPdf(org: Organization, projects: Project[], invoices: Invoice[], reports: SeoReport[], s: PortalSettings) {
  const w = await Writer.create(`${org.name} report`);
  w.brand(s, 'CLIENT REPORT', pdfDate(new Date().toISOString()));
  w.text(org.name, { size: 18, bold: true, gap: 2 });
  w.text([org.country, org.website].filter(Boolean).join('  ·  '), { size: 9.5, color: MUTED });
  w.heading('Projects');
  if (!projects.length) w.text('No projects.', { size: 9.5, color: MUTED });
  for (const p of projects) {
    w.text(`${p.name}`, { size: 10.5, bold: true });
    w.text(`${stageLabel(p.stage)}  ·  ${p.progress}% complete  ·  ${p.status.replace('_', ' ')}  ·  due ${pdfDate(p.due_date)}${p.value != null ? `  ·  value ${pdfMoney(p.value, p.currency)}` : ''}`, { size: 9, color: MUTED, gap: 6 });
  }
  w.heading('Billing');
  const byCur = new Map<string, { total: number; paid: number; bal: number }>();
  for (const i of invoices.filter(i => i.status === 'issued')) {
    const t = byCur.get(i.currency) ?? { total: 0, paid: 0, bal: 0 };
    t.total += Number(i.total); t.paid += Number(i.amount_paid); t.bal += Number(i.balance); byCur.set(i.currency, t);
  }
  if (!byCur.size) w.text('No issued invoices.', { size: 9.5, color: MUTED });
  for (const [cur, t] of byCur) w.text(`${cur}: invoiced ${pdfMoney(t.total, cur)}, paid ${pdfMoney(t.paid, cur)}, balance ${pdfMoney(t.bal, cur)}`, { size: 9.5 });
  for (const i of invoices.filter(i => i.status === 'issued')) w.text(`${i.number}  ·  ${pdfDate(i.issue_date)}  ·  ${pdfMoney(i.total, i.currency)}  ·  ${i.payment_status.replace('_', ' ')}`, { size: 8.5, color: MUTED });
  w.heading('Search performance (from connected tools; blank where not available)');
  const pub = reports.filter(r => r.status === 'published').slice(0, 6);
  if (!pub.length) w.text('No published search reports yet.', { size: 9.5, color: MUTED });
  for (const r of pub) {
    const f = (n: number | null) => (n == null ? 'n/a' : new Intl.NumberFormat('en-US').format(n));
    w.text(`${pdfDate(r.period).replace(/^\d+ /, '')}: clicks ${f(r.clicks)}, impressions ${f(r.impressions)}, avg position ${r.avg_position ?? 'n/a'}, indexed pages ${f(r.indexed_pages)}`, { size: 9 });
  }
  return w.save();
}
