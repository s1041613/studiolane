import { connection } from "next/server";
import { todayIso } from "@/server/logic/date";
import { RulesRepository } from "@/server/repositories/rules-repository";
import { loadSection } from "@/server/services/section";
import { RentalRulesBoard } from "@/components/rental-rules/rental-rules-board";
import { dataOrEmpty } from "@/components/shared/failures/section-failure";
import { requirePageAccess } from "@/server/auth/require-staff";

// The title, tabs and page frame come from app/settings/layout.tsx.
export default async function RentalRulesPage() {
  // Everyone signed in can read; ADMIN_PAGES decides who may change it.
  const { canEdit } = await requirePageAccess("/settings/rules");
  // Live data and the real "today": never prerender this page at build time.
  await connection();
  const rules = await loadSection(() => new RulesRepository().listAll());

  const { data, failure } = dataOrEmpty(rules, []);

  return <RentalRulesBoard rules={data} today={todayIso()} readFailure={failure} canEdit={canEdit} />;
}
