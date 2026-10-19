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

/** A patient inquiry, as surfaced on the dashboard "latest inquiries" card.
 * Contract mirrors the Blade `$inquiriesList` shape (dashboard/index.blade.php:121+). */
export interface ApiDashboardInquiry {
  id: number;
  user_name: string | null;
  medicine_trade_name: string | null;
  message: string | null;
  status: string;
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
  latest_inquiries: ApiDashboardInquiry[];
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
/** One hit of the local catalogue in the create-screen live search. */
export interface ApiCatalogMedicineHit {
  type: 'medicine';
  id: number;
  name: string | null;
  name_ar: string | null;
  sub: string | null;
}

/** One hit of the MOH catalogue in the create-screen live search. */
export interface ApiCatalogMohHit {
  type: 'moh';
  id: number;
  name: string | null;
  sub: string | null;
  official_price: number | null;
}

/** `GET /api/pharmacy/medicines/search` — local catalogue + MOH catalogue. */
export interface ApiCatalogSearchResult {
  medicines: ApiCatalogMedicineHit[];
  moh_catalog: ApiCatalogMohHit[];
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
  /**
   * `total` is the historical gross; `refunded` is the value of returned goods
   * and `net_total = total − refunded`. The invoice `stats` block alone does
   * NOT send these (it is summed by `statsFor`, not `sumSales`) — only the
   * `sales-summary` endpoint does, hence optional.
   */
  refunded?: number;
  net_total?: number;
}

/**
 * Settlement of returned goods for a period: the goods value (`refunded_goods`)
 * is split into cash actually paid back (`cash_refunded`) and debt wiped
 * (`debt_cancelled`). Never treat `refunded_goods` as cash leaving the drawer.
 */
export interface ApiRefundTotals {
  gross_sales: number;
  refunded_goods: number;
  net_sales: number;
  cash_refunded: number;
  debt_cancelled: number;
  count: number;
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
  /** Present since the D1–D7 refund work; optional for forward/back safety. */
  refunds?: ApiRefundTotals;
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
  /** Cash returned vs debt cancelled — split of `amount`. */
  cash_refunded?: number;
  debt_cancelled?: number;
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
  /** Cash actually returned to the customer (0 for unpaid/credit returns). */
  cash_refunded: number;
  /** Debt wiped because the returned goods were never paid for. */
  debt_cancelled: number;
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
  /** Historical gross, never changes after a refund. */
  refunded_amount: number;
  /** `total − refunded_amount`: the invoice's live value. */
  net_total: number;
  paid: number;
  /** `net_total − paid`: unpaid balance a return must cancel first. */
  remaining: number;
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
  cash_refunded?: number;
  debt_cancelled?: number;
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

/** `POST /customers/{id}/payments` → `data` — payment + refreshed customer. */
export interface ApiSalePaymentResult {
  payment: {
    id: number;
    amount: number;
    method: string;
    /** `paid_at` as a plain `Y-m-d` date. */
    date: string | null;
  };
  customer: {
    id: number;
    name: string;
    /** After the payment: negative means the customer is in credit. */
    current_balance: number;
  };
}

export interface ApiCustomerDetail extends ApiCustomer {
  sales: Array<{    number: string;
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
// Pharmacy-scoped barcode resolve — `GET /api/pharmacy/accounting/barcode/{barcode}`
// ══════════════════════════════════════════════════════════════════════

/**
 * One candidate stock row when the resolve is `ambiguous`.
 *
 * The backend NEVER picks a candidate when more than one row matches — it
 * returns all of them and the human decides. The POS must therefore never
 * silently pick `candidates[0]`.
 */
export interface ApiAccountingBarcodeCandidate {
  pharmacy_medicine_id: number;
  medicine_id: number;
  moh_medicine_id: number | null;
  name: string | null;
  price: number;
  quantity: number;
  is_available: boolean;
}

/**
 * The catalog medicine attached to the barcode record (present for every
 * status except `unknown`).
 */
export interface ApiAccountingBarcodeMedicine {
  id: number | null;
  trade_name: string | null;
  trade_name_ar: string | null;
  active_ingredient: string | null;
  manufacturer: string | null;
  dosage_form: string | null;
  packaging: string | null;
  official_price: number | null;
  image_url: string | null;
}

/**
 * `data` of `GET /api/pharmacy/accounting/barcode/{barcode}` — the single-step
 * replacement for the old `GET /medicines/barcode` → inventory-match chain.
 *
 * ⚠️ `price` and `quantity` are THE PHARMACY'S STOCK VALUES read from the
 * server (`pharmacy_medicines` row) — they are never client-echoed. For
 * `not_in_stock` (barcode known, pharmacy doesn't stock it) and `unknown`
 * (barcode not in the catalog) they are null.
 *
 * ⚠️ `ambiguous` means multiple inventory rows match this pharmacy's barcode —
 * the response carries `candidates[]` and NO row to sell.
 */
export interface ApiAccountingBarcodeResult {
  status: 'found' | 'out_of_stock' | 'not_in_stock' | 'unknown' | 'ambiguous';
  barcode: string;
  medicine: ApiAccountingBarcodeMedicine | null;
  pharmacy_medicine_id: number | null;
  local_medicine_id: number | null;
  moh_medicine_id: number | null;
  price: number | null;
  quantity: number | null;
  is_available: boolean | null;
  is_out_of_stock: boolean;
  is_low_stock: boolean;
  candidates: ApiAccountingBarcodeCandidate[];
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
  /**
   * Omitted when the cashier left the field empty — the backend then defaults
   * per tender (cash/card/bank paid in full, credit paid 0). Sending `0` would
   * store a cash sale as unpaid. See `salePayload.ts`.
   */
  paid?: number;
  payment_method: string;
}
