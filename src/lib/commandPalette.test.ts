import { describe, expect, it } from 'vitest';
import {
  filterCommands,
  isPaletteShortcut,
  matchScore,
  normalizeArabic,
  shortcutLabel,
  type CommandDescriptor,
} from './commandPalette';

/**
 * Guards for the Ctrl+K palette search.
 *
 * These are the parts that are pure and therefore worth testing: the Arabic
 * normalisation and the ranking. The dialog's keyboard handling is DOM
 * behaviour and is deliberately NOT tested here (vitest runs in a `node`
 * environment in this repo — see vitest.config.ts).
 */

/** A miniature registry shaped like the real one the component builds. */
const items: CommandDescriptor[] = [
  { id: 'dashboard', label: 'لوحة التحكم', group: 'الانتقال', keywords: '/ dashboard home' },
  { id: 'medicines', label: 'إدارة الأدوية', group: 'الانتقال', keywords: '/medicines pills' },
  { id: 'inventory', label: 'إدارة المخزون', group: 'الانتقال', keywords: '/inventory stock' },
  { id: 'inquiries', label: 'استفسارات التوفر', group: 'الانتقال', keywords: '/inquiries chat' },
  { id: 'sales', label: 'المبيعات', group: 'المحاسبة', keywords: '/accounting/sales invoices' },
  { id: 'refunds', label: 'الإرجاعات', group: 'المحاسبة', keywords: '/accounting/refunds' },
];

describe('normalizeArabic()', () => {
  it('folds the alef forms together', () => {
    // The core case: a label carrying a hamza must match a query typed without
    // one. Without this, Arabic search silently misses obvious results.
    expect(normalizeArabic('أ')).toBe('ا');
    expect(normalizeArabic('إ')).toBe('ا');
    expect(normalizeArabic('آ')).toBe('ا');
    expect(normalizeArabic('إدارة')).toBe(normalizeArabic('ادارة'));
  });

  it('folds alef maqsura and ya-hamza to ya', () => {
    expect(normalizeArabic('مصطفى')).toBe(normalizeArabic('مصطفي'));
    expect(normalizeArabic('قائمة')).toBe(normalizeArabic('قايمه'));
  });

  it('folds ta marbuta to ha', () => {
    expect(normalizeArabic('مخزنة')).toBe(normalizeArabic('مخزنه'));
  });

  it('drops harakat and tatweel', () => {
    expect(normalizeArabic('مَخْزُون')).toBe(normalizeArabic('مخزون'));
    expect(normalizeArabic('مخـــزون')).toBe(normalizeArabic('مخزون'));
  });

  it('lowercases latin and collapses whitespace', () => {
    expect(normalizeArabic('  Inventory  ')).toBe('inventory');
    expect(normalizeArabic('a   b')).toBe('a b');
  });

  it('maps Arabic-Indic digits to ASCII', () => {
    expect(normalizeArabic('١٢٣')).toBe('123');
  });
});

describe('matchScore()', () => {
  const inv = items[2];

  it('gives an exact label match the best score', () => {
    expect(matchScore('إدارة المخزون', inv)).toBe(0);
  });

  it('ranks a label prefix above a substring (prefix beats substring)', () => {
    const prefix = matchScore('إدارة', inv);
    const substring = matchScore('المخزون', inv);
    expect(prefix).not.toBeNull();
    expect(substring).not.toBeNull();
    expect(prefix!).toBeLessThan(substring!);
  });

  it('matches on the latin route keyword (arabic-keyboard-less user)', () => {
    // "inv" must find inventory via the keyword, not the Arabic label.
    expect(matchScore('inv', inv)).not.toBeNull();
    expect(matchScore('sales', items[4])).not.toBeNull();
  });

  it('is diacritic-insensitive across a query/label mismatch', () => {
    // Query without hamza, label with it.
    expect(matchScore('ادارة المخزون', inv)).toBe(0);
  });

  it('returns null for a non-match', () => {
    expect(matchScore('zzzz', inv)).toBeNull();
  });

  it('returns 0 (matches everything) for an empty query', () => {
    expect(matchScore('', inv)).toBe(0);
    expect(matchScore('   ', inv)).toBe(0);
  });
});

describe('filterCommands()', () => {
  it('preserves registry order when the query is empty', () => {
    // The empty state is the full menu — it must look the same every time,
    // not get re-sorted by label length.
    expect(filterCommands(items, '').map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it('puts the prefix match first', () => {
    const out = filterCommands(items, 'إدارة');
    expect(out[0].id).toBe('medicines');
  });

  it('filters down to the matching items only', () => {
    const out = filterCommands(items, 'inventory');
    expect(out.map((i) => i.id)).toEqual(['inventory']);
  });

  it('finds several results across groups for a loose query', () => {
    const out = filterCommands(items, 'ا');
    expect(out.length).toBeGreaterThan(1);
  });

  it('returns a new array and does not mutate the input', () => {
    const snapshot = items.slice();
    const out = filterCommands(items, 'inv');
    expect(out).not.toBe(items);
    expect(items).toEqual(snapshot);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterCommands(items, 'qqqqq')).toEqual([]);
  });

  it('is insensitive to diacritics in the query', () => {
    expect(filterCommands(items, 'الإرجاعات').map((i) => i.id)).toEqual(['refunds']);
  });
});

describe('isPaletteShortcut()', () => {
  const base = { key: 'k', ctrlKey: false, metaKey: false, altKey: false };

  it('fires on Ctrl+K', () => {
    expect(isPaletteShortcut({ ...base, ctrlKey: true })).toBe(true);
  });

  it('fires on Cmd+K (meta)', () => {
    expect(isPaletteShortcut({ ...base, metaKey: true })).toBe(true);
  });

  it('accepts an uppercase K', () => {
    expect(isPaletteShortcut({ ...base, key: 'K', ctrlKey: true })).toBe(true);
  });

  it('ignores a bare k without a modifier', () => {
    expect(isPaletteShortcut({ ...base })).toBe(false);
  });

  it('ignores Ctrl+Alt+K so it does not steal another shortcut', () => {
    expect(isPaletteShortcut({ ...base, ctrlKey: true, altKey: true })).toBe(false);
  });

  it('ignores other keys', () => {
    expect(isPaletteShortcut({ ...base, key: 'j', ctrlKey: true })).toBe(false);
  });
});

describe('shortcutLabel()', () => {
  it('shows the command glyph on macOS', () => {
    expect(shortcutLabel(true)).toBe('⌘K');
  });
  it('shows Ctrl K elsewhere', () => {
    expect(shortcutLabel(false)).toBe('Ctrl K');
  });
});
