import type { ApiClient } from './client';
import type {
  AdminCategoriesResponse,
  AdminCategoryLinksResponse,
  AdminDashboardResponse,
  AdminInventoryResponse,
  AdminLogsResponse,
  AdminMedicineRequestsResponse,
  AdminMedicinesResponse,
  AdminPatientsResponse,
  AdminPharmaciesResponse,
  AdminPharmacy,
  AdminSettingsResponse,
  AdminUsersResponse,
  DeliveredCredentials,
} from './adminTypes';

/**
 * Admin API — paths verified from `routes/api.php`.
 *
 * Every route here sits behind `auth:sanctum` + `role:admin`, so a pharmacy or
 * patient token receives 403 regardless of what the UI shows. The UI's guard is
 * a convenience, not the security boundary.
 */
export const ADMIN_ENDPOINTS = {
  login: '/api/login/admin',
  dashboard: '/api/admin/dashboard',
  pharmacies: '/api/admin/pharmacies',
  pharmacy: (id: number) => `/api/admin/pharmacies/${id}`,
  pharmacyToggle: (id: number) => `/api/admin/pharmacies/${id}/toggle-status`,
  pharmacyReset: (id: number) => `/api/admin/pharmacies/${id}/reset-credentials`,
  medicines: '/api/admin/medicines',
  medicineRequests: '/api/admin/medicine-requests',
  medicineRequest: (id: number) => `/api/admin/medicine-requests/${id}`,
  medicineRequestApprove: (id: number) => `/api/admin/medicine-requests/${id}/approve`,
  medicineRequestReject: (id: number) => `/api/admin/medicine-requests/${id}/reject`,
  users: '/api/admin/users',
  user: (id: number) => `/api/admin/users/${id}`,
  userToggle: (id: number) => `/api/admin/users/${id}/toggle-status`,
  patients: '/api/admin/patients',
  inventory: '/api/admin/inventory',
  categories: '/api/admin/categories',
  categoryToggle: (id: number) => `/api/admin/categories/${id}/toggle-status`,
  categoryLinks: (id: number) => `/api/admin/categories/${id}/links`,
  logs: '/api/admin/logs',
  settings: '/api/admin/settings',
} as const;

export interface AdminListParams {
  q?: string;
  status?: string;
  role?: string;
  event?: string;
  date?: string;
  page?: number;
  per_page?: number;
}

