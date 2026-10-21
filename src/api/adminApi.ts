import type { ApiClient } from './client';
import type {
  AdminCategoriesResponse,
  AdminCategoryLinksResponse,
  AdminDashboardResponse,
  AdminDeliveryPricingResponse,
  AdminLogsResponse,
  AdminMedicineRequestsResponse,
  AdminMedicinesResponse,
  AdminMedicineDetail,
  AdminPharmaciesResponse,
  AdminPharmacy,
  AdminProfile,
  AdminSettingsResponse,
  AdminUsersResponse,
  DeliveryFeeTier,
  AdminUserDetail,
  DeliveredCredentials,
  AdminPaymentBanksResponse,
  AdminPaymentDetail,
  AdminPaymentProblemsResponse,
  AdminPaymentRow,
  AdminPaymentsResponse,
  PaymentBank,
  PaymentProblemStatus,
  PaymentStatus,
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
  pharmacyPasswordResetRequests: '/api/admin/pharmacy-password-reset-requests',
  pharmacyPasswordResetApprove: (id: number) =>
    `/api/admin/pharmacy-password-reset-requests/${id}/approve`,
  pharmacyPasswordResetReject: (id: number) =>
    `/api/admin/pharmacy-password-reset-requests/${id}/reject`,
  medicines: '/api/admin/medicines',
  medicine: (id: number) => `/api/admin/medicines/${id}`,
  medicineRequests: '/api/admin/medicine-requests',
  medicineRequest: (id: number) => `/api/admin/medicine-requests/${id}`,
  medicineRequestApprove: (id: number) => `/api/admin/medicine-requests/${id}/approve`,
  medicineRequestReject: (id: number) => `/api/admin/medicine-requests/${id}/reject`,
  users: '/api/admin/users',
  user: (id: number) => `/api/admin/users/${id}`,
  userToggle: (id: number) => `/api/admin/users/${id}/toggle-status`,
  categories: '/api/admin/categories',
  categoryToggle: (id: number) => `/api/admin/categories/${id}/toggle-status`,
  categoryLinks: (id: number) => `/api/admin/categories/${id}/links`,
  logs: '/api/admin/logs',
  settings: '/api/admin/settings',
  deliveryPricing: '/api/admin/delivery-pricing',
  deliveryPricingStatus: '/api/admin/delivery-pricing/status',
  deliveryPricingSettings: '/api/admin/delivery-pricing/settings',
  deliveryPricingTiers: '/api/admin/delivery-pricing/tiers',
  deliveryPricingTier: (id: number) => `/api/admin/delivery-pricing/tiers/${id}`,
  deliveryPricingTierToggle: (id: number) =>
    `/api/admin/delivery-pricing/tiers/${id}/toggle-status`,
  paymentBanks: '/api/admin/payment-banks',
  paymentBank: (id: number) => `/api/admin/payment-banks/${id}`,
  paymentBankToggle: (id: number) => `/api/admin/payment-banks/${id}/toggle-status`,
  payments: '/api/admin/payments',
  payment: (orderId: number) => `/api/admin/payments/${orderId}`,
  paymentApprove: (orderId: number) => `/api/admin/payments/${orderId}/approve`,
  paymentReject: (orderId: number) => `/api/admin/payments/${orderId}/reject`,
  paymentReceipt: (orderId: number, submissionId: number) =>
    `/api/admin/payments/${orderId}/submissions/${submissionId}/receipt`,
  paymentProblems: '/api/admin/payment-problems',
  paymentProblemResolve: (id: number) => `/api/admin/payment-problems/${id}/resolve`,
  /**
   * Own profile + password change.
   *
   * ⚠️ These are ADMIN-scoped even though a pharmacy equivalent exists
   * (`/api/profile/pharmacy`). The pharmacy route begins with
   * `abort_unless($user->role === 'pharmacy', 403)` — it refuses an admin by
   * design — so pointing the admin screen at it would always 403.
   */
  profile: '/api/admin/profile',
  changePassword: '/api/admin/change-password',
} as const;

export interface AdminListParams {
  q?: string;
  status?: string;
  payment_status?: PaymentStatus | 'all';
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

