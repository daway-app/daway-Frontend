# API Contract Map — Pharmacy Web

Extracted **from the Laravel backend source** (read-only), not from assumptions.
Every shape below was read out of the controller / service / resource that
produces it. Where the backend has a gap, it is marked **GAP**.

## Envelope

- Success: `{ success: true, message?: string, data: T }`
- Lists add a sibling `pagination` (sometimes `stats` / `counts`).
- Errors: `{ success: false, message: string }` (+ `errors` on 422).
- `Accept: application/json` is mandatory (engages Laravel's JSON handlers).

## Auth

All routes below live inside `Route::middleware('auth:sanctum')` +
`Route::prefix('pharmacy')` + `Route::middleware('role:pharmacy')`.
So: **every one requires `Authorization: Bearer <token>`.**

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/pharmacy/dashboard/stats` | |
| GET | `/api/pharmacy/inventory` | `per_page` (default 20, max 100) |
| PUT | `/api/pharmacy/inventory/{pharmacyMedicineId}` | `quantity`, `is_available` |
| POST | `/api/pharmacy/inventory/bulk` | `items[{id,quantity,is_available?}]` |
| GET | `/api/pharmacy/medicines` | apiResource |
| GET | `/api/pharmacy/medicines/search` | |
| POST | `/api/pharmacy/medicines` | |
| POST | `/api/pharmacy/medicines/by-name` | |
| PUT | `/api/pharmacy/medicines/{id}` | |
| GET | `/api/pharmacy/medicines/{id}/alternatives` | |
| GET | `/api/pharmacy/medicine-requests` | |
| POST | `/api/pharmacy/medicine-requests` | |
| GET | `/api/pharmacy/inquiries` | `+counts{new,answered,closed}` |
| GET | `/api/pharmacy/inquiries/{id}` | |
| PUT | `/api/pharmacy/inquiries/{id}` | `status`,`reply`,`availability_status` |
| GET | `/api/pharmacy/inquiries/{id}/messages` | `mark_read=1` supported |
| POST | `/api/pharmacy/inquiries/{id}/messages` | |
| GET | `/api/pharmacy/ratings` | `+pagination` (no trend/avg — see GAP-2) |
| GET | `/api/pharmacy/alternatives` | |
| POST | `/api/pharmacy/alternatives` | `base_medicine_id`,`alternative_id` |
| DELETE | `/api/pharmacy/alternatives/{base}/{alternative}` | |
| GET | `/api/profile/pharmacy` | |
| POST | `/api/profile/pharmacy` | |
| POST | `/api/pharmacy/change-password` | |

### Inventory item (`PharmacyMedicineResource`)

```json
{
  "id": 1, "medicine_id": 5, "pharmacy_id": 2,
  "price": 12.5, "quantity": 4, "min_stock": 10,
  "is_available": true,
  "is_low_stock": true, "is_out_of_stock": false,
  "medicine": { "id": 5, "trade_name": "...", "trade_name_ar": "...",
                "active_ingredient": "...", "image_url": "..." }
}
```

`min_stock` is sent as the **constant** `PharmacyMedicine::LOW_STOCK_THRESHOLD`
(=10). Per project rule it carries **no availability logic** — do not "fix" it.

### Dashboard stats

```json
{
  "total_medicines": 11, "available_count": 5,
  "low_count": 6, "out_count": 0,
  "pending_inquiries": 0, "total_inquiries": 3,
  "new_ratings_this_week": 0,
  "latest_ratings": [{ "id", "user_name", "stars_rating", "comment", "created_at" }],
  "low_stock_items": [{ "pharmacy_medicine_id", "medicine_id",
                        "trade_name", "active_ingredient", "quantity" }]
}
```

**This encodes the approved stock convention verbatim:**
`available = is_available && quantity > 0` · `low = 0 < quantity <= 10` ·
`out = quantity <= 0`. Matches the frontend's `stockStatus()`.

### Inquiry resource

```json
{
  "id", "status", "message", "reply", "availability_status",
  "replied_at", "created_at",
  "user": { "id", "name" },
  "medicine": { "id", "trade_name", "active_ingredient" } | null,
  "last_message": { "id", "sender_user_id", "message", "created_at" } | null,
  "unread_messages_count": 0
}
```

### Inquiry message resource

```json
{ "id", "inquiry_id", "sender_user_id", "message",
  "media_url", "media_type", "is_read", "read_at", "created_at", "is_mine" }
```

`is_mine` is computed **server-side** against the authenticated user — the
frontend must not re-derive it from a local "current user id".

### Rating resource

```json
{ "id", "stars_rating", "comment", "created_at",
  "user": { "id", "name" }, "pharmacy_id" }
```

### Pharmacy profile payload

```json
{
  "type": "pharmacy", "pharmacy_id": "PH-1234",
  "name": "...", "phone": "...", "logo_url": "...",
  "latitude": 31.5, "longitude": 34.4, "address": "...",
  "working_hours": { "sat": { "open": "08:00", "close": "20:00" }, ... }
}
```

## Accounting (`/api/pharmacy/accounting/*`)

All GETs are unthrottled beyond the global `api` (60/min). All writes sit under
`throttle:writes` (20/min per user).

### `GET overview?range=today|7d|30d|month`

```json
{ "kpis": [...], "series": { "today": {labels,data}, "7d": ..., "30d": ..., "month": ... },
  "range": "today", "expense_breakdown": [...],
  "recent_transactions": [...], "alerts": [...],
  "profit_indicator": { "sales", "purchases", "expenses", "net" },
  "comparison": { "current", "previous", "change_percent", "direction" },
  "receivables": { "customer_balances", "invoice_remaining", "drift",
                   "supplier_balances", "purchase_remaining" },
  "barcode_coverage": { "total", "with_barcode", "without_barcode",
                        "percent", "by_status": {verified,pending,unknown} } }
```

KPI entry: `{ key, label, value, format:'money'|'int', icon, tone, href }`.
`tone ∈ teal|blue|orange|green|red|gray`. **`label` is already localised by
`__()`** — render it as-is; do not re-map from `key`.

`alerts[]` / `inventoryAlerts[]` entry:
`{ severity:'warning'|'danger', icon, title, description, href|null }` —
also pre-localised.

`recent_transactions[]` shape varies by `type`
(`sale|expense|purchase|customer_payment|supplier_payment|cash_adjustment`) but
always carries `type`, `reference`, `description`, `amount`, `method`, `status`,
`date`, `href`.

`barcode_coverage.percent` is `0.0` (float) when total is 0 — see JS pitfall
`json_encode(0.0)⇒0`.

### `GET sales` / `GET sales-summary` / `GET sales/{number}`

`sales` query: `per_page,page,search,status,payment_method,range,from,to`.
Returns `data[]` + `pagination` + **`stats`**:
`{ total, count, paid, remaining, discount }`.

`sales/{number}` — `{number}` is the **invoice number** (`INV-1042`), not an id.
With `withItems`, adds `items[]` (`id, medicine_id, pharmacy_medicine_id,
medicine_name, barcode, unit_price, quantity, line_discount, line_total`) and
`created_by`.

`sales-summary` returns `{ summary, comparison, by_payment_method, top_items,
average_items_per_sale, profit_indicator }`.

### `GET refunds` / `GET refunds/{id}` / `GET sales/{number}/refund-items`

`refunds` returns the **raw Eloquent models** (not a resource) — so the JSON is
the column set: `id, sale_id, amount, reason, status, refunded_at, created_at`,
with nested `sale` and `items[].sale_item`.

`sales/{number}/refund-items` (this answers **D-1**):

```json
{ "sale_number": "INV-1042", "total": 100.0, "paid": 100.0,
  "already_refunded": 0.0, "available_to_refund": 100.0,
  "items": [{ "id", "medicine_name", "unit_price",
              "original_quantity", "refunded_quantity",
              "available_quantity", "line_total" }] }
```

**`available_quantity` already subtracts prior refunds** (`original − refunded`).
So the correct refund UI reads `available_quantity`, and the D-1 defect is real:
the current screen shows gross `line_total`/original quantity.

### `GET cash` / `POST cash/adjustments`

`data[]` movement: `{ id, direction:'in'|'out', amount, signed_amount,
source_type, source_id, description, reason, date, date_human, created_by }`.
Plus `pagination`, `stats` (`balance_now`, `balance_as_of`, `period`, `low_threshold`, `is_low`),
and `period {from,to}`.

`LOW_CASH_THRESHOLD = 500.00`. Adjustment requires **`reason`** (min 3 chars) —
the API deliberately has no "set balance" endpoint.

### `GET expenses` / `POST expenses` / `POST expenses/{id}/cancel` / `GET expense-categories`

Expense: `{ id, category_key, category_label, amount, description, reference,
payment_method, method_label, expense_date, date_human, is_cancelled, created_by }`.
List adds `stats { total, count, breakdown[] }`.

### `GET customers` / `GET customers/{id}` / `GET suppliers`

Customer: `{ id, name, phone, email, notes, current_balance, credit_limit,
credit_limit_label, is_active, exceeds_credit_limit, created_at }`.
`customers` adds `stats { total_debt, customers_count, debtors_count }`.
Supplier: `{ id, name, company, phone, email, notes, current_balance, is_active,
created_at }` + `stats { total_payables, suppliers_count }`.

## GAPS found (backend-side, reported not patched)

### 🔴 DEFECT-1 — `available_count` double-counts low-stock rows

Verified live against `PH-1234` (11 inventory rows):

| source | total | out | low | available |
| --- | --- | --- | --- | --- |
| **Backend `stats`/dashboard** | 11 | 0 | 6 | **11** ❌ |
| **Derived from the same rows** | 11 | 0 | 6 | **5** ✅ |
| Approved rule (عبود, 2026-10-04) | 11 | 0 | 6 | **5** |

The backend computes `available_count` as
`is_available = true AND quantity > 0` — which **also matches the 6 low rows**,
so `low + available = 17 > total = 11`. The response is internally
contradictory.

The backend's OWN per-row flags are correct (`quantity = 10 → is_low_stock =
true`). Only the aggregate is wrong. This is the **same legacy Blade defect the
frontend already documents and deliberately refuses to reproduce** (see the
`stockStatus()` doc comment in `src/data/pharmacy.ts`).

**Frontend decision:** derive `out` / `low` / `available` client-side from the
returned rows via the approved `quantity`-only rule, so the numbers are
self-consistent and match the approved reference. The backend aggregate is
ignored for display and flagged in the report. **No backend change made
(read-only).**

### Other gaps

Numbering note: GAP-1…GAP-6 were written while mapping the contracts. GAP-7…GAP-12
were added during the wiring pass, when the screens surfaced further mismatches.

- **GAP-1 — `region` never returned.** `PharmacyProfileController::payload()`
  accepts and persists `region` (it is part of the completeness check) but omits
  it from the response. The React Profile screen cannot round-trip it. Requires
  a one-line backend change — **out of scope (backend is read-only)**.
  *Handled:* the field is editable and sent on save; the UI states plainly that
  the value is not returned after a reload.
- **GAP-2 — no ratings aggregate.** `GET pharmacy/ratings` returns rows +
  pagination only. It does **not** return the average or the star histogram, so
  both are derived client-side from the fetched (page-scoped) rows.
- **GAP-3 — no "dashboard trends" endpoint.** The old `MOCK_TREND_DATA` (7-day
  medicines trend) has no server source; `/dashboard/stats` is a point-in-time
  snapshot. Removed from the dashboard rather than faked.
- **GAP-4 — no POS catalogue endpoint.** `/pharmacy/medicines/search` returns
  `{id, trade_name, active_ingredient}` — **no `price` and no `quantity`** — so
  it cannot drive a point of sale. The POS instead loads
  `GET /pharmacy/inventory`, which is the only payload carrying the pharmacy's
  own price AND stock, and treats that as the sellable catalogue. Consequence:
  the catalogue is page-scoped (`per_page: 200`), so a pharmacy with more than
  200 stock lines needs server-side paging.
- **GAP-5 — `kpi.href` points at Blade web routes.** `AccountingReports::kpis()`
  builds `href` with Laravel's `route(...)`, which resolves to the **Blade** URL
  (`http://host/pharmacy/accounting/sales`). Rendering that in the SPA would
  navigate out of the React app. *Handled:* `src/lib/appRoute.ts` strips the
  origin and the `/pharmacy` prefix, so the KPI links stay inside the SPA.
- **GAP-6 — transient 500 on `accounting/sales`.** The first live request
  returned `{"success":false,"message":"حدث خطأ داخلي"}` (500); an immediate retry
  returned 200. The log shows
  `Maximum execution time of 30 seconds exceeded` inside the **DB connector**
  (`Connectors/Connector.php:67`, `Connection.php:435`). The database is a
  **remote Aiven MySQL** (`dway-db-daway.l.aivencloud.com:28123`), so this is
  connection latency, not a logic error. It recurs under poor network
  conditions and is the main reason the screens need real error/retry states.
  **Not a code defect; no backend change made.**
- **GAP-7 — no candidate-alternatives endpoint.** `GET /pharmacy/alternatives`
  returns only medicines that ALREADY have a linked alternative
  (`whereHas('medicine.alternatives')`), and only the linked `alternatives[]`.
  The "pick an alternative" list has no server source, because the catalogue is
  searchable but not enumerable. *Handled:* the inline list became a per-row
  search over `/pharmacy/medicines/search`.
- **GAP-8 — `logo` is a URL, not an upload.** `PharmacyProfileRequest` validates
  `logo` with `SecureImageUrl` (a string URL). The Blade page uses a file picker;
  the API has no upload route. *Handled:* the logo modal takes a URL and says so.
- **GAP-9 — `email` is neither returned nor writable.** The profile payload has
  no `email`, and `updateProfile` only touches `users.name` / `users.phone`. The
  field is rendered read-only with an explanatory hint.
- **GAP-10 — refund detail omits the sale summary.** `AccountingRefundController::show()`
  eager-loads `sale:id,number,sold_at,total,paid,remaining,customer_name` but the
  response only exposes `sale_number`. The Blade page reads the whole
  `$refund->sale`, so its "sale summary" card needs data the endpoint does not
  send. *Handled:* the screen fetches the sale separately through the real
  `GET /pharmacy/accounting/sales/{number}`.
- **GAP-11 — refund items carry no `unit_price`.** The detail payload gives
  `{quantity, amount}` per line. Unit price is derived as `amount / quantity`
  (exact for a refund line) with a divide-by-zero guard.
- **GAP-12 — no import-session list endpoint.** The import API exposes
  `inventory/import/{uuid}` but no LIST route, so a "recent sessions" table has
  nothing to read from. *Handled:* the table was removed rather than faked. The
  Blade page's rate-limit banner also had no endpoint; the limiter now surfaces
  as a normal error if it rejects the upload.

### D-1 — CLOSED

The open D-1 question was: *does `AccountingRefundCreatePage` correctly exclude
previously refunded quantities?* It did **not** — it showed each line's gross
`line_total` as refundable.

The backend already provides the answer:
`GET /pharmacy/accounting/sales/{number}/refund-items` returns
`available_quantity = original − refunded` per line, plus sale-level
`already_refunded` / `available_to_refund`. The wiring now reads those fields
directly and caps every quantity input at `available_quantity`, so a line cannot
be refunded twice. The type comment in `pharmacyTypes.ts` calls this out
explicitly as the D-1 defect.
