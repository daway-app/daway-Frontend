import type { ApiClient } from './client';
import type { ApiSuccess } from './types';
import type {
  AccountingRange,
  ApiAccountingOverview,
  ApiAlternativeBlock,
  ApiBarcodeMedicine,
  ApiCategory,
  ApiImportSession,
  ApiCashResponse,
  ApiCustomer,
  ApiCustomerDetail,
  ApiCustomersList,
  ApiDashboardStats,
  ApiExpense,
  ApiExpenseCategory,
  ApiExpensesList,
  ApiInquiry,
  ApiInquiryCounts,
  ApiInquiryList,
  ApiInquiryMessage,
  ApiInventoryItem,
  ApiInventoryList,
  ApiInventoryStats,
  ApiPharmacyProfile,
  ApiRating,
  ApiRefundDetail,
  ApiRefundForSale,
  ApiRefundRow,
  ApiRefundableItems,
  ApiSale,
  ApiSalesList,
  ApiSalesStats,
  ApiSalesSummary,
  ApiSearchableMedicine,
  ApiSuppliersList,
  Paginated,
} from './pharmacyTypes';

/**
 * Pharmacy endpoints — every path verified from `routes/api.php`.
 *
 * All of these live under `auth:sanctum` + `role:pharmacy`, so the client
 * attaches the Bearer token automatically. Nothing here sets a token manually.
 *
 * The module returns the **`data` payload only**: the envelope (`success` /
 * `message`) is unwrapped once, here, so feature code never writes
 * `response.data.data`. Envelope fields that are siblings of `data`
 * (`pagination`, `stats`, `counts`) are re-attached where relevant, because
 * they are part of the same logical response.
 */

const P = {
  dashboardStats: '/api/pharmacy/dashboard/stats',

  inventory: '/api/pharmacy/inventory',
  inventoryBulk: '/api/pharmacy/inventory/bulk',
  inventoryImport: '/api/pharmacy/inventory/import',

  medicines: '/api/pharmacy/medicines',
  medicinesSearch: '/api/pharmacy/medicines/search',
  medicinesByName: '/api/pharmacy/medicines/by-name',
  medicineRequests: '/api/pharmacy/medicine-requests',

  inquiries: '/api/pharmacy/inquiries',
  ratings: '/api/pharmacy/ratings',

  alternatives: '/api/pharmacy/alternatives',

  profile: '/api/profile/pharmacy',
  changePassword: '/api/pharmacy/change-password',

  accOverview: '/api/pharmacy/accounting/overview',
  accSales: '/api/pharmacy/accounting/sales',
  accSalesSummary: '/api/pharmacy/accounting/sales-summary',
  accRefunds: '/api/pharmacy/accounting/refunds',
  accCash: '/api/pharmacy/accounting/cash',
  accCashAdjustments: '/api/pharmacy/accounting/cash/adjustments',
  accExpenses: '/api/pharmacy/accounting/expenses',
  accExpenseCategories: '/api/pharmacy/accounting/expense-categories',
  accCustomers: '/api/pharmacy/accounting/customers',
  accSuppliers: '/api/pharmacy/accounting/suppliers',
} as const;

/** Query values accepted by the API — `undefined`/`null` are dropped by the client. */
type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * The list endpoints put `pagination` (and sometimes `stats`) next to `data`.
 * This lifts both back into one object so the UI gets everything it needs from
 * a single call.
 *
 * `Extra` is the sibling keys the endpoint adds beside `data` (e.g. `stats`).
 * Pass the *full response type* as `R` so the sibling keys are required.
 */
function paginated<T, Extra extends object = object>(
  response: ApiSuccess<T[]> & Extra,
): Paginated<T> & Extra {
  const { data, pagination, ...rest } = response;
  return {
    data,
    pagination:
      pagination ?? {
        current_page: 1,
        last_page: 1,
        per_page: data.length,
        total: data.length,
      },
    ...(rest as Extra),
  };
}

/** The siblings an endpoint sends beside `data` on a list response. */
type ListEnvelope<T, Extra extends object> = ApiSuccess<T[]> & Extra;

