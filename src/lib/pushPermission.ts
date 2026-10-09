/**
 * localStorage state for the push-permission banner (item #70).
 *
 * Kept separate from the component so the "when may we ask?" policy is a plain,
 * testable function instead of living inside a React effect.
 *
 * POLICY — why the banner must not appear on first load
 * -----------------------------------------------------
 * `Notification.requestPermission()` can be called only ONCE in practice: if the
 * user dismisses the browser prompt (or the page asks before they have any
 * reason to say yes), most browsers record `denied` and the app can never ask
 * again. So the banner is gated on a REAL signal — the user having actually
 * used the app — not on a timer.
 *
 * The signal we use: the pharmacy has visited the inquiries screen at least
 * once. Inquiries are the notify-worthy event (a new patient question creates a
 * push), so a user who has seen that screen understands what the permission is
 * for. We also require a minimum lifetime page-view count so a single accidental
 * navigation is not enough.
 *
 * All keys are namespaced `daway.push.*`.
 */

const KEY_DISMISSED = 'daway.push.bannerDismissed';
const KEY_VIEWS = 'daway.push.pageViews';
const KEY_INQUIRIES_SEEN = 'daway.push.inquiriesSeen';

/** Minimum page views before the banner may be considered. */
export const MIN_PAGE_VIEWS = 5;

/** localStorage can throw (private mode), so every access is guarded. */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the banner simply never becomes eligible */
  }
}

/** True once the user has dismissed the banner — it must never return. */
export function isPushBannerDismissed(): boolean {
  return read(KEY_DISMISSED) === '1';
}

/** Persist dismissal. Idempotent. */
export function dismissPushBanner(): void {
  write(KEY_DISMISSED, '1');
}

/** Number of app loads recorded so far. */
export function getPageViews(): number {
  const raw = read(KEY_VIEWS);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Increment the lifetime page-view counter. Returns the new value. */
export function bumpPageViews(): number {
  const next = getPageViews() + 1;
  write(KEY_VIEWS, String(next));
  return next;
}

/** True once the user has opened the inquiries screen. */
export function hasSeenInquiries(): boolean {
  return read(KEY_INQUIRIES_SEEN) === '1';
}

/** Record that the user opened the inquiries screen. */
export function markInquiriesSeen(): void {
  write(KEY_INQUIRIES_SEEN, '1');
}

/**
 * The one place the "may we show the banner?" decision is made.
 *
 * `permission` comes from `Notification.permission`; the caller must have
 * already checked `'Notification' in window`.
 */
export function shouldShowPushBanner(permission: NotificationPermission): boolean {
  // Never show if we can no longer ask — a denied permission is permanent.
  if (permission !== 'default') return false;
  // Never nag after a dismissal.
  if (isPushBannerDismissed()) return false;
  // Require a real usage signal, not just a first paint.
  return hasSeenInquiries() && getPageViews() >= MIN_PAGE_VIEWS;
}
