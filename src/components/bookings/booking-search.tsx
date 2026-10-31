"use client";

// E-51: /bookings?q= is a GET form, so the query lives in the URL (shareable,
// back-button friendly) instead of client state. A client component because
// controlVariants comes from the client-only ui/input module.
import Form from "next/form";
import Link from "next/link";
import { controlVariants } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";

interface BookingSearchProps {
  // Already trimmed by the page; used to prefill the input and to decide
  // whether 清除 shows.
  query: string;
}

export function BookingSearch({ query }: BookingSearchProps) {
  return (
    // Keyed by query so a navigation (submit, or 清除) remounts the input
    // instead of leaving React's uncontrolled value stale against the URL.
    <Form key={query} action="/bookings" className="flex items-center gap-2">
      <input
        type="search"
        name="q"
        aria-label="搜尋"
        placeholder="姓名或租借 ID"
        defaultValue={query}
        className={controlVariants({ width: "search" })}
      />
      <button type="submit" className={buttonVariants({ variant: "outline" })}>
        查詢
      </button>
      {query !== "" && (
        <Link href="/bookings" className={buttonVariants({ variant: "ghost" })}>
          清除
        </Link>
      )}
    </Form>
  );
}
