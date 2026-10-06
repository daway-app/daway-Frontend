/**
 * Formatting helpers for values coming back from the API.
 *
 * These exist because the API sends machine formats (ISO-8601 strings,
 * `Y-m-d H:i`) while the UI must show Arabic, human, right-to-left text.
 *
 * House rules honoured here:
 *  - Never re-derive a value the server already localised (status labels, KPI
 *    labels, alert text). This file only formats dates/numbers, which the
 *    server sends raw.
 *  - Arabic first, with Latin digits (the rest of the app uses Latin digits).
 *  - Every parse failure returns a safe placeholder, never "Invalid Date".
 */

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

/** Parse an API date string without throwing. Returns null when unusable. */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // The backend also emits `Y-m-d H:i` (no timezone). `Date` parses that as
  // local time, which is what we want for `date_human` fields.
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-10-06` → `6 أكتوبر 2026`. */
export function formatDate(value: string | null | undefined): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  return `${date.getDate()} ${AR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `2026-10-06T14:30:00+03:00` → `14:30`. */
export function formatTime(value: string | null | undefined): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** `...T14:30` → `6 أكتوبر 2026 — 14:30`. */
export function formatDateTime(value: string | null | undefined): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  return `${formatDate(value)} — ${formatTime(value)}`;
}

/**
 * Arabic relative time: `الآن` · `منذ 5 دقائق` · `منذ ساعتين` · `أمس` · `منذ 3 أيام`.
 *
 * Falls back to an absolute date beyond 30 days, because "منذ 47 يومًا" is less
 * useful to a pharmacist than the date itself.
 */
export function relativeTime(value: string | null | undefined): string {
  const date = parseApiDate(value);
  if (!date) return '—';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  // Clock skew or a future timestamp: treat as "now" rather than "-3 دقائق".
  if (seconds < 60) return 'الآن';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    if (minutes === 1) return 'منذ دقيقة';
    if (minutes === 2) return 'منذ دقيقتين';
    if (minutes <= 10) return `منذ ${minutes} دقائق`;
    return `منذ ${minutes} دقيقة`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    if (hours === 1) return 'منذ ساعة';
    if (hours === 2) return 'منذ ساعتين';
    if (hours <= 10) return `منذ ${hours} ساعات`;
    return `منذ ${hours} ساعة`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return 'أمس';
  if (days === 2) return 'منذ يومين';
  if (days <= 10) return `منذ ${days} أيام`;
  if (days < 30) return `منذ ${days} يومًا`;

  return formatDate(value);
}

/**
 * Money in Arabic, matching the Blade convention (`₪` prefix, 2 decimals).
 *
 * Kept here as well as in the (now removed) mock data so screens have one
 * shared formatter that does not depend on any fixture module.
 */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '₪0.00';
  return `₪${value.toFixed(2)}`;
}

/** Compact integer with thousands separators (Latin digits). */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US');
}

/** `45.0` → `45%`, `45.25` → `45.3%`. */
export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0%';
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return `${rounded}%`;
}

/**
 * Status → `.ph-badge` variant used across the pharmacy UI.
 * The label itself comes from the server (`status_label`), not from here.
 */
export function statusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case 'paid':
    case 'completed':
      return 'ok';
    case 'partially_paid':
    case 'pending':
      return 'low';
    case 'unpaid':
      return 'out';
    case 'refunded':
    case 'cancelled':
      return 'closed';
    default:
      return '';
  }
}

// ══════════════════════════════════════════════════════════════════════
// Images
// ══════════════════════════════════════════════════════════════════════

/**
 * Is this URL served by Cloudinary?
 *
 * Ports `App\Support\Image::isCloudinary` from the Laravel app.
 */
function isCloudinary(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'res.cloudinary.com' || host.endsWith('.res.cloudinary.com');
  } catch {
    return false;
  }
}

/**
 * Thumbnail URL for an image the API returned.
 *
 * WHY THIS EXISTS — the API sends the RAW `image_url`, with no size transform.
 * The Laravel Blade views do NOT use that raw URL for list thumbnails; they go
 * through `App\Support\Image::thumbUrl($img, 88, 88)`, whose own comment records
 * the exact defect it prevents:
 *
 *   «كان أفاتار يُعرض بـ 34 بكسل يُنزَّل بأبعاد 1920×1080 (≈95 كيلوبايت للصورة)»
 *
 * An avatar displayed at 34px was downloading at 1920×1080 (~95 KB each). Using
 * the raw URL in a 44×44 table cell reproduces that defect — 11 inventory rows
 * would pull 11 full-resolution JPEGs. So the transform is reproduced here,
 * client-side, with the same rules:
 *
 *   - only Cloudinary URLs are transformed (the transform is Cloudinary-specific
 *     and must not be assumed for other hosts);
 *   - the insert point is `/image/upload/`;
 *   - an already-transformed URL is returned untouched (never stack transforms).
 */
export function thumbUrl(
  url: string | null | undefined,
  width: number,
  height: number = width,
): string | null {
  if (!url) return null;
  if (!isCloudinary(url)) return url;

  const marker = '/image/upload/';
  const pos = url.indexOf(marker);
  if (pos === -1) return url;

  const head = url.slice(0, pos + marker.length);
  const tail = url.slice(pos + marker.length);

  // A transform already present (e.g. `w_100,h_100/v123/...`) — do not double it.
  if (/^[a-z]+_[^/]+(?:,[a-z]+_[^/]+)*\//i.test(tail)) return url;

  const transform = `w_${Math.max(1, width)},h_${Math.max(
    1,
    height,
  )},c_fill,g_auto,f_auto,q_auto:good,dpr_auto`;

  return `${head}${transform}/${tail}`;
}