    // ── طلبات استعادة كلمة مرور الصيدليات ─────────────────────────────────
    // الطلب ينشئه المالك من شاشة الدخول (عام)، والمراجعة من هنا فقط.
    // الموافقة تولّد كلمة مرور جديدة وتُلغي الجلسات القائمة، وتُعيدها مرة
    // واحدة في `credentials` — تُعرض عبر CredentialsModal ولا تُمرَّر أبداً
    // عبر toast أو URL أو log.

    async pharmacyPasswordResetRequests(signal?: AbortSignal) {
      return client.get<{
        success: boolean;
        data: Array<{
          id: number;
          status: 'pending';
          created_at: string | null;
          pharmacy: { id: number; name: string; pharmacy_id: string; phone: string | null };
        }>;
        pagination: { current_page: number; last_page: number; per_page: number; total: number };
      }>(ADMIN_ENDPOINTS.pharmacyPasswordResetRequests, { signal });
    },

    async approvePharmacyPasswordResetRequest(id: number) {
      return client.post<{
        success: boolean;
        message: string;
        data: { credentials: DeliveredCredentials };
      }>(ADMIN_ENDPOINTS.pharmacyPasswordResetApprove(id));
    },

    async rejectPharmacyPasswordResetRequest(id: number, admin_notes = '') {
      return client.post<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.pharmacyPasswordResetReject(id),
        { admin_notes },
      );
    },

    // ── Medicines ───────────────────────────────────────────────────────────
    async medicines(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminMedicinesResponse }>(
        ADMIN_ENDPOINTS.medicines,
        { query: clean(params), signal },
      );
      return res.data;
    },

    async medicine(id: number, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminMedicineDetail }>(
        ADMIN_ENDPOINTS.medicine(id),
        { signal },
      );
      return res.data;
    },

    /**
     * Create a catalogue entry.
     *
     * The backend accepts EITHER an `image` URL (what this client sends, since
     * there is no Cloudinary SDK here) or an uploaded `image_file`. Only the
     * URL form is used by the React screens.
     */
    async createMedicine(body: Record<string, unknown>) {
      const res = await client.post<{ success: boolean; message: string; data: { id: number } }>(
        ADMIN_ENDPOINTS.medicines,
        body,
      );
      return res;
    },

    async updateMedicine(id: number, body: Record<string, unknown>) {
      return client.put<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.medicine(id),
        body,
      );
    },

    async deleteMedicine(id: number) {
      return client.delete<{ success: boolean; message: string }>(ADMIN_ENDPOINTS.medicine(id));
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

    async user(id: number, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminUserDetail }>(
        ADMIN_ENDPOINTS.user(id),
        { signal },
      );
      return res.data;
    },

    async createUser(body: Record<string, unknown>) {
      const res = await client.post<{ success: boolean; message: string; data: { id: number } }>(
        ADMIN_ENDPOINTS.users,
        body,
      );
      return res;
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

    // ── Delivery pricing ────────────────────────────────────────────────────
    async deliveryPricing(signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminDeliveryPricingResponse }>(
        ADMIN_ENDPOINTS.deliveryPricing,
        { signal },
      );
      return res.data;
    },

    async setDeliveryPricingEnabled(enabled: boolean) {
      return client.post<{ success: boolean; message: string; data: { enabled: boolean } }>(
        ADMIN_ENDPOINTS.deliveryPricingStatus,
        { enabled },
      );
    },

    async updateDeliveryPricingSettings(body: Record<string, unknown>) {
      const res = await client.post<{
        success: boolean;
        message: string;
        data: {
          mode: AdminDeliveryPricingResponse['mode'];
          base_fee: number | null;
          per_km_rate: number | null;
        };
      }>(ADMIN_ENDPOINTS.deliveryPricingSettings, body);
      return res.data;
    },

    async createDeliveryFeeTier(body: Record<string, unknown>) {
      const res = await client.post<{
        success: boolean;
        message: string;
        data: { tier: DeliveryFeeTier };
      }>(ADMIN_ENDPOINTS.deliveryPricingTiers, body);
      return res;
    },

    async updateDeliveryFeeTier(id: number, body: Record<string, unknown>) {
      const res = await client.put<{
        success: boolean;
        message: string;
        data: { tier: DeliveryFeeTier };
      }>(ADMIN_ENDPOINTS.deliveryPricingTier(id), body);
      return res;
    },

    async toggleDeliveryFeeTier(id: number) {
      const res = await client.patch<{
        success: boolean;
        message: string;
        data: { is_active: boolean };
      }>(ADMIN_ENDPOINTS.deliveryPricingTierToggle(id));
      return res.data;
    },

    async deleteDeliveryFeeTier(id: number) {
      return client.delete<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.deliveryPricingTier(id),
      );
    },

    // ── Payments ────────────────────────────────────────────────────────────
    async paymentBanks(signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminPaymentBanksResponse }>(
        ADMIN_ENDPOINTS.paymentBanks,
        { signal },
      );
      return res.data;
    },

    async createPaymentBank(body: Record<string, unknown>) {
      const res = await client.post<{
        success: boolean;
        message: string;
        data: { bank: PaymentBank };
      }>(ADMIN_ENDPOINTS.paymentBanks, body);
      return res;
    },

    async updatePaymentBank(id: number, body: Record<string, unknown>) {
      const res = await client.patch<{
        success: boolean;
        message: string;
        data: { bank: PaymentBank };
      }>(ADMIN_ENDPOINTS.paymentBank(id), body);
      return res;
    },

    async togglePaymentBank(id: number) {
      const res = await client.patch<{
        success: boolean;
        message: string;
        data: { bank: PaymentBank };
      }>(ADMIN_ENDPOINTS.paymentBankToggle(id));
      return res;
    },

    async deletePaymentBank(id: number) {
      return client.delete<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.paymentBank(id),
      );
    },

    async payments(params: AdminListParams = {}, signal?: AbortSignal) {
      const res = await client.get<{
        success: boolean;
        data: AdminPaymentRow[];
        pagination: AdminPaymentsResponse['pagination'];
      }>(ADMIN_ENDPOINTS.payments, { query: clean(params), signal });
      return { payments: res.data, pagination: res.pagination };
    },

    async payment(orderId: number, signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: AdminPaymentDetail }>(
        ADMIN_ENDPOINTS.payment(orderId),
        { signal },
      );
      return res.data;
    },

    async approvePayment(orderId: number, reviewNote = '') {
      return client.post<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.paymentApprove(orderId),
        { review_note: reviewNote.trim() || null },
      );
    },

    async rejectPayment(orderId: number, reason: string) {
      return client.post<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.paymentReject(orderId),
        { reason },
      );
    },

    async downloadPaymentReceipt(orderId: number, submissionId: number) {
      return client.download(ADMIN_ENDPOINTS.paymentReceipt(orderId, submissionId));
    },

    async paymentProblems(
      params: { status?: PaymentProblemStatus | 'all'; page?: number; per_page?: number } = {},
      signal?: AbortSignal,
    ) {
      const res = await client.get<{
        success: boolean;
        data: AdminPaymentProblemsResponse['problems'];
        pagination: AdminPaymentProblemsResponse['pagination'];
      }>(ADMIN_ENDPOINTS.paymentProblems, { query: clean(params), signal });
      return { problems: res.data, pagination: res.pagination };
    },

    async resolvePaymentProblem(id: number, adminNote: string) {
      return client.post<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.paymentProblemResolve(id),
        { admin_note: adminNote },
      );
    },

    // ── Own profile ─────────────────────────────────────────────────────────
    async profile(signal?: AbortSignal) {
      const res = await client.get<{ success: boolean; data: { user: AdminProfile } }>(
        ADMIN_ENDPOINTS.profile,
        { signal },
      );
      return res.data;
    },

    /**
     * Change the signed-in admin's password.
     *
     * 🔴 The server DELETES ALL TOKENS on success, so the response is the last
     * thing this session will ever get — the caller must send the user back to
     * the login screen, not continue on a now-dead token.
     *
     * A 422 carries `errors.current_password` / `errors.password`; the screen
     * maps those onto the fields rather than showing one generic message.
     */
    async changePassword(body: {
      current_password: string;
      password: string;
      password_confirmation: string;
    }) {
      return client.post<{ success: boolean; message: string }>(
        ADMIN_ENDPOINTS.changePassword,
        body,
      );
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