export function createPharmacyApi(client: ApiClient) {
  return {
    // ══════════════════════════════════════════════════════════════════
    // Dashboard
    // ══════════════════════════════════════════════════════════════════

    async dashboardStats(signal?: AbortSignal): Promise<ApiDashboardStats> {
      const res = await client.get<ApiSuccess<ApiDashboardStats>>(
        P.dashboardStats,
        { signal },
      );
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Inventory
    // ══════════════════════════════════════════════════════════════════

    async inventory(query?: Query, signal?: AbortSignal): Promise<ApiInventoryList> {
      const res = await client.get<ListEnvelope<ApiInventoryItem, { stats: ApiInventoryStats }>>(
        P.inventory,
        { query, signal },
      );
      return paginated<ApiInventoryItem, { stats: ApiInventoryStats }>(res);
    },

    async updateInventory(
      pharmacyMedicineId: number,
      body: { quantity: number; is_available?: boolean },
    ): Promise<ApiInventoryItem> {
      const res = await client.put<ApiSuccess<ApiInventoryItem>>(
        `${P.inventory}/${pharmacyMedicineId}`,
        body,
      );
      return res.data;
    },

    async bulkUpdateInventory(
      items: Array<{ id: number; quantity: number; is_available?: boolean }>,
    ): Promise<{ updated_count: number }> {
      const res = await client.post<ApiSuccess<{ updated_count: number }>>(
        P.inventoryBulk,
        { items },
      );
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Medicines
    // ══════════════════════════════════════════════════════════════════

    async searchMedicines(
      q: string,
      signal?: AbortSignal,
    ): Promise<ApiSearchableMedicine[]> {
      const res = await client.get<ApiSuccess<ApiSearchableMedicine[]>>(
        P.medicinesSearch,
        { query: { q }, signal },
      );
      return res.data;
    },

    async requestMedicine(body: Record<string, unknown>): Promise<unknown> {
      const res = await client.post<ApiSuccess<unknown>>(P.medicineRequests, body);
      return res.data;
    },

    /**
     * Medicine categories — `GET /api/categories` (public, read-only).
     *
     * Used by the "request a new medicine" form, whose `category_id` is required
     * and validated with `exists:categories,id`.
     */
    async categories(signal?: AbortSignal): Promise<ApiCategory[]> {
      const res = await client.get<ApiSuccess<ApiCategory[]>>('/api/categories', {
        signal,
        skipAuth: true,
      });
      return res.data;
    },

    /**
     * Resolve a barcode to a CATALOGUE medicine.
     *
     * `GET /api/medicines/barcode/{barcode}` is a public, read-only route
     * (throttled 60/min) that reads Daway's own `medicine_barcodes` table — it
     * does NOT call an external provider per request.
     *
     * The result is catalogue data only (no pharmacy quantity/price), so the POS
     * matches it onto an inventory row via `medicine.local_medicine_id`.
     */
    async medicineByBarcode(
      barcode: string,
      signal?: AbortSignal,
    ): Promise<ApiBarcodeMedicine> {
      const res = await client.get<ApiSuccess<ApiBarcodeMedicine>>(
        `/api/medicines/barcode/${encodeURIComponent(barcode)}`,
        { signal, skipAuth: true },
      );
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Inquiries
    // ══════════════════════════════════════════════════════════════════

    async inquiries(query?: Query, signal?: AbortSignal): Promise<ApiInquiryList> {
      const res = await client.get<ListEnvelope<ApiInquiry, { counts: ApiInquiryCounts }>>(
        P.inquiries,
        { query, signal },
      );
      return paginated<ApiInquiry, { counts: ApiInquiryCounts }>(res);
    },

    async inquiry(id: number | string, signal?: AbortSignal): Promise<ApiInquiry> {
      const res = await client.get<ApiSuccess<ApiInquiry>>(
        `${P.inquiries}/${id}`,
        { signal },
      );
      return res.data;
    },

    async updateInquiry(
      id: number | string,
      body: { status?: string; reply?: string; availability_status?: string },
    ): Promise<ApiInquiry> {
      const res = await client.put<ApiSuccess<ApiInquiry>>(
        `${P.inquiries}/${id}`,
        body,
      );
      return res.data;
    },

    async inquiryMessages(
      id: number | string,
      options?: { markRead?: boolean; signal?: AbortSignal },
    ): Promise<Paginated<ApiInquiryMessage>> {
      const res = await client.get<ApiSuccess<ApiInquiryMessage[]>>(
        `${P.inquiries}/${id}/messages`,
        {
          query: options?.markRead ? { mark_read: 1 } : undefined,
          signal: options?.signal,
        },
      );
      return paginated(res);
    },

    async sendInquiryMessage(
      id: number | string,
      body: { message: string },
    ): Promise<ApiInquiryMessage> {
      const res = await client.post<ApiSuccess<ApiInquiryMessage>>(
        `${P.inquiries}/${id}/messages`,
        body,
      );
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Ratings
    // ══════════════════════════════════════════════════════════════════

    async ratings(query?: Query, signal?: AbortSignal): Promise<Paginated<ApiRating>> {
      const res = await client.get<ApiSuccess<ApiRating[]>>(P.ratings, {
        query,
        signal,
      });
      return paginated(res);
    },

    // ══════════════════════════════════════════════════════════════════
    // Alternatives
    // ══════════════════════════════════════════════════════════════════

    async alternatives(signal?: AbortSignal): Promise<ApiAlternativeBlock[]> {
      const res = await client.get<ApiSuccess<ApiAlternativeBlock[]>>(
        P.alternatives,
        { signal },
      );
      return res.data;
    },

    async addAlternative(baseMedicineId: number, alternativeId: number): Promise<void> {
      await client.post<ApiSuccess<unknown>>(P.alternatives, {
        base_medicine_id: baseMedicineId,
        alternative_id: alternativeId,
      });
    },

    async removeAlternative(baseId: number, alternativeId: number): Promise<void> {
      await client.delete<ApiSuccess<unknown>>(
        `${P.alternatives}/${baseId}/${alternativeId}`,
      );
    },

    // ══════════════════════════════════════════════════════════════════
    // Profile
    // ══════════════════════════════════════════════════════════════════

    async profile(signal?: AbortSignal): Promise<ApiPharmacyProfile> {
      const res = await client.get<ApiSuccess<ApiPharmacyProfile>>(P.profile, {
        signal,
      });
      return res.data;
    },

    async updateProfile(body: Record<string, unknown>): Promise<ApiPharmacyProfile> {
      const res = await client.post<ApiSuccess<ApiPharmacyProfile>>(P.profile, body);
      return res.data;
    },

    /**
     * Change the pharmacy password.
     *
     * The backend **deletes all tokens** when a password is supplied, so the
     * caller must treat this as a forced re-login. Sending no password merely
     * clears `must_change_password`.
     */
    async changePassword(body: {
      password?: string;
      password_confirmation?: string;
    }): Promise<{ message?: string }> {
      return client.post<ApiSuccess<unknown> & { message: string }>(
        P.changePassword,
        body,
      );
    },

    // ══════════════════════════════════════════════════════════════════
    // Accounting — overview
    // ══════════════════════════════════════════════════════════════════

    async accountingOverview(
      range: AccountingRange = 'today',
      signal?: AbortSignal,
    ): Promise<ApiAccountingOverview> {
      const res = await client.get<ApiSuccess<ApiAccountingOverview>>(P.accOverview, {
        query: { range },
        signal,
      });
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Inventory import
    // ══════════════════════════════════════════════════════════════════

    /**
     * Absolute URL of the xlsx template download.
     *
     * This is a file download, not a JSON call, so it must be a plain link —
     * fetching it through the API client would try to parse a binary body.
     * `mode: 'current'` exports the pharmacy's existing inventory instead of an
     * empty template.
     */
    templateUrl(mode: 'empty' | 'current' = 'empty'): string {
      const q = mode === 'current' ? '?mode=current' : '';
      return `${client.baseUrl}/api/pharmacy/inventory/import/template${q}`;
    },

    /** Upload a spreadsheet and get a DRY-RUN preview (no inventory writes). */
    async previewImport(file: File): Promise<ApiImportSession> {
      const form = new FormData();
      form.append('file', file);
      const res = await client.post<ApiSuccess<ApiImportSession>>(
        P.inventoryImport,
        form,
      );
      return res.data;
    },

    async importSession(uuid: string, signal?: AbortSignal): Promise<ApiImportSession> {
      const res = await client.get<ApiSuccess<ApiImportSession>>(
        `${P.inventoryImport}/${encodeURIComponent(uuid)}`,
        { signal },
      );
      return res.data;
    },

    async decideImport(
      uuid: string,
      body: Record<string, unknown>,
    ): Promise<ApiImportSession> {
      const res = await client.post<ApiSuccess<ApiImportSession>>(
        `${P.inventoryImport}/${encodeURIComponent(uuid)}/decide`,
        body,
      );
      return res.data;
    },

    async commitImport(uuid: string): Promise<ApiImportSession> {
      const res = await client.post<ApiSuccess<ApiImportSession>>(
        `${P.inventoryImport}/${encodeURIComponent(uuid)}/commit`,
      );
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Accounting — sales
    // ══════════════════════════════════════════════════════════════════

    async sales(query?: Query, signal?: AbortSignal): Promise<ApiSalesList> {
      const res = await client.get<ListEnvelope<ApiSale, { stats: ApiSalesStats }>>(
        P.accSales,
        { query, signal },
      );
      return paginated<ApiSale, { stats: ApiSalesStats }>(res);
    },

    async salesSummary(
      query?: Query,
      signal?: AbortSignal,
    ): Promise<ApiSalesSummary> {
      const res = await client.get<ApiSuccess<ApiSalesSummary>>(P.accSalesSummary, {
        query,
        signal,
      });
      return res.data;
    },

    /**
     * A single sale. `number` is the invoice number (`INV-1042`), not an id —
     * the backend resolves by number scoped to the pharmacy.
     */
    async sale(number: string, signal?: AbortSignal): Promise<ApiSale> {
      const res = await client.get<ApiSuccess<ApiSale>>(
        `${P.accSales}/${encodeURIComponent(number)}`,
        { signal },
      );
      return res.data;
    },

    async createSale(body: Record<string, unknown>): Promise<ApiSale> {
      const res = await client.post<ApiSuccess<ApiSale>>(P.accSales, body);
      return res.data;
    },

    async cancelSale(number: string): Promise<ApiSale> {
      const res = await client.post<ApiSuccess<ApiSale>>(
        `${P.accSales}/${encodeURIComponent(number)}/cancel`,
      );
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Accounting — refunds
    // ══════════════════════════════════════════════════════════════════

    async refunds(query?: Query, signal?: AbortSignal): Promise<Paginated<ApiRefundRow>> {
      const res = await client.get<ApiSuccess<ApiRefundRow[]>>(P.accRefunds, {
        query,
        signal,
      });
      return paginated(res);
    },

    async refund(id: number, signal?: AbortSignal): Promise<ApiRefundDetail> {
      const res = await client.get<ApiSuccess<ApiRefundDetail>>(
        `${P.accRefunds}/${id}`,
        { signal },
      );
      return res.data;
    },

    async refundsForSale(
      saleNumber: string,
      signal?: AbortSignal,
    ): Promise<ApiRefundForSale[]> {
      const res = await client.get<ApiSuccess<ApiRefundForSale[]>>(
        `${P.accSales}/${encodeURIComponent(saleNumber)}/refunds`,
        { signal },
      );
      return res.data;
    },

    /** Refundable quantities — already net of prior refunds. */
    async refundableItems(
      saleNumber: string,
      signal?: AbortSignal,
    ): Promise<ApiRefundableItems> {
      const res = await client.get<ApiSuccess<ApiRefundableItems>>(
        `${P.accSales}/${encodeURIComponent(saleNumber)}/refund-items`,
        { signal },
      );
      return res.data;
    },

    async createRefund(body: {
      sale_number: string;
      items: Array<{ sale_item_id: number; quantity: number }>;
      reason?: string;
      refunded_at?: string;
    }): Promise<unknown> {
      const res = await client.post<ApiSuccess<unknown>>(P.accRefunds, body);
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Accounting — cash
    // ══════════════════════════════════════════════════════════════════

    async cash(query?: Query, signal?: AbortSignal): Promise<ApiCashResponse> {
      const res = await client.get<
        ApiSuccess<ApiCashResponse['data']> & {
          stats: ApiCashResponse['stats'];
          period: ApiCashResponse['period'];
        }
      >(P.accCash, { query, signal });

      return {
        ...paginated(res),
        stats: res.stats,
        period: res.period,
      };
    },

    async cashAdjustment(body: {
      direction: 'in' | 'out';
      kind: 'withdrawal' | 'deposit' | 'adjustment';
      amount: number;
      reason: string;
      moved_at?: string;
    }): Promise<{
      movement: { id: number; direction: string; amount: number };
      balance_now: number;
      is_low: boolean;
      warning: string | null;
    }> {
      const res = await client.post<ApiSuccess<{
        movement: { id: number; direction: string; amount: number };
        balance_now: number;
        is_low: boolean;
        warning: string | null;
      }>>(P.accCashAdjustments, body);
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Accounting — expenses
    // ══════════════════════════════════════════════════════════════════

    async expenses(query?: Query, signal?: AbortSignal): Promise<ApiExpensesList> {
      const res = await client.get<
        ListEnvelope<ApiExpense, { stats: ApiExpensesList['stats'] }>
      >(P.accExpenses, { query, signal });
      return paginated<ApiExpense, { stats: ApiExpensesList['stats'] }>(res);
    },

    async expenseCategories(signal?: AbortSignal): Promise<ApiExpenseCategory[]> {
      const res = await client.get<ApiSuccess<ApiExpenseCategory[]>>(
        P.accExpenseCategories,
        { signal },
      );
      return res.data;
    },

    async createExpense(body: Record<string, unknown>): Promise<ApiExpense> {
      const res = await client.post<ApiSuccess<ApiExpense>>(P.accExpenses, body);
      return res.data;
    },

    async cancelExpense(id: number): Promise<ApiExpense> {
      const res = await client.post<ApiSuccess<ApiExpense>>(
        `${P.accExpenses}/${id}/cancel`,
      );
      return res.data;
    },

    // ══════════════════════════════════════════════════════════════════
    // Accounting — parties
    // ══════════════════════════════════════════════════════════════════

    async customers(query?: Query, signal?: AbortSignal): Promise<ApiCustomersList> {
      const res = await client.get<
        ListEnvelope<ApiCustomer, { stats: ApiCustomersList['stats'] }>
      >(P.accCustomers, { query, signal });
      return paginated<ApiCustomer, { stats: ApiCustomersList['stats'] }>(res);
    },

    async customer(id: number, signal?: AbortSignal): Promise<ApiCustomerDetail> {
      const res = await client.get<ApiSuccess<ApiCustomerDetail>>(
        `${P.accCustomers}/${id}`,
        { signal },
      );
      return res.data;
    },

    async createCustomer(body: Record<string, unknown>): Promise<ApiCustomer> {
      const res = await client.post<ApiSuccess<ApiCustomer>>(P.accCustomers, body);
      return res.data;
    },

    async customersForPicker(
      query?: Query,
      signal?: AbortSignal,
    ): Promise<ApiCustomer[]> {
      const res = await this.customers({ per_page: 100, ...query }, signal);
      return res.data;
    },

    async suppliers(query?: Query, signal?: AbortSignal): Promise<ApiSuppliersList> {
      const res = await client.get<ApiSuccess<ApiSuppliersList['data']> & {
        stats: ApiSuppliersList['stats'];
      }>(P.accSuppliers, { query, signal });

      return {
        data: res.data,
        stats: res.stats ?? { total_payables: 0, suppliers_count: 0 },
      };
    },
  };
}

export type PharmacyApi = ReturnType<typeof createPharmacyApi>;
