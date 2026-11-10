import { cache } from "react";
import { RentalRepository } from "@/server/repositories/rental-repository";
import { RulesRepository } from "@/server/repositories/rules-repository";
import { loadSection } from "@/server/services/section";

// Both the (desktop) layout (for the widgets) and /bookings (for the 預約冊
// window) need the same rentals/rules reads. Wrapping each in React's
// cache() dedupes them within a single request, same pattern as
// getBookingFormData.
export const getRentalsSection = cache(() => loadSection(() => new RentalRepository().listAll()));
export const getRulesSection = cache(() => loadSection(() => new RulesRepository().listAll()));
