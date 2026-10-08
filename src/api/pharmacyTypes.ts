/**
 * Response types for the pharmacy API — transcribed from the Laravel source.
 *
 * Every field name here was read out of the controller/service/resource that
 * produces it (see `docs/API-CONTRACT-MAP.md`). Nothing is guessed here: if the
 * backend does not send a field, it is not in this file.
 *
 * House rule: the backend ALSO localises (`__()`) several display strings —
 * KPI labels, status labels, method labels, alert titles/descriptions. Those are
 * typed as `string` and must be rendered verbatim, never re-derived in the UI.
 */

// ══════════════════════════════════════════════════════════════════════
// Envelope helpers
// ══════════════════════════════════════════════════════════════════════

// Re-exported so feature code has a single import site.
export type { ApiPagination, ApiSuccess } from './types';
import type { ApiPagination } from './types';

/** A paginated list response. */
export interface Paginated<T> {
  data: T[];
  pagination: ApiPagination;
}

// ══════════════════════════════════════════════════════════════════════
// Inventory
// ══════════════════════════════════════════════════════════════════════

export interface ApiMedicineRef {
  id: number | null;
  trade_name: string | null;
  trade_name_ar?: string | null;
  active_ingredient: string | null;
  image_url?: string | null;
}

export interface ApiInventoryItem {
  id: number;
  medicine_id: number | null;
  pharmacy_id: number;
  price: number;
  quantity: number;
  /**
   * Sent as the constant `PharmacyMedicine::LOW_STOCK_THRESHOLD`.
   * It carries NO availability logic — by project rule it must not be "fixed"
   * into a per-row threshold.
   */
  min_stock: number;
  is_available: boolean;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  medicine?: ApiMedicineRef | null;
}

export interface ApiInventoryStats {
  total: number;
  available_count: number;
  low_count: number;
  out_count: number;
}

export interface ApiInventoryList extends Paginated<ApiInventoryItem> {
  stats: ApiInventoryStats;
}

// ══════════════════════════════════════════════════════════════════════
// Dashboard
// ══════════════════════════════════════════════════════════════════════

export interface ApiDashboardRating {
  id: number;
  user_name: string | null;
  stars_rating: number;
  comment: string | null;
  created_at: string | null;
}

export interface ApiLowStockItem {
  pharmacy_medicine_id: number;
  medicine_id: number | null;
  trade_name: string | null;
  active_ingredient: string | null;
  quantity: number;
}

export interface ApiDashboardStats {
  total_medicines: number;
  available_count: number;
  low_count: number;
  out_count: number;
  pending_inquiries: number;
  total_inquiries: number;
  new_ratings_this_week: number;
  latest_ratings: ApiDashboardRating[];
  low_stock_items: ApiLowStockItem[];
}

// ══════════════════════════════════════════════════════════════════════
// Inquiries
// ══════════════════════════════════════════════════════════════════════

export type ApiInquiryStatus = 'new' | 'answered' | 'closed';

export interface ApiInquiryLastMessage {
  id: number;
  sender_user_id: number;
  message: string | null;
  created_at: string | null;
}

export interface ApiInquiry {
  id: number;
  status: ApiInquiryStatus;
  message: string | null;
  reply: string | null;
  availability_status: string | null;
  replied_at: string | null;
  created_at: string | null;
  user?: { id: number; name: string } | null;
  medicine?: ApiMedicineRef | null;
  last_message?: ApiInquiryLastMessage | null;
  unread_messages_count?: number;
}

export interface ApiInquiryCounts {
  new: number;
  answered: number;
  closed: number;
}

export interface ApiInquiryList extends Paginated<ApiInquiry> {
  counts: ApiInquiryCounts;
}

export interface ApiInquiryMessage {
  id: number;
  inquiry_id: number;
  sender_user_id: number | null;
  message: string | null;
  media_url: string | null;
  media_type: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string | null;
  /** Computed server-side against the authenticated user. Do not re-derive. */
  is_mine: boolean;
}

// ══════════════════════════════════════════════════════════════════════
// Ratings
// ══════════════════════════════════════════════════════════════════════

export interface ApiRating {
  id: number;
  stars_rating: number;
  comment: string | null;
  created_at: string | null;
  user?: { id: number; name: string } | null;
  pharmacy_id: number;
}

// ══════════════════════════════════════════════════════════════════════
// Alternatives
// ══════════════════════════════════════════════════════════════════════

export interface ApiAlternativeRef {
  id: number;
  trade_name: string | null;
  active_ingredient: string | null;
}

export interface ApiAlternativeBlock {
  id: number;
  pharmacy_id: number;
  medicine_id: number | null;
  price: number;
  quantity: number;
  medicine: ApiAlternativeRef | null;
  alternatives: ApiAlternativeRef[];
}

