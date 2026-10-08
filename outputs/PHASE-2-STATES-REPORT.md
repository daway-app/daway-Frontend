# PHASE 2 — States + Onboarding

**Date:** 2026-10-08
**Scope:** `daway-web` — Phase 2 only. Phase 3 not started.
**Backend:** untouched. No API contract, route, DB or business logic changed.

---

## 0. Correction to the earlier draft of this report

A previous draft declared an **ownership conflict** with a "second session" in the repo and
stopped work because of it. That was wrong, and it is worth recording why:

`Notice` exists in the working tree but **not** in `HEAD`
(`git show HEAD:src/components/ui/index.tsx | grep "export function Notice"` → nothing). The
draft concluded another session had created it.

It was **me** — a turn that got truncated mid-edit. There was never a second session, and
nothing was blocked. The lesson: before assuming a conflict, check `git show HEAD:<file>` and
compare against your own uncommitted work.

---

## 1. The audit — measured, and corrected twice

The brief asked for an audit before any change. My first pass produced two claims that were
**wrong**, and I am reporting both because the corrected numbers are what the work is based on:

| First claim | What it actually was |
|---|---|
| "18 screens show a generic empty state" | **15 of 18 already render context-aware inline empty states** with their own Arabic copy. The remaining 3 are **forms**, which have no meaningful empty state. |
| "5 screens write with no success feedback" | 3 of those already had feedback (the chat message bubble *is* the confirmation; the import screen shows a preview card). The real gap was **2**. |

**Lesson (and it repeated all through this phase):** count with a script, but do not *conclude*
from one counter. A grep cannot tell "missing" from "implemented differently".

The verified gaps were:

| Gap | Count | How it was measured |
|---|---|---|
| Empty states with **no call to action** | 11 | grepping each `ph-empty` block for a button/link |
| Writes with **no success feedback** | 2 | `AlternativesPage`, `InquiriesPage` |
| Native `alert` / `confirm` | 2 | `ProfilePage`, `MedicinesPage` |
| Onboarding | 0 — did not exist | no such code |
| First-use guidance | 0 — did not exist | no such code |

---

## 2. 🔴 The most important find: the POS was completely broken

The **expanded smoke QA** (Phase 1 point 6 — 17 routes instead of 3) caught this on
`/accounting/sales/create`:

```
error boundary: يجب ألا تكون قيمة الحقل per page أكبر من 100
HTTP 422  /api/pharmacy/inventory?per_page=200
```

The backend validates `per_page` with `max:100`. The till asked for **200**, so the request was
rejected and the screen loaded **no catalogue at all** — it was unusable.

**Fixed:** `INVENTORY_PAGE_SIZE = 100`, a named constant with the limit documented at the call
site. **Verified after:** `err=0`, `GET /api/pharmacy/inventory?per_page=100 → 200`.

A 3-screen check never visited this page. This is the entire argument for the wider sweep.

---

## 3. What was implemented

### 3.1 Empty states — context-aware CTAs

The brief's "guide them to the next step". Each CTA leads to the action that actually unblocks
the screen, and **every label reuses an existing i18n string** — no new copy.

| Screen | Empty state | CTA |
|---|---|---|
| `InventoryPage` | "لا توجد أدوية في المخزون" | إضافة دواء جديد → `/medicines/request` |
| `MedicinesPage` | "لا توجد أدوية" | إضافة دواء جديد → `/medicines/request` |
| `AlternativesPage` | "لا توجد أدوية في صيدليتك لإدارة بدائلها" | إضافة دواء جديد → `/medicines/request` |
| `AccountingCashPage` | "لا توجد حركات صندوق" | فاتورة جديدة → `/accounting/sales/create` |

`MedicinesPage` previously showed **one** empty state for both the filtered and unfiltered case.
Those are different situations and now read differently: a search with no match says
"لا نتائج" and offers **no** CTA (the user knows how to add — they searched for something that
is not there), while a genuinely empty pharmacy gets the action.

