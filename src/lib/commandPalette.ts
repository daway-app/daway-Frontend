/**
 * Command palette (Ctrl+K) — pure search logic + the open-state store.
 *
 * WHY THIS IS A MODULE AND NOT A LIBRARY
 * --------------------------------------
 * The obvious implementation is `cmdk`. This codebase deliberately does not
 * take that dependency: a command palette is ~150 lines of ranking plus a
 * listbox, and the project already has a documented preference for a small
 * in-house piece over a package (see the Chart.js vendoring notes). Everything
 * in this file is plain and testable; none of it touches the DOM.
 *
 * WHY THE HOOK LIVES HERE, NOT IN `components/ui`
 * -----------------------------------------------
 * `src/lib/forms.ts` explains the rule: `components/ui/index.tsx` is a
 * component module, and adding a hook to it trips
 * `react-refresh/only-export-components` (editing the hook remounts every
 * component in the file). This module exports no components, so a hook is safe
 * here — and the Topbar can import `openCommandPalette` without dragging in a
 * component module.
 */
import { useSyncExternalStore } from 'react';

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Arabic combining marks (harakat + Quranic annotation signs). Typing them is
 * rare, but text pasted from a document routinely carries them, and a mark in
 * the middle of a word breaks a naive character-by-character comparison.
 */
const ARABIC_MARKS =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;

/** Tatweel (kashida) — a purely decorative elongation that must not be matched. */
const TATWEEL = /\u0640/g;

/**
 * Normalise a search string so visually-equivalent Arabic matches itself.
 *
 * THE POINT
 * ---------
 * A user typing `استفسارات` and a label stored as `استفسارات` are the same to a
 * human but NOT to `String.prototype.includes` when one uses `أ` and the other
 * `ا`. The same applies to `ى`/`ي`, `ة`/`ه` and the hamza carriers. Folding
 * these forms is a handful of lines and is the difference between Arabic search
 * "mostly working" and working.
 *
 * `NFKC` first so compatibility forms (e.g. the lam-alef ligature `ﻻ`) decompose
 * to their base letters before the letter folding runs.
 *
 * Latin input is lowercased so a route path (`/inventory`) can be matched
 * without the user holding Shift.
 */
export function normalizeArabic(value: string): string {
  return value
    .normalize('NFKC')
    .replace(ARABIC_MARKS, '')
    .replace(TATWEEL, '')
    // Alef forms → bare alef. `ٱ` (wasla) and `ٲ`/`ٳ` fold too so a word typed
    // without them still matches a label that carries them.
    .replace(/[أإآٱٲٳ]/g, 'ا')
    // Alef maqsura and ya-hamza → ya (they are the one letter in practice).
    .replace(/[ىئ]/g, 'ي')
    // Waw-hamza → waw.
    .replace(/ؤ/g, 'و')
    // Ta marbuta and ha-yeh → ha.
    .replace(/[ةۀ]/g, 'ه')
    // Arabic-Indic and extended Arabic-Indic digits → ASCII, so `١` finds `1`.
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

/**
 * The minimum a command must expose to be searchable. The component attaches
 * an icon and a destination on top of this; the ranking never needs those, so
 * it stays pure and trivial to test.
 */
export interface CommandDescriptor {
  /** Stable identity — used for the option `id` and the active descendant. */
  id: string;
  /** The Arabic label shown to the user. */
  label: string;
  /** The group the option is presented under (shown as secondary text). */
  group: string;
  /**
   * Latin fallback searched IN ADDITION to the label — a route path and/or a
   * short English synonym, so a user without an Arabic keyboard can type `inv`.
   */
  keywords: string;
}

/**
 * Score one command against a query, or `null` when it does not match.
 *
 * LOWER IS BETTER, and the ordering encodes the intent:
 *
 *   0  exact label            "المخزون" → المخزون
 *   1  label prefix           "المخ"    → المخزون
 *   2  word prefix in label   "إدارة"   → إدارة المخزون
 *   3  substring in label
 *   4  keyword prefix         "in"      → /inventory
 *   5  keyword word prefix    "sales"   → /accounting/sales
 *   6  substring in keyword
 *
 * Prefix beating substring is the whole reason this is not a boolean filter: a
 * user typing "إدارة" expects `إدارة الأدوية` above a longer label that merely
 * contains the letters.
 */
export function matchScore(query: string, item: CommandDescriptor): number | null {
  const q = normalizeArabic(query);
  if (!q) return 0;

  const label = normalizeArabic(item.label);
  // Strip the leading slash so a route can be matched by a word prefix rather
  // than only by the literal `/` the user is unlikely to type.
  const keywords = normalizeArabic(item.keywords).replace(/^\/+/, '');

  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.split(' ').some((word) => word.startsWith(q))) return 2;
  if (label.includes(q)) return 3;
  if (keywords.startsWith(q)) return 4;
  if (keywords.split(/[\s/]+/).some((word) => word.startsWith(q))) return 5;
  if (keywords.includes(q)) return 6;
  return null;
}

