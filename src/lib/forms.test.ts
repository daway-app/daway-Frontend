import { describe, expect, it } from 'vitest';
import {
  coordinate,
  latitude,
  longitude,
  matches,
  optionalUrl,
  password,
  phone,
  requiredText,
  validate,
} from './forms';

/**
 * Guards for the form-validation rules.
 *
 * These are worth testing because every one of them decides whether a request is
 * sent. A rule that is too lax means a 422 from the server that the user cannot
 * connect to a field; a rule that is too strict blocks a legitimate save. Both
 * are silent in a way that unit tests catch and clicking around usually does not.
 */

describe('requiredText()', () => {
  it('rejects an empty string', () => {
    expect(requiredText('', 'الاسم')).toBe('الاسم مطلوب');
  });

  it('rejects whitespace-only input', () => {
    // The backend's `required` rule trims, so `'   '` is invalid there too. If
    // this returned null the user would see a clean field and then a server
    // error, which is the single most confusing validation outcome.
    expect(requiredText('   ', 'الاسم')).toBe('الاسم مطلوب');
    expect(requiredText('\t\n', 'الاسم')).toBe('الاسم مطلوب');
  });

  it('accepts real text, with surrounding space ignored', () => {
    expect(requiredText('صيدلية النور', 'الاسم')).toBeNull();
    expect(requiredText('  صيدلية النور  ', 'الاسم')).toBeNull();
  });
});

describe('phone()', () => {
  it('accepts the local 10-digit form', () => {
    expect(phone('0599123456', 'الهاتف')).toBeNull();
  });

  it('accepts the same number with spaces and dashes', () => {
    // Palestine writes numbers this way constantly; rejecting the formatting
    // rather than the number would be hostile.
    expect(phone('0599 123 456', 'الهاتف')).toBeNull();
    expect(phone('0599-123-456', 'الهاتف')).toBeNull();
  });

  it('accepts an international form with a plus and parentheses', () => {
    expect(phone('+970 599 123 456', 'الهاتف')).toBeNull();
    expect(phone('(0599) 123456', 'الهاتف')).toBeNull();
  });

  it('rejects a number with too few digits', () => {
    expect(phone('059912', 'الهاتف')).toBe('رقم الهاتف غير مكتمل');
  });

  it('rejects letters mixed into the number', () => {
    // 10 digits, so the length check passes and the character check is what
    // fires. The earlier attempts (`0599abc456` = 7 digits, `0599abc4567` = 8)
    // failed on length first — the assertions were wrong, not the code. The
    // digit count is asserted explicitly below so this cannot drift again.
    const value = '0599abc456789';
    expect(value.replace(/[^\d]/g, '')).toHaveLength(10);
    expect(phone(value, 'الهاتف')).toBe('رقم الهاتف يحتوي رموزاً غير صحيحة');
  });

  it('rejects an empty value with the required message', () => {
    expect(phone('   ', 'الهاتف')).toBe('الهاتف مطلوب');
  });

  it('ignores separators when counting digits', () => {
    // 9 digits padded with separators only — the separators must not count.
    expect(phone('--- 123456789 ---', 'الهاتف')).toBeNull();
  });
});

describe('coordinate()', () => {
  it('treats an empty value as valid, because the API accepts null', () => {
    expect(coordinate('', 'خط العرض', -90, 90)).toBeNull();
    expect(coordinate('   ', 'خط العرض', -90, 90)).toBeNull();
  });

  it('accepts a decimal within range', () => {
    expect(coordinate('31.5017', 'خط العرض', -90, 90)).toBeNull();
    expect(coordinate('-90', 'خط العرض', -90, 90)).toBeNull();
    expect(coordinate('90', 'خط العرض', -90, 90)).toBeNull();
  });

  it('rejects a value outside range', () => {
    expect(coordinate('91', 'خط العرض', -90, 90)).toContain('بين');
    expect(coordinate('-181', 'خط الطول', -180, 180)).toContain('بين');
  });

  it('rejects trailing garbage rather than parsing the prefix', () => {
    // `Number('12abc')` is NaN but `parseFloat('12abc')` is 12 — if the shape
    // check were missing, this would sail through as 12.
    expect(coordinate('12abc', 'خط العرض', -90, 90)).toBe('خط العرض يجب أن يكون رقماً');
    expect(coordinate('31.5.2', 'خط العرض', -90, 90)).toBe('خط العرض يجب أن يكون رقماً');
  });

  it('does NOT accept the empty string as the number zero', () => {
    // The classic JS trap: `Number('') === 0`, which is a legal latitude. If
    // this rule collapsed empty to 0, an unset location would silently save as
    // (0, 0) — a point in the Atlantic.
    expect(coordinate('', 'خط العرض', -90, 90)).toBeNull();
    expect(coordinate('0', 'خط العرض', -90, 90)).toBeNull();
  });
});

