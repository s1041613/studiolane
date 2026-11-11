import { connection } from "next/server";
import { todayIso } from "@/server/logic/date";
import { RulesRepository } from "@/server/repositories/rules-repository";
import { loadSection } from "@/server/services/section";
import { RentalRulesBoard } from "@/components/rental-rules/rental-rules-board";
import { dataOrEmpty } from "@/components/shared/failures/section-failure";
import { requirePageAccess } from "@/server/auth/require-staff";

// Parked (src/app/_parked is a private, unrouted folder — see Next's
// project-organization docs on private folders): /settings/rules currently
// shows PreparingWindow's 準備中 instead (see
// src/components/desktop/preparing-window.tsx and
// src/app/(desktop)/settings/rules/page.tsx). To restore, move this file
// (and its sibling layout.tsx, the 設定 tab bar) back to
// src/app/(desktop)/settings/rules/page.tsx and
// src/app/(desktop)/settings/layout.tsx, drop the real routed page's
// requirePageAccess-only body and this route from
// src/components/desktop/preparing.ts, and run `pnpm exec next typegen`.
export default async function RentalRulesPage() {
  // Everyone signed in can read; ADMIN_PAGES decides who may change it.
  const { canEdit } = await requirePageAccess("/settings/rules");
  // Live data and the real "today": never prerender this page at build time.
  await connection();
  const rules = await loadSection(() => new RulesRepository().listAll());

  const { data, failure } = dataOrEmpty(rules, []);

  return <RentalRulesBoard rules={data} today={todayIso()} readFailure={failure} canEdit={canEdit} />;
}
