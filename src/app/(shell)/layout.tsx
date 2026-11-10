import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

// Every route outside the (desktop) group (/settings/*, /bookings/new,
// /bookings/batch/[batchId]) keeps the old icon-rail shell.
export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