export interface ApiSearchableMedicine {
  id: number;
  trade_name: string | null;
  active_ingredient: string | null;
}

// ══════════════════════════════════════════════════════════════════════
// Profile
// ══════════════════════════════════════════════════════════════════════

export type ApiDayKey = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export interface ApiWorkingHour {
  open: string | null;
  close: string | null;
}

export interface ApiPharmacyProfile {
  type: 'pharmacy';
  pharmacy_id: string | null;
  name: string | null;
  phone: string | null;
  logo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  working_hours: Record<ApiDayKey, ApiWorkingHour>;
  /**
   * RESOLVED (was GAP-1): `region` was accepted and persisted by the backend but
   * not returned by `PharmacyProfileController::payload()`, so no client could
   * evaluate the backend's own completeness rule — which requires it. The
   * backend now returns it, so it is no longer optional.
   */
  region: string | null;
  /**
   * When the pharmacy first completed its profile, or `null` if it never has.
   *
   * ⚠️ Set ONCE and never cleared (`PharmacyProfileController::update()` guards
   * on `=== null`), and the two flows disagree on when to set it: the API sets
   * it only when `isProfileComplete()` passes, the web completion controller
   * sets it unconditionally. So this answers "did they ever finish setup" —
   * which is exactly what the first-run checklist needs — and NOT "is the
   * profile complete right now". For the current state, read the fields.
   *
   * The demo pharmacy is a live example of the gap: `region` is null while this
   * is set.
   */
  profile_completed_at: string | null;
}

// ══════════════════════════════════════════════════════════════════════
// Accounting — overview
// ══════════════════════════════════════════════════════════════════════

export type AccountingRange = 'today' | '7d' | '30d' | 'month';

export type KpiFormat = 'money' | 'int';
export type KpiTone = 'teal' | 'blue' | 'orange' | 'green' | 'red' | 'gray';

export interface ApiKpi {
  key: string;
  /** Pre-localised by the backend `__()`. Render verbatim. */
  label: string;
  value: number;
  format: KpiFormat;
  icon: string;
  tone: KpiTone;
  href: string | null;
}

export interface ApiSeries {
  labels: string[];
  data: number[];
}

export interface ApiExpenseSlice {
  category: string;
  label: string;
  amount: number;
  percentage: number;
}

export interface ApiTransaction {
  type: string;
  reference: string;
  description: string;
  amount: number;
  method: string | null;
  status: string | null;
  date: string | null;
  href: string | null;
}

export type AlertSeverity = 'warning' | 'danger' | 'info';

export interface ApiAlert {
  severity: AlertSeverity;
  icon: string;
  /** Pre-localised. Render verbatim. */
  title: string;
  /** Pre-localised. Render verbatim. */
  description: string;
  href: string | null;
}

export interface ApiProfitIndicator {
  sales: number;
  purchases: number;
  expenses: number;
  net: number;
}

export interface ApiComparison {
  current: number;
  previous: number;
  change_percent: number;
  direction: 'up' | 'down' | 'flat';
}

export interface ApiReceivables {
  customer_balances: number;
  invoice_remaining: number;
  drift: number;
  supplier_balances: number;
  purchase_remaining: number;
}

export type BarcodeStatusKey = 'verified' | 'pending' | 'unknown';

export interface ApiBarcodeCoverage {
  total: number;
  with_barcode: number;
  without_barcode: number;
  percent: number;
  by_status: Record<BarcodeStatusKey, number>;
}

export interface ApiAccountingOverview {
  kpis: ApiKpi[];
  series: Record<AccountingRange, ApiSeries>;
  range: AccountingRange;
  expense_breakdown: ApiExpenseSlice[];
  recent_transactions: ApiTransaction[];
  alerts: ApiAlert[];
  profit_indicator: ApiProfitIndicator;
  comparison: ApiComparison;
  receivables: ApiReceivables;
  barcode_coverage: ApiBarcodeCoverage;
}

// ══════════════════════════════════════════════════════════════════════
// Accounting — sales
// ══════════════════════════════════════════════════════════════════════

export type PaymentStatus = 'paid' | 'partially_paid' | 'unpaid' | 'refunded' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'credit';

export interface ApiSaleItem {
  id: number;
  medicine_id: number | null;
  pharmacy_medicine_id: number | null;
  medicine_name: string;
  barcode: string | null;
  unit_price: number;
  quantity: number;
  line_discount: number;
  line_total: number;
}

export interface ApiSale {
  id: number;
  number: string;
  date: string | null;
  date_human: string | null;
  customer_id: number | null;
  customer: string | null;
  items_count: number;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  method: PaymentMethod;
  /** Pre-localised. Render verbatim. */
  method_label: string;
  status: PaymentStatus;
  /** Pre-localised. Render verbatim. */
  status_label: string;
  notes: string | null;
  items?: ApiSaleItem[];
  created_by?: string | null;
}

