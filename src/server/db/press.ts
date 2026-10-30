import { ok, type ServerResult } from "@/lib/result";
import { runFormAction } from "@/server/boundary/run-action";
import { withTransaction } from "@/server/drizzle/context";

// One button press as a server action runs it: the write inside one
// transaction, behind the server boundary, so a refusal or a database error
// rolls everything back and comes back as a failed result.
export function press(write: () => Promise<unknown>): Promise<ServerResult<null>> {
  return runFormAction({ attempted: "test", access: "staff" }, () =>
    withTransaction(async () => {
      await write();
      return ok();
    }),
  );
}
