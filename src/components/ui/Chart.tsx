import { useEffect, useRef } from 'react';

/**
 * Chart.js wrapper — reproduces resources/js/pharmacy_hub.js `phBuildChart`
 * EXACTLY (same chart types, same token-driven colours, same donut cutout and
 * centre-text plugin).
 *
 * Chart.js is loaded from the vendored file copied from Blade
 * (public/vendor/chart.umd.js) — no new npm dependency, per decision B7.
 */

declare global {
  interface Window {
    Chart?: new (ctx: CanvasRenderingContext2D, config: unknown) => {
      destroy: () => void;
    };
  }
}

export type ChartKind = 'bar' | 'line' | 'donut';

export interface ChartProps {
  kind: ChartKind;
  labels: string[];
  data: number[];
  /** Token names (e.g. "--success") or literal colours, resolved at draw time. */
  colors?: string[];
  /** Hide the built-in legend (donut centre-text mode uses an external list). */
  legend?: boolean;
  centerValue?: string;
  centerLabel?: string;
}

/** Read a CSS custom property from :root, exactly as the Blade helper does. */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function isDark(): boolean {
  return (
    document.documentElement.classList.contains('dark-mode') ||
    document.body.classList.contains('dark-mode')
  );
}

/** Resolve "--token" strings via tokens.css, pass literals through. */
function resolveColor(c: string): string {
  return typeof c === 'string' && c.slice(0, 2) === '--' ? cssVar(c) || '#94A3B8' : c;
}

/** Donut centre text plugin — ported 1:1 from the Blade `phCenterTextPlugin`. */
const centerTextPlugin = {
  id: 'phCenterText',
  beforeDraw(chart: {
    config: { options: { phCenterText?: { value: string; label: string } } };
    ctx: CanvasRenderingContext2D;
    chartArea: { width: number; height: number; left: number; top: number };
  }) {
    const opts = chart.config.options.phCenterText;
    if (!opts) return;
    const {
      ctx,
      chartArea: { width, height, left, top },
    } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = left + width / 2;
    const cy = top + height / 2;
    ctx.font = '700 22px Tajawal, Cairo, sans-serif';
    ctx.fillStyle = cssVar('--ink') || '#0C2224';
    ctx.fillText(opts.value, cx, cy - 10);
    ctx.font = '600 12px Tajawal, Cairo, sans-serif';
    ctx.fillStyle = cssVar('--ink-faint') || '#5C7073';
    ctx.fillText(opts.label, cx, cy + 12);
    ctx.restore();
  },
};

export function Chart({ kind, labels, data, colors = [], legend = true, centerValue, centerLabel }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    function build() {
      const canvas = canvasRef.current;
      const ChartCtor = window.Chart;
      if (!canvas || !ChartCtor) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const resolved = colors.map(resolveColor);
      const dark = isDark();
      const grid = cssVar('--line-soft') || '#EEF4F3';
      const tick = cssVar('--ink-faint') || '#5C7073';
      const accent = cssVar('--focus-ring') || '#1C72A6';
      const axis = {
        y: { beginAtZero: true, grid: { color: grid }, ticks: { color: tick } },
        x: { grid: { display: false }, ticks: { color: tick } },
      };

      let config: Record<string, unknown> = {};

      if (kind === 'bar') {
        config = {
          type: 'bar',
          data: { labels, datasets: [{ data, backgroundColor: resolved, borderRadius: 6 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: axis,
          },
        };
      } else if (kind === 'line') {
        config = {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                data,
                borderColor: accent,
                backgroundColor: dark ? 'rgba(56,189,248,.16)' : 'rgba(28,114,166,.10)',
                pointBackgroundColor: accent,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: axis,
          },
        };
      } else {
        config = {
          type: 'doughnut',
          data: { labels, datasets: [{ data, backgroundColor: resolved, borderWidth: 0 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
              legend: legend
                ? {
                    position: document.dir === 'rtl' ? 'left' : 'right',
                    labels: { color: tick },
                  }
                : { display: false },
            },
            scales: {},
          },
        };
        if (centerValue) {
          (config.options as Record<string, unknown>).phCenterText = {
            value: centerValue,
            label: centerLabel || '',
          };
          config.plugins = [centerTextPlugin];
        }
      }

      instanceRef.current = new ChartCtor(ctx, config);
    }

    /** Rebuild on theme change (destroys + recreates, like phRedrawCharts). */
    function onThemeChanged() {
      instanceRef.current?.destroy();
      instanceRef.current = null;
      build();
    }
    window.addEventListener('daway:theme-changed', onThemeChanged);

    let intervalId: number | null = null;
    if (window.Chart) {
      build();
    } else {
      /**
       * Chart.js is loaded with `defer` from index.html, so it may land a few
       * microseconds after this effect runs.
       *
       * AUDIT B-1 FIX: the previous implementation polled every 50 ms with NO
       * upper bound. If the script tag was missing (which it was), the charts
       * silently rendered nothing, forever, with no console error — the defect
       * was invisible. Now the wait is bounded and a missing library fails
       * LOUDLY so it can never regress silently again.
       */
      const MAX_WAIT_MS = 5000;
      const POLL_MS = 50;
      let waited = 0;

      intervalId = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(intervalId!);
          return;
        }
        if (window.Chart) {
          window.clearInterval(intervalId!);
          intervalId = null;
          build();
          return;
        }
        waited += POLL_MS;
        if (waited >= MAX_WAIT_MS) {
          window.clearInterval(intervalId!);
          intervalId = null;
          console.error(
            '[Chart] window.Chart is unavailable after %d ms. Chart.js must be loaded ' +
              'by a <script defer src="/vendor/chart.umd.js"> tag in index.html — ' +
              'the chart cannot render without it.',
            MAX_WAIT_MS,
          );
          console.warn('[Chart] chart did not render', { kind, labels });
        }
      }, POLL_MS);
    }

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      window.removeEventListener('daway:theme-changed', onThemeChanged);
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [kind, labels, data, colors, legend, centerValue, centerLabel]);

  return <canvas ref={canvasRef} />;
}

/**
 * Redraw all charts when the theme class flips — mirrors the Blade
 * `MutationObserver(phRedrawCharts)` on documentElement. Individual charts
 * re-run their own effect because the theme toggle is a class change, so this
 * is handled by the Topbar dispatching a custom event.
 */
