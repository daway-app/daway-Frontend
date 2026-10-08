# PHASE 1 — UI Foundation + Visual Polish

**Date:** 2026-10-07
**Scope:** `daway-web` (React SPA) — the existing project, polished. No rebuild, no new UI.
**Backend:** untouched (read-only). No API contract, route, DB or business logic changed.
**Git:** nothing committed or pushed in this phase yet — changes are in the working tree.

---

## 1. What already existed (the audit, before touching anything)

The audit was **read-only** and measurement-driven, not eyeballed.

| Thing | Finding |
|---|---|
| Framework | **No Tailwind.** Vanilla CSS + design tokens — 16 files, **6,664 lines** |
| Token system | **Healthy.** 153 tokens defined: brand teal, neutrals (light **and** dark), semantic states (success/warning/danger/info × bg/text/fill), radii, shadows, easing, layout metrics |
| Reusable components | **Already existed**: `PageHeader` · `StatCard` · `Card` · `Badge` · `Btn` · `EmptyState` · `DataTable` · `Modal` · `LoadingState` · `ErrorState` · `AsyncBoundary` |
| Typography | Tajawal self-hosted, Arabic-first, RTL throughout |
| Duplicated selectors | Only **7** across files — the stylesheets are well partitioned |

So the foundation was in good shape. The problems were **consistency**, not absence.

---

## 2. Problems found

### 2.1 The components exist but the screens bypass them

This is the core finding:

| Component | Used in JSX | Raw class used instead |
|---|---|---|
| `Card` | **8** | **67** × `div.ph-card` |
| `Btn` | **1** | **77** × `ph-btn` |
| `Badge` | **0** | 5 × `ph-badge` |
| `DataTable` | **0** | 13 × `table.ph-table` |
| `EmptyState` | **0** | 23 × `div.ph-empty` |
| `Modal` | 10 | ✓ this one is used |

**But** the raw classes are the *shared CSS layer* — so the visual result was still
consistent. This is a maintainability problem, not (mostly) a visual one, and the fix is
therefore the shared CSS, not 170 JSX edits.

### 2.2 No spacing scale, no motion scale

The project had radii, shadows and easing — but no spacing tokens and no duration tokens, so
pages invented their own: `padding: 11px 14px`, `gap: 22px`, `transition: .2s`.

### 2.3 Ad-hoc radii and shadows

`border-radius` was written by hand in **5 different values** (`8px` `10px` `12px` `14px`
`16px`) alongside tokens. Two competing radius scales also exist: `--r-lg: 18px` vs
`--ph-r-lg: 16px`.

### 2.4 A control-height mismatch

`.ph-btn` rendered at **42px** while `.ph-control` used `padding: 11px 14px` (≈**40px**) — so
a field and the button beside it never quite lined up. A real, visible defect.

### 2.5 Colours

> **Correction to my own first pass.** I initially reported "366 hardcoded colours". That was
> **wrong** — my regex counted token *definitions* as violations. Re-measured properly:

| Category | Count | Verdict |
|---|---|---|
| Token definitions | 105 | correct — they *are* the tokens |
| Fallbacks inside `var(--x, #hex)` | 7 | correct |
| `#fff` on a coloured fill | ~70 | correct — no `--white-text` token exists |
| **Genuinely invented colours** | **32 unique / 48 uses** | the real finding |

Of those 32, most are near-duplicates of existing tokens (Tailwind palette leftovers like
`#14b8a6`, greys like `#e2e8f0` vs `--line`). Only **15 are genuinely different colours**
(Δ>30) and those are mostly dark-shell gradient stops.

### 2.6 One undefined token

`--ph-teal-soft` was referenced in `profile-complete.css` but defined nowhere. It had a
fallback, so nothing broke — but it was a latent trap.

### 2.7 A broken guard (my own earlier mistake)

The dead-CSS ratchet stored its budget at `qa/dead-css-budget.json` — and `qa/` had been
gitignored. **The guard therefore existed only on my machine** and protected nobody else.

---

## 3. What was fixed

### 3.1 A new shared polish layer — `src/styles/ui-system.css`

One file, imported **last** in `global.css` so it wins the cascade. It polishes the shared
primitives, which means **all 20 screens pick it up at once** — the brief's "don't restyle
each page independently".

