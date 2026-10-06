import { describe, expect, it } from 'vitest';
import { money, thumbUrl } from './format';

/**
 * Regression guards for `money()` (audit B-10).
 *
 * Moved here from the fixture tests when the mock data was deleted: the helper
 * is live (every accounting screen formats with it), so the guard stays.
 */
describe('money() — audit B-10', () => {
  it('preserves the sign of a negative amount', () => {
    expect(money(-1366.5)).toBe('₪-1366.50');
  });

  it('renders positives unchanged', () => {
    expect(money(1240.5)).toBe('₪1240.50');
  });

  it('never emits NaN for a missing or non-finite value', () => {
    expect(money(null)).toBe('₪0.00');
    expect(money(undefined)).toBe('₪0.00');
    expect(money(Number.NaN)).toBe('₪0.00');
  });

  it('always shows exactly 2 decimals', () => {
    expect(money(0)).toBe('₪0.00');
    expect(money(7)).toBe('₪7.00');
  });
});

/**
 * `thumbUrl` must stay byte-identical to the Laravel reference
 * `App\Support\Image::thumbUrl()`.
 *
 * The API sends the RAW `image_url` with no size transform, so the frontend has
 * to reproduce the backend's Cloudinary transform — otherwise every 44×44 table
 * thumbnail downloads a full-resolution image. The backend's own comment records
 * the defect this prevents:
 *
 *   «كان أفاتار يُعرض بـ 34 بكسل يُنزَّل بأبعاد 1920×1080 (≈95 كيلوبايت للصورة)»
 *
 * The expected values below were produced by running the real PHP method
 * (`php artisan tinker`) — not hand-written — so a drift in either side fails
 * this test.
 */
describe('thumbUrl — parity with App\\Support\\Image::thumbUrl()', () => {
  const CLOUDINARY =
    'https://res.cloudinary.com/dmvzcwm3g/image/upload/v1790788319/daway/medicines/za3xt0bvlecmkzi17a7l.jpg';

  it('injects the transform after /image/upload/ for a Cloudinary URL', () => {
    expect(thumbUrl(CLOUDINARY, 88, 88)).toBe(
      'https://res.cloudinary.com/dmvzcwm3g/image/upload/w_88,h_88,c_fill,g_auto,f_auto,q_auto:good,dpr_auto/v1790788319/daway/medicines/za3xt0bvlecmkzi17a7l.jpg',
    );
  });

  it('passes a non-Cloudinary URL through untouched (transform is host-specific)', () => {
    expect(thumbUrl('https://example.com/foo.jpg', 88, 88)).toBe(
      'https://example.com/foo.jpg',
    );
  });

  it('does NOT stack a transform on an already-transformed URL', () => {
    expect(
      thumbUrl('https://res.cloudinary.com/x/image/upload/w_100,h_100/v1/a.jpg', 88, 88),
    ).toBe('https://res.cloudinary.com/x/image/upload/w_100,h_100/v1/a.jpg');
  });

  it('returns null for a missing URL', () => {
    expect(thumbUrl(null, 88, 88)).toBeNull();
    expect(thumbUrl(undefined, 88, 88)).toBeNull();
  });

  it('defaults height to width (the Laravel signature default)', () => {
    expect(thumbUrl(CLOUDINARY, 44)).toContain('w_44,h_44,');
  });

  it('returns the URL unchanged when there is no /image/upload/ marker', () => {
    const noMarker = 'https://res.cloudinary.com/x/image/fetch/a.jpg';
    expect(thumbUrl(noMarker, 88, 88)).toBe(noMarker);
  });

  it('never emits a zero or negative dimension', () => {
    expect(thumbUrl(CLOUDINARY, 0, 0)).toContain('w_1,h_1,');
  });
});
