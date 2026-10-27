import { Component, useContext } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { LangContext } from '@/lib/lang/useLang';
import { AR } from '@/lib/i18n';
import { isChunkLoadError } from './chunkLoadError';

/**
 * Route-level crash screen.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Before this component the router had NO `errorElement` anywhere. Any of the
 * following produced a **completely blank page with no message**:
 *
 *   · a render error in a page component (e.g. reading a property off an
 *     `undefined` that a malformed API payload left behind);
 *   · a rejected `React.lazy` import — the realistic one: a new build is
 *     deployed while a user still has the previous tab open, the old hashed
 *     chunk 404s, and every navigation to a not-yet-loaded route dies silently.
 *     With this backend measured at 3–9s per request that window is wide,
 *     not theoretical;
 *   · an error thrown by a guard or a loader.
 *
 * React Router renders `errorElement` INSTEAD of the crashed subtree, so only
 * the content area is replaced. The router declares this component both at the
 * root and on every guarded branch (see `router.tsx`): a crash inside a page
 * then keeps the user's sidebar and session rather than dumping them onto a
 * dead full-page screen.
 *
 * WHY IT READS `useRouteError()`
 * ------------------------------
 * The router never passes the thrown value as a prop — it is only reachable
 * through `useRouteError()`. That hook returns the value; a class boundary is
 * what renders the fallback, because React has no hook for catching errors.
 *
 * WHY THE COPY DEGRADES INSTEAD OF THROWING
 * -----------------------------------------
 * `useLang()` throws outside `<LanguageProvider>` by design. An error screen
 * that throws while rendering the error is unrecoverable, so this reads the
 * context directly and falls back to Arabic (the app default). Same reasoning
 * for the actions: they are a plain `<a href>` and `location.reload()` rather
 * than `useNavigate`, because a crash ABOVE the router must still offer a way
 * out.
 */

/** The actual UI. Not exported — the module must export components only. */
function CrashScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  // Read the context directly: `useLang()` throws when unmounted, and an error
  // screen that crashes is worse than an untranslated one.
  const ctx = useContext(LangContext);
  const STR = ctx?.STR ?? AR;
  const C = STR.crash;
  const isAr = (ctx?.lang ?? 'ar') === 'ar';

  const chunkFailure = isChunkLoadError(error);
  // A 404 that reached here was thrown by a loader/action, not a bad URL.
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  const title = chunkFailure ? C.chunk_title : C.title;
  const body = chunkFailure ? C.chunk_body : C.body;

  // The raw message only helps a developer or a user filing a report. A chunk
  // error's message is noise ("Failed to fetch …/Page-abc123.js") so it is
  // suppressed there — the copy above already explains the cause.
  const detail = !chunkFailure && !notFound ? describe(error) : null;

  return (
    <div
      className="ph-error route-crash"
      role="alert"
      aria-live="assertive"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <i
        className={chunkFailure ? 'fas fa-arrow-rotate-right' : 'fas fa-triangle-exclamation'}
        aria-hidden="true"
      />
      <h1>{title}</h1>
      <p>{body}</p>

      {detail && (
        <details className="route-crash-details">
          <summary>{C.details}</summary>
          <pre>{detail}</pre>
        </details>
      )}

      <div className="route-crash-actions">
        {/* A hard reload is the ONLY reliable recovery from a chunk 404: the
            in-memory module map still holds the rejected promise, so a soft
            retry re-fails instantly. For other errors a reload is a safe second
            chance, so it stays primary either way. */}
        <button className="ph-btn sm" type="button" onClick={() => window.location.reload()}>
          <i className="fas fa-arrows-rotate" aria-hidden="true" />
          {C.reload}
        </button>
        {/* Soft retry only makes sense when no module load failed. */}
        {!chunkFailure && (
          <button className="ph-btn outline sm" type="button" onClick={onRetry}>
            <i className="fas fa-rotate-right" aria-hidden="true" />
            {C.retry}
          </button>
        )}
        {/* Plain anchor, not <Link>: this may render above the router. */}
        <a className="ph-btn outline sm" href="/">
          <i className="fas fa-house" aria-hidden="true" />
          {C.home}
        </a>
      </div>
    </div>
  );
}

/** Human-readable one-liner for the collapsed details block. */
function describe(error: unknown): string | null {
  if (!error) return null;
  if (isRouteErrorResponse(error)) {
    return [error.status, error.statusText].filter(Boolean).join(' ') || null;
  }
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return null;
  }
}

/**
 * Router-facing entry point — mounted as `errorElement`.
 *
 * React Router catches the throw and re-renders this in place of the branch, so
 * the error arrives via `useRouteError()` rather than as a prop.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  return <CrashScreen error={error} onRetry={() => window.location.reload()} />;
}

/**
 * Class boundary — the non-router escape hatch.
 *
 * `errorElement` only covers errors thrown inside the router tree. Anything
 * that throws during the initial mount of the providers wrapping
 * `RouterProvider` (App.tsx) would still get no boundary at all — the other
 * half of the blank-screen problem. Wrapping that tree in this component
 * closes it.
 */
export class ErrorBoundary extends Component<
  { children?: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // `console.error`, not `console.log` — a crash is exactly what a console is
    // for, and this keeps the stack reachable in devtools and in browser error
    // reporting without shipping log noise on the happy path.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return <CrashScreen error={this.state.error} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
