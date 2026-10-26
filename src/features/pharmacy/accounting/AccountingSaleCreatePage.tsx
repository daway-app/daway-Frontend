import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/lang/useLang';
import { AsyncBoundary, Modal } from '@/components/ui';
import { toast } from '@/lib/toast';
import { BarcodeField } from '@/components/pharmacy/BarcodeField';
import { ScanSessionModal } from '@/features/pharmacy/scanner/ScanSessionModal';
import { usePharmacyApi } from '@/auth/authHooks';
import { useAuth } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { pharmacyKeys } from '@/api/queryKeys';
import { money } from '@/lib/format';
import { round2 } from '@/lib/money';
import { readDraft, writeDraft, clearDraft } from '@/lib/drafts';
import type { ApiCustomer, ApiInventoryItem, PaymentMethod } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';
import { buildSalePayload, type CartLine, type SalePayload } from './salePayload';
import { mapAccountingBarcodeResult } from './barcodeResult';
import { pickExactCustomer } from './customerPicker';
import { ApiError } from '@/api/errors';

/**
 * POS "new sale" — live against the real endpoints.
 *
 * Port of `pharmacy/accounting/sale-create.blade.php`. Blade's behaviour lives
 * in `accounting-pos.js` (~800 lines of direct DOM mutation); React replaces the
 * DOM plumbing with state while keeping every *rule* identical:
 *  - barcode scan and name search are EQUAL entry paths (not primary/fallback);
 *  - an item is only addable when the pharmacy actually stocks it;
 *  - `paid > total` is rejected; an empty cart cannot be completed;
 *  - the invoice number is generated at save time, never shown before.
 *
 * Data sources (all real):
 *  - **catalogue** → `GET /api/pharmacy/inventory`. The POS sells from stock, so
 *    the inventory IS the catalogue — it is the only payload carrying the
 *    pharmacy's own `price` AND `quantity`. (`/medicines/search` returns
 *    catalogue rows with neither.)
 *  - **barcode** → `GET /api/pharmacy/accounting/barcode/{code}` (auth). The
 *    single-step resolve: it returns the pharmacy's own stock row
 *    (`pharmacy_medicine_id`), `price` and `quantity` FROM THE SERVER, plus
 *    one of five statuses (`found`|`out_of_stock`|`not_in_stock`|`unknown`|
 *    `ambiguous`). The old `/medicines/barcode` → local-match chain is gone —
 *    it depended on the row being inside the loaded inventory page.
 *  - **customers** → `GET /api/pharmacy/accounting/customers`.
 *  - **save** → `POST /api/pharmacy/accounting/sales`.
 *
 * ⚠️ Known scope limit: NAME search still filters the loaded catalogue page
 * (`INVENTORY_PAGE_SIZE`, the backend's maximum). Barcode lookup does not
 * have that limit anymore — it resolves against the whole inventory row set
 * server-side.
 */


/**
 * The backend validates `per_page` with `max:100`, so this is the largest page
 * that can be requested in ONE call. Exceeding it is a 422, not a bigger page —
 * which is exactly how this screen was broken before.
 */
const INVENTORY_PAGE_SIZE = 100;

/** A sellable line — carries the ids the create-sale payload requires. */
interface CatalogItem {
  pharmacyMedicineId: number;
  medicineId: number | null;
  name: string;
  ingredient: string;
  barcode: string;
  quantity: number;
  price: number;
}

