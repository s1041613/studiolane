import { PageTitleRow } from "@/components/layout/app-shell";
import { ActionFailure } from "@/components/shared/failures/action-failure";
import { SectionFailure } from "@/components/shared/failures/section-failure";
import { refuse } from "@/server/audit/refusal";
import { requirePageAccess } from "@/server/auth/require-staff";
import { runFormAction } from "@/server/boundary/run-action";
import { loadSection } from "@/server/services/section";

export const dynamic = "force-dynamic";

export default async function FailureDemoPage() {
  await requirePageAccess("/failure-demo");

  const section = await loadSection(async () => {
    throw new Error("demo failure");
  });

  const action = await runFormAction({ attempted: "示範操作", access: "staff" }, async () => refuse("FAILED_PRECONDITION", "這是示範用的錯誤訊息"));

  return (
    <main className="flex w-full flex-1 flex-col gap-4">
      <PageTitleRow>
        <h1 className="text-[28px] leading-tight font-normal">失敗畫面示範</h1>
      </PageTitleRow>
      <p className="text-text-secondary">這是示範頁，用來展示一個區塊讀取失敗、以及一個表單操作被拒絕時各自的畫面。內容為假資料。</p>

      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">區塊讀取失敗（SectionFailure）</h2>
        {!section.ok && <SectionFailure failure={section.error} />}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">表單操作被拒絕（ActionFailure）</h2>
        {!action.ok && <ActionFailure failure={action.error} />}
      </section>
    </main>
  );
}
