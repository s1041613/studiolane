import { readdirSync } from "node:fs";

// Every export of every file in schema/ — the same set drizzle-kit reads from
// the folder (drizzle.config.ts), so a new table file is picked up here too.
export async function loadSchema(): Promise<Record<string, unknown>> {
  const files = readdirSync(new URL("./schema/", import.meta.url)).filter((name) => name.endsWith(".ts"));
  const modules = await Promise.all(
    files.map((name) => import(`@/server/drizzle/schema/${name.replace(/\.ts$/, "")}`) as Promise<object>),
  );
  return Object.assign({}, ...modules);
}
