import { AR } from '@/lib/i18n';
import { EN } from './en';
import { type Lang as LangType } from './store';

export type Lang = LangType;

/**
 * A dictionary value with every string leaf widened to `string`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `typeof AR`
 * ─────────────────────────────────────────────────────────────────────────────
 * `AR` is declared `as const`, so `typeof AR` is not "a dictionary" — it is the
 * exact set of ARABIC STRING LITERALS (`app_title: "دواك"`). Assigning `EN` to
 * that type is a type error, because `"DAWAK"` is not `"دواك"`.
 *
 * The mismatch stayed hidden because nothing ever passed `EN` where a `Strings`
 * was expected: consumers take `STR` from `useLang()`, whose runtime value is
 * `AR | EN`, and TypeScript accepts it because `AR` is the declared type. The
 * first genuinely language-agnostic call site (`pageInfo` in a test) exposed it
 * immediately — which is the point: "the dictionaries are interchangeable" was
 * an assumption nobody had ever asked the compiler to verify.
 *
 * `DeepWiden` keeps the exact KEY STRUCTURE, so a missing key in a translation
 * is still a compile error, while allowing any string value.
 */
type DeepWiden<T> = T extends string ? string : { readonly [K in keyof T]: DeepWiden<T[K]> };

/**
 * The dictionary contract every language must satisfy.
 *
 * Keys come from `AR` (the reference); values are widened. This makes `EN`
 * assignable to the same type as `AR` while still failing to compile if it
 * drifts out of shape.
 */
export type Strings = DeepWiden<typeof AR>;

/**
 * Compile-time proof that both shipped dictionaries satisfy the contract.
 *
 * These assignments are never read at runtime. They exist so that a translation
 * that misses a key — because `AR` gained one and `EN` did not — fails `tsc` at
 * the source of the drift, naming the missing property, instead of surfacing as
 * a blank label in the UI.
 *
 * Checking `AR` against the widened form of itself also proves `DeepWiden` does
 * not reject its own reference dictionary, which is the failure mode if the
 * widener is ever tightened too far.
 */
export const _AR_SATISFIES_STRINGS: Strings = AR;
export const _EN_SATISFIES_STRINGS: Strings = EN;
