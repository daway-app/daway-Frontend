/**
 * Tests for `pageInfo` — specifically the language-parameter regression.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `pageInfo(pagination, STR = AR)` defaulted to Arabic. That is invisible at the
 * call site: a screen that forgot the second argument still compiled, still
 * rendered, and shipped Arabic pagination labels ("عرض 1–20 من 240") under an
 * English UI. Seven of the nine admin screens had exactly that bug — the default
 * hid it from typecheck, lint, tests and code review alike.
 *
 * The default is now removed, so the type system catches the next occurrence.
 * These tests pin the behavioural half: the label must always follow the
 * dictionary it was handed.
 */
import { describe, expect, it } from 'vitest';
import { pageInfo } from './shared';
import { AR } from '@/lib/i18n';
import { EN } from '@/lib/lang/en';

const page = (current_page: number, per_page: number, total: number) => ({
  current_page,
  per_page,
  total,
  last_page: Math.max(1, Math.ceil(total / per_page)),
});

describe('pageInfo', () => {
  it('computes the visible range for a middle page', () => {
    const info = pageInfo(page(3, 20, 240), AR);
    expect(info.from).toBe(41);
    expect(info.to).toBe(60);
    expect(info.total).toBe(240);
  });

  it('clamps `to` on a partial last page', () => {
    // 235 items at 20/page → the last page shows 231–235, not 231–240.
    const info = pageInfo(page(12, 20, 235), AR);
    expect(info.from).toBe(221);
    expect(info.to).toBe(235);
  });

  it('reports 0–0 for an empty result set', () => {
    const info = pageInfo(page(1, 20, 0), AR);
    expect(info.from).toBe(0);
    expect(info.to).toBe(0);
    expect(info.label).toContain('0');
  });

  it('labels in Arabic when given the Arabic dictionary', () => {
    const info = pageInfo(page(2, 20, 100), AR);
    expect(info.label).toBe(AR.admin.common.showing
      .replace('{from}', '21')
      .replace('{to}', '40')
      .replace('{total}', '100'));
    // Sanity: it really is Arabic and not the Latin default.
    expect(info.label).toMatch(/[\u0600-\u06FF]/);
  });

  it('labels in English when given the English dictionary', () => {
    const info = pageInfo(page(2, 20, 100), EN);
    expect(info.label).toBe(
      EN.admin.common.showing
        .replace('{from}', '21')
        .replace('{to}', '40')
        .replace('{total}', '100'),
    );
    // The regression this suite exists for: no Arabic under an English UI.
    expect(info.label).not.toMatch(/[\u0600-\u06FF]/);
    expect(info.label).toContain('21');
  });

  it('uses the dictionary for the zero-result label too', () => {
    // The empty branch returns early and has its own replace() — it is the one
    // most likely to be overlooked when the label logic changes.
    expect(pageInfo(page(1, 20, 0), EN).label).not.toMatch(/[\u0600-\u06FF]/);
    expect(pageInfo(page(1, 20, 0), AR).label).toMatch(/[\u0600-\u06FF]/);
  });
});
