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

/** A user row from `GET /api/admin/users`. */
export interface AdminUserRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  pagination: Pagination;
  filters: { q: string; role: string };
  role_counts: { admin: number; pharmacy: number; patient: number };
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

/** A patient row (a user with role=patient). */
export interface AdminPatient {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
}

export interface AdminPatientsResponse {
  patients: AdminPatient[];
  pagination: Pagination;
  filters: { q: string };
  total_patients: number;
}

/** One inventory (catalog-wide) row. */
export interface AdminInventoryRow {
  id: number;
  trade_name: string;
  scientific_name: string | null;
  pharmacy_medicines_sum_quantity: number;
  pharmacy_medicines_count: number;
}

export interface AdminInventoryResponse {
  medicines: AdminInventoryRow[];
  pagination: Pagination;
  stock_summary: {
    total_items: number;
    in_stock: number;
    low_stock: number;
    out_of_stock: number;
  };
}

/** A category row. */
export interface AdminCategory {
  id: number;
  name_ar: string;
  name_en: string | null;
  slug: string | null;
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
