import { describe, expect, it } from 'vitest';
import type { ApiSale } from '@/api/pharmacyTypes';
import {
  buildInvoiceHtml,
  escapeHtml,
  invoiceFileName,
  type InvoiceExportLabels,
} from './invoiceExport';

function sale(overrides: Partial<ApiSale> = {}): ApiSale {
  return {
    id: 41,
    number: 'INV-1042',
    date: '2026-01-18T14:30:00.000000Z',
    date_human: '2026-01-18 14:30',
    customer_id: 7,
    customer: 'محمد <شركة> "الأمل"',
    items_count: 2,
    subtotal: 30,
    discount: 2,
    total: 28,
    paid: 10,
    remaining: 18,
    method: 'cash',
    method_label: 'نقدًا',
    status: 'partially_paid',
    status_label: 'مدفوع جزئيًا',
    notes: null,
    items: [
      {
        id: 1,
        medicine_id: 9,
        pharmacy_medicine_id: 41,
        medicine_name: 'بنادول <إكسترا>',
        barcode: '6291041500213',
        unit_price: 15,
        quantity: 2,
        line_discount: 2,
        line_total: 30,
      },
    ],
    created_by: 'عبود',
    ...overrides,
  };
}

function labels(): InvoiceExportLabels {
  return {
    title: 'فاتورة',
    pharmacy: 'الصيدلية',
    customer: 'العميل',
    payment_method: 'طريقة الدفع',
    created_at: 'تاريخ الإنشاء',
    created_by: 'أنشأها',
    items: 'الأصناف',
    item: 'الصنف',
    qty: 'الكمية',
    unit_price: 'سعر الوحدة',
    line_total: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    total: 'الإجمالي',
    paid: 'المدفوع',
    remaining: 'المتبقي',
    status: 'الحالة',
    walk_in: 'عميل عابر',
    refunded_status: 'الحالة: مُرجَع',
    no_payments: 'لا توجد دفعات',
    payment_history: 'سجل الدفعات',
    print_hint: 'اطبع عبر Ctrl+P',
  };
}

describe('escapeHtml', () => {
  it('escapes markup-sensitive characters', () => {
    expect(escapeHtml('<script>&"\'')).toBe('&lt;script&gt;&amp;&quot;&#39;');
  });

  it('renders null/undefined as an empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('invoiceFileName', () => {
  it('is ASCII-safe and keeps the invoice number', () => {
    expect(invoiceFileName(sale())).toBe('invoice-INV-1042.html');
    expect(invoiceFileName(sale({ number: 'INV/99 x' }))).toBe('invoice-INV_99_x.html');
  });
});

describe('buildInvoiceHtml', () => {
  it('is a standalone RTL document with no external assets', () => {
    const html = buildInvoiceHtml(sale(), labels(), 'صيدلية الأمل');

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('dir="rtl"');
    expect(html).not.toMatch(/https?:\/\//); // no CDN/asset leak
    expect(html).toContain('INV-1042');
    expect(html).toContain('صيدلية الأمل');
  });

  it('renders every figure from the SERVER payload, and escapes user input', () => {
    const html = buildInvoiceHtml(sale(), labels());
    const idx = html.indexOf('محمد');

    // Name is escaped: `<شركة>` must appear literally escaped, not as markup.
    expect(idx).toBeGreaterThan(-1);
    expect(html.slice(idx, idx + 30)).toContain('&lt;شركة&gt;');

    expect(html).toContain('مدفوع جزئيًا'); // pre-localised status label, verbatim
    expect(html).toContain('بنادول &lt;إكسترا&gt;');
    expect(html).toContain('6291041500213');
    expect(html).toContain('28'); // total
    expect(html).toContain('18'); // remaining
  });

  it('shows a paid line in the history when paid > 0 and not refunded', () => {
    const html = buildInvoiceHtml(sale(), labels());
    expect(html).toContain(sale().method_label);
    expect(html).not.toContain(labels().no_payments);
  });

  it('shows the refunded note instead of a payment line for a refunded sale', () => {
    const html = buildInvoiceHtml(sale({ status: 'refunded', paid: 28, remaining: 0 }), labels());
    expect(html).toContain(labels().refunded_status);
  });

  it('shows "no payments" for an unpaid sale', () => {
    const html = buildInvoiceHtml(sale({ paid: 0, remaining: 28 }), labels());
    expect(html).toContain(labels().no_payments);
  });

  it('falls back to the walk-in label when the sale has no customer', () => {
    const html = buildInvoiceHtml(sale({ customer: null, customer_id: null }), labels());
    expect(html).toContain(labels().walk_in);
  });

  it('does not invent items when a list-only payload slips through', () => {
    const html = buildInvoiceHtml(sale({ items: undefined }), labels());
    expect(html).toMatch(/<tbody>\s*<\/tbody>/);
  });
});
