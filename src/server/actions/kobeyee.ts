"use server";

import type { KobeyeeResult } from "@/server/logic/kobeyee";
import { buildKobeyeeReviews } from "@/server/logic/kobeyee-review";
import { todayIso } from "@/server/logic/date";
import { requireStaff } from "@/server/auth/require-staff";
import { RentalRepository } from "@/server/repositories/rental-repository";
import { RulesRepository } from "@/server/repositories/rules-repository";
import { extractKobeyeeParse } from "@/server/services/kobeyee-extraction";

const rentalRepo = new RentalRepository();
const rulesRepo = new RulesRepository();

// A pasted chat message is a few lines; anything far longer is not one
// request and would only cost tokens.
const KOBEYEE_MAX_INPUT_CHARS = 2000;

// With reasoning effort "low" the eval's slowest case took 10.8s; the
// earlier default-effort worst case was 22s. 25s covers both with margin.
const KOBEYEE_TIMEOUT_MS = 25_000;

// Reads one staff message into reviews. Never writes: staff confirm the
// filled form themselves. No retry here; the chat offers 再試一次 on "failed".
export async function readKobeyeeMessage(text: string): Promise<KobeyeeResult> {
  await requireStaff();
  const message = text.trim();
  if (message.length === 0 || message.length > KOBEYEE_MAX_INPUT_CHARS) return { status: "unreadable" };

  try {
    const today = todayIso();
    const [extraction, rules, existingRentals] = await Promise.all([
      extractKobeyeeParse(message, today, undefined, undefined, AbortSignal.timeout(KOBEYEE_TIMEOUT_MS)),
      rulesRepo.listAll(),
      rentalRepo.listAll(),
    ]);
    if (extraction.status === "unreadable") return extraction;
    return { status: "ok", reviews: buildKobeyeeReviews(extraction.parse, { rules, existingRentals, today }) };
  } catch (error) {
    // Timeout, network, API key, or database: all show the same 讀取失敗.
    console.error("readKobeyeeMessage failed", error);
    return { status: "failed" };
  }
}
