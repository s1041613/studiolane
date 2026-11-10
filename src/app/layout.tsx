import type { Metadata } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studiolane",
  description: "教室租借與預約管理",
};

// AppShell (icon rail / mobile bar) and the full-viewport desktop shell are
// each used by only some routes, so they live in route-group layouts below
// this one instead of here. See src/app/(shell)/layout.tsx and
// src/app/(desktop)/layout.tsx.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
