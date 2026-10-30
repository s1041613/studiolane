import { AsyncLocalStorage } from "node:async_hooks";
import { getDb, type Db } from "@/server/db/client";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The open transaction for the current request, so a repository method can
// take part in its caller's transaction without the transaction being passed
// through every function signature.
const currentTx = new AsyncLocalStorage<Tx>();

// Repositories read and write through this: inside withTransaction it is the
// open transaction, otherwise the shared connection.
export function currentDb(): Db | Tx {
  return currentTx.getStore() ?? getDb();
}

// Runs every write inside `run` as one transaction: a throw rolls all of them
// back. A nested call joins the outer transaction instead of opening a
// savepoint (Spring/Rails default; Drizzle's own tx.transaction() would add
// one), so a failure anywhere fails the whole transaction. Work deferred out
// of the async chain (after(), setTimeout) runs outside the transaction.
export function withTransaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  const outer = currentTx.getStore();
  if (outer) return run(outer);
  return getDb().transaction((tx) => currentTx.run(tx, () => run(tx)));
}
