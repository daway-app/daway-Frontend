/**
 * Admin API types — verified against the Laravel controllers.
 *
 * ============================================================================
 * SOURCE OF TRUTH
 * ============================================================================
 * These shapes were read from the newly added controllers at:
 *   app/Http/Controllers/Api/AdminAuthController.php
 *   app/Http/Controllers/Api/Admin/*.php
 *
 * They mirror the Blade controllers' computations exactly (the JSON layer was
 * a port, not a reimplementation), so numbers agree with the existing admin
 * panel by construction.
 */

/** An admin session user (returned by `POST /api/login/admin`). */
export interface AdminUser {
  id: number;
  name: string;
  email: string | null;
  role: string;
}

/** Standard pagination block. */
export interface Pagination {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

/** `GET /api/admin/dashboard` → `data.stats` */
export interface AdminDashboardStats {
  totalPatients: number;
  totalOtherUsers: number;
  activePharmacies: number;
  totalMedicines: number;
  stockStatus: {
    available: number;
    low_stock: number;
    out_of_stock: number;
  };
  userRoles: Record<string, number>;
  trendPatients: number;
  newPharmaciesThisWeek: number;
  medicinesAddedRecently: number;
  chartData: {
    labels: string[];
    datasets: Record<
      'all' | 'searches' | 'patients' | 'pharmacies',
      {
        /** Machine key — the UI supplies the Arabic label, not the server. */
        key: string;
        values: number[];
        total: number;
        /** `null` when there is no previous week to compare against. */
        change: number | null;
        average: number;
        color: string;
      }
    >;
  };
}

/** One activity row — raw data; the UI builds the sentence. */
export interface AdminActivity {
  name: string;
  role: string;
  created_at: string;
}

export interface AdminDashboardResponse {
  stats: AdminDashboardStats;
  recent_activities: AdminActivity[];
}

/** A pharmacy row as returned by `GET /api/admin/pharmacies`. */
export interface AdminPharmacy {
  id: number;
  pharmacy_name: string;
  pharmacy_custom_id: string;
  address: string | null;
  phone_number: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  is_active: boolean;
  delivered_at: string | null;
  pharmacy_medicines_count: number;
  user?: {
    id: number;
    name: string;
    email: string | null;
    is_active: boolean;
  } | null;
}

export interface AdminPharmaciesResponse {
  pharmacies: AdminPharmacy[];
  pagination: Pagination;
  filters: { q: string; status: string };
  stats: {
    total: number;
    active: number;
    disabled: number;
    total_items: number;
  };
}

/**
 * Credentials that are shown ONCE.
 *
 * On the Blade admin these arrive as session flash keys
 * (`delivered_pharmacy_id` / `delivered_password`); over the API they are in the
 * response body. Either way they cannot be retrieved again — the UI must make
 * that unmistakable.
 */
export interface DeliveredCredentials {
  pharmacy_id: string;
  password: string;
}

/** A medicine row from `GET /api/admin/medicines`. */
export interface AdminMedicine {
  id: number;
  trade_name: string;
  active_ingredient: string | null;
  /** Absolute URL resolved server-side (`Image::url`); null when unset. */
  image_url: string | null;
  stock: number | string;
  pharmacy_count: number | string;
  min_price: number | string | null;
}

export interface AdminMedicinesResponse {
  medicines: AdminMedicine[];
  pagination: Pagination;
  filters: { q: string; status: string };
  stats: {
    total: number;
    available: number;
    low: number;
    out: number;
    available_pct: number;
    low_pct: number;
    out_pct: number;
    in_pharmacy_pct: number;
    not_in_pharmacy_pct: number;
  };
}

/** One medicine from `GET /api/admin/medicines/{id}` — the edit screen's payload. */
export interface AdminMedicineDetail {
  id: number;
  trade_name: string;
  active_ingredient: string | null;
  description: string | null;
  /** Absolute URL, or null when the catalogue entry has no photo. */
  image_url: string | null;
  stock: number;
  pharmacy_count: number;
  /** Convenience for the multi-select's initial value. */
  alternative_ids: number[];
  alternatives: Array<{ id: number; trade_name: string }>;
}

/** A trimmed catalogue entry — the alternatives picker's option list. */
export interface AdminMedicineOption {
  id: number;
  trade_name: string;
}

/** A user row from `GET /api/admin/users`. */
export interface AdminUserRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  /** Raw stored path/URL from `users.avatar` — may be null. */
  avatar: string | null;
  created_at: string | null;
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  pagination: Pagination;
  filters: { q: string; role: string };
  role_counts: { admin: number; pharmacy: number; patient: number };
}

