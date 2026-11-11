import { requirePageAccess } from "@/server/auth/require-staff";

// S-準備中: the real board is parked at
// src/app/_parked/settings-rules/page.tsx until this route is rebuilt (see
// that file's header for how to restore it). The (desktop) layout's
// PreparingWindow (src/components/desktop/preparing-window.tsx) renders
// the 準備中 placeholder for this pathname; this page has nothing of its
// own to render.
export default async function RentalRulesPage() {
  await requirePageAccess("/settings/rules");
  return null;
}
