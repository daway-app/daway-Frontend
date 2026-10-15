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
import { useQuery } from '@tanstack/react-query';
import { usePharmacyApi, useAuth } from '@/auth/authHooks';
import { pharmacyKeys } from '@/api/queryKeys';
import { PRESET_STALE_TIMES } from '@/api/queryClient';

export interface SidebarCounts {
  /** Inquiries the pharmacy has not replied to yet — `counts.new`. */
  newInquiries: number;
}

const EMPTY: SidebarCounts = { newInquiries: 0 };

/**
 * Fetch the sidebar's counts.
 *
 * Only the unread-inquiry count is fetched — the inventory page was removed
 * from the sidebar, so the low-stock badge is no longer needed.
 *
 * Errors are swallowed on purpose. These are decorative counts; surfacing a
 * toast for a failed badge fetch would interrupt the user for something that
 * does not block their work.
 */
export function useSidebarCounts(): SidebarCounts {
  const api = usePharmacyApi();
  const { user } = useAuth();
  const { data } = useQuery<SidebarCounts>({
    // Shared key so mutations (e.g. replying to an inquiry) can invalidate
    // the badge with a single invalidateQueries(pharmacyKeys(id).sidebarCounts).
    queryKey: pharmacyKeys(user?.id ?? 'anon').sidebarCounts,
    staleTime: PRESET_STALE_TIMES.inquiries,
    // No retry on failure — a stale `0` is preferable to a retry storm against
    // a remote DB for a decorative badge.
    retry: false,
    queryFn: async (ctx) => {
      const inquiries = await api.inquiries({ per_page: 1 }, ctx.signal);
      const next: SidebarCounts = {
        newInquiries: Number.isFinite(inquiries.counts?.new) ? Number(inquiries.counts.new) : 0,
      };
      return next;
    },
  });

  return data ?? EMPTY;
}
