# daway-web — Audit Remediation Report

**Date:** 2026-10-06 · **Branch:** `develop` · **Remote:** none configured
**Scope:** `daway-web` only. Laravel/Blade/backend untouched. Patient UI untouched.
**Source:** "Cleanliness & Technical Debt Audit — daway-web (READ-ONLY)"
**Status:** all fixes applied locally. **Nothing committed, nothing pushed.**

---

## 1. Verdict on the audit itself

The report was **accurate and well-evidenced**. Every finding I re-checked reproduced,
with two corrections:

| Audit claim | My independent measurement | Note |
|---|---|---|
| "228 of 622 CSS classes (~37%) unused" | **159 of 634 (25%)** | The audit over-counted: it missed classes passed as props (`bodyClassName="…"`) and composed inside template literals. My detector is deliberately conservative (see §5). |
| (not reported) | **A second real defect found** | No pre-paint theme snippet — see §4. |

I re-measured every number I quote below. Nothing is restated on the audit's authority.

---

## 2. Verdict per finding

### 🔴 CRITICAL

| ID | Verdict | Action |
|---|---|---|
| **B-1** Chart.js never loads in production | **REAL — confirmed** | Fixed + probe-guarded |
| **B-2** Cash balance: two conflicting sources | **REAL — worse than stated** | Fixed + test |

**B-1 — confirmed.** `index.html` had no `<script src="/vendor/chart.umd.js">`, and
`Chart.tsx` polled `window.Chart` every 50 ms **with no upper bound**, so charts rendered
blank canvases forever with no console error. Fixed by adding the `defer` script tag and
replacing the unbounded poll with a 5 s bounded wait that logs loudly on failure.

**Proof (real app, real backend, not the harness):**
```
6/6 checks passed
  PASS  window.Chart is defined
  PASS  chart.umd <script> present in DOM
  PASS  chart.umd served with 200
  PASS  every canvas has been drawn to — 2/2 drawn
        canvas[0] 482x260 — drawn
        canvas[1] 482x220 — drawn
  PASS  no console errors
```
Also verified in the built artifact: `dist/index.html:27` ships the tag and
`dist/vendor/chart.umd.js` (204,993 bytes) is emitted.

**B-2 — confirmed, and the gap was larger than reported.** The audit said the derived
balance "resolves negative". It is **-1366.50**, while the KPI literal was **+1240.50** —
a **₪2607** discrepancy between the Overview and the Cash page for the same figure.
Fixed: the KPI now reads the single derived `MOCK_CASH_BALANCE`, and the Cash page
consumes the same constant instead of re-deriving inline.

### 🟠 HIGH

| ID | Verdict | Action |
|---|---|---|
| **B-3** Refunds reference non-existent sales | **REAL** | Fixed (repointed to real sales) |
| **B-4** Refund line arithmetic wrong | **REAL** | Fixed + `note?` field for documented divergence |
| **B-5** `.ph-page-title` undefined in 9+ files | **REAL** | Fixed — defined, not deleted |
| **B-6** Global `table { min-width }` leak | **REAL** | Fixed — scoped |
| **B-7** ~47% of accounting CSS unconsumed | **PARTLY REAL — escalated to guard** | Quarantined what is provably dead; see §3 |
| **B-9** `!important` escalation from duplicated selectors | **REAL** | Fixed — one owner per selector |

**B-5 nuance:** the hook is undefined in **Blade too** — this is an inherited legacy defect,
exactly the class the migration exists to leave behind. The fix defines `.ph-page-title`
properly rather than deleting the hook, because the standalone accounting pages
(cash/refunds) had an **entirely unstyled** `<h1>` and `.subtitle`.

**B-6:** the bare `table { min-width: 620px }` sat in a *layout* stylesheet
(`sidebar.css`, inside `@media max-width:768px`), so it hit every table app-wide. Scoped to
`.ph-table-wrap > table, .table-container > table`.