It contains:

| Section | What it unifies |
|---|---|
| **Scale tokens** | `--sp-1…8` (4px base), `--dur-fast/base/slow` + `--tr-*`, `--ctl-h-sm/md/lg`, `--ring` |
| **Typography** | One hierarchy: page title, card heading, subtitle, field label, hint, muted, tabular numerals |
| **Buttons** | Primary · Secondary (outline) · Ghost · Destructive · Icon — with hover, `:active` press, `:focus-visible` ring, disabled |
| **Cards** | One radius, border, shadow, header/body padding, consistent stacking rhythm |
| **Inputs** | One height (`--ctl-h-md`, matching buttons), radius, border, hover, focus ring, disabled/readonly, `aria-invalid` error state, placeholder |
| **Tables** | One header treatment, row hover, end-aligned tabular numeric columns |
| **Badges / empty states / icons** | One pill radius, one icon scale |
| **Motion** | Overlay fade + dialog rise, page fade-in — all disabled under `prefers-reduced-motion` |

**No new colour was introduced.** Every value is an existing token or a pure layout number.
`tokens.css` and `pharmacy-hub.css` are Blade mirrors and were left intact.

### 3.2 Fixed the control-height mismatch

`.ph-control` now uses the same `--ctl-h-md` as `.ph-btn`, so a field and its button align.

### 3.3 Unified the ad-hoc colours — the safe subset only

Replaced only values that are **both** nearly identical to a token (Δ≤12) **and** the same
semantic role — 10 values, **20 lines across 7 files**:

`#e2e8f0`→`--line` · `#edf2f7`/`#f8fafc`/`#f0fdfa`→`--canvas` · `#eef2f7`→`--line-soft` ·
`#166534`→`--success-text` · `#071722`→`--topbar-bg` · `#04141a`→`--sidebar-bg` ·
`#0a1a2e`/`#0c2130`→`--sidebar-bg-2`

**Deliberately excluded:**
- `#1e3a5f` — the **approved dark-mode brand colour**. Changing it would alter brand identity.
- `#ccfbf1` — a teal tint, semantically different from the green `--success-bg`.
- Everything Δ>30 — genuinely different colours (Tailwind leftovers, dark gradient stops).
  Replacing those *would* change the look, so they are reported instead.

### 3.4 Defined the undefined token

`--ph-teal-soft: var(--teal-light)` — the value the call site obviously meant.

### 3.5 Repaired the dead-CSS guard

- Moved the budget to `tools/dead-css-budget.json` so it is **versioned** and protects the team.
- Pruned `.ph-med*` (6 classes) — orphaned when `MedicinesPage` became a table. Verified with
  the detector first, and `ph-med-thumb` (still used) was left alone.
- Re-accepted the baseline at **135/606** with justification (see §6).

### 3.6 Removed speculative CSS

Dropped `.is-invalid` and `.is-interactive` before committing — nothing can produce those
states. The error state is keyed on `aria-invalid`, which the auth pages **already set**
(5 call sites). Shipping CSS for an impossible state is exactly what the ratchet exists to stop.

### 3.7 A mistake I made and caught — worth recording

My colour-distance script matched each literal against **every** token value from **both**
themes, then picked the nearest. That is wrong when a token's value differs per theme.

`#04141A` is dark text placed on a **bright teal gradient** (4 uses, all inside `body.dark-mode`).
The nearest match was `--sidebar-bg` — because in *dark* mode that token is `#061019` (Δ=5).
But in **light** mode `--sidebar-bg` resolves to `#FFFFFF`. Substituting it meant that if any of
those rules ever applied outside `.dark-mode`, the label would render **white on a bright
gradient — invisible**.

It did not break anything today (all four are scoped to `.dark-mode`), but it was a latent trap
and a misuse of a surface token for text.

**Fix:** added a properly-named token, `--on-accent: #04141a` — "text placed on a bright accent
fill". It names the value the call sites already used rather than inventing a colour, and it
cannot be broken by a theme change.

**Lesson for the rest of this work:** a literal must be matched against the token that is
*correct in the theme where the rule applies*, not simply the nearest value globally.

---

## 4. Reusable components

