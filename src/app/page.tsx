import { PageTitleRow } from "@/components/layout/app-shell";

export default function Home() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <PageTitleRow>
        <h1 className="text-[28px] leading-tight font-normal">Studiolane</h1>
      </PageTitleRow>
      <p className="text-text-secondary">教室租借與預約管理</p>
    </main>
  );
}
