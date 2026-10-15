/**
 * Session-scoped drafts storage (Phase 3).
 *
 * A small, typed wrapper over sessionStorage for UNSAVED form/fields state that
 * must survive a navigation-within-session but MUST NOT survive a reload of a
 * DIFFERENT account (e.g. the POS cart, an in-progress chat message, inventory
 * quantity drafts).
 *
 * Design rules:
 *   - Keys are namespaced: `daway.draft.<userId>.<route>` — so a pharmacy
 *     logging in on a shared browser cannot read another pharmacy's cart.
 *   - TTL: 24h. A cart left open for a day is stale and discarded, not
 *     silently persisted forever.
 *   - The cached VALUE is a DRAFT only — financial amounts and stock levels
 *     are re-read from the server on submit. A cached cart line's price is
 *     never trusted as proof the item is still available or correctly priced.
 *   - `clearDraft` removes the entry immediately (used after a successful save).
 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface DraftEnvelope<T> {
  /** Serialized on save, checked against TTL on read. */
  _ts: number;
  value: T;
}

/** Read + parse a draft, returning undefined if absent / expired / unparseable. */
export function readDraft<T>(userId: string | number, route: string): T | undefined {
  const key = draftKey(userId, route);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (Date.now() - parsed._ts > DRAFT_TTL_MS) {
      sessionStorage.removeItem(key);
      return undefined;
    }
    return parsed.value;
  } catch {
    // Corrupt JSON — treat as absent, don't crash the page.
    return undefined;
  }
}

/** Write a draft with a fresh timestamp. Replaces any existing value. */
export function writeDraft<T>(userId: string | number, route: string, value: T): void {
  const key = draftKey(userId, route);
  const envelope: DraftEnvelope<T> = { _ts: Date.now(), value };
  try {
    sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* QuotaExceeded / private mode — fail silently, drafts are best-effort. */
  }
}

/** Remove a draft immediately (e.g. after a successful save). */
export function clearDraft(userId: string | number, route: string): void {
  const key = draftKey(userId, route);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignored */
  }
}

function draftKey(userId: string | number, route: string): string {
  return `daway.draft.${userId}.${route}`;
}
