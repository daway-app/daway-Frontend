# Backend Wiring Report — daway-web (Pharmacy Web)

**Date:** 2026-10-06 (session 2)
**Scope:** wire the React SPA to the live Laravel API — all pharmacy screens, mocks deleted
**Backend:** `C:\Users\MSI\daway-backend` — **READ-ONLY, no file changed**
**Frontend:** `C:\Users\MSI\daway-web` — branch `develop`, **no remote configured**
**Git state:** nothing committed, nothing pushed. Changes are in the working tree only.

---

## 1. What "connect to the backend" meant here

The approved scope was the widest option: **all 20 screens, mocks deleted entirely,
full loading/error/empty/retry states on every screen.**

Confirmed before starting, because each reading is very different work.

---

## 2. Screens converted — 20 / 20

Every screen that reads data now calls the live API. None import fixture data.

| # | Route | Screen | Live request(s) |
|---|---|---|---|
| 1 | `/` | Dashboard | `GET /api/pharmacy/dashboard/stats` |
| 2 | `/inventory` | Inventory | `GET /api/pharmacy/inventory` · `POST …/inventory/bulk` (save) |
| 3 | `/inventory/import` | Bulk import | `GET …/inventory/import/template` · `POST …/inventory/import` |
| 4 | `/medicines` | Medicines | `GET /api/pharmacy/inventory` (search server-side) |
| 5 | `/medicines/request` | Request medicine | `GET /api/categories` · `POST /api/pharmacy/medicine-requests` |
| 6 | `/inquiries` | Inquiries | `GET /api/pharmacy/inquiries` · `PUT …/inquiries/{id}` |
| 7 | `/inquiries/:id/chat` | Inquiry chat | `GET …/inquiries/{id}` · `GET/POST …/{id}/messages` |
| 8 | `/alternatives` | Alternatives | `GET/POST/DELETE /api/pharmacy/alternatives` · `GET …/medicines/search` |
| 9 | `/alternatives/create` | Add alternative | `GET /api/pharmacy/inventory` · `GET …/medicines/search` · `POST …/alternatives` |
| 10 | `/ratings` | Ratings | `GET /api/pharmacy/ratings` |
| 11 | `/profile` | Profile | `GET/POST /api/profile/pharmacy` · `POST …/change-password` |
| 12 | `/profile/complete` | Complete profile | `GET/POST /api/profile/pharmacy` |
| 13 | `/accounting` | Accounting overview | `GET …/accounting/overview` |
| 14 | `/accounting/sales` | Sales log | `GET …/accounting/sales` (filtered + paged) |
| 15 | `/accounting/sales/create` | POS new sale | `GET …/inventory` · `GET …/customers` · `GET /api/medicines/barcode/{code}` · `POST …/sales` |
| 16 | `/accounting/sales/:number` | Invoice | `GET …/accounting/sales/{number}` |
| 17 | `/accounting/refunds` | Refunds log | `GET …/accounting/refunds` |
| 18 | `/accounting/refunds/create/:saleNumber` | Create refund | `GET …/sales/{n}/refund-items` · `POST …/refunds` |
| 19 | `/accounting/refunds/:id` | Refund detail | `GET …/refunds/{id}` · `GET …/sales/{number}` |
| 20 | `/accounting/cash` | Cash register | `GET …/accounting/cash` |

**Not reachable with live data (no rows in the DB, not a code problem):**
`/accounting/sales/:number`, `/accounting/refunds/:id`, `/accounting/refunds/create/:saleNumber`.
The DB currently has **0 sales and 0 refunds**, so these three parameterised routes cannot be
exercised end-to-end. Their contracts were verified against the controllers and are typed.

---

## 3. New modules

### API layer (`src/api/`)
| File | Purpose |
|---|---|
| `pharmacyApi.ts` | ~60 typed endpoint bindings over the existing `createApiClient` |
| `pharmacyTypes.ts` | Every response shape, transcribed from the real controllers |
| `useApiQuery.ts` | Dependency-free data-fetching hook (loading/error/empty/refetch) + `useApiMutation` |
| `client.ts` | **modified** — added `FormData` support and an authenticated `download()` |

### Helpers (`src/lib/`)
| File | Purpose |
|---|---|
| `stock.ts` | The approved `quantity`-only stock rule, shared by every screen |
| `format.ts` | Dates, times, relative time, money, plus `thumbUrl()` (Cloudinary) |
| `appRoute.ts` | Maps backend `href`s (absolute Blade URLs) onto SPA routes |
| `money.ts` | `round2` / `sumBy` — one rounding rule |
| `i18n.ts` | **modified** — added `labelOf()` and 5 strings that had no source |

### Profile
`src/features/pharmacy/profile/hours.ts` — working-hours contract shared by both profile
screens (short day keys, `null` = closed, **full-replace** save).

