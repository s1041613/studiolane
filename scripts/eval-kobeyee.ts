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
import { extractKobeyeeParse, KOBEYEE_MODEL_ID } from "@/server/services/kobeyee-extraction";

function rowFor(caseId: string, description: string, score: CaseScore): Record<string, string | number> {
  return {
    case: caseId,
    description,
    tasks: score.taskCount,
    wrongFields: score.wrongFieldCount,
    missingFields: score.missingFieldCount,
    result: score.passed ? "pass" : "FAIL",
  };
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.log("Skipping pnpm eval:ai: OPENAI_API_KEY is not set.");
    return;
  }

  // KOBEYEE_EVAL_MODEL=gpt-5-nano pnpm eval:ai compares another model on the same cases.
  const modelId = process.env.KOBEYEE_EVAL_MODEL ?? KOBEYEE_MODEL_ID;
  const transcript: unknown[] = [];
  const rows: Record<string, string | number>[] = [];
  let failedCases = 0;
  let missingFieldTotal = 0;
  const evalCases = [
    ...kobeyeeEvalCases,
    ...kobeyeeBlindEvalCases.map((evalCase) => ({
      ...evalCase,
      id: evalCase.id.startsWith("blind-") ? evalCase.id : `blind-${evalCase.id}`,
    })),
  ];

  for (const evalCase of evalCases) {
    const result = await extractKobeyeeParse(evalCase.input, evalCase.today, modelId);
    // "unreadable" is scored as nothing extracted, the same as the model
    // itself returning `{ tasks: [] }` — see kobeyee-extraction.ts.
    const actual: KobeyeeParse = result.status === "ok" ? result.parse : { tasks: [] };
    const score = scoreKobeyeeParse(evalCase.expected, actual);
    if (!score.passed) failedCases += 1;
    missingFieldTotal += score.missingFieldCount;
    rows.push(rowFor(evalCase.id, evalCase.description, score));
    console.log(
      `\n[${score.passed ? "pass" : "FAIL"}${score.missingFieldCount > 0 ? `, ${score.missingFieldCount} null` : ""}] ${evalCase.id}\n  input:  ${evalCase.input.replace(/\n/g, " / ")}\n  output: ${JSON.stringify(result.status === "ok" ? result.parse : result)}`,
    );
    transcript.push({
      id: evalCase.id,
      result: score.passed ? "pass" : "FAIL",
      missingFields: score.missingFieldCount,
      today: evalCase.today,
      input: evalCase.input,
      expected: evalCase.expected,
      output: result.status === "ok" ? result.parse : result,
    });
  }

  console.table(rows);
  mkdirSync("eval-results", { recursive: true });
  const file = `eval-results/kobeyee-${modelId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(transcript, null, 2));
  console.log(`Inputs and model outputs: ${file}`);
  console.log(`${modelId}: ${evalCases.length} cases, ${failedCases} failed, ${missingFieldTotal} null field(s).`);
  if (failedCases > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
