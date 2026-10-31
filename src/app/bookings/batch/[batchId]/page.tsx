import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { RentalRepository } from "@/server/repositories/rental-repository";
import { summarizeBatch } from "@/server/logic/booking-summary";
import { money } from "@/server/logic/home-selectors";
import { loadSection } from "@/server/services/section";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionFailure } from "@/components/shared/failures/section-failure";
import { requirePageAccess } from "@/server/auth/require-staff";

// rentals.batch_id is a uuid column; eq()-ing it against a non-uuid string
// makes Postgres throw before any row comes back. A malformed id is treated
// the same as a batch with no rows below: 404, not a 500 or SectionFailure.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// S-完成-1..6: where the form lands after a successful submit. The URL holds
// the batch id, so a refresh shows the same details and Back can't resubmit.
export default async function BookingBatchPage(props: PageProps<"/bookings/batch/[batchId]">) {
  const { batchId } = await props.params;
  if (!UUID_PATTERN.test(batchId)) notFound();

  await requirePageAccess(`/bookings/batch/${batchId}`);
  // Without a request-time API this page prerenders at build time, freezing
  // whatever the batch looked like then; connection() forces per-request
  // rendering so a refresh always reflects what was actually saved.
  await connection();
  const section = await loadSection(() => new RentalRepository().listByBatch(batchId));

  if (!section.ok) {
    return (
      <main className="w-full flex-1">
        <Card>
          <SectionFailure message="這次的預約明細暫時讀不到" failure={section.error} />
        </Card>
      </main>
    );
  }

  const summary = summarizeBatch(section.data);
  if (!summary) notFound();

  const details: Array<[string, string]> = [
    ["租借人", summary.renter],
    ["教室", summary.roomLabel],
    ["用途", summary.purposeLabel],
    ["付款方式", summary.paymentLabel],
    ["備註", summary.note || "—"],
  ];
  const personName = section.data[0].person;

  return (
    <main className="w-full flex-1 space-y-5">
      <div role="status" className="rounded-lg bg-inset p-3 text-sm text-foreground">
        已送出 {summary.count} 筆預約
        {summary.statusLabel && `，狀態：${summary.statusLabel}`}
      </div>

      <dl className="grid grid-cols-[5rem_1fr] gap-y-1.5 text-sm">
        {details.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <Card padding="none">
        <TableFrame>
          <Table>
            <TableHeader>
              <tr>
                <TableHead>日期</TableHead>
                <TableHead>時間</TableHead>
                <TableHead>時數</TableHead>
                {!summary.statusLabel && <TableHead>狀態</TableHead>}
                <TableHead align="amount">金額</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {summary.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.dateLabel}</TableCell>
                  <TableCell>
                    {row.time}
                    {row.isCrossMidnight && <span className="ml-1 text-xs text-warn">跨日</span>}
                  </TableCell>
                  <TableCell>{row.hours}</TableCell>
                  {!summary.statusLabel && <TableCell>{row.statusLabel}</TableCell>}
                  <TableCell align="amount">{money(row.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-medium hover:bg-transparent">
                <TableCell colSpan={2}>合計</TableCell>
                <TableCell>{summary.totalHours}</TableCell>
                {!summary.statusLabel && <TableCell />}
                <TableCell align="amount">{money(summary.totalAmount)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableFrame>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href="/bookings/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
          再預約一筆
        </Link>
        <Link href={`/bookings?q=${encodeURIComponent(personName)}`} className={buttonVariants({ size: "lg" })}>
          前往預約追蹤
        </Link>
      </div>
    </main>
  );
}