/**
 * `GET /api/admin/users/{id}` — the edit screen's payload.
 *
 * DEEPER than `AdminUserRow` on purpose: `pharmacy` is what lets the form know
 * the account is pharmacy-linked and therefore cannot have its role changed.
 * The endpoint returns the raw Eloquent model with `password`/`remember_token`
 * hidden — `avatar` is the RAW stored path, so the client applies its own size
 * transform exactly as it does on the list screen.
 */
export interface AdminUserDetail {
  user: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    is_active: boolean;
    avatar: string | null;
    created_at: string | null;
    /** Present (non-null) when this user account IS a pharmacy's login. */
    pharmacy?: { id: number } | null;
  };
}

/** A medicine request row. */
export interface AdminMedicineRequest {
  id: number;
  trade_name: string | null;
  trade_name_ar: string | null;
  generic_name: string | null;
  active_ingredient: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string | null;
  pharmacy?: { id: number; pharmacy_name: string } | null;
  category?: { id: number; name_ar: string } | null;
  subcategory?: { id: number; name_ar: string } | null;
}

export interface AdminMedicineRequestsResponse {
  requests: AdminMedicineRequest[];
  pagination: Pagination;
  filters: { q: string; status: string };
  stats: { pending: number; approved: number; rejected: number };
}

/** A category row. */
export interface AdminCategory {
  id: number;
  name_ar: string;
  name_en: string | null;
  slug: string | null;
  /** Raw stored path/URL from the `categories.image` column — may be null. */
  image: string | null;
  is_active: boolean;
  sort_order: number | null;
  category_medicine_links_count: number;
  needs_review_count: number;
  subcategories?: { id: number; name_ar: string }[];
}

export interface AdminCategoriesResponse {
  categories: AdminCategory[];
  pagination: Pagination;
  filters: { q: string };
  stats: { total: number; active: number; links: number; needs_review: number };
}

/** A category↔medicine link. */
export interface AdminCategoryLink {
  id: number;
  type: 'moh' | 'medicine';
  medicine_id: number | null;
  moh_product_id: number | null;
  moh_drug_id: number | null;
  name: string | null;
  source: string | null;
  confidence: number | null;
  needs_review: boolean;
}

export interface AdminCategoryLinksResponse {
  links: AdminCategoryLink[];
  pagination: Pagination;
}

/** An activity-log row. */
export interface AdminLogRow {
  id: number;
  description: string | null;
  event: string | null;
  subject_type: string | null;
  causer_name: string | null;
  properties: Record<string, unknown> | null;
  created_at: string | null;
}

export interface AdminLogsResponse {
  logs: AdminLogRow[];
  pagination: Pagination;
  filters: { q: string; event: string; date: string };
}

/** Settings page payload. */
export interface AdminSettingsResponse {
  settings: Record<string, string>;
  catalog_count: number;
  catalog_file_exists: boolean;
  catalog_file_size: number;
}

/** One distance fee tier from `GET /api/admin/delivery-pricing`. */
export interface DeliveryFeeTier {
  id: number;
  min_distance_meters: number;
  /** `null` = open-ended (no upper bound) — allowed only on the LAST active tier. */
  max_distance_meters: number | null;
  /** Server-computed convenience value: `min_distance_meters / 1000`. */
  min_distance_km: number;
  max_distance_km: number | null;
  fee: number;
  is_active: boolean;
}

/** The active pricing mode — one mode only, never combined. */
export type DeliveryPricingMode = 'tiers' | 'per_km';

/** `GET /api/admin/delivery-pricing` → `data`. */
export interface AdminDeliveryPricingResponse {
  enabled: boolean;
  mode: DeliveryPricingMode;
  /** Fallback final fee when no active tier matches (`tiers` mode). `null` = reject. */
  base_fee: number | null;
  /** Charged as `rate × distance(km)` in `per_km` mode. `null` = not configured. */
  per_km_rate: number | null;
  tiers: DeliveryFeeTier[];
}

/**
 * The signed-in admin's own profile — `GET /api/admin/profile`.
 *
 * 🔴 `avatar_url` is a RESOLVED absolute URL, not the raw `users.avatar`
 * column. The Blade profile page passes the raw column through
 * `Image::thumbUrl`; the API resolves it server-side with `Image::url` (the
 * same split used for `AdminMedicine.image_url`). Sending the raw column would
 * force every client to know the storage layout — and on this project all
 * images are Cloudinary, whose stored value is NOT directly loadable.
 *
 * `phone` is nullable: an admin created before the phone column was required
 * has NULL there, and the screen must render `—` rather than "null".
 */
export interface AdminProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
}

