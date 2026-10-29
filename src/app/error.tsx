"use client";

import { PageFailure } from "@/components/ui/page-failure";

// Any page whose render threw, or a <form action> request that never got an
// answer (useActionState rethrows it).
export default function AppError({ error }: { error: Error & { digest?: string } }) {
  return <PageFailure error={error} />;
}