/**
 * Filter + rank commands, preserving the caller's order when the query is empty.
 *
 * Returns a NEW array (the input is module-level registry data, and a caller
 * may memoise on the identity of the result).
 *
 * Ties are broken by label length, then by the original position: for two
 * equally-good matches the shorter label is almost always the one meant, and
 * otherwise the registry order decides — never an arbitrary sort order, so the
 * list does not reshuffle between identical renders.
 */
export function filterCommands<T extends CommandDescriptor>(
  items: readonly T[],
  query: string,
): T[] {
  if (!normalizeArabic(query)) return items.slice();

  const scored: { item: T; score: number; index: number; length: number }[] = [];
  items.forEach((item, index) => {
    const score = matchScore(query, item);
    if (score !== null) scored.push({ item, score, index, length: item.label.length });
  });

  scored.sort(
    (a, b) => a.score - b.score || a.length - b.length || a.index - b.index,
  );
  return scored.map((entry) => entry.item);
}

/* ------------------------------------------------------------------ */
/* Shortcut                                                            */
/* ------------------------------------------------------------------ */

/**
 * Is this key event the palette shortcut?
 *
 * `Ctrl+K` on Windows/Linux, `Cmd+K` on macOS — but rather than guess the
 * platform we accept EITHER modifier. A Mac user on an external PC keyboard (or
 * vice-versa) is common, and there is no other binding competing for Ctrl+K or
 * Cmd+K in this app, so being forgiving costs nothing and removes a way for the
 * feature to appear broken.
 *
 * `Alt` must not be held: `Alt+Ctrl+K` is some other shortcut's space, and
 * matching it here would steal it. `shiftKey` is ignored, so `Ctrl+Shift+K`
 * still works — the palette does not use Shift for anything.
 */
export function isPaletteShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  if (event.altKey) return false;
  if (!event.ctrlKey && !event.metaKey) return false;
  return event.key === 'k' || event.key === 'K';
}

/** Best-effort macOS detection, used only to pick the label on the trigger. */
export function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || navigator.userAgent || '';
  return /mac/i.test(platform);
}

/**
 * The human label for the shortcut, e.g. `⌘K` on macOS and `Ctrl K` elsewhere.
 * Pure by argument so it can be asserted in a test without a `navigator`.
 */
export function shortcutLabel(isMac: boolean): string {
  return isMac ? '⌘K' : 'Ctrl K';
}

/* ------------------------------------------------------------------ */
/* Open-state store                                                    */
/* ------------------------------------------------------------------ */

/**
 * A tiny external store instead of React Context.
 *
 * WHY NOT CONTEXT
 * ---------------
 * The palette is mounted once in `AppLayout`, and the ONLY other thing that
 * needs to open it is the Topbar trigger. Threading a context provider through
 * the layout (and a consumer everywhere in between) for a single boolean is
 * more machinery than the problem has. A module-level store read through
 * `useSyncExternalStore` gives both components the same value with no provider,
 * and it cannot drift out of sync with itself the way two `useState`s can.
 *
 * Only two subscribers exist (the palette and the trigger), so a `Set` of
 * listeners is entirely adequate — this is not a general-purpose state library.
 */
let isOpen = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function openCommandPalette(): void {
  if (isOpen) return;
  isOpen = true;
  emit();
}

export function closeCommandPalette(): void {
  if (!isOpen) return;
  isOpen = false;
  emit();
}

export function toggleCommandPalette(): void {
  if (isOpen) closeCommandPalette();
  else openCommandPalette();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The raw snapshot — also handy for the global key handler's own guard. */
export function isCommandPaletteOpen(): boolean {
  return isOpen;
}

/** React binding for the store. */
export function useCommandKOpen(): boolean {
  return useSyncExternalStore(subscribe, isCommandPaletteOpen, isCommandPaletteOpen);
}