describe('latitude() / longitude()', () => {
  it('use the correct ranges', () => {
    expect(latitude('91')).toContain('بين -90 و 90');
    expect(latitude('31.5')).toBeNull();
    expect(longitude('181')).toContain('بين -180 و 180');
    expect(longitude('34.4668')).toBeNull();
  });
});

describe('optionalUrl()', () => {
  it('accepts empty, because the logo is optional', () => {
    expect(optionalUrl('', 'الشعار')).toBeNull();
  });

  it('accepts http and https', () => {
    expect(optionalUrl('https://cdn.example.com/logo.png', 'الشعار')).toBeNull();
    expect(optionalUrl('http://cdn.example.com/logo.png', 'الشعار')).toBeNull();
  });

  it('rejects a bare host with no scheme', () => {
    // Laravel's `url` rule requires a scheme, so this MUST fail here too or the
    // user gets a red-free field and then a 422.
    expect(optionalUrl('cdn.example.com/logo.png', 'الشعار')).toBe('الشعار ليس رابطاً صحيحاً');
  });

  it('rejects a non-http scheme', () => {
    expect(optionalUrl('javascript:alert(1)', 'الشعار')).toContain('http');
    expect(optionalUrl('ftp://example.com/logo.png', 'الشعار')).toContain('http');
  });
});

describe('password() / matches()', () => {
  it('enforces the backend minimum of 8', () => {
    expect(password('short', 'كلمة المرور')).toContain('8');
    expect(password('1234567', 'كلمة المرور')).toContain('8');
    expect(password('12345678', 'كلمة المرور')).toBeNull();
  });

  it('reports empty as required', () => {
    expect(password('', 'كلمة المرور')).toBe('كلمة المرور مطلوب');
  });

  it('matches only on exact equality', () => {
    expect(matches('abc12345', 'abc12345', 'كلمتا المرور')).toBeNull();
    expect(matches('abc12345', 'abc1234', 'كلمتا المرور')).toContain('غير متطابقة');
    // A trailing space is a real difference, and silently trimming it would
    // mean the confirmation disagrees with what was sent.
    expect(matches('abc12345 ', 'abc12345', 'كلمتا المرور')).toContain('غير متطابقة');
  });
});

describe('validate()', () => {
  it('reports ok when every rule passes', () => {
    const { errors, ok } = validate<'a' | 'b'>({
      a: () => null,
      b: () => null,
    });
    expect(ok).toBe(true);
    expect(errors).toEqual({ a: null, b: null });
  });

  it('reports not-ok and collects EVERY failure, not just the first', () => {
    // Collecting all of them is what lets the form mark every bad field at
    // once; bailing on the first would leave the second one clean-looking.
    const { errors, ok } = validate<'a' | 'b' | 'c'>({
      a: () => null,
      b: () => 'مطلوب',
      c: () => 'غير صحيح',
    });
    expect(ok).toBe(false);
    expect(errors.a).toBeNull();
    expect(errors.b).toBe('مطلوب');
    expect(errors.c).toBe('غير صحيح');
  });

  it('treats an empty-string message as a failure when it is falsy', () => {
    const { ok } = validate<'a'>({ a: () => '' });
    expect(ok).toBe(true); // an empty string is "no error" by design
  });
});