/** Drop blank params so the URL stays clean and Laravel sees no empty filters. */
function clean(params: AdminListParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export function createAdminApi(client: ApiClient) {
  return {
    // ── Auth ────────────────────────────────────────────────────────────────
    async login(email: string, password: string) {
      return client.post<{
        success: boolean;
        message: string;
        data: { user: { id: number; name: string; email: string | null; role: string }; token: string };
      }>(ADMIN_ENDPOINTS.login, { email, password }, { skipAuth: true });
    },

    // ── Dashboard ───────────────────────────────────────────────────────────
    async dashboard(signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminDashboardResponse }>(
        ADMIN_ENDPOINTS.dashboard,
        { signal },
      );
      return res.data;
    },

    // ── Pharmacies ──────────────────────────────────────────────────────────
    async pharmacies(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminPharmaciesResponse }>(
        ADMIN_ENDPOINTS.pharmacies,
        { query: clean(params), signal },
      );
      return res.data;
    },

    async pharmacy(id: number, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: { pharmacy: AdminPharmacy } }>(
        ADMIN_ENDPOINTS.pharmacy(id),
        { signal },
      );
      return res.data;
    },

    async createPharmacy(pharmacy_name: string) {
      const res = await client.post<{
        success: boolean;
        message: string;
        data: { credentials: DeliveredCredentials };
      }>(ADMIN_ENDPOINTS.pharmacies, { pharmacy_name });
      return res;
    },

    async updatePharmacy(id: number, body: Record<string, unknown>) {
      return client.put<{ success: boolean; message: string }>(ADMIN_ENDPOINTS.pharmacy(id), body);
    },

    async deletePharmacy(id: number) {
      return client.delete<{ success: boolean; message: string }>(ADMIN_ENDPOINTS.pharmacy(id));
    },

    /**
     * Toggle a pharmacy's active state.
     *
     * Returns `credentials` ONLY when a previously-undelivered pharmacy is being
     * activated — that is the one moment the password becomes visible.
     */
    async togglePharmacy(id: number) {
      const res = await client.patch<{
        success: boolean;
        message: string;
        data: { is_active: boolean; credentials: DeliveredCredentials | null };
      }>(ADMIN_ENDPOINTS.pharmacyToggle(id));
      return res.data;
    },

    async resetPharmacyCredentials(id: number) {
      const res = await client.patch<{
        success: boolean;
        message: string;
        data: { credentials: DeliveredCredentials };
      }>(ADMIN_ENDPOINTS.pharmacyReset(id));
      return res;
    },

    // ── Medicines ───────────────────────────────────────────────────────────
    async medicines(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminMedicinesResponse }>(
        ADMIN_ENDPOINTS.medicines,
        { query: clean(params), signal },
      );
      return res.data;
    },

    // ── Medicine requests ───────────────────────────────────────────────────
    async medicineRequests(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminMedicineRequestsResponse }>(
        ADMIN_ENDPOINTS.medicineRequests,
        { query: clean(params), signal },
      );
      return res.data;
    },

    async approveMedicineRequest(id: number, body: Record<string, unknown>) {
      return client.post<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.medicineRequestApprove(id),
        body,
      );
    },

    async rejectMedicineRequest(id: number, admin_notes: string) {
      return client.post<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.medicineRequestReject(id),
        { admin_notes },
      );
    },

    // ── Users ───────────────────────────────────────────────────────────────
    async users(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminUsersResponse }>(
        ADMIN_ENDPOINTS.users,
        { query: clean(params), signal },
      );
      return res.data;
    },

    async updateUser(id: number, body: Record<string, unknown>) {
      return client.put<{ success: boolean; message: string }>(ADMIN_ENDPOINTS.user(id), body);
    },

    async deleteUser(id: number) {
      return client.delete<{ success: boolean; message: string }>(ADMIN_ENDPOINTS.user(id));
    },

    async toggleUser(id: number) {
      const res = await client.patch<{
        success: boolean;
        message: string;
        data: { is_active: boolean };
      }>(ADMIN_ENDPOINTS.userToggle(id));
      return res.data;
    },

    // ── Patients + inventory (read-only) ────────────────────────────────────
    async patients(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminPatientsResponse }>(
        ADMIN_ENDPOINTS.patients,
        { query: clean(params), signal },
      );
      return res.data;
    },

    async inventory(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminInventoryResponse }>(
        ADMIN_ENDPOINTS.inventory,
        { query: clean(params), signal },
      );
      return res.data;
    },

    // ── Categories ──────────────────────────────────────────────────────────
    async categories(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminCategoriesResponse }>(
        ADMIN_ENDPOINTS.categories,
        { query: clean(params), signal },
      );
      return res.data;
    },

    async toggleCategory(id: number) {
      const res = await client.patch<{
        success: boolean;
        message: string;
        data: { is_active: boolean };
      }>(ADMIN_ENDPOINTS.categoryToggle(id));
      return res.data;
    },

    async categoryLinks(id: number, params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminCategoryLinksResponse }>(
        ADMIN_ENDPOINTS.categoryLinks(id),
        { query: clean(params), signal },
      );
      return res.data;
    },

    async approveCategoryLink(categoryId: number, linkId: number) {
      return client.post<{ success: boolean; message: string }>(
        `/api/admin/categories/${categoryId}/review/${linkId}`,
      );
    },

    async detachCategoryLink(categoryId: number, linkId: number) {
      return client.delete<{ success: boolean; message: string }>(
        `/api/admin/categories/${categoryId}/medicines/${linkId}`,
      );
    },

    // ── Logs + settings ─────────────────────────────────────────────────────
    async logs(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminLogsResponse }>(
        ADMIN_ENDPOINTS.logs,
        { query: clean(params), signal },
      );
      return res.data;
    },

    async settings(signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminSettingsResponse }>(
        ADMIN_ENDPOINTS.settings,
        { signal },
      );
      return res.data;
    },

    async updateSettings(body: Record<string, unknown>) {
      return client.post<{ success: boolean; message: string }>(ADMIN_ENDPOINTS.settings, body);
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
