import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AR } from '@/lib/i18n';
import { EN } from '@/lib/lang/en';
import { sidebarLinkAccessibleName } from './sidebarAccessibility';

const PHARMACY_LINKS = [
  'dashboard',
  'manage_medicines',
  'add_medicine',
  'inquiries',
  'manage_alternatives',
  'pharmacy_profile',
  'ratings',
] as const;
const ACCOUNTING_LINKS = ['overview', 'sales', 'refunds', 'cash_register'] as const;
const ADMIN_LINKS = [
  'dashboard',
  'pharmacies',
  'medicines',
  'categories',
  'users',
  'medicine_requests',
  'payments',
  'payment_problems',
  'system_settings',
  'delivery_pricing',
  'payment_banks',
  'activity_log',
  'profile',
] as const;

describe('sidebar accessible names', () => {
  it('has translated names for every pharmacy, accounting, and admin link', () => {
    for (const lang of [AR, EN]) {
      for (const key of PHARMACY_LINKS) {
        expect(lang.pharmacy.sidebar[key].trim()).not.toBe('');
      }
      for (const key of ACCOUNTING_LINKS) {
        expect(lang.accounting.sidebar[key].trim()).not.toBe('');
      }
      for (const key of ADMIN_LINKS) {
        expect(lang.admin.nav[key].trim()).not.toBe('');
      }
    }
  });

  it('keeps a link named without a badge and announces its count only once', () => {
    for (const label of [AR.pharmacy.sidebar.inquiries, EN.pharmacy.sidebar.inquiries]) {
      expect(sidebarLinkAccessibleName(label)).toBe(label);
      expect(sidebarLinkAccessibleName(label, 4)).toBe(`${label}: 4`);
      expect(sidebarLinkAccessibleName(label, 0)).toBe(label);
    }
  });

  it('applies the accessible name helper to pharmacy and admin navigation links', () => {
    const pharmacySidebar = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
    const adminSidebar = readFileSync(new URL('../admin/AdminSidebar.tsx', import.meta.url), 'utf8');
    expect(pharmacySidebar.match(/aria-label=\{sidebarLinkAccessibleName/g)).toHaveLength(2);
    expect(adminSidebar.match(/aria-label=\{sidebarLinkAccessibleName/g)).toHaveLength(2);
    expect(pharmacySidebar).toContain('aria-hidden="true"');
    expect(pharmacySidebar).not.toContain('className="sr-only">{`${label}: ${count}`}</span>');
  });
});
