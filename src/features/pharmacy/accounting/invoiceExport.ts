/**
 * Invoice export — the pure half of the invoice page's "Exporter" button.
 *
 * The backend exposes NO invoice/PDF endpoint, so the export is built
 * **entirely from the sale payload already on screen** — the same fields the
 * page renders (a detail-endpoint payload, so `items[]` is present). It
 * produces a standalone, self-contained HTML file (RTL, inline CSS, no
 * external assets, no JavaScript) that opens in any browser and prints to PDF
 * via the browser's own dialog. Nothing is invented: every figure comes from
 * the server payload.
 */

import { money } from '@/lib/format';
import type { ApiSale } from '@/api/pharmacyTypes';

export interface InvoiceExportLabels {
  title: string;
  pharmacy: string;
  customer: string;
  payment_method: string;
  created_at: string;
  created_by: string;
  items: string;
  item: string;
  qty: string;
  unit_price: string;
  line_total: string;
  subtotal: string;
  discount: string;
  total: string;
  paid: string;
  remaining: string;
  status: string;
  walk_in: string;
  refunded_status: string;
  no_payments: string;
  payment_history: string;
  print_hint: string;
}

/** Light entity escaping — customer names and staff names are user input. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ASCII-safe file name — Arabic numbers/values stay readable via the title. */
export function invoiceFileName(sale: ApiSale): string {
  const safeNumber = sale.number.replace(/[^\w-]/g, '_');
  return `invoice-${safeNumber}.html`;
}

/**
 * Builds the standalone HTML document. Mirrors the on-page invoice layout
 * (`AccountingInvoicePage`): header, meta, items, totals, payment history.
 */
export function buildInvoiceHtml(
  sale: ApiSale,
  labels: InvoiceExportLabels,
  pharmacyName?: string | null,
): string {
  const esc = escapeHtml;
  const items = sale.items ?? [];

  const history =
    sale.paid > 0 && sale.status !== 'refunded'
      ? `<tr><td>${esc(sale.date ?? '').replace('T', ' ').slice(0, 16)} — ${esc(sale.method_label)}</td><td class="num">${money(sale.paid)}</td></tr>`
      : sale.status === 'refunded'
        ? `<tr><td colspan="2" class="muted">${esc(labels.refunded_status)}</td></tr>`
        : `<tr><td colspan="2" class="muted">${esc(labels.no_payments)}</td></tr>`;

  const rows = items
    .map(
      (item) => `<tr>
        <td class="name">${esc(item.medicine_name)}${item.barcode ? `<div class="barcode">${esc(item.barcode)}</div>` : ''}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.unit_price)}</td>
        <td class="num">${money(item.line_total)}${item.line_discount > 0 ? `<div class="neg">−${money(item.line_discount)}</div>` : ''}</td>
      </tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(sale.number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, 'Segoe UI', Tahoma, sans-serif; margin: 24px auto; max-width: 720px; color: #111; }
  h1 { font-size: 1.25rem; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0d9488; padding-block-end: 12px; }
  .meta, .totals, .history { width: 100%; border-collapse: collapse; margin-block-start: 18px; }
  .meta td { padding: 4px 0; font-size: .9rem; }
  .meta td:first-child { color: #555; font-weight: 600; width: 140px; }
  table.items { width: 100%; border-collapse: collapse; margin-block-start: 18px; }
  .items th { text-align: start; border-bottom: 1px solid #ddd; padding: 8px 6px; font-size: .85rem; color: #444; }
  .items td { padding: 8px 6px; border-bottom: 1px solid #f2f2f2; font-size: .92rem; }
  .num { text-align: end; white-space: nowrap; }
  .name { font-weight: 600; }
  .barcode { color: #777; font-size: .78rem; direction: ltr; }
  .neg { color: #b91c1c; font-size: .8rem; }
  .muted { color: #777; }
  .totals td { padding: 5px 0; font-size: .95rem; }
  .totals .grand { font-weight: 700; border-top: 2px solid #0d9488; font-size: 1.05rem; }
  .hint { color: #666; font-size: .8rem; margin-block-start: 24px; border-top: 1px solid #eee; padding-block-start: 10px; }
  @media print { body { margin: 0; } .hint { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>${esc(labels.title)} — ${esc(sale.number)}</h1>
      <div class="muted">${esc(sale.date_human ?? (sale.date ?? '').replace('T', ' ').slice(0, 16))}</div>
      <div class="muted">${esc(sale.status_label)}</div>
    </div>
    <div style="text-align: end;">
      <strong>${esc(pharmacyName ?? '')}</strong>
    </div>
  </div>

  <table class="meta">
    <tr><td>${esc(labels.pharmacy)}</td><td>${esc(pharmacyName ?? '')}</td></tr>
    <tr><td>${esc(labels.customer)}</td><td>${esc(sale.customer ?? labels.walk_in)}</td></tr>
    <tr><td>${esc(labels.payment_method)}</td><td>${esc(sale.method_label)}</td></tr>
    <tr><td>${esc(labels.created_at)}</td><td>${esc((sale.date ?? '').replace('T', ' ').slice(0, 16))}</td></tr>
    <tr><td>${esc(labels.created_by)}</td><td>${esc(sale.created_by ?? '')}</td></tr>
  </table>

  <h2 style="font-size: 1rem; margin-block-end: 6px;">${esc(labels.items)}</h2>
  <table class="items">
    <thead>
      <tr><th>${esc(labels.item)}</th><th class="num">${esc(labels.qty)}</th><th class="num">${esc(labels.unit_price)}</th><th class="num">${esc(labels.line_total)}</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>${esc(labels.subtotal)}</td><td class="num">${money(sale.subtotal)}</td></tr>
    <tr><td>${esc(labels.discount)}</td><td class="num ${sale.discount > 0 ? 'neg' : ''}">${sale.discount > 0 ? '−' : ''}${money(sale.discount)}</td></tr>
    <tr class="grand"><td>${esc(labels.total)}</td><td class="num">${money(sale.total)}</td></tr>
    <tr><td>${esc(labels.paid)}</td><td class="num">${money(sale.paid)}</td></tr>
    <tr><td>${esc(labels.remaining)}</td><td class="num ${sale.remaining > 0 ? 'neg' : ''}">${money(sale.remaining)}</td></tr>
  </table>

  <h2 style="font-size: 1rem; margin-block-end: 6px;">${esc(labels.payment_history ?? '')}</h2>
  <table class="history">${history}</table>

  <p class="hint">${esc(labels.print_hint)}</p>
</body>
</html>`;
}

/**
 * Triggers the actual browser download. Kept separate from `buildInvoiceHtml`
 * so the (pure) document builder stays unit-testable.
 */
export function downloadInvoiceHtml(html: string, fileName: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