export interface ApiSalesStats {
  total: number;
  count: number;
  paid: number;
  remaining: number;
  discount: number;
}

export interface ApiSalesList extends Paginated<ApiSale> {
  stats: ApiSalesStats;
}

export interface ApiPaymentMethodSlice {
  method: string;
  label: string;
  total: number;
  count: number;
}

export interface ApiTopItem {
  medicine_name: string;
  quantity: number;
  revenue: number;
}

export interface ApiSalesSummary {
  summary: ApiSalesStats;
  comparison: ApiComparison;
  by_payment_method: ApiPaymentMethodSlice[];
  top_items: ApiTopItem[];
  average_items_per_sale: number;
  profit_indicator: ApiProfitIndicator;
}

// ══════════════════════════════════════════════════════════════════════
// Accounting — refunds
// ══════════════════════════════════════════════════════════════════════

export type RefundStatus = 'completed' | 'pending' | 'cancelled';

export interface ApiRefundSaleRef {
  id: number;
  number: string;
  sold_at: string | null;
  total: number;
  paid: number;
  remaining: number;
  customer_name: string | null;
}

export interface ApiRefundItemRef {
  id: number;
  sale_item_id: number;
  quantity: number;
  amount: number;
  sale_item?: { id: number; medicine_name: string } | null;
}

/**
 * `GET accounting/refunds` returns raw Eloquent models (no Resource), so the
 * payload is the column set plus the eager-loaded relations.
 */
export interface ApiRefundRow {
  id: number;
  sale_id: number;
  amount: number;
  reason: string | null;
  status: RefundStatus;
  refunded_at: string | null;
  created_at?: string | null;
  sale?: ApiRefundSaleRef | null;
  items?: ApiRefundItemRef[];
}

export interface ApiRefundDetail {
  id: number;
  sale_id: number;
  sale_number: string;
  amount: number;
  reason: string | null;
  status: RefundStatus;
  refunded_at: string | null;
  created_by?: string | null;
  items: Array<{
    id: number;
    sale_item_id: number;
    medicine_name: string;
    quantity: number;
    amount: number;
  }>;
}

/**
 * `GET accounting/sales/{number}/refund-items`.
 *
 * `available_quantity` ALREADY subtracts previously refunded quantities
 * (`original − refunded`). The refund UI must use it, not the gross
 * original quantity — that is exactly the D-1 defect.
 */
export interface ApiRefundableItems {
  sale_number: string;
  total: number;
  paid: number;
  already_refunded: number;
  available_to_refund: number;
  items: Array<{
    id: number;
    medicine_name: string;
    unit_price: number;
    original_quantity: number;
    refunded_quantity: number;
    available_quantity: number;
    line_total: number;
  }>;
}

export interface ApiRefundForSale {
  id: number;
  amount: number;
  status: RefundStatus;
  refunded_at: string | null;
  items_count: number;
}

// ══════════════════════════════════════════════════════════════════════
// Accounting — cash
// ══════════════════════════════════════════════════════════════════════

export type CashDirection = 'in' | 'out';

export interface ApiCashMovement {
  id: number;
  direction: CashDirection;
  amount: number;
  signed_amount: number;
  source_type: string;
  source_id: number | null;
  description: string | null;
  reason: string | null;
  date: string | null;
  date_human: string | null;
  created_by: string | null;
}

export interface ApiCashStats {
  balance_now: number;
  balance_as_of: number;
  /**
   * Verified live: the backend sends `{ in, out, net, count }`.
   * (An earlier draft of this file guessed `inflow/outflow` — corrected against
   * the real response, not the source comments.)
   */
  period: { in: number; out: number; net: number; count: number };
  low_threshold: number;
  is_low: boolean;
}

export interface ApiCashResponse extends Paginated<ApiCashMovement> {
  stats: ApiCashStats;
  period: { from: string; to: string };
}

// ══════════════════════════════════════════════════════════════════════
// Accounting — expenses
// ══════════════════════════════════════════════════════════════════════

export interface ApiExpense {
  id: number;
  category_key: string;
  /** Pre-localised. Render verbatim. */
  category_label: string;
  amount: number;
  description: string | null;
  reference: string | null;
  payment_method: string;
  /** Pre-localised. Render verbatim. */
  method_label: string;
  expense_date: string | null;
  date_human: string | null;
  is_cancelled: boolean;
  created_by: string | null;
}

export interface ApiExpenseCategory {
  id: number;
  key: string;
  label: string;
  sort_order: number;
}

export interface ApiExpensesList extends Paginated<ApiExpense> {
  stats: { total: number; count: number; breakdown: ApiExpenseSlice[] };
}

// ══════════════════════════════════════════════════════════════════════
// Accounting — parties (customers / suppliers)
// ══════════════════════════════════════════════════════════════════════