**Deliberately given no CTA**, because no real action exists:
`RatingsPage` (ratings come from patients) · `DashboardPage` (a summary) ·
`AccountingOverviewPage` (a summary) · `AccountingSaleCreatePage` (the POS's own cart state) ·
`InquiriesPage` / `InquiryChatPage` (patient-driven) · the "not found" states (they already
carry a back link).

### 3.2 Success feedback

- **`InquiriesPage`** — changing an inquiry's status was silent. It now confirms with the
  status the user picked (`status_saved`).
- **`AlternativesPage`** — linking **and** unlinking an alternative were both completely silent;
  the row simply appeared or vanished. Both now confirm.

### 3.3 A documented-but-unwired state

`InquiriesPage` declared `statusError` with a comment explaining exactly why it was needed —
*"the update is optimistic, so on failure the badge silently flips back… the revert needs an
explanation"* — and then **never used it**. The update reverted with no explanation, which is
indistinguishable from a broken button. The intent is now implemented.

### 3.4 Native dialogs — zero left

| Was | Now |
|---|---|
| `ProfilePage`: `window.alert(…)` **immediately followed by a redirect** | A blocking modal. The old pairing was actively broken — the dialog blocked the page and dismissing it fired the navigation, so the message could never be read. The session really is over (the backend deletes all tokens), so re-login is the only action and the modal says so. |
| `MedicinesPage`: `window.confirm("…delete this medicine?")` that **did nothing** | A disabled button with an honest title. There is **no delete endpoint** — `routes/api.php` exposes only `GET` for medicines. Confirming a destructive action and having nothing happen is worse than not offering it. The button is kept (removing it would drop UI the Blade page has) but no longer lies. |

### 3.5 Onboarding — `SetupChecklist`

A new reusable component (4 steps: account · profile · first medicine · first invoice) with a
real `role="progressbar"`, a per-step hint, and an "ابدأ" link on each unfinished step.

Meeting the brief's constraints:
- **Not annoying / does not cover content** — it is an inline card in the normal page flow,
  never a modal or an overlay.
- **Disappears on its own** — the component returns `null` once every step is done, so an
  established pharmacy never sees it.
- **Dismissible and remembered** — dismissal persists in `localStorage`.
- **Never guesses** — completion is derived from real data, and the component takes the steps
  as props rather than fetching anything.

### 3.6 🔴 A design mistake I made and fixed

My first version gated the checklist on **two extra queries** (profile + sales). On this
backend those requests carry a **~10 s CORS preflight each**, so a genuinely new pharmacy would
have sat in front of a normal-looking dashboard and the guidance would have arrived ten seconds
late — the opposite of the point of onboarding.

**Fixed by gating on data that is already loaded:** a pharmacy with no stock is either brand new
or has not started, and either way the checklist is the right thing to show. It appears as soon
as the stats land. The profile branch still refines it for a pharmacy that *does* have stock but
never filled in its public profile — the one case where waiting is genuinely unavoidable,
because the fact is not known any earlier.

---

## 4. Components

**No new component was added that duplicates an existing one.** One was, and it was caught:

> I built a `SuccessNotice` component plus a `.ph-notice` CSS block **before checking** —
> and `Notice` already existed with 4 tones and 2 live call sites. Both were deleted and the
> existing `Notice` used instead. Net effect on the tree: none. This is exactly the
> duplication the brief forbids.

**Extended, not duplicated** (each gap was verified against real call sites first):

| Component | What was missing | Evidence it was needed |
|---|---|---|
| `Badge` | 6 of the 12 variants the CSS defines (`paid/partial/unpaid/cancelled/credit/refunded`) | screens build these via `statusBadgeClass()`; TypeScript rejected them |
| `DataTable` | `scope="col"`, `<caption>`, per-column class | 53 `scope="col"`, 8 `<caption>`, 18 `th className` in the screens |
| `Btn` | a link form | 14 `.ph-btn` on `<Link>`/`<a>` |
| `EmptyState` | action slots | 4 real empty states already contained a button |
| `PageHeader` | an icon | — |

**New:** `SetupChecklist`.

---

## 5. Files changed

**New (2):** `outputs/PHASE-2-STATES-REPORT.md` · (`tools/dead-css-budget.json` from Phase 1)

**Modified (13):**
`components/ui/index.tsx` · `lib/i18n.ts` ·
`dashboard/DashboardPage.tsx` · `inventory/InventoryPage.tsx` · `medicines/MedicinesPage.tsx` ·
`alternatives/AlternativesPage.tsx` · `inquiries/InquiriesPage.tsx` · `profile/ProfilePage.tsx` ·
`accounting/AccountingCashPage.tsx` · `accounting/AccountingSaleCreatePage.tsx` ·
`styles/ui-system.css` · `tools/screens.mjs` · `tools/probe-inventory.mjs`

**Not touched:** any API contract, any route, any backend file, any business logic.

---

## 6. Gates

| Gate | Result |
|---|---|
| `tsc -b --noEmit --force` | **0 errors** |
| `eslint .` | **0 errors, 0 warnings** |
| `vitest run` | **56 / 56 passed** (7 files) |
| `vite build` | **✓ built** — CSS 141.36 kB (gzip 25.76) |
| `check:css` (dead-CSS ratchet) | **✓ 134 / 135** — shrank |

> ⚠️ `tsc -b` reported **stale errors** mid-session (names that were demonstrably declared two
> lines above). `--force` clears it. Do not believe a `tsc -b` failure without `--force`.

### Visual verification

| Screen | Result |
|---|---|
| `/` dashboard + checklist | ✓ rendered — **2 / 4**, progress bar, hints, per-step links |
| `/accounting/cash` | ✓ rendered, empty state with CTA |
| `/accounting/refunds` | ✓ rendered |

Shell integrity asserted on every capture (`sidebar = 260px`, `topbar = 81px`,
`overflowX = false`) — a screenshot alone does not reveal a missing sidebar.

**Harness bugs fixed along the way:** `screens.mjs` gained shell-integrity assertions and
`THEME=dark`; `probe-inventory.mjs` used a fixed 3.5 s sleep before finding the login form and
aborted falsely on a slow backend — it now polls.

---

## 7. Remaining

1. **7 empty-state CTAs not added** — the remaining screens were checked and deliberately left
   alone (§3.1), except `AccountingRefundsPage` and `AccountingSalesPage`, which would benefit
   from a "view sales" link. Low value, not done.
2. **No `window.confirm` replacement UI** for the disabled delete button — there is no endpoint,
   so there is nothing to build yet. When the endpoint lands, the button becomes real and the
   modal pattern from `ProfilePage` is the template.
3. **The onboarding checklist was verified with the gate temporarily forced** — the demo
   pharmacy has stock and an incomplete profile, so the real gate does resolve to "show", but
   the capture window (~10 s preflight) made it unreliable to observe directly. The component
   itself is confirmed rendered; the *gate* is type-checked and reasoned, not visually confirmed
   in both branches.
4. **Responsive QA at 390 / 768 was not re-run** for Phase 2.
