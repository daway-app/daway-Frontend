/**
 * Build the EN dictionary from the Laravel lang files (part 1: PHP parser).
 * See part 2 appended below for the mirror builder.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const backendLang = 'C:\\Users\\MSI\\daway-backend\\resources\\lang';

/** Strip //, # and block comments (outside strings). */
export function stripPhpComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === '\\' && i + 1 < src.length) { out += src[i + 1]; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; out += c; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Parse a single-quoted PHP string starting at i (src[i] === "'"). */
export function parsePhpString(src, i) {
  let j = i + 1;
  let value = '';
  while (j < src.length) {
    const c = src[j];
    if (c === '\\' && j + 1 < src.length && (src[j + 1] === "'" || src[j + 1] === '\\')) {
      value += src[j + 1];
      j += 2;
      continue;
    }
    if (c === "'") return { value, next: j + 1 };
    value += c;
    j++;
  }
  throw new Error('Unterminated PHP string');
}

/** Parse a PHP array body (content between [ and matching ]) to a JS object. */
export function parsePhpArrayBody(src) {
  let i = 0;
  const len = src.length;
  const obj = {};
  function skipWs() { while (i < len && /[\s,]/.test(src[i])) i++; }
  while (i < len) {
    skipWs();
    if (i >= len) break;
    if (src[i] === ']' || src[i] === ')') { i++; break; }
    if (src[i] !== "'") { i++; continue; }
    const parsed = parsePhpString(src, i);
    const key = parsed.value;
    i = parsed.next;
    skipWs();
    if (src[i] === ']' || src[i] === ')') { obj[key] = true; continue; }
    if (src[i] !== '=' || src[i + 1] !== '>') continue;
    i += 2;
    skipWs();
    if (src[i] === "'") {
      const v = parsePhpString(src, i);
      obj[key] = v.value;
      i = v.next;
    } else if (src[i] === '[') {
      let depth = 0;
      let j = i;
      let q = null;
      while (j < len) {
        const c = src[j];
        if (q) {
          if (c === '\\') { j += 2; continue; }
          if (c === q) q = null;
          j++;
          continue;
        }
        if (c === "'") { q = c; j++; continue; }
        if (c === '[') depth++;
        if (c === ']') { depth--; if (depth === 0) break; }
        j++;
      }
      obj[key] = parsePhpArrayBody(src.slice(i + 1, j));
      i = j + 1;
    } else {
      let j = i;
      while (j < len && ![',', ']', ')', '\n'].includes(src[j])) j++;
      obj[key] = src.slice(i, j).trim();
      i = j;
    }
  }
  return obj;
}

/** Find span [start..end] of outermost bracket opened at `open`. */
export function bracketSpan(src, open) {
  let depth = 0;
  let j = open;
  let q = null;
  while (j < src.length) {
    const c = src[j];
    if (q) {
      if (c === '\\') { j += 2; continue; }
      if (c === q) q = null;
      j++;
      continue;
    }
    if (c === "'") { q = c; j++; continue; }
    if (c === '[') depth++;
    if (c === ']') { depth--; if (depth === 0) break; }
    j++;
  }
  return [open, j];
}

export function parsePhpLangFile(path) {
  const raw = readFileSync(path, 'utf8');
  const clean = stripPhpComments(raw);
  const ret = clean.indexOf('return');
  const open = clean.indexOf('[', ret);
  const span = bracketSpan(clean, open);
  return parsePhpArrayBody(clean.slice(span[0] + 1, span[1]));
}

/** Flatten {a:{b:'x'}} to {'a.b':'x'} (leaf strings only). */
export function flatten(obj, prefix, out) {
  const target = out || {};
  for (const entry of Object.entries(obj)) {
    const k = entry[0];
    const v = entry[1];
    const key = prefix ? prefix + '.' + k : k;
    if (typeof v === 'string') target[key] = v;
    else if (v && typeof v === 'object') flatten(v, key, target);
  }
  return target;
}

export function loadLocale(locale) {
  const dir = join(backendLang, locale);
  const files = readdirSync(dir).filter((f) => f.endsWith('.php'));
  const perFile = {};
  for (const f of files) {
    const base = f.replace(/\.php$/, '');
    perFile[base] = flatten(parsePhpLangFile(join(dir, f)), '', {});
  }
  return perFile;
}
