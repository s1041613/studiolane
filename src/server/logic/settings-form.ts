// Field helpers shared by the settings forms (人員名單, 價格方案, 用途).

import { money } from "@/server/logic/home-selectors";

export const MAX_RATE = 99_999;

export type ParsedRate = { ok: true; value: number } | { ok: false; reason: string };

const RATE_ERROR = "請填 0 到 99,999 的整數";

// Hourly rates are whole TWD, 0..99,999 (pricing B3, purposes B2). Accepts
// what the field shows after formatting, e.g. "1,250".
export function parseRate(input: string): ParsedRate {
  const digits = input.trim().replaceAll(",", "");
  if (!/^\d+$/.test(digits)) return { ok: false, reason: RATE_ERROR };
  const value = Number(digits);
  return value <= MAX_RATE ? { ok: true, value } : { ok: false, reason: RATE_ERROR };
}

export function formatRate(rate: number): string {
  return money(rate);
}

// 「500／250」: room A and B hourly rates, full-width slash.
export function formatRates(roomARate: number, roomBRate: number): string {
  return `${formatRate(roomARate)}／${formatRate(roomBRate)}`;
}
