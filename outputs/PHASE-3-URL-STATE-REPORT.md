# PHASE 3 — URL State, Drafts, Keep-Alive & Guards

**Date:** 2026-10-15
**Scope:** `daway-web` (frontend only). Backend untouched — no API contract, route, DB or business logic changed.
**Predecessors:** `PHASE-1-UI-FOUNDATION-REPORT.md`, `PHASE-2-STATES-REPORT.md`.

---

## 0. 🔴 The headline: the app was crashing on EVERY route, and no static gate could see it

While verifying the browser smoke test I found that **`lazyPage` — the helper that
turns every route into a code-split chunk — rejected every page in the repo.**

```ts
// BEFORE (broken)
if (mod.default && typeof mod.default === 'object' && '$$typeof' in mod.default) …
const named = Object.values(mod).find(v => v != null && typeof v === 'object' && '$$typeof' in v);
```

`'$$typeof'` exists on `memo()` / `forwardRef()` wrappers — **not** on a plain
function component. Every page here is `export function PageName()`, i.e.
`typeof === 'function'` with no `$$typeof`. So `find` returned `undefined` and the
helper threw:

```
Unexpected Application Error!
lazyPage: no default or named component export found
```

**Why it survived three phases of gates:** the throw happens when a route is
*rendered*, not when the bundle is built. `tsc -b`, `eslint .`, `vitest run` and
`vite build` all pass on code that crashes the moment a user opens the app. The
Phase-1 gate was static-only; this is the gap that let it through.

**Fix** — resolution logic moved to a pure, tested module:

| File | Role |
|---|---|
| `src/routes/lazyPageResolve.ts` | `isComponent()` (accepts **function** *or* object-with-`$$typeof`) + `resolveLazyComponent()` — default → PascalCase named export → the single component-like export |
| `src/routes/lazyPage.tsx` | thin `React.lazy` + `Suspense` wrapper over the above |
| `src/routes/lazyPageResolve.test.ts` | 11 tests; the **first** one is this exact regression |

Verified in a real browser: `/login` now renders the form (it previously rendered
an error boundary).

---

## 1. URL state — one shared, tested library

`src/lib/urlState.ts` was rebuilt around a pure core plus a hook:

| Export | Contract |
|---|---|
| `readUrlState(searchParams, schema)` | typed values; a throwing `parse` falls back to `default` |
| `writeUrlState(prev, updates, schema)` | returns a **new** `URLSearchParams`; a value equal to its `default` is **removed**; foreign params are preserved |
| `clearUrlState(prev, schema)` | removes only this schema's keys |
| `useUrlState(schema)` | `{ state, set, reset }`; writes with `replace: true`; `set`/`reset` are stable via a latest-ref |

**Why URL params, not component state:** filters become shareable, back/forward-safe,
and survive a reload — what a user expects when they copy a filtered view.

### Applied to 12 screens

| Area | Screens | Params |
|---|---|---|
| Pharmacy | `MedicinesPage`, `InventoryPage`, `InquiriesPage` | `tab`, `q` |
| Pharmacy | `AlternativesPage` | `q` |
| Pharmacy | `AccountingSalesPage` | `q`, `range`, `method`, `status`, `page` |
| Pharmacy | `AccountingRefundsPage`, `AccountingCashPage` | `q`/`source`, `status`/`direction`, `page` |
| Admin | `AdminMedicinesPage`, `AdminPharmaciesPage`, `AdminUsersPage`, `AdminMedicineRequestsPage`, `AdminLogsPage` | `q`, `status`/`role`/`event`, `date`, `page` |

### Two deliberate decisions

1. **`AdminCategoriesPage` is left as-is.** Its `?q=` carries a *presence* semantic
   (`seeded === null` means "no param", `?q=` means "clear the filter") that the
   generic schema — which maps both to `''` — cannot express. Forcing it onto the
   hook would have broken a documented behaviour to win consistency.

2. **Debounced admin search commits only on change.** The URL holds the committed
   term; the effect writes it **only when `q !== committedQ`**. Without that guard a
   deep link like `?q=…&page=3` would be rewritten to page 1 on mount.

---

## 2. Drafts — `lib/drafts.ts` (identity-scoped, TTL-bound, sessionStorage)

Wired into the three screens where losing in-progress work hurts most:

| Screen | What is preserved | Cleared |
|---|---|---|
| `AccountingSaleCreatePage` (POS) | cart lines, selected customer | on successful sale |
| `InquiryChatPage` | the unsent message draft | on send |
| `InventoryPage` | unsaved per-row quantity edits | on successful save / bulk-apply |

The `InventoryPage` draft no longer wipes on every data arrival (the old
`useEffect([query.data])` fought the TanStack cache); restored ids are matched
against live rows, so a stale draft can never write to a deleted row.

---

## 3. Keep-alive — `layouts/KeepAliveOutlet.tsx`