No new component was needed — the right move was to make the **existing** shared layer carry
the polish. What is now genuinely reusable:

| Asset | Reused by |
|---|---|
| `ui-system.css` primitives | **all 20 screens**, via `.ph-btn` / `.ph-card` / `.ph-control` / `.ph-table` / `.ph-badge` / `.ph-empty` |
| `--sp-*`, `--dur-*`, `--ctl-h-*`, `--ring` | any new screen or component |
| `Card` · `Btn` · `Badge` · `Modal` · `EmptyState` · `AsyncBoundary` | unchanged API — they now inherit the same visuals as the raw classes, so both paths render identically |

---

## 5. Files modified

**New (2)**
- `src/styles/ui-system.css`
- `tools/dead-css-budget.json` (moved from `qa/`)

**Modified (11)**
- `src/styles/global.css` — imports the new layer last
- `src/styles/pages/pharmacy-hub.css` — removed the dead `.ph-med*` block
- `src/styles/layout/app-layout.css`, `sidebar.css`, `topbar.css` — colour tokens
- `src/styles/pages/medicines-edit.css`, `users-create.css`, `pharmacy-import.css` — colour tokens
- `tools/dead-css-budget.mjs` — budget path
- `tools/screens.mjs` — `THEME=dark` support for two-theme verification

**Not touched:** any `.tsx` behaviour, any API call, any route, any backend file.

---

## 6. Test / build results

| Gate | Result |
|---|---|
| `tsc -b --noEmit` | **0 errors** |
| `eslint .` | **0 errors, 0 warnings** |
| `vitest run` | **56 / 56 passed** (7 files) |
| `vite build` | **✓ built** — CSS 138.72 kB (gzip 25.37) |
| `check:css` (dead-CSS ratchet) | **✓ 135 / 606 at budget** |

**Why the budget moved 130 → 135:** the new layer adds **0 dead classes** (verified). The +5
came from the earlier Task-B rewiring, which legitimately orphaned Blade-only classes. The
budget comment requires an explicit justification to raise it — this is that justification.
Pruning the remaining ~135 is a separate, deliberate task (the ratchet is designed for exactly
that), not part of a UI-polish phase.

### Visual verification — both themes

Captured with the real app against the live API, real login, headless Chrome. `tools/screens.mjs`
gained a `THEME=dark` switch so a change is checked on **both** surfaces — a rule that looks
right on white can be invisible on a dark card.

| Screen | Light | Dark | Rows | Errors |
|---|---|---|---|---|
| `/medicines` | ✓ | ✓ | 11 | 0 |
| `/accounting/sales` | ✓ | ✓ | 0 (empty state) | 0 |
| `/profile` | ✓ | ✓ | — | 0 |

Evidence: `qa/polish-light/*.png` · `qa/polish-dark/*.png`

What the screenshots confirm is actually applied:
- cards carry the unified radius, border and padding
- buttons show the hierarchy (filled primary · outline · ghost · red destructive icon)
- table header is tinted, rows hover, numeric columns are end-aligned and tabular
- badges render as pills with a status dot
- inputs share the control height and the focus ring
- the active sidebar item is highlighted
- **dark mode is fully legible** — dark surfaces, light text, readable badges

---

## 7. Remaining problems

1. **15 genuinely different colours remain** (Δ>30) — Tailwind leftovers (`#14b8a6`, `#22c55e`,
   `#86efac`…) and dark-shell gradient stops. Unifying them **would change the look**, so they
   need a design decision, not a mechanical pass.
2. **Two radius scales coexist** — `--r-*` (Blade) and `--ph-r-*` (pharmacy). Unifying them
   changes values (`--r-lg: 18px` vs `--ph-r-lg: 16px`), so it was left as a documented
   duplication rather than a silent visual change.
3. **Components still bypassed** (Card 8/67, Btn 1/77…). Purely maintainability — the visuals
   now match — but a mechanical migration would make future changes cheaper.
4. **~135 dead CSS classes** remain, mostly Blade-port leftovers (unwired notifications,
   unported import steps 3–4). Tracked by the ratchet.
5. **Light mode was not restyled.** Per the standing project rule, no token value was changed;
   only near-identical literals were pointed at their existing token.
6. **Responsive QA at 390/768 was not re-run** for this phase.
