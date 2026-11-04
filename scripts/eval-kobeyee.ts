// Runner for `pnpm eval:ai`. Calls the real OpenAI API, so it is not part
// of `pnpm test` or CI (vitest's default include pattern only matches
// *.test.ts, which this file deliberately isn't named). Run directly with
// tsx instead of vitest — see the "eval:ai" script in package.json for why
// it needs `--conditions=react-server` (the extraction service imports
// "server-only", which otherwise throws outside a React Server Component).
import { mkdirSync, writeFileSync } from "node:fs";
import { kobeyeeEvalCases } from "@/server/logic/__fixtures__/kobeyee-eval-cases";
import { kobeyeeBlindEvalCases } from "@/server/logic/__fixtures__/kobeyee-eval-cases-blind";
import { scoreKobeyeeParse, type CaseScore } from "@/server/logic/kobeyee-eval-scorer";
import type { KobeyeeParse } from "@/server/logic/kobeyee-parse";
import { extractKobeyeeParse, KOBEYEE_MODEL_ID, type KobeyeeReasoningEffort } from "@/server/services/kobeyee-extraction";

function rowFor(
  caseId: string,
  description: string,
  score: CaseScore,
  ms: number,
): Record<string, string | number> {
  return {
    case: caseId,
    description,
    tasks: score.taskCount,
    wrongFields: score.wrongFieldCount,
    missingFields: score.missingFieldCount,
    result: score.passed ? "pass" : "FAIL",
    ms: Math.round(ms),
  };
}

// Sorted-array percentile (nearest-rank), used for the latency summary below.
function percentile(sortedMs: number[], p: number): number {
  const index = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[Math.max(0, index)];
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.log("Skipping pnpm eval:ai: OPENAI_API_KEY is not set.");
    return;
  }

  // KOBEYEE_EVAL_MODEL=gpt-5-nano pnpm eval:ai compares another model on the same cases.
  const modelId = process.env.KOBEYEE_EVAL_MODEL ?? KOBEYEE_MODEL_ID;
  // KOBEYEE_EVAL_EFFORT=low pnpm eval:ai compares a reasoning effort level.
  const effort = process.env.KOBEYEE_EVAL_EFFORT as KobeyeeReasoningEffort | undefined;
  const transcript: unknown[] = [];
  const rows: Record<string, string | number>[] = [];
  let failedCases = 0;
  let missingFieldTotal = 0;
  const allCases = [
    ...kobeyeeEvalCases,
    ...kobeyeeBlindEvalCases.map((evalCase) => ({
      ...evalCase,
      id: evalCase.id.startsWith("blind-") ? evalCase.id : `blind-${evalCase.id}`,
    })),
  ];

  // KOBEYEE_EVAL_ONLY=foo,bar pnpm eval:ai runs only cases whose id contains
  // one of the comma-separated substrings, for a fast subset timing run.
  const only = process.env.KOBEYEE_EVAL_ONLY?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const evalCases = only ? allCases.filter((c) => only.some((substring) => c.id.includes(substring))) : allCases;

  const latenciesMs: number[] = [];

  for (const evalCase of evalCases) {
    const startedAt = performance.now();
    const result = await extractKobeyeeParse(evalCase.input, evalCase.today, modelId, effort);
    const ms = performance.now() - startedAt;
    latenciesMs.push(ms);
    // "unreadable" is scored as nothing extracted, the same as the model
    // itself returning `{ tasks: [] }` — see kobeyee-extraction.ts.
    const actual: KobeyeeParse = result.status === "ok" ? result.parse : { tasks: [] };
    const score = scoreKobeyeeParse(evalCase.expected, actual);
    if (!score.passed) failedCases += 1;
    missingFieldTotal += score.missingFieldCount;
    rows.push(rowFor(evalCase.id, evalCase.description, score, ms));
    console.log(
      `\n[${score.passed ? "pass" : "FAIL"}${score.missingFieldCount > 0 ? `, ${score.missingFieldCount} null` : ""}] ${evalCase.id} (${Math.round(ms)}ms)\n  input:  ${evalCase.input.replace(/\n/g, " / ")}\n  output: ${JSON.stringify(result.status === "ok" ? result.parse : result)}`,
    );
    transcript.push({
      id: evalCase.id,
      result: score.passed ? "pass" : "FAIL",
      missingFields: score.missingFieldCount,
      ms: Math.round(ms),
      today: evalCase.today,
      input: evalCase.input,
      expected: evalCase.expected,
      output: result.status === "ok" ? result.parse : result,
    });
  }

  console.table(rows);
  mkdirSync("eval-results", { recursive: true });
  const file = `eval-results/kobeyee-${modelId}-${effort ?? "default"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(transcript, null, 2));
  console.log(`Inputs and model outputs: ${file}`);
  console.log(`${modelId} (effort ${effort ?? "default"}): ${evalCases.length} cases, ${failedCases} failed, ${missingFieldTotal} null field(s).`);

  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  const p90 = percentile(sorted, 90);
  const max = sorted[sorted.length - 1];
  console.log(`latency ms: median ${Math.round(median)}, p90 ${Math.round(p90)}, max ${Math.round(max)}`);
  // extractKobeyeeParse doesn't expose generateText's token usage in its
  // public return type (KobeyeeExtraction), and widening that return type
  // is out of scope here, so this run reports latency only, no tokens.
  console.log("usage: not available — extractKobeyeeParse's return type does not expose token usage.");

  if (failedCases > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