The POS page is the most expensive screen to lose (12 state atoms). It is now
mounted **once**, in a hidden `div`, and stays alive while the user is elsewhere —
returning re-reveals it instantly, with no remount and no catalogue refetch. Its
route still renders `null`, so URL matching, guards and breadcrumbs are unchanged.
The POS chunk stays lazy, so code-splitting is preserved (confirmed in the build
output: `AccountingSaleCreatePage-*.js` is still its own chunk).

---

## 4. `useBlocker` — `components/admin/UnsavedChangesGuard.tsx`

**Where it is used, and where it deliberately is not:**

- **Not** on the POS or Inventory. Keep-alive preserves the cart and `lib/drafts.ts`
  persists every draft, so leaving those screens loses nothing — a prompt there is
  pure friction.
- **On the admin forms** (`AdminMedicineFormPage`, `AdminUserFormPage`,
  `AdminSettingsPage`), whose fields live only in component state and *are* lost.

`when` accepts `boolean | (() => boolean)`. The predicate form matters: after a
successful save the form navigates while its fields still differ from the (stale)
baseline, so the save handler flips a ref immediately before `navigate()` — otherwise
the guard would intercept its own success redirect. A `beforeunload` listener covers
tab close / hard reload, which the router's blocker cannot see.

---

## 5. Harness fixes & a new verifier

- **`nav-smoke.mjs` and `shot.mjs` were missing `--no-proxy-server`.** Chrome
  honours the system proxy, which routes `127.0.0.1` through the sandbox proxy and
  refuses the connection — the tools failed with `ERR_CONNECTION_REFUSED` before
  reaching the app. Both now match `screens.mjs` / `probe-inventory.mjs`.
- **New: `tools/verify-url-params.mjs`** — logs in, then runs 13 assertions on the
  URL contract (deep-link is read from the URL, filter writes the URL, a default
  value is omitted, changes use `replace` without growing history, params survive a
  reload) across two screens with different schemas.

---

## 6. Gates

| Gate | Result |
|---|---|
| `tsc -b --noEmit` | **0 errors** |
| `eslint .` | **0 errors, 0 warnings** |
| `vitest run` | **248 / 248 passed** (20 files) — was 237 before this phase's new tests |
| `vite build` | **✓ built** — code-splitting intact (every page its own chunk) |
| `check:css` (dead-CSS ratchet) | **✓ 118 < 120** — shrank |
| `nav-smoke` (8 authenticated routes) | **8 / 8 ok** — h1 rendered, `docW == winW`, no console errors |
| `verify-url-params` | **13 / 13 passed** |

### The two failures I chased, and what they actually were

1. *"login form never appeared"* → the dev server had been killed with its parent
   shell, and Chrome could not reach `127.0.0.1` at all (proxy). Fixed the harness
   and ran the server as a persistent background task.
2. *"deep link fills the search input — input=null"* and *"default tab is omitted —
   still present"* → **harness timing, not app bugs.** The filters block renders
   *inside* `AsyncBoundary`, and the local API reads a remote MySQL (17–62 s per
   call), so the probe ran against the loading skeleton and the tab-click checks
   passed *vacuously*. After waiting for the skeleton to clear and asserting the
   active tab (not just the URL), all checks passed.

A third failure — *"inventory deep link selects the matching tab — activeIndex=3"* —
was **my assertion being wrong**: `InventoryPage`'s order is `['all','ok','low','out']`,
so `out` really is index 3. The app was right.

---

## 7. Files

**New (8):** `routes/lazyPageResolve.ts` · `routes/lazyPageResolve.test.ts` ·
`components/admin/UnsavedChangesGuard.tsx` · `api/queryClient.test.ts` ·
`tools/verify-url-params.mjs` · `layouts/KeepAliveOutlet.tsx` · `lib/drafts.ts` ·
`lib/drafts.test.ts` (the last three from Phase 3a)

**Rewritten (2):** `lib/urlState.ts`, `lib/urlState.test.ts` (the test previously
tested `PRESET_STALE_TIMES` and never imported `urlState` — those assertions moved
to `api/queryClient.test.ts`)

**Modified:** 12 list screens · 3 admin forms · `lib/i18n.ts` (4 strings) ·
`tools/nav-smoke.mjs` · `tools/shot.mjs`

**Not touched:** any API contract, any route path, any backend file.

---

## 8. Residual risk (stated, not assumed)

1. **The `UnsavedChangesGuard` was not driven end-to-end.** Its blocker logic and the
   save-then-redirect escape are reasoned and type-checked, but no automated test
   navigates away from a dirty form and asserts the modal. `useBlocker` needs a live
   router, which the node-only vitest setup does not provide.
2. **Screens whose data takes >88 s** would still fail `verify-url-params` (the
   `waitForList` cap). No screen hit that ceiling in these runs.
3. **`page` params are validated on read** (`Math.max(1, Number(…) || 1)`) but a
   hand-edited `?page=99999` produces an empty list rather than a redirect. The API
   returns an empty page; the pagination control still renders. Left as-is —
   clamping to `last_page` would need the response first.
