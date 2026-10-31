import { connection } from "next/server";
import { getBookingFormData } from "@/server/services/booking-form";
import { BookingSheet } from "@/components/booking/booking-sheet";
import { requirePageAccess } from "@/server/auth/require-staff";

export default async function NewBookingPage() {
  await requirePageAccess("/bookings/new");
  // Without a request-time API this page was prerendered at build time, so
  // the form's free windows, greyed-out dates and roster were frozen at
  // build time. Render per request so they reflect the current rentals.
  await connection();
  const data = await getBookingFormData();

  const rules = data.rules.ok ? data.rules.data : [];
  const roster = data.roster.ok ? data.roster.data : [];
  const plans = data.plans.ok ? data.plans.data : [];
  const existingRentals = data.existingRentals.ok ? data.existingRentals.data : [];
  const purposeSettings = data.purposeSettings.ok ? data.purposeSettings.data : [];

  // The form still works without a source; the form says so once and
  // quotes the first failure's error code.
  const failed = Object.values(data).find((section) => !section.ok);

  return (
    <main className="w-full flex-1">
      <BookingSheet
        readFailure={failed && !failed.ok ? failed.error : null}
        initialRules={rules}
        initialRoster={roster}
        initialPlans={plans}
        initialRentals={existingRentals}
        initialPurposeSettings={purposeSettings}
      />
    </main>
  );
}
