import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AR } from '@/lib/i18n';
import { AsyncBoundary, Modal } from '@/components/ui';
import { BarcodeField } from '@/components/pharmacy/BarcodeField';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { money } from '@/lib/format';
import { round2 } from '@/lib/money';
import type { ApiCustomer, ApiInventoryItem, PaymentMethod } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';
import { buildSalePayload, type CartLine, type SalePayload } from './salePayload';

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
 *  - **barcode** → `GET /api/medicines/barcode/{code}`. That endpoint returns a
 *    CATALOGUE medicine (no price/quantity), so the result is matched back onto
 *    an inventory row via `medicine.local_medicine_id` ↔
 *    `ApiInventoryItem.medicine_id`. A barcode the pharmacy does not stock is
 *    therefore reported as not-in-inventory, which is the correct POS behaviour.
 *  - **customers** → `GET /api/pharmacy/accounting/customers`.
 *  - **save** → `POST /api/pharmacy/accounting/sales`.
 *
 * ⚠️ Known scope limit: the catalogue is loaded one page deep (`per_page: 200`).
 * Name search filters that loaded set, so a pharmacy with more than 200 stock
 * lines would need paging/search server-side. Reported, not hidden.
 */

const A = AR.accounting;

/** Backend `payment_method` enum: `cash,card,bank_transfer,credit`. */
const PAYMENT_METHODS: ReadonlyArray<{ key: PaymentMethod; label: string }> = [
  { key: 'cash', label: A.payment_methods.cash },
  { key: 'card', label: A.payment_methods.card },
  { key: 'bank_transfer', label: A.payment_methods.bank_transfer },
  { key: 'credit', label: A.payment_methods.credit },
];

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
  const api = usePharmacyApi();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [barcode, setBarcode] = useState('');
  const [scanFound, setScanFound] = useState<CatalogItem | null>(null);
  const [search, setSearch] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [scanNote, setScanNote] = useState(false);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const inventory = useApiQuery<{ data: ApiInventoryItem[] }>(
    (signal) => api.inventory({ per_page: 200 }, signal),
    [],
  );

  const customers = useApiQuery<ApiCustomer[]>(
    (signal) => api.customersForPicker({}, signal),
    [],
  );

  const createSale = useApiMutation((body: SalePayload) => api.createSale(body));

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
    const total = subtotal - discount;
    const paidNum = paid === '' ? 0 : Number(paid);
    return {
      subtotal: round2(subtotal),
      discount: round2(discount),
      total: round2(total),
      paid: Number.isFinite(paidNum) ? paidNum : 0,
      remaining: round2(total - (Number.isFinite(paidNum) ? paidNum : 0)),
    };
  }, [cart, paid]);

  /** Blade `renderResults()` — 2-character minimum, name or ingredient. */
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog.filter(
      (m) => m.name.toLowerCase().includes(q) || m.ingredient.toLowerCase().includes(q),
    );
  }, [search, catalog]);

  const customerMatches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return (customers.data ?? []).filter((c) => c.name.toLowerCase().includes(q));
  }, [customerQuery, customers.data]);

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
   * Barcode submit — resolves the code through the real lookup, then matches the
   * catalogue medicine back onto a stock row.
   */
  async function submitBarcode() {
    const code = barcode.trim();
    if (!code) {
      setMsg({ tone: 'err', text: A.barcode.empty_code });
      return;
    }
    setScanNote(false);
    setScanFound(null);
    try {
      const found = await api.medicineByBarcode(code);
      const localId = found.medicine.local_medicine_id;
      const row = catalog.find(
        (c) =>
          (localId !== null && c.medicineId === localId) ||
          (found.medicine.name_en !== null &&
            c.name.toLowerCase() === (found.medicine.name_en ?? '').toLowerCase()),
      );
      if (!row) {
        setScanNote(true);
        setMsg({ tone: 'err', text: A.pos.barcode_not_found });
        return;
      }
      setScanFound({ ...row, barcode: code });
      setMsg(null);
    } catch {
      setScanNote(true);
      setMsg({ tone: 'err', text: A.pos.barcode_not_found });
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
    try {
      // Payload construction (and the double-discount rule) lives in
      // `salePayload.ts` so it can be unit-tested — see `salePayload.test.ts`.
      const sale = await createSale.run(
        buildSalePayload({ cart, paid: totals.paid, method, customerId }),
      );
      setSavedNumber(sale.number);
      // Reset the till for the next sale.
      setCart([]);
      setPaid('');
      setCustomerId(null);
      setCustomerName('');
      setCustomerQuery('');
      setBarcode('');
      setScanFound(null);
      setSearch('');
    } catch {
      // `createSale.error` renders below.
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
                  {customerMatches.length > 0 ? (
                    <div className="ac-search-results ac-customer-matches">
                      {customerMatches.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="ac-search-result"
                          onClick={() => pickCustomer(c)}
                        >
                          <span className="ac-result-name">{c.name}</span>
                          <span className="ac-result-meta">{c.phone ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <span className="ph-hint">
                    {customerId ? customerName : A.pos.customer_walk_in}
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

                {createSale.error && (
                  <div className="ac-inline-msg is-err" role="alert">
                    {createSale.error.message}
                  </div>
                )}

                {msg ? (
                  <div
                    className={`ac-inline-msg ${msg.tone === 'ok' ? 'is-ok' : 'is-err'}`}
                    role="alert"
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
    </div>
  );
}
