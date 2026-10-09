import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  closeCommandPalette,
  detectMac,
  filterCommands,
  isCommandPaletteOpen,
  isPaletteShortcut,
  openCommandPalette,
  shortcutLabel,
  useCommandKOpen,
} from '@/lib/commandPalette';
import { AR } from '@/lib/i18n';
import { toggleTheme } from '@/lib/theme';
import { ROUTES } from '@/routes/paths';
import { IconAlertTriangle, IconBox, IconCapsule, IconChat, IconDashboard, IconPlus, IconStar, IconUser } from './icons';

/**
 * CommandPalette — a Ctrl+K / Cmd+K quick-navigation dialog.
 *
 * WHERE IT LIVES
 * --------------
 * `components/layout/`, next to `Sidebar`/`Topbar`, because it is shell chrome:
 * it is mounted once in `AppLayout`, is not aware of any page, and resolves its
 * destinations from the SAME nav constants the sidebar renders. It was not put
 * in `components/ui` because that module is a set of page primitives; the
 * palette is a single, shell-owned feature, not a reusable primitive.
 *
 * WHY IT DOES NOT REUSE THE SHARED `Modal`
 * ----------------------------------------
 * `ui/index.tsx`'s `Modal` has a good focus trap, and the temptation is to wrap
 * it. It conflicts with the combobox pattern in two concrete ways:
 *
 *   1. It focuses the FIRST focusable element. Its chrome renders a header
 *      close button before the body, so focus would land on `×`, not the search
 *      input — exactly backwards for a type-to-filter dialog.
 *   2. Its Tab handler CYCLES focus between the trap's focusables. In the
 *      listbox pattern focus must NEVER leave the input: the highlighted option
 *      is expressed with `aria-activedescendant`, not by moving focus. A trap
 *      that pulls focus onto the close button on Tab breaks that contract.
 *
 * So this builds its own dialog — reusing the same overlay/dialog class family
 * and the same guarantees the `Modal` provides (focus moves in on open, returns
 * to the trigger on close, Escape closes, body scroll locks) but with the input
 * as the single focus target.
 *
 * A11Y SHAPE
 * ----------
 * input  role="combobox"  aria-expanded / aria-controls / aria-activedescendant
 * list   role="listbox"
 * option role="option"     aria-selected on the active one
 */

/** A registry entry: a `CommandDescriptor` plus what activating it does. */
interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  keywords: string;
  icon: ReactNode;
  /** Router destination. Exactly one of `to` / `action` is set. */
  to?: string;
  action?: () => void;
}

/**
 * Build the registry from real routes only.
 *
 * This mirrors `Sidebar.tsx`: the same destinations, the same Arabic labels,
 * the same icons — plus the four accounting links that are ACTUALLY built. The
 * sidebar's eight "قريبًا" (coming-soon) rows are deliberately NOT here: they
 * have no route, so offering them would navigate nowhere.
 *
 * `keywords` carries the route path (so `inv` finds `/inventory`) plus a short
 * Latin synonym, which is what makes the palette usable without an Arabic
 * keyboard.
 */