// ?? Payments ????????????????????????????????????????????????????????????????

export type PaymentStatus =
  | 'pending'
  | 'under_review'
  | 'paid'
  | 'rejected'
  | 'problem_reported';

export type PaymentSubmissionStatus = 'under_review' | 'approved' | 'rejected';
export type PaymentProblemStatus = 'open' | 'resolved';
export type PaymentProblemCategory = 'bank_details' | 'amount' | 'receipt' | 'other';

export interface PaymentBank {
  id: number;
  bank_name: string;
  account_holder: string;
  account_number: string;
  iban: string | null;
  branch: string | null;
  instructions: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface AdminPaymentBanksResponse {
  banks: PaymentBank[];
  active_count: number;
  max_active: number;
}

export interface AdminPaymentPatient {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}

/**
 * Result of comparing the patient-declared transfer amount against the order's
 * grand total, computed server-side at receipt-upload time (Phase 2 contract).
 *
 * `matches`         — declared amount equals grand_total
 * `under`           — declared amount is LESS than grand_total (deficit = grand_total - amount)
 * `over`            — declared amount is MORE than grand_total (overage = amount - grand_total)
 */
export type AmountStatus = 'matches' | 'under' | 'over';

export interface AdminPaymentSubmission {
  id: number;
  order_id: number;
  bank_id: number | null;
  bank_name: string;
  account_holder: string;
  account_number: string;
  iban: string | null;
  amount: number;
  /**
   * The order's `grand_total` at the moment the receipt was uploaded — a
   * snapshot, NOT the live order total. `null` when unknown / not snapshotted.
   * Used only to detect that the order total drifted since the receipt was
   * uploaded; the live `grand_total` from the order summary is the reference
   * shown for "amount due".
   */
  order_grand_total: number | null;
  /**
   * Reconciliation state of `amount` vs `order_grand_total` at receipt time.
   */
  amount_status: AmountStatus;
  /**
   * Surplus when `amount_status === 'over'` (amount - grand_total).
   * `0` otherwise. The backend does NOT auto-refund this.
   */
  overage_amount: number;
  sender_name: string | null;
  transfer_reference: string | null;
  transferred_at: string | null;
  receipt_original_name: string;
  receipt_mime: string;
  receipt_size: number;
  status: PaymentSubmissionStatus;
  review_note: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

export interface AdminPaymentProblem {
  id: number;
  order_id: number;
  submission_id: number | null;
  category: PaymentProblemCategory;
  message: string;
  status: PaymentProblemStatus;
  admin_note: string | null;
  resolved_by: number | null;
  resolved_at: string | null;
  created_at: string | null;
  payment_status?: PaymentStatus | null;
  patient?: AdminPaymentPatient | null;
}

export interface AdminPaymentRow {
  order_id: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  grand_total: number;
  patient: AdminPaymentPatient | null;
  latest_submission_id: number | null;
  latest_submission_status: PaymentSubmissionStatus | null;
  open_problem_id: number | null;
  created_at: string | null;
}

export interface AdminPaymentOrderSummary {
  order_id: number;
  status: string;
  payment_status: PaymentStatus;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  total: number;
  delivery_fee: number;
  grand_total: number;
  patient: AdminPaymentPatient | null;
  created_at: string | null;
}

export interface AdminPaymentDetail {
  order: AdminPaymentOrderSummary;
  payment: {
    can_approve: boolean;
    can_reject: boolean;
    latest_submission_id: number | null;
  };
  submissions: AdminPaymentSubmission[];
  problems: AdminPaymentProblem[];
  banks: PaymentBank[];
}

export interface AdminPaymentsResponse {
  payments: AdminPaymentRow[];
  pagination: Pagination;
}

/**
 * Payload the backend attaches to a `422 amount_unmatched` rejection from
 * `POST /api/admin/payments/{id}/approve`.
 *
 * Returned when the latest receipt's declared `amount` does not equal the
 * order's CURRENT `grand_total` (either it was under/over at submission, or the
 * order total drifted since the receipt snapshot was taken). The backend does
 * NOT mutate the order; approval must be retried with a matching receipt.
 *
 * Exactly one of `deficit` / `overage` is present; `grand_total` is the live
 * amount-due the server compared against.
 */
export interface PaymentAmountUnmatched {
  code: 'amount_unmatched';
  deficit?: number;
  overage?: number;
  grand_total: number;
}

/** Typed view of a parsed `amount_unmatched` error body, or null. */
export type AmountUnmatchedError = PaymentAmountUnmatched | null;

export interface AdminPaymentProblemsResponse {
  problems: AdminPaymentProblem[];
  pagination: Pagination;
}
