/**
 * An explicit link name remains available when CSS hides its visible label.
 * Keep the optional count in the name of its own link, without repeating that
 * link name in a separate screen-reader-only badge.
 */
export function sidebarLinkAccessibleName(label: string, count?: number): string {
  return count !== undefined && count > 0 ? `${label}: ${count}` : label;
}
