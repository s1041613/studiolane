import { cache } from "react";
import { activeOnly } from "@/server/logic/active-only";
import { loadBookingSections } from "@/server/services/booking-sources";
import type { BookingSourceSections } from "@/server/services/booking-sources";

export type BookingFormData = BookingSourceSections;

// Deduped within a single request via React's cache(), same pattern as
// getHomeDashboard. Each source degrades independently (see
// loadBookingSections) so one failing source doesn't take down the page.
export const getBookingFormData = cache(async (): Promise<BookingFormData> => {
  const sections = await loadBookingSections();
  const { roster } = sections;
  // The renter picker offers active people only (roster R21).
  return { ...sections, roster: roster.ok ? { ...roster, data: activeOnly(roster.data) } : roster };
});