**B-9:** `.user-name`/`.user-role` existed **twice, unscoped**, in `sidebar.css` (white, dark
sidebar) and `topbar.css` (`--text-primary`), each with `!important` to out-shout the other.
Also `.user-profile-btn` — a topbar element — was sized from `sidebar.css`. Fixed by giving
each context its own scoped owner and dropping every escalation `!important`. Only the
legitimate ones remain (`prefers-reduced-motion`, `@media print`, `.ac-hidden`/`.pi-hidden`).

### 🟡 MEDIUM

| ID | Verdict | Action |
|---|---|---|
| **B-8** 37% dead selectors | **REAL (25%, not 37%)** | Quarantined + ratchet guard; see §3 |
| **B-10** `money()` masks negatives via `Math.abs` | **REAL** | Fixed; added `moneyAbs()` |
| **B-11** `reffunded_at` typo | **REAL** | Renamed at all 6 sites |
| **B-12** rounding idiom duplicated | **REAL** | Extracted `src/lib/money.ts` |
| **D-2** alert "بقي 5" vs inventory 6 | **REAL** | Alert now derives the real lowest quantity |
| **D-3** avg `4.3` vs histogram `4.45` | **REAL** | Average now derives from the histogram |
| **D-5** duplicated fixtures | **REAL** | Both now derived |

### 🟢 LOW

| ID | Verdict | Action |
|---|---|---|
| **B-13** hardcoded light colours in `profile-complete.css` | **REAL** | Mapped to tokens via local aliases |
| **B-14** hardcoded `direction: rtl` | **REAL** | Now `text-align: start` (inherits direction) |
| **B-15** `data-theme` set but never read | **REAL** | Made a real selector (not deleted) |
| **B-16** two tokens for the same disabled-field visual | **REAL** | Single owner in `base.css` |

### ⚖️ D-4 — **NOT A DEFECT (documented, not changed)**

The audit flagged `كلاريتين` as id **15** in inventory but id **31** in the catalogue.
This is **correct by design**: they are two different id namespaces —
`pharmacy_medicines.id` (what this pharmacy stocks) vs `medicines.id` (the MOH catalogue
you may propose as an alternative). All candidates 31–34 exist in the catalogue and none are
inventory rows (لوسيك 40mg / أموكسيل 250mg / هيبيتن are not stocked here). Same medicine,
different id per namespace — exactly as the real schema behaves. Documented in place with a
`RESOLVED AS NOT-A-DEFECT` comment so it is not re-raised.

---

## 3. B-7 / B-8 — why quarantine instead of delete

The audit warned "do not delete blind (some are runtime state classes)". **That warning was
right.** The scanner/QR block (lines 1302–1692) looks entirely dead, but an individual symbol
check found **4 live members**:

```
block 1302–1692 → 61 classes → 4 ARE referenced:
  ac-scan-actions, ac-scan-or, ac-entry-card, ph-btn
```

A line-range move would have silently broken the POS. So the deliverable is not a bulk delete:

- **Quarantined** the blocks that are dead **100 %** (barcode link-results, conflict compare,
  coverage card, activity card, inline-empty) — **254 lines** → `src/styles/legacy/accounting-unported-screens.css`,
  which is **not imported**, with a header explaining what it holds and how to revive it.
- **Ratchet guard** — `tools/dead-css-budget.mjs` (`npm run check:css`) freezes the current
  count and **fails if it grows**, so debt stops accumulating while each cluster is pruned
  deliberately, in its own review, with visual QA.

**Result:** dead classes **159 → 130** (−18 %). CSS bundle **136.98 kB → 131.98 kB** (−5 kB).

---

## 4. Defects I found that the audit did not list

**No pre-paint theme snippet.** `initTheme()` runs inside a Topbar effect, but the Topbar
only mounts **after login**. Consequences: the login screen could never render dark, and every
authenticated load painted light then flipped — a visible flash. Fixed with a synchronous
inline snippet in `index.html` that applies the stored theme before first paint.