function buildCommands(): PaletteCommand[] {
  const destinations: PaletteCommand[] = [
    { id: 'dashboard', label: AR.pharmacy.sidebar.dashboard, group: AR.commandPalette.group_destinations, keywords: `${ROUTES.dashboard} home dashboard`, icon: <IconDashboard />, to: ROUTES.dashboard },
    { id: 'medicines', label: AR.pharmacy.sidebar.manage_medicines, group: AR.commandPalette.group_destinations, keywords: `${ROUTES.medicines} medicines meds`, icon: <IconCapsule />, to: ROUTES.medicines },
    { id: 'inventory', label: AR.pharmacy.sidebar.inventory, group: AR.commandPalette.group_destinations, keywords: `${ROUTES.inventory} inventory stock`, icon: <IconBox />, to: ROUTES.inventory },
    { id: 'inventory-import', label: AR.pharmacy.sidebar.bulk_import, group: AR.commandPalette.group_destinations, keywords: `${ROUTES.inventoryImport} inventory import bulk excel`, icon: <IconPlus />, to: ROUTES.inventoryImport },
    { id: 'inquiries', label: AR.pharmacy.sidebar.inquiries, group: AR.commandPalette.group_destinations, keywords: `${ROUTES.inquiries} inquiries chat`, icon: <IconChat />, to: ROUTES.inquiries },
    { id: 'alternatives', label: AR.pharmacy.sidebar.manage_alternatives, group: AR.commandPalette.group_destinations, keywords: `${ROUTES.alternatives} alternatives substitutes`, icon: <IconAlertTriangle />, to: ROUTES.alternatives },
    { id: 'profile', label: AR.pharmacy.sidebar.pharmacy_profile, group: AR.commandPalette.group_destinations, keywords: `${ROUTES.profile} profile settings`, icon: <IconUser />, to: ROUTES.profile },
    { id: 'ratings', label: AR.pharmacy.sidebar.ratings, group: AR.commandPalette.group_destinations, keywords: `${ROUTES.ratings} ratings reviews stars`, icon: <IconStar />, to: ROUTES.ratings },
  ];

  const accounting: PaletteCommand[] = [
    { id: 'acc-overview', label: AR.accounting.sidebar.overview, group: AR.commandPalette.group_accounting, keywords: `${ROUTES.accounting} accounting overview`, icon: <IconDashboard />, to: ROUTES.accounting },
    { id: 'acc-sales', label: AR.accounting.sidebar.sales, group: AR.commandPalette.group_accounting, keywords: `${ROUTES.accountingSales} accounting sales invoices pos`, icon: <IconCapsule />, to: ROUTES.accountingSales },
    { id: 'acc-refunds', label: AR.accounting.sidebar.refunds, group: AR.commandPalette.group_accounting, keywords: `${ROUTES.accountingRefunds} accounting refunds returns`, icon: <IconAlertTriangle />, to: ROUTES.accountingRefunds },
    { id: 'acc-cash', label: AR.accounting.sidebar.cash_register, group: AR.commandPalette.group_accounting, keywords: `${ROUTES.accountingCash} accounting cash register till`, icon: <IconBox />, to: ROUTES.accountingCash },
  ];

  // A single real ACTION — toggling the theme is already wired and reversible.
  // Logout is deliberately NOT offered: the sidebar routes it through a
  // confirmation dialog, and a palette row that logged out on Enter would
  // bypass that confirmation.
  const actions: PaletteCommand[] = [
    {
      id: 'toggle-theme',
      label: AR.commandPalette.action_toggle_theme,
      group: AR.commandPalette.group_actions,
      keywords: `theme dark light mode ${AR.commandPalette.action_toggle_theme}`,
      icon: <IconStar />,
      action: () => toggleTheme(),
    },
  ];

  return [...destinations, ...accounting, ...actions];
}

/** True when a dialog is already on screen, so Ctrl+K must NOT stack another. */
function anotherDialogIsOpen(): boolean {
  return (
    isCommandPaletteOpen() ||
    document.querySelector('.ph-modal-overlay.active, .confirm-modal-overlay.active, dialog[open]') !== null
  );
}

