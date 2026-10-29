import { defineConfig } from "drizzle-kit";

// Triggers, RPC functions and grants are not expressible in the schema;
// write them with `pnpm db:generate --custom`.
//
// Every table must call .enableRLS(): without it drizzle-kit generates
// DISABLE ROW LEVEL SECURITY, opening the table to the publishable key.
export default defineConfig({
  schema: "./src/server/drizzle/schema",
  out: "./supabase/migrations",
  dialect: "postgresql",
  migrations: { prefix: "supabase" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