export function AccountingSaleCreatePage() {
  const { STR } = useLang();
  const A = STR.accounting;
  /** Backend `payment_method` enum: `cash,card,bank_transfer,credit`. */
  const PAYMENT_METHODS: ReadonlyArray<{ key: PaymentMethod; label: string }> = [
    { key: 'cash', label: A.payment_methods.cash },
    { key: 'card', label: A.payment_methods.card },
    { key: 'bank_transfer', label: A.payment_methods.bank_transfer },
    { key: 'credit', label: A.payment_methods.credit },
  ];
  const api = usePharmacyApi();
  const { user } = useAuth();
  const keys = pharmacyKeys(user?.id ?? 'anon');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [barcode, setBarcode] = useState('');
  const [scanFound, setScanFound] = useState<CatalogItem | null>(null);
  const [search, setSearch] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [scanNote, setScanNote] = useState(false);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  // Phone-as-scanner: opening this mounts a real scan session (see
  // `ScanSessionModal`). Remote scans arrive at `submitBarcode(code)` — the SAME
  // path as a typed/USB code, so no cart or pricing rule is duplicated.
  const [phoneScannerOpen, setPhoneScannerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  /*
   * Phase 3: cart draft persistence (sessionStorage, identity-scoped).
   *
   * The keep-alive wrapper (KeepAliveOutlet) already preserves the MOUNTED
   * instance across in-session navigation. The draft covers the harder cases:
   * a full page refresh, or a logout/login cycle by the SAME pharmacy. The
   * restored cart is a DRAFT ONLY — prices and stock are re-validated from the
   * live inventory catalogue on submit (buildSalePayload reads the live rows),
   * so a cached cart line can never "prove" a stale price or availability.
   */
  const DRAFT_ROUTE = 'accounting/sales/create';
  const draftLoadedRef = useRef(false);

  // Restore once on mount.
  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    const saved = readDraft<{ cart: CartLine[]; customerId: number | null; customerName: string }>(
      user?.id ?? 'anon',
      DRAFT_ROUTE,
    );
    if (saved?.cart?.length) {
      setCart(saved.cart);
      if (saved.customerId != null) {
        setCustomerId(saved.customerId);
        setCustomerName(saved.customerName ?? '');
        setCustomerQuery(saved.customerName ?? '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore-once on purpose
  }, []);

  // Persist (debounced-ish: coalesced by React batching on each cart mutation).
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (cart.length === 0) {
      clearDraft(user?.id ?? 'anon', DRAFT_ROUTE);
      return;
    }
    writeDraft(user?.id ?? 'anon', DRAFT_ROUTE, { cart, customerId, customerName });
    // customerName is derived state of customerId — tracking both keeps the
    // draft self-contained without depending on the input field value.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cart is the trigger
  }, [cart, customerId, user?.id]);

  const customerTerm = customerQuery.trim();

  useEffect(() => {
    const timer = setTimeout(() => setCustomerSearchTerm(customerTerm), 250);
    return () => clearTimeout(timer);
  }, [customerTerm]);

  const inventory = useApiQuery<{ data: ApiInventoryItem[] }>(
    // 🔴 `per_page` is CAPPED AT 100 by the backend (`max:100`). Sending 200
    // returns HTTP 422 "يجب ألا تكون قيمة الحقل per page أكبر من 100" and the
    // till loads no catalogue at all. Caught by the expanded smoke QA — a
    // 3-screen check never touched this page.
    (signal) => api.inventory({ per_page: INVENTORY_PAGE_SIZE }, signal),
    [],
    { queryKey: keys.inventory.list({ per_page: INVENTORY_PAGE_SIZE }) },
  );

  const customers = useApiQuery<ApiCustomer[]>(
    (signal) => api.customersForPicker({ search: customerSearchTerm }, signal),
    [customerSearchTerm],
    {
      queryKey: keys.customerSearch(customerSearchTerm),
      enabled: customerSearchTerm.length >= 2,
    },
  );

  const addCustomer = useApiMutation(
    (name: string) => api.createCustomer({ name }),
    { invalidates: [keys.customers] },
  );

  const createSale = useApiMutation(
    (body: SalePayload) => api.createSale(body),
    {
      // A completed sale affects: this sale's inventory (stock ↓), the sales
      // list, the cash register, the dashboard summary, and the customer's
      // ledger balance. All refresh via one invalidation — no manual refetch()
      // calls needed.
      invalidates: [
        keys.inventory.all,
        keys.sales({ per_page: 50 }),
        keys.cash({ per_page: 50 }),
        keys.dashboardStats,
        keys.sidebarCounts,
        keys.customers,
      ],
    },
  );

  /** The sellable catalogue, flattened from the inventory payload. */
  const catalog = useMemo<CatalogItem[]>(
    () =>
      (inventory.data?.data ?? []).map((row) => ({
        pharmacyMedicineId: row.id,
        medicineId: row.medicine_id,
        name: row.medicine?.trade_name ?? '',
        ingredient: row.medicine?.active_ingredient ?? '',
        barcode: '',
        quantity: row.quantity,
        price: row.price,
      })),
    [inventory.data],
  );

  /** Blade `ac-pos.js` `calcTotals()` — one place computes every displayed total. */
  const totals = useMemo(() => {
    const subtotal = cart.reduce((a, l) => a + l.quantity * l.unit_price, 0);
    const discount = cart.reduce((a, l) => a + l.discount, 0);
    const total = round2(subtotal - discount);
    /*
     * An EMPTY paid field means "not specified" — not zero.
     *
     * The backend (`AccountingLedger::recordSale`) defaults a missing `paid` by
     * tender: cash/card/bank are paid in full, credit is paid 0. Sending `0`
     * instead stored a cash sale as unpaid (remaining = total) — a state the UI
     * cannot settle, because recording a payment needs a linked customer and a
     * walk-in invoice has none. The panel mirrors the same rule so the shown
     * `remaining` equals what the server will store.
     */
    const entered = paid === '' ? null : Number(paid);
    const paidEntered = entered !== null && Number.isFinite(entered) ? entered : null;
    const effectivePaid = paidEntered ?? (method === 'credit' ? 0 : total);
    return {
      subtotal: round2(subtotal),
      discount: round2(discount),
      total,
      paid: effectivePaid,
      /** What the cashier typed — `null` ⇒ omit `paid` and let the server default. */
      paidEntered,
      remaining: round2(total - effectivePaid),
    };
  }, [cart, paid, method]);

  /** Blade `renderResults()` — 2-character minimum, name or ingredient. */
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog.filter(
      (m) => m.name.toLowerCase().includes(q) || m.ingredient.toLowerCase().includes(q),
    );
  }, [search, catalog]);

  const customerMatches = customers.data ?? [];

  useEffect(() => {
    if (customerId !== null) return;
    if (customerTerm !== customerSearchTerm) return;
    if (customerSearchTerm.length < 2) return;
    const exact = pickExactCustomer(customers.data ?? [], customerTerm);
    if (!exact) return;
    setCustomerId(exact.id);
    setCustomerName(exact.name);
    setCustomerQuery(exact.name);
    setMsg(null);
  }, [customerId, customerTerm, customerSearchTerm, customers.data]);

  /** Blade `addToCart()` — merges into an existing line when already present. */
  function addToCart(item: CatalogItem) {
    setMsg(null);
    if (item.quantity <= 0) {
      setMsg({ tone: 'err', text: A.pos.barcode_out_of_stock.replace(':name', item.name) });
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.pharmacyMedicineId === item.pharmacyMedicineId);
      if (existing) {
        return prev.map((l) =>
          l.pharmacyMedicineId === item.pharmacyMedicineId
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [
        ...prev,
        {
          pharmacyMedicineId: item.pharmacyMedicineId,
          medicineId: item.medicineId,
          name: item.name,
          barcode: item.barcode,
          quantity: 1,
          unit_price: item.price,
          discount: 0,
        },
      ];
    });
    setScanFound(null);
    setBarcode('');
    setSearch('');
    setMsg({ tone: 'ok', text: A.pos.barcode_found.replace(':name', item.name) });
  }

  /**
   * Barcode submit — resolves the code through THIS pharmacy's own endpoint.
   *
   * Single-step now: `GET /api/pharmacy/accounting/barcode/{code}` returns the
   * stock row (`pharmacy_medicine_id`), the server price and the stock
   * quantity for the authenticated pharmacy — the old two-step chain
   * (`/medicines/barcode` → local `catalog` match) is gone. That chain used
   * to report "not found" whenever the row did not happen to be inside the
   * loaded 100-row inventory page, even when the pharmacy actually stocked it.
   *
   * `rawCode` is the bridge for the phone scanner: a remote scan delivers a
   * code that must go through EXACTLY this path (same lookup, same statuses,
   * same "not found" handling), never a parallel one. Omitted, it reads the
   * input field as before — so every existing call site is unchanged.
   *
   * Returns `true` only when a sellable stock row was found and shown to the
   * cashier; the scanner uses that to decide whether to flash "received".
   */
  async function submitBarcode(rawCode?: string): Promise<boolean> {
    const code = (rawCode ?? barcode).trim();
    if (!code) {
      setMsg({ tone: 'err', text: A.barcode.empty_code });
      return false;
    }
    setScanNote(false);
    setScanFound(null);
    try {
      const outcome = mapAccountingBarcodeResult(await api.accountingBarcode(code));

      if (outcome.kind === 'found' || outcome.kind === 'out_of_stock') {
        // `out_of_stock` keeps the item visible with quantity 0; addToCart's
        // stock guard (`item.quantity <= 0`) blocks its addition — the
        // decision to sell stays with the cashier, never auto-added.
        setScanFound({ ...outcome.item, barcode: code });
        setMsg(null);
        return outcome.kind === 'found';
      }

      setScanNote(true);
      if (outcome.kind === 'not_in_stock') {
        setMsg({ tone: 'err', text: A.pos.barcode_not_in_stock });
      } else if (outcome.kind === 'ambiguous') {
        // Multiple inventory rows match — the backend refuses to pick one and
        // so does the till. The cashier reviews the stock lines and rescans;
        // guessing `candidates[0]` would decrement an arbitrary row.
        setMsg({ tone: 'err', text: A.pos.barcode_ambiguous });
      } else {
        setMsg({ tone: 'err', text: A.pos.barcode_not_found });
      }
      return false;
    } catch (err) {
      setScanNote(true);
      // 422 = unsupported barcode format (the server normalizes via the same
      // BarcodeNormalizer as the public endpoint) — say that, not "not found".
      setMsg({
        tone: 'err',
        text:
          err instanceof ApiError && err.status === 422
            ? A.pos.barcode_invalid
            : A.pos.barcode_not_found,
      });
      return false;
    }
  }

  function setQuantity(pharmacyMedicineId: number, quantity: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.pharmacyMedicineId === pharmacyMedicineId ? { ...l, quantity: Math.max(1, quantity) } : l,
      ),
    );
  }

  function setLineDiscount(pharmacyMedicineId: number, discount: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.pharmacyMedicineId === pharmacyMedicineId ? { ...l, discount: Math.max(0, discount) } : l,
      ),
    );
  }

  function pickCustomer(c: ApiCustomer) {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerQuery(c.name);
    setMsg(null);
  }

  async function addCustomerFromSearch() {
    try {
      const created = await addCustomer.run(customerTerm);
      pickCustomer(created);
    } catch {
      toast.error(addCustomer.error?.message || A.pos.customer_add_failed);
    }
  }

  async function completeSale() {
    setMsg(null);
    if (cart.length === 0) {
      setMsg({ tone: 'err', text: A.pos.lines_required });
      return;
    }
    if (totals.paid > totals.total) {
      setMsg({ tone: 'err', text: A.pos.paid_exceeds_total });
      return;
    }
    /*
     * A sale with an outstanding balance (credit, or a partial cash payment)
     * must be tied to a customer: the customer's ledger is what carries the
     * debt, and it is the only handle the "record payment" action can later use.
     * Allowing a walk-in invoice to stay unpaid creates a dead end — a balance
     * nobody can ever settle.
     */
    if (totals.remaining > 0 && customerId === null) {
      setMsg({ tone: 'err', text: A.pos.customer_required });
      return;
    }
    try {
      // Payload construction (and the double-discount rule) lives in
      // `salePayload.ts` so it can be unit-tested — see `salePayload.test.ts`.
      const sale = await createSale.run(
        buildSalePayload({ cart, paid: totals.paidEntered, method, customerId }),
      );
      /*
       * The sale result is a TOAST, not the inline `msg` block.
       *
       * The till RESETS on success — cart cleared, fields emptied, a
       * confirmation modal opened — so an inline message attached to the (now
       * empty) invoice panel is exactly what the user is NOT looking at. A toast
       * follows them, and on failure it is STICKY (errors default to no
       * auto-dismiss), which is the case that must not be missed: a till that
       * appears to accept a sale it never recorded is a money bug.
       */
      toast.success(A.pos.sale_saved);
      setSavedNumber(sale.number);
      // Reset the till for the next sale — and drop the draft with it, so a
      // refresh never resurrects a cart that was already paid.
      setCart([]);
      setPaid('');
      setCustomerId(null);
      setCustomerName('');
      setCustomerQuery('');
      setBarcode('');
      clearDraft(user?.id ?? 'anon', DRAFT_ROUTE);
      setScanFound(null);
      setSearch('');
    } catch {
      toast.error(createSale.error?.message || A.pos.sale_failed);
    }
  }

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{A.pos.heading}</h1>
          <p>{A.pos.subtitle}</p>
        </div>
        <div className="ph-actions">
          <Link to={ROUTES.accountingSales} className="ph-btn ghost">
            <i className="fas fa-arrow-right" aria-hidden="true" /> {A.sidebar.sales}
          </Link>
        </div>
      </div>

      <AsyncBoundary
        isLoading={inventory.isLoading}
        isError={inventory.isError}
        error={inventory.error}
        onRetry={inventory.refetch}
        loadingRows={5}
      >
        <div className="ac-pos">
          <div className="ac-pos-left">
            <section className="ph-card ac-entry-card" aria-labelledby="ac-entry-heading">
              <div className="ph-card-head">
                <h2 id="ac-entry-heading">
                  <i className="fas fa-barcode" aria-hidden="true" /> {A.pos.entry_title}
                </h2>
                <p>{A.pos.entry_subtitle}</p>
              </div>

              <div className="ph-card-body">
                <BarcodeField
                  id="ac-barcode"
                  name="barcode"
                  value={barcode}
                  onValueChange={setBarcode}
                  onOpenPhoneScanner={() => setPhoneScannerOpen(true)}
                />
                <p className="ac-field-help">{A.pos.barcode_hint}</p>

                <div className="ac-scan-actions">
                  <span className="ac-scan-or" aria-hidden="true">
                    {A.pos.or}
                  </span>
                  <button
                    type="button"
                    className="ph-btn ghost sm"
                    onClick={() => searchRef.current?.focus()}
                  >
                    <i className="fas fa-magnifying-glass" aria-hidden="true" />{' '}
                    {A.pos.search_by_name}
                  </button>
                  <button type="button" className="ph-btn primary sm" onClick={() => void submitBarcode()}>
                    <i className="fas fa-arrow-down-long" aria-hidden="true" /> {A.barcode.found_title}
                  </button>
                </div>

                {scanFound ? (
                  <div className="ac-scan-found">
                    <span className="ac-scan-found-body">
                      <span className="ac-scan-found-name" dir="auto">
                        {scanFound.name}
                      </span>
                      <span className="ac-scan-found-meta">
                        {A.pos.stock_available.replace(':qty', String(scanFound.quantity))} ·{' '}
                        {money(scanFound.price)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="ph-btn primary sm"
                      onClick={() => addToCart(scanFound)}
                    >
                      <i className="fas fa-plus" aria-hidden="true" /> {A.barcode.found_add}
                    </button>
                  </div>
                ) : null}

                {scanNote ? (
                  <div className="ac-note is-info" role="status">
                    <span className="ac-note-icon" aria-hidden="true">
                      i
                    </span>
                    <div>
                      <strong>{A.barcode.link_note_title}</strong>
                      <p>{A.barcode.link_note_body}</p>
                    </div>
                  </div>
                ) : null}

                <div className="ac-field">
                  <label htmlFor="ac-search" className="ac-field-label">
                    {A.pos.search_label}
                  </label>
                  <div className="ac-search-wrap">
                    <span className="ac-search-icon" aria-hidden="true">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <input
                      type="search"
                      id="ac-search"
                      ref={searchRef}
                      className="ac-search-input"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      autoComplete="off"
                      placeholder={A.pos.search_placeholder}
                    />
                  </div>
                  <p className="ac-field-help">{A.pos.search_hint}</p>
                </div>

                {search.trim().length >= 2 ? (
                  <ul className="ac-search-results" role="listbox" aria-label={A.pos.search_results}>
                    {results.length === 0 ? (
                      <li className="ac-search-empty">{A.pos.search_no_results}</li>
                    ) : (
                      results.map((m) => (
                        <li key={m.pharmacyMedicineId}>
                          <button
                            type="button"
                            className="ac-search-result"
                            onClick={() => addToCart(m)}
                          >
                            <span className="ac-result-name" dir="auto">
                              {m.name}
                            </span>
                            <span className="ac-result-meta">
                              {m.ingredient} · {money(m.price)} ·{' '}
                              {m.quantity > 0
                                ? A.pos.stock_available.replace(':qty', String(m.quantity))
                                : A.pos.not_in_inventory}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            </section>

            <section className="ph-card" aria-labelledby="ac-cart-heading" style={{ marginBlockEnd: 0 }}>
              <div className="ph-card-head">
                <h2 id="ac-cart-heading">
                  <i className="fas fa-cart-shopping" aria-hidden="true" /> {A.pos.cart_title}
                  <span className="ph-badge new" style={{ marginInlineStart: 6 }}>
                    {cart.length}
                  </span>
                </h2>
                <p>{A.pos.cart_items}</p>
              </div>

              {cart.length === 0 ? (
                <div className="ph-empty">
                  <i className="fas fa-basket-shopping" aria-hidden="true" />
                  <h3>{A.pos.cart_empty}</h3>
                  <p>{A.pos.cart_empty_desc}</p>
                </div>
              ) : (
                <>
                  <div className="ac-cart-wrap">
                    <table className="ac-cart-table">
                      <caption className="ac-hidden">{A.pos.cart_title}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{A.common.medicine}</th>
                          <th scope="col">{A.common.qty}</th>
                          <th scope="col">{A.common.unit_price}</th>
                          <th scope="col">{A.common.discount}</th>
                          <th scope="col">{A.common.total}</th>
                          <th scope="col">
                            <span className="ac-hidden">{A.common.remove}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map((l) => (
                          <tr key={l.pharmacyMedicineId}>
                            <td>
                              <span className="ac-strong" dir="auto">
                                {l.name}
                              </span>
                              {l.barcode ? <div className="ac-muted ac-mono">{l.barcode}</div> : null}
                            </td>
                            <td>
                              <input
                                type="number"
                                className="ph-control ac-cart-qty"
                                min={1}
                                value={l.quantity}
                                aria-label={`${A.common.qty} — ${l.name}`}
                                onChange={(e) =>
                                  setQuantity(l.pharmacyMedicineId, Number(e.target.value))
                                }
                              />
                            </td>
                            <td className="ac-num">{money(l.unit_price)}</td>
                            <td>
                              <input
                                type="number"
                                className="ph-control ac-cart-disc"
                                min={0}
                                step="0.01"
                                value={l.discount}
                                aria-label={`${A.common.discount} — ${l.name}`}
                                onChange={(e) =>
                                  setLineDiscount(l.pharmacyMedicineId, Number(e.target.value))
                                }
                              />
                            </td>
                            <td className="ac-num ac-strong">
                              {money(round2(l.quantity * l.unit_price - l.discount))}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="ac-icon-btn"
                                aria-label={`${A.common.remove} — ${l.name}`}
                                onClick={() =>
                                  setCart((prev) =>
                                    prev.filter((x) => x.pharmacyMedicineId !== l.pharmacyMedicineId),
                                  )
                                }
                              >
                                <i className="fas fa-xmark" aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="ph-card-body">
                    <div className="ac-cart-toolbar">
                      <button type="button" className="ph-btn danger sm" onClick={() => setCart([])}>
                        <i className="fas fa-trash-can" aria-hidden="true" /> {A.pos.clear_cart}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>

          <div className="ac-pos-right">
            <div className="ac-invoice-panel">
              <div className="ac-invoice-head">
                <h2>
                  <i className="fas fa-file-invoice" aria-hidden="true" /> {A.pos.invoice_title}
                </h2>
              </div>

              <div className="ac-invoice-body">
                <div className="ph-group">
                  <label>{A.pos.invoice_number}</label>
                  <input
                    type="text"
                    className="ph-control"
                    value=""
                    disabled
                    placeholder={A.pos.invoice_number_pending}
                  />
                </div>

                <div className="ph-group">
                  <label htmlFor="ac-customer">{A.pos.customer_label}</label>
                  <input
                    type="text"
                    id="ac-customer"
                    className="ph-control"
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      // Typing invalidates a previous pick.
                      setCustomerId(null);
                      setCustomerName('');
                    }}
                    autoComplete="off"
                    placeholder={A.pos.customer_search_placeholder}
                  />
                  {customerTerm.length >= 2 &&
                  customerTerm === customerSearchTerm &&
                  customerTerm !== customerName ? (
                    <div className="ac-search-results ac-customer-matches">
                      {customers.isLoading ? (
                        <div className="ac-search-empty">{A.pos.customer_searching}</div>
                      ) : customerMatches.length > 0 ? (
                        customerMatches.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="ac-search-result"
                            onClick={() => pickCustomer(c)}
                          >
                            <span className="ac-result-name">{c.name}</span>
                            <span className="ac-result-meta">{c.phone ?? ''}</span>
                          </button>
                        ))
                      ) : (
                        <>
                          <div className="ac-search-empty">{A.pos.customer_no_results}</div>
                          <button
                            type="button"
                            className="ac-search-result"
                            onClick={() => void addCustomerFromSearch()}
                            disabled={addCustomer.isPending}
                          >
                            <span className="ac-result-name">
                              {A.pos.customer_add.replace(':name', customerTerm)}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                  <span className="ph-hint">
                    {customerId
                      ? customerName
                      : customerTerm
                        ? A.pos.customer_select_hint
                        : A.pos.customer_walk_in}
                  </span>
                </div>

                <div className="ac-invoice-line">
                  <span className="label">{A.pos.subtotal}</span>
                  <span className="value">
                    {money(totals.subtotal).replace('₪', '')} {A.common.currency}
                  </span>
                </div>
                <div className="ac-invoice-line">
                  <span className="label">{A.pos.discount}</span>
                  <span className="value ac-neg">
                    −{money(totals.discount).replace('₪', '')} {A.common.currency}
                  </span>
                </div>
                <div className="ac-invoice-line">
                  <span className="label">
                    {A.pos.tax}{' '}
                    <i
                      className="fas fa-circle-info"
                      style={{ fontSize: '.75rem' }}
                      aria-hidden="true"
                      title={A.pos.tax_not_supported}
                    />
                  </span>
                  <span className="value ac-muted">{A.pos.tax_not_supported}</span>
                </div>

                <div className="ac-invoice-line is-total">
                  <span className="label ac-strong">{A.pos.total}</span>
                  <span className="value">
                    {money(totals.total).replace('₪', '')} {A.common.currency}
                  </span>
                </div>

                <div className="ph-group">
                  <label htmlFor="ac-paid">{A.pos.paid}</label>
                  <input
                    type="number"
                    id="ac-paid"
                    className="ph-control"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                  />
                </div>

                <div className="ac-invoice-line is-remaining">
                  <span className="label">{A.pos.remaining}</span>
                  <span className="value">
                    {money(totals.remaining).replace('₪', '')} {A.common.currency}
                  </span>
                </div>

                <div className="ph-group">
                  <label htmlFor="ac-payment">{A.pos.payment_method}</label>
                  <select
                    id="ac-payment"
                    className="ph-select"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/*
                  The sale SUCCESS/FAILURE outcome is a toast now — see
                  completeSale. `msg` remains for the PRE-SUBMIT validation
                  complaints (empty cart, paid over total): those are about the
                  form in front of the user and belong inline, next to the button
                  that produced them.
                */}
                {msg ? (
                  <div
                    className={`ac-inline-msg show ${msg.tone === 'err' ? 'error' : 'success'}`}
                    role={msg.tone === 'err' ? 'alert' : 'status'}
                  >
                    {msg.text}
                  </div>
                ) : null}
              </div>

              <div className="ac-invoice-foot">
                <button
                  type="button"
                  className="ph-btn primary"
                  onClick={() => void completeSale()}
                  disabled={createSale.isPending}
                >
                  <i className="fas fa-circle-check" aria-hidden="true" /> {A.pos.complete_sale}
                </button>
                <p className="ac-invoice-note">{A.pos.invoice_number_pending}</p>
              </div>
            </div>
          </div>
        </div>
      </AsyncBoundary>

      <Modal
        open={savedNumber !== null}
        title={A.pos.heading}
        onClose={() => setSavedNumber(null)}
        footer={
          <>
            <button
              type="button"
              className="ph-btn ghost"
              onClick={() => setSavedNumber(null)}
            >
              {A.common.close}
            </button>
            {savedNumber ? (
              <Link
                to={`${ROUTES.accountingSales}/${savedNumber}`}
                className="ph-btn primary"
              >
                {A.common.view}
              </Link>
            ) : null}
          </>
        }
      >
        <p className="ph-hint">
          {A.common.saved} — {savedNumber}
        </p>
      </Modal>

      {/*
        Phone-as-scanner pairing. This is the ONLY edit to the POS screen: it
        opens a session and forwards the raw scanned code into `submitBarcode`,
        which is the existing, tested lookup path. No cart, price, discount,
        payment or sale logic is touched — `onBarcode` returns whether the code
        resolved, and nothing else about the till changes.
      */}
      <ScanSessionModal
        open={phoneScannerOpen}
        onClose={() => setPhoneScannerOpen(false)}
        onBarcode={(code) => submitBarcode(code)}
      />
    </div>
  );
}