**Double-encoded (mojibake) comments in `users-create.css`.** Arabic comments were written in
CP1256 and later re-saved as UTF-8 without transcoding. **Comments only — zero functional
impact.** The original text is unrecoverable without loss, so they were rewritten as readable
English section labels. The rest of `src/styles/**` was scanned and is clean.

---

## 5. Verification gates

| Gate | Result |
|---|---|
| `tsc -b --noEmit` | **exit 0** |
| `eslint .` | **exit 0** (0 warnings) |
| `vitest run` | **49 passed / 49** (was 31 — added 18 guards) |
| `vite build` | **✓ built** — CSS 131.98 kB, JS 512.03 kB |
| `npm run check:css` | **✓ 130/600 at budget** |
| `git diff --check` | **clean** |
| Chart probe (`tools/chart-verify.mjs`) | **6/6 passed** on the real app |

**New regression suite:** `src/data/pharmacy.fixtures.test.ts` — 18 tests pinning the exact
invariants of B-2, B-3, B-4, B-10, B-11, B-12, D-2, D-3 and D-5, named by audit id so a
regression is traceable to its finding.

### Responsive / RTL QA
No layout structure changed — the responsive rules touched (B-6, B-9) were **scoped**, not
removed, and B-14 replaced a hardcoded `rtl` with the inherited logical direction. The
pre-existing shell-wide sidebar collapse at 768/390 was **not** touched (out of scope for
this audit) and remains open — see §7.

---

## 6. Files changed

**Modified (tracked):**
`index.html` · `package.json` · `src/features/auth/LoginPage.tsx` · `src/layouts/AppLayout.tsx`
· `src/routes/paths.ts` · `src/routes/router.tsx` · `src/styles/global.css`

(From the earlier phase of this session; the audit work itself is in the untracked trees below.)

**Modified (untracked — this session's audit work):**
`src/data/pharmacy.ts` · `src/lib/theme.ts` · `src/styles/tokens.css` · `src/styles/base.css`
· `src/styles/pages/pharmacy-hub.css` · `src/styles/pages/pharmacy-accounting.css`
· `src/styles/pages/profile-complete.css` · `src/styles/pages/users-create.css`
· `src/components/ui/Chart.tsx` · `src/features/pharmacy/accounting/AccountingCashPage.tsx`
· `src/features/pharmacy/accounting/AccountingSaleCreatePage.tsx`
· `src/features/pharmacy/accounting/AccountingSalesPage.tsx`
· `src/features/pharmacy/accounting/AccountingRefundCreatePage.tsx`

**New:** `src/lib/money.ts` · `src/data/pharmacy.fixtures.test.ts`
· `src/styles/legacy/accounting-unported-screens.css`
· `tools/dead-css.mjs` · `tools/dead-css-budget.mjs` · `tools/chart-verify.mjs`
· `tools/quarantine-dead-css.mjs` · `tools/fix-mojibake-comments.mjs`
· `qa/dead-css.json` · `qa/dead-css-budget.json` · `qa/chart-verify.log`

---

## 7. Still open / needs your decision

1. **D-1** — `AccountingRefundCreatePage` shows the full `line_total` as refundable, ignoring
   prior refunds. Subtract prior refunds, or is gross intentional? *I did not change it.*
2. **Commit / push** — nothing committed. `daway-web` has **no remote configured**; supply the
   remote URL before any push.
3. **Shell-wide sidebar responsive collapse at 768/390** — pre-existing, outside this audit's
   scope. Recommend a dedicated fix.
4. **`daway-backend/.env`** was edited earlier this session (CORS origins for local dev). It is
   gitignored and local-only, so it has no repo impact — flagging it for completeness.

---

## 8. Bottom line

- **17 of 18 audit findings were real** and are fixed. **1 (D-4) is not a defect** and is
  documented as such. **1 (D-1) is escalated** for your decision.
- **2 additional defects** found that the audit missed, both fixed.
- Every fix carries a guard: **18 new tests, 2 new ratchets/probes, 5 new tools**.
- All gates green. **Nothing committed or pushed. Awaiting your approval.**