### UI
`AsyncBoundary` + `LoadingState` / `ErrorState` / `EmptyState` in `components/ui`,
with `.ph-skel-row`, `.ph-error`, `.sr-only` styles built from `--ph-*` tokens so
**both themes work with no extra rules**, and `prefers-reduced-motion` is respected.

**No new dependency was added** (rule B7).

---

## 4. Real defects found and fixed

| ID | Defect | Fix |
|---|---|---|
| **D-1** | Refund screen offered each line's **gross** total as refundable — a line could be refunded twice | Read `available_quantity = original − refunded` from `…/refund-items` and cap every input at it. **D-1 is now closed.** |
| — | `useApiQuery` restarted on every render (inline `deps` array), so requests were aborted before resolving — a permanently stuck skeleton | Serialise `deps` by **value**, not identity |
| — | Cash screen: Blade paginated **before** filtering, so the table ignored the filter bar | Filtering moved into SQL (`source_type`, `direction`) |
| — | Cloudinary images were requested at full resolution into 44×44 cells | `thumbUrl()` reproduces `App\Support\Image::thumbUrl()` — **verified 4/4 byte-identical** against real PHP output |
| — | `kpi.href` / `alert.href` are absolute **Blade** URLs; a `<Link>` would leave the SPA | `toAppRoute()` strips origin + `/pharmacy` |
| — | `client.ts` could not send multipart | `FormData` support + `download()` for token-authenticated files |

### Backend divergence NOT propagated
`available_count` in the dashboard/inventory `stats` is `is_available && quantity > 0`, which
**also matches every low row** — live: `available = 11`, `low = 6`, `total = 11`
⇒ `low + available = 17 > total`. The backend's own per-row flags are correct; only the
aggregate is wrong. Screens **derive** the counts from the rows (approved rule:
`0 out / 6 low / 5 available`). No backend change made.

---

## 5. Documented gaps (backend-side, reported not patched)

GAP-1 `region` accepted + persisted but never returned ·
GAP-2 no ratings aggregate (average/histogram derived client-side, page-scoped) ·
GAP-3 no dashboard-trends endpoint (widget removed, not faked) ·
GAP-4 no POS catalogue endpoint (`/medicines/search` has no price/quantity → POS uses inventory) ·
GAP-5 `kpi.href` points at Blade routes ·
GAP-6 transient 500 from cold DB connection ·
GAP-7 no candidate-alternatives endpoint ·
GAP-8 `logo` is a URL, not an upload ·
GAP-9 `email` neither returned nor writable ·
GAP-10 refund detail omits the sale summary (fetched separately) ·
GAP-11 refund items carry no `unit_price` (derived `amount / quantity`) ·
GAP-12 no import-session list endpoint.

Full detail: `docs/API-CONTRACT-MAP.md`.

---

## 6. 🔴 Root cause of the intermittent 500s (confirmed)

The database is **remote Aiven MySQL** — `dway-db-daway.l.aivencloud.com:28123`.
The timeouts appear in `Connectors/Connector.php:67` and `Connection.php:435`, i.e. **connection
establishment**, not query execution.

Measured latency (warm, repeated):

| Endpoint | TTFB |
|---|---|
| `/api/pharmacy/inventory?per_page=100` | 3.7 – 4.7 s |
| `/api/login/pharmacy` | 4.5 – 5.7 s |
| `/api/pharmacy/accounting/overview?range=7d` | **16.9 s · 18.2 s · 62.1 s** |

The accounting overview is by far the worst and its variance is extreme. Because the SPA's
client timeout is 20 s (`VITE_API_TIMEOUT_MS`), a 62 s response is aborted and the screen shows
its **error + retry** state — which is the correct behaviour, but it means that screen is
**unreliable on this connection for infrastructure reasons, not frontend ones**.

**This is an environment condition, not a code defect, and no backend change was made.**
It is, however, exactly why the loading/error/retry states were required rather than cosmetic.

---

## 7. Mocks — deleted

- `src/data/pharmacy.ts` (**1390 lines**) — deleted
- `src/data/pharmacy.fixtures.test.ts` — deleted
- `src/data/` — directory removed; **no dangling references**

Two test blocks guarded **live** helpers and were preserved rather than deleted with the mocks:
`money()` → `src/lib/format.test.ts`; `round2`/`sumBy` → `src/lib/money.test.ts`.
The other 18 fixture tests asserted mock values that no longer exist.

---

## 8. Verification

### Gates — all green
| Gate | Result |
|---|---|
| `tsc -b --noEmit` | **0 errors** |
| `eslint .` | **0 errors, 0 warnings** |
| `vitest run` | **48 / 48 passed** (6 files) |
| `vite build` | **✓ built** — 537.91 kB JS (gzip 152.07) · 133.05 kB CSS (gzip 24.26) |
| `git diff --check` | **clean** |

### Live end-to-end (headless Chrome, real login `PH-1234` / `password`)
Screens verified rendering with **live backend data** (heading + row/stat counts read from the DOM):

