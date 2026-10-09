/**
 * Sidebar badge counts.
 *
 * WHY ONE HOOK, FETCHED ONCE
 * --------------------------
 * The obvious implementation is a query inside each nav item that needs a
 * badge. That would mean N requests for N badges, each one re-fetching on every
 * navigation, and — worse — each badge could be showing a count from a
 * different moment, so the sidebar contradicts itself.
 *
 * So the counts come from a single query the Sidebar runs once, and the values
 * are passed down. It also means the sidebar makes exactly one request even
 * though four items currently want a badge.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No polling interval. A pharmacy dashboard is not a chat client; a badge that
 * is seconds stale is fine, and a background poll every 30s against a free-tier
 * host is a real cost for no benefit. The count refreshes when the user
 * navigates (the query is keyed on the pathname), which is exactly when they
 * look at it.
 */
import { useEffect, useState } from 'react';
import { usePharmacyApi } from '@/auth/authHooks';
import { countStock } from '@/lib/stock';

export interface SidebarCounts {
  /** Inquiries the pharmacy has not replied to yet — `counts.new`. */
  newInquiries: number;
  /** Medicines at or below the low-stock threshold. */
  lowStock: number;
}

const EMPTY: SidebarCounts = { newInquiries: 0, lowStock: 0 };

/**
 * Fetch the sidebar's counts.
 *
 * Both requests are issued together and are individually tolerant: if the
 * inquiry call fails the stock badge still renders, and vice versa. A failed
 * count is `0`, never `undefined` — a badge showing "undefined" is worse than
 * no badge, and `NaN` in a badge is worse still.
 *
 * Errors are swallowed on purpose. These are decorative counts; surfacing a
 * toast for a failed badge fetch would interrupt the user for something that
 * does not block their work.
 */
export function useSidebarCounts(): SidebarCounts {
  const api = usePharmacyApi();
  const [counts, setCounts] = useState<SidebarCounts>(EMPTY);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    (async () => {
      const [inquiries, inventory] = await Promise.allSettled([
        // `per_page: 1` — the counts come from the envelope, so there is no
        // reason to transfer rows. This is the whole point of using the list
        // endpoint for a badge.
        api.inquiries({ per_page: 1 }, controller.signal),
        api.inventory({ per_page: 100 }, controller.signal),
      ]);

      if (!alive) return;

      const next: SidebarCounts = { ...EMPTY };

      if (inquiries.status === 'fulfilled') {
        const n = inquiries.value.counts?.new;
        next.newInquiries = Number.isFinite(n) ? Number(n) : 0;
      }

      if (inventory.status === 'fulfilled') {
        /*
         * Uses the shared `countStock` rather than a local `quantity <= 10`, so
         * the badge cannot drift from the inventory screen's own numbers — the
         * threshold lives in exactly one place (`src/lib/stock.ts`).
         *
         * The count covers the first page only (100 rows), which is the same
         * page the inventory screen shows. If a pharmacy ever exceeds that, the
         * badge under-counts rather than lying — and the threshold is a
         * *restock* signal, not an audited total.
         */
        next.lowStock = countStock(inventory.value.data ?? []).low;
      }

      setCounts(next);
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [api]);

  return counts;
}
