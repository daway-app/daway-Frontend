// All chart instances share one request. A failed request can be retried when
// the user opens a chart again; public login pages never call this function.
let pending: Promise<void> | undefined;

export function loadChartLibrary(): Promise<void> {
  if (window.Chart) return Promise.resolve();
  if (pending) return pending;

  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = (message: string) => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error(message));
    };
    const timeout = setTimeout(() => fail('Chart.js timed out'), 30_000);
    script.src = '/vendor/chart.umd.js';
    script.async = true;
    script.onload = () => {
      clearTimeout(timeout);
      if (window.Chart) resolve();
      else fail('Chart.js did not register its constructor');
    };
    script.onerror = () => fail('Could not load Chart.js');
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