export function CommandPalette() {
  const open = useCommandKOpen();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Built once — the registry is static (labels come from `AR`, routes from
  // `ROUTES`), so there is no reason to rebuild it on every keystroke.
  const commands = useMemo(() => buildCommands(), []);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  /* -------- global shortcut: open from anywhere, unless a dialog is up ----- */
  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if (!isPaletteShortcut(event)) return;
      // Do not fight the browser's own Ctrl+K (focus address bar) when a native
      // dialog is present, and do not stack a second palette dialog.
      if (anotherDialogIsOpen()) return;
      event.preventDefault();
      openCommandPalette();
    }
    document.addEventListener('keydown', onGlobalKeyDown);
    return () => document.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  /* -------- on open: reset the query and put focus in the INPUT ----------- */
  useEffect(() => {
    if (!open) return;

    // Remember the trigger so focus can go back to it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    setQuery('');
    setActiveIndex(0);
    // `requestAnimationFrame` so the node exists and is laid out before focus.
    const raf = requestAnimationFrame(() => inputRef.current?.focus());

    // Lock the page behind the overlay, exactly like the shared `Modal`.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  /* -------- keep the active option in view as the user arrows through ----- */
  useEffect(() => {
    if (!open) return;
    const active = document.getElementById(`${listId}-opt-${activeIndex}`);
    // `scrollIntoView` on a `block: 'nearest'` only moves when it must, so the
    // list does not jump while the pointer is elsewhere.
    active?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, results, listId]);

  /**
   * Clamp the active index to the current result set.
   *
   * Done at read time rather than in an effect: filtering can shrink the list
   * below `activeIndex` in the same render, and reading a clamped value avoids
   * a frame where no option is highlighted.
   */
  const safeIndex = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);

  function activate(command: PaletteCommand | undefined) {
    if (!command) return;
    closeCommandPalette();
    if (command.to) {
      void navigate(command.to);
    } else {
      command.action?.();
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((current) => {
        const clamped = Math.min(current, results.length - 1);
        const next = event.key === 'ArrowDown' ? clamped + 1 : clamped - 1;
        // Wrap around, so the ends are reachable without reversing.
        return (next + results.length) % results.length;
      });
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(results.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activate(results[safeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      // Stop the key from also reaching any parent dialog's Escape handler.
      event.stopPropagation();
      closeCommandPalette();
      return;
    }
    if (event.key === 'Tab') {
      // Focus must stay in the input for `aria-activedescendant` to work; there
      // is no other tabbable control inside the palette.
      event.preventDefault();
    }
  }

  if (!open) return null;

  const activeOptionId = safeIndex >= 0 ? `${listId}-opt-${safeIndex}` : undefined;

  return (
    <div
      className="cmdk-overlay"
      // `mousedown` (not `click`) so a drag that starts outside and ends on the
      // dialog does not close it — the usual overlay-close mistake.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeCommandPalette();
      }}
    >
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label={AR.commandPalette.title}
      >
        <div className="cmdk-input-row">
          <input
            ref={inputRef}
            type="text"
            className="cmdk-input"
            role="combobox"
            aria-expanded={true}
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-label={AR.commandPalette.search_label}
            placeholder={AR.commandPalette.placeholder}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // A new query means a new result set; highlight the best match.
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="cmdk-esc">{AR.commandPalette.hint_close}</kbd>
        </div>

        {results.length === 0 ? (
          <div className="cmdk-empty" role="status">
            <p className="cmdk-empty-title">{AR.commandPalette.empty_title}</p>
            <p className="cmdk-empty-hint">{AR.commandPalette.empty_hint}</p>
          </div>
        ) : (
          <ul className="cmdk-list" id={listId} role="listbox" aria-label={AR.commandPalette.search_label}>
            {results.map((command, index) => {
              const active = index === safeIndex;
              return (
                <li
                  key={command.id}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={active}
                  className={`cmdk-item${active ? ' is-active' : ''}`}
                  // Keep focus in the input; the pointer only moves the
                  // highlight. `onMouseDown` prevents the input's blur too.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => activate(command)}
                >
                  <span className="cmdk-item-icon" aria-hidden="true">
                    {command.icon}
                  </span>
                  <span className="cmdk-item-label">{command.label}</span>
                  <span className="cmdk-item-group">{command.group}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="cmdk-foot">
          <span className="cmdk-foot-hint">
            <kbd>↑</kbd>
            <kbd>↓</kbd> {AR.commandPalette.hint_navigate}
          </span>
          <span className="cmdk-foot-hint">
            <kbd>↵</kbd> {AR.commandPalette.hint_select}
          </span>
          {results.length > 0 && (
            <span className="cmdk-foot-count">
              {AR.commandPalette.results_count.replace(':count', String(results.length))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The quiet Topbar affordance that makes the shortcut discoverable.
 *
 * A keyboard shortcut nobody knows about may as well not exist. This is a real
 * `<button>` (reachable by Tab) whose visible `⌘K`/`Ctrl K` label doubles as
 * the hint. It is small and low-contrast by default so it does not disturb the
 * Light Mode header.
 */
export function CommandPaletteTrigger() {
  const isMac = useMemo(() => detectMac(), []);
  return (
    <button
      type="button"
      className="cmdk-trigger"
      title={AR.commandPalette.open_tooltip}
      aria-label={AR.commandPalette.open_tooltip}
      onClick={() => openCommandPalette()}
    >
      <span className="cmdk-trigger-label">{shortcutLabel(isMac)}</span>
    </button>
  );
}
