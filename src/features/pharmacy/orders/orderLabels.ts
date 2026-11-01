import type { Strings } from '@/lib/lang/types';

export type OrderStrings = Strings['orders'];

export function orderStatusLabel(status: string, strings: OrderStrings): string {
  return (strings.statuses as Record<string, string>)[status] ?? status;
}

export function paymentStatusLabel(status: string, strings: OrderStrings): string {
  return (strings.payments as Record<string, string>)[status] ?? status;
}
