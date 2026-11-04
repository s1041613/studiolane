import { z } from "zod";
import type { HHmm } from "@/server/logic/booking";
import { PURPOSE_CODES, type PurposeCode } from "@/server/supabase/codecs";

// The AI-owned half of the extraction contract
// (docs/desktop-ai-assistant/extraction-contract.md, "AI session review").
// This is what the model is asked to produce from one staff chat message —
// never a resolved IsoDate (see date-mention.ts), never a renter name, never
// a price. Every field is required and nullable rather than optional: the
// OpenAI provider's strict mode rejects `.optional()` with a misleading
// NoObjectGeneratedError, so `T | null` is the only way to say "not stated".

const ROOM = z.enum(["A", "B"]);
export type Room = z.infer<typeof ROOM>;

// What the text says about a date, not a calendar date. A pure resolver
// (resolveDateMention) turns this into an IsoDate once "today" is known;
// keeping that step out of the model keeps "this week starts on Monday" and
// "pick the closest year" unit-testable instead of prompt-dependent.
// z.union, not z.discriminatedUnion: the latter emits JSON Schema `oneOf`,
// which OpenAI strict mode rejects; `anyOf` is accepted.
const DATE_MENTION = z.union([
  z
    .object({
      kind: z.literal("absolute"),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
      year: z.number().int().nullable(),
    })
    .strict(),
  // 今天 is offset 0, 明天 is offset 1.
  z.object({ kind: z.literal("relative_day"), offset: z.number().int() }).strict(),
  // 1 = Monday … 7 = Sunday, matching isoWeekday() in date.ts.
  z
    .object({
      kind: z.literal("weekday"),
      week: z.enum(["this", "next"]),
      weekday: z.number().int().min(1).max(7),
    })
    .strict(),
]);
export type DateMention = z.infer<typeof DATE_MENTION>;

const HHMM = z.string().regex(/^\d{2}:\d{2}$/) as z.ZodType<HHmm>;
const PURPOSE = z.enum(PURPOSE_CODES) as z.ZodType<PurposeCode>;

const PARSED_SLOT = z
  .object({
    date: DATE_MENTION,
    start: HHMM.nullable(), // null when AM/PM is unclear (「8-9點」)
    end: HHMM.nullable(),
    quote: z.string(), // source span, for staff cross-check and evals; never shown as copy
  })
  .strict();
export type ParsedSlot = z.infer<typeof PARSED_SLOT>;

// `slots` takes the array schema in: the model-facing schema and the
// cap-enforcing boundary schema below share every other field, so the cap
// doesn't have to be hand-duplicated across the whole task union.
type SlotsSchema = z.ZodArray<typeof PARSED_SLOT>;

function kobeyeeTask(slots: SlotsSchema) {
  return z.union([
    z
      .object({
        intent: z.literal("new_rental"),
        room: ROOM.nullable(),
        purpose: PURPOSE.nullable(),
        slots,
      })
      .strict(),
    z
      .object({
        intent: z.literal("reschedule"),
        room: ROOM.nullable(),
        oldSlots: slots, // the bookings being moved
        slots, // their new times
      })
      .strict(),
    z
      .object({
        intent: z.literal("availability_question"),
        room: ROOM.nullable(),
        slots,
      })
      .strict(),
  ]);
}
export type KobeyeeTask = z.infer<ReturnType<typeof kobeyeeTask>>;

// The model-facing schema: no `.max()` on the slot arrays. Whether OpenAI's
// strict mode actually enforces a JSON Schema `maxItems` is unverified, so
// the cap below runs as an ordinary Zod check after generation instead of
// as part of the schema sent to the model.
export const kobeyeeParseSchema = z.object({ tasks: z.array(kobeyeeTask(z.array(PARSED_SLOT))) }).strict();
export type KobeyeeParse = z.infer<typeof kobeyeeParseSchema>;

// Same shape, capped at 20 slots per task (the largest sample case has 6).
// Re-parsing the model's already-typed output against this schema is how
// extractKobeyeeParse rejects an oversized response.
export const kobeyeeParseWithCapSchema = z.object({
  tasks: z.array(kobeyeeTask(z.array(PARSED_SLOT).max(20))),
});
