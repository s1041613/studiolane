import { requirePageAccess } from "@/server/auth/require-staff";

// S-準備中: the real summary is parked at
// src/app/_parked/bookings-batch/page.tsx until this route is rebuilt (see
// that file's header for how to restore it). The (desktop) layout's
// PreparingWindow (src/components/desktop/preparing-window.tsx) renders
// the 準備中 placeholder for any batchId; this page has nothing of its own
// to render.
export default async function BookingBatchPage(props: PageProps<"/bookings/batch/[batchId]">) {
  const { batchId } = await props.params;
  await requirePageAccess(`/bookings/batch/${batchId}`);
  return null;
}