```
/               GET /api/pharmacy/dashboard/stats              → 200  stats=4 rows=5
/inventory      GET /api/pharmacy/inventory?per_page=100       → 200  stats=4 rows=11
/medicines      GET /api/pharmacy/inventory?per_page=100       → 200  stats=4 rows=11
/inquiries      GET /api/pharmacy/inquiries?per_page=50        → 200  stats=3 rows=6
/alternatives   GET /api/pharmacy/alternatives                 → 200  stats=2 empty=1
/ratings        GET /api/pharmacy/ratings?per_page=100         → 200  empty=2
/profile        GET /api/profile/pharmacy                      → 200
/accounting     GET /api/pharmacy/accounting/overview?range=7d → 200  (when < 20s; see below)
/accounting/sales GET /api/pharmacy/accounting/sales?per_page=25&page=1 → 200
```

Zero error boundaries, zero auth bounces. `rows=11` matches the database exactly, and the
dashboard showed **11 إجمالي · 5 متوفر · 6 مخزون منخفض · 0 نافد** — the approved numbers,
with `available` derived rather than trusting the backend aggregate.

### `/accounting` — the error path is verified (and it works)

The accounting overview is the slowest endpoint by far (17 s / 18 s / **62 s** across three
warm calls). When it exceeds the client's 20 s timeout the screen does exactly what it should:
it leaves the skeleton and renders a clear, Arabic, RTL error card with a working
**إعادة المحاولة** (retry) button, while the page heading and action buttons stay usable.

Captured evidence: `qa/accounting-check/accounting.png`
(report: `errorBoundary: 1`, `loading: 0`, message *"انتهت مهلة الطلب، يرجى المحاولة مرة أخرى"*).

This is a **positive** result — it is the error/retry state the brief required, proven on the
one endpoint that reliably triggers it. The same screen rendered its data successfully in an
earlier run (`→ 200`, empty states visible) when the endpoint answered in time.

**The flakiness is infrastructure, not code.** No frontend or backend change was made for it.

### Assets / fonts
No asset or font change in this pass. Fonts remain self-hosted Cairo + Tajawal
(`/fonts/tajawal-*.woff2` served 200); `/vendor/chart.umd.js` still ships and loads.

### RTL
All new markup uses logical properties (`margin-inline`, `border-block`, `text-align: start`)
and inherits the existing `dir="rtl"`. Arabic labels come from the backend where the backend
provides them (`label`, `status_label`, `method_label`, alert text) and are rendered verbatim.

### Responsive
New table wrappers use the standard `.ph-table-wrap`, and pagination/filter bars use flex with
wrap. **Not re-verified at 768/390 in this pass** — the pre-existing shell-wide sidebar
collapse issue (below) still dominates narrow layouts.

---

## 9. New tooling

| Tool | Purpose |
|---|---|
| `tools/lib/paths.mjs` | Shared MSYS path sanitiser (used by 3 tools) |
| `tools/api-shape.mjs` | Prints the real shape of any endpoint |
| `tools/page-check.mjs` | Loads a page and reports the **actual** console/network errors |
| `tools/screens.mjs` | Authenticated sweep of every screen + screenshots + JSON report |
| `tools/probe-inventory.mjs` | Single-route DOM + traffic probe |

---

## 10. Known open items

1. **`/accounting/sales/:number`, `/accounting/refunds/:id`, `…/refunds/create/:saleNumber`** —
   cannot be exercised end-to-end: the DB has no sales or refunds.
2. **`/profile/complete` and `/inventory/import`** were wired but not captured in the final
   sweep (both were exercised earlier in the session).
3. **Remote-DB latency** — screens are correct but slow (≈4 s TTFB). Any performance work is a
   backend/infrastructure matter and was out of scope.
4. **Shell-wide sidebar responsive collapse at 768/390** — pre-existing, still open, unrelated
   to this wiring.
5. **POS catalogue is page-scoped** (`per_page: 200`); a pharmacy with more stock lines needs
   server-side paging (GAP-4).

---

## 11. Git

```
branch:  develop
remote:  (none configured)
```

Tracked files modified (10):

```
 index.html                      |  44 ++++++++
 package.json                    |   4 +-
 src/api/client.ts               |  39 ++++++-
 src/auth/authHooks.ts           |  32 +++++-
 src/auth/session.ts             |   3 +
 src/features/auth/LoginPage.tsx | 225 +++++++++++++++++++++++++++++--------
 src/layouts/AppLayout.tsx       |  36 +++---
 src/routes/paths.ts             |  14 +++
 src/routes/router.tsx           | 119 +++++++++++++++++++++--
 src/styles/global.css           | 242 +++++++---------------------------------
 10 files changed, 487 insertions(+), 271 deletions(-)
```

Plus 78 untracked files under `src/`, `tools/`, `docs/` (the new API layer, helpers, wired
screens, tooling and the contract map).

`git diff --check` → **clean** (only LF→CRLF notices, no whitespace errors).

**No commit. No push. No remote created.** Per the standing rule, shipping stops here and waits
for approval.
