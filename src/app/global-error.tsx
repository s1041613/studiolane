"use client";

import { PageFailure } from "@/components/ui/page-failure";
import { fontVariables } from "./fonts";
import "./globals.css";

// The root layout itself threw: this replaces it, so it brings its own
// <html>, <body> and styles, and no app shell (which may be what failed).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="zh-Hant-TW" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full">
        <title>Studiolane</title>
        <PageFailure error={error} />
      </body>
    </html>
  );
}