export interface ApiCustomer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  current_balance: number;
  credit_limit: number;
  credit_limit_label: string;
  is_active: boolean;
  exceeds_credit_limit: boolean;
  created_at: string | null;
}

export interface ApiCustomerDetail extends ApiCustomer {
  sales: Array<{
    number: string;
    date: string | null;
    total: number;
    paid: number;
    remaining: number;
    status: PaymentStatus;
    status_label: string;
  }>;
  payments: Array<{
    id: number;
    amount: number;
    method: string;
    date: string | null;
    reference: string | null;
  }>;
}

export interface ApiCustomersList extends Paginated<ApiCustomer> {
  stats: { total_debt: number; customers_count: number; debtors_count: number };
}

export interface ApiSupplier {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  current_balance: number;
  is_active: boolean;
  created_at: string | null;
}

export interface ApiSuppliersList {
  data: ApiSupplier[];
  stats: { total_payables: number; suppliers_count: number };
}

// ══════════════════════════════════════════════════════════════════════
// Barcode lookup — `GET /api/medicines/barcode/{barcode}`
// ══════════════════════════════════════════════════════════════════════

/**
 * A catalogue (MOH) medicine resolved from a barcode.
 *
 * ⚠️ This is the CATALOGUE record, not the pharmacy's stock row: it has no
 * `quantity` and no pharmacy `price`. The POS must therefore match it back onto
 * an inventory row — `local_medicine_id` lines up with
 * `ApiInventoryItem.medicine_id` — before it can be sold. See
 * `AccountingSaleCreatePage`.
 */
export interface ApiBarcodeMedicine {
  medicine: {
    id: number;
    name_en: string | null;
    name_ar: string | null;
    active_ingredient: string | null;
    manufacturer: string | null;
    dosage_form: string | null;
    pack_size: string | null;
    official_price: number | null;
    moh_product_id: string | null;
    moh_drug_id: string | null;
    /** Matches `ApiInventoryItem.medicine_id` when the pharmacy stocks it. */
    local_medicine_id: number | null;
  };
  barcode: {
    value: string;
    raw: string;
    type: string | null;
    verified: boolean;
    source: string | null;
  };
  image: { url: string | null; source?: string | null } | null;
}

// ══════════════════════════════════════════════════════════════════════
// Categories — `GET /api/categories`
// ══════════════════════════════════════════════════════════════════════

/**
 * A medicine category.
 *
 * The route is public. Note the payload has NO `name` field — the display name
 * is `name_ar` (with `name_en` as the Latin fallback).
 */
export interface ApiCategory {
  id: number;
  name_ar: string;
  name_en: string | null;
  slug: string | null;
  image: string | null;
  is_active: boolean;
  sort_order: number;
  medicines_count: number;
  subcategories: ApiCategory[];
}

// ══════════════════════════════════════════════════════════════════════
// Inventory import — `GET/POST /api/pharmacy/inventory/import*`
// ══════════════════════════════════════════════════════════════════════

export interface ApiImportRow {
  row_number: number;
  status: string;
  trade_name: string | null;
  message: string | null;
}

/**
 * An import session, as returned by `preview` / `show` / `decide` / `commit`.
 *
 * NOTE: there is **no list endpoint** for import sessions, so a "recent
 * sessions" table has no server source (GAP-12).
 */
export interface ApiImportSession {
  uuid: string;
  original_filename: string | null;
  status: string | null;
  total_rows: number;
  valid_rows?: number;
  invalid_rows?: number;
  is_committed?: boolean;
  is_expired?: boolean;
  can_commit?: boolean;
  expires_at?: string | null;
  created_at?: string | null;
  rows?: ApiImportRow[];
}

// ══════════════════════════════════════════════════════════════════════
// Accounting — create-sale payload
// ══════════════════════════════════════════════════════════════════════

export interface ApiSalePayloadItem {
  pharmacy_medicine_id: number;
  medicine_id?: number;
  medicine_name: string;
  barcode?: string;
  unit_price: number;
  quantity: number;
  line_discount: number;
}

/**
 * Body of `POST /api/pharmacy/accounting/sales`.
 *
 * ⚠️ `discount` is an ADDITIONAL invoice-level discount, applied AFTER the
 * per-line discounts — `AccountingLedger::recordSale()` computes
 * `$subtotal = Σ(unitPrice × quantity − lineDiscount)` and then
 * `$total = $subtotal − $discount`. Since every discount in the POS is per-line,
 * `discount` must be sent as **0** or the discount is applied twice. See
 * `salePayload.ts` and `salePayload.test.ts`.
 */
export interface ApiSalePayload {
  customer_id?: number;
  items: ApiSalePayloadItem[];
  discount: number;
  paid: number;
  payment_method: string;
}
