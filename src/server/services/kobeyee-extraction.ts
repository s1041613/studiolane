import "server-only";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type { IsoDate } from "@/server/logic/booking";
import { kobeyeeParseSchema, kobeyeeParseWithCapSchema, type KobeyeeParse } from "@/server/logic/kobeyee-parse";
import { dedupeKobeyeeParse } from "@/server/logic/kobeyee-parse-dedupe";
import { buildKobeyeePrompt } from "@/server/services/kobeyee-prompt";

// Cheap and fast; the eval harness (pnpm eval:ai) is how a stronger model
// gets tried before changing this.
export const KOBEYEE_MODEL_ID = "gpt-5-mini";

// "low" measured 43/44 at median 5.6s vs default 43/44 at 7.5s; "minimal"
// dropped to 40/44. Compare via KOBEYEE_EVAL_EFFORT before changing this.
export type KobeyeeReasoningEffort = "minimal" | "low" | "medium" | "high";
export const KOBEYEE_REASONING_EFFORT: KobeyeeReasoningEffort | undefined = "low";

export type KobeyeeExtraction = { status: "ok"; parse: KobeyeeParse } | { status: "unreadable" };

const UNREADABLE: KobeyeeExtraction = { status: "unreadable" };

// Reads one staff chat message into a KobeyeeParse. No retry: a refusal,
// truncation, or schema failure all mean the one attempt didn't produce a
// usable parse, and the chat shows the same one line regardless of which
// (see extraction-contract.md, "Open questions: recommendations"). An error
// that isn't about the model's output — a network failure, a missing or
// rejected API key — is not one of those cases and is left to throw, so a
// real outage doesn't masquerade as "nothing to extract".
export async function extractKobeyeeParse(
  text: string,
  today: IsoDate,
  modelId: string = KOBEYEE_MODEL_ID,
  reasoningEffort: KobeyeeReasoningEffort | undefined = KOBEYEE_REASONING_EFFORT,
  abortSignal?: AbortSignal,
): Promise<KobeyeeExtraction> {
  let output: unknown;
  try {
    const result = await generateText({
      model: openai(modelId),
      prompt: buildKobeyeePrompt(text, today),
      output: Output.object({ schema: kobeyeeParseSchema }),
      abortSignal,
      ...(reasoningEffort && { providerOptions: { openai: { reasoningEffort } } }),
    });
    output = result.output;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return UNREADABLE;
    throw error;
  }

  // The model-facing schema has no slot cap (see kobeyee-parse.ts); re-parse
  // against the capped schema here so an oversized response is rejected
  // the same way a schema failure is, instead of reaching the UI.
  const capped = kobeyeeParseWithCapSchema.safeParse(output);
  if (!capped.success) return UNREADABLE;
  if (capped.data.tasks.length === 0) return UNREADABLE;
  return { status: "ok", parse: dedupeKobeyeeParse(capped.data) };
}
