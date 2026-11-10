import { connection } from "next/server";
import type { ReactNode } from "react";
import { getRentalsSection, getRulesSection } from "@/server/services/desktop-sections";
import { getBookingFormData } from "@/server/services/booking-form";
import { requirePageAccess } from "@/server/auth/require-staff";
import { DesktopBookings } from "@/app/(desktop)/desktop-bookings";

// Wraps both `/` and `/bookings`: the desktop shell (menu bar, wallpaper,
// widgets, Dock, Kobeyee) is shared chrome, so its data loads once here
// instead of once per page.
export default async function DesktopLayout({ children }: { children: ReactNode }) {
  await requirePageAccess("/");
  // Without a request-time API this group prerenders at build time,
  // freezing the rental list; connection() forces per-request rendering so
  // the widgets reflect the current bookings.
  await connection();
  const [section, rules, data] = await Promise.all([
    getRentalsSection(),
    // Only the 下一個空檔 widget reads these.
    getRulesSection(),
    getBookingFormData(),
  ]);
  // Each source degrades to empty, same as /bookings/new.
  const formData = {
    rules: data.rules.ok ? data.rules.data : [],
    roster: data.roster.ok ? data.roster.data : [],
    plans: data.plans.ok ? data.plans.data : [],
    existingRentals: data.existingRentals.ok ? data.existingRentals.data : [],
    purposeSettings: data.purposeSettings.ok ? data.purposeSettings.data : [],
  };

  return (
    <DesktopBookings formData={formData} rentals={section.ok ? section.data : null} rules={rules.ok ? rules.data : null}>
      {children}
    </DesktopBookings>
  );
}
