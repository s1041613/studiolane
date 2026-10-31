import type { RentalStatus } from "@/server/types/home";

// One other renter's held booking that overlaps a submitted slot. Shown in
// the confirmation dialog: date, time, renter name, status.
export type BookingConflict = {
  id: string;
  date: string;
  start: string;
  end: string;
  renterName: string;
  status: RentalStatus;
};
