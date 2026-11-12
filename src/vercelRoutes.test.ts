import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Route = { src?: string; handle?: string; continue?: boolean; status?: number; dest?: string; headers?: Record<string, string> };
const routes: Route[] = JSON.parse(readFileSync('vercel.json', 'utf8')).routes;

// Model Vercel's documented filesystem boundary: successful static files stop
// there; rules after it handle only paths missing from the deployment.
function resolve(path: string, exists: boolean) {
  let headers: Record<string, string> = {};
  for (const route of routes) {
    if (route.handle === 'filesystem') {
      if (exists) return { status: 200, headers };
      continue;
    }
    if (!route.src || !new RegExp(route.src).test(path)) continue;
    headers = { ...headers, ...route.headers };
    if (route.continue) continue;
    return { status: route.status ?? 200, dest: route.dest, headers };
  }
  return { status: 404, headers };
}

describe('Vercel asset cache routes', () => {
  it('caches existing fingerprinted JavaScript and CSS for a year', () => {
    for (const path of ['/assets/index-CD4aPD9j.js', '/assets/index-D78PDzqR.css']) {
      expect(resolve(path, true)).toEqual({ status: 200, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } });
    }
  });

  it('does not cache missing assets, even when their names appear fingerprinted', () => {
    expect(resolve('/assets/missing-abcdefgh.js', false)).toEqual({ status: 404, dest: undefined, headers: { 'Cache-Control': 'no-store' } });
  });

  it('revalidates HTML and unversioned files and preserves SPA routing', () => {
    expect(resolve('/sw.js', true).headers['Cache-Control']).toBe('public, max-age=0, must-revalidate');
    expect(resolve('/vendor/chart.umd.js', true).headers['Cache-Control']).toBe('public, max-age=0, must-revalidate');
    expect(resolve('/login', false)).toEqual({ status: 200, dest: '/index.html', headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } });
    expect(resolve('/assets/no-hash.js', true).headers['Cache-Control']).toBeUndefined();
  });
});
