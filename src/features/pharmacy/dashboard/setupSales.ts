/** Only the visible setup checklist consumes this sales-list response. */
export function shouldLoadSetupSales(checklistVisible: boolean, dismissed: boolean): boolean {
  return checklistVisible && !dismissed;
}
