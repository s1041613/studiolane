// The migrated Postgres that *.db.test.ts run against. vitest.config.mts only
// adds the db project when this is set, e.g. to the local Supabase stack's
// DB_URL from `supabase status -o env`.
function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  return url;
}

export const TEST_DATABASE_URL = requireTestDatabaseUrl();
