import type { Metadata } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studiolane",
  description: "教室租借與預約管理",
};

// The full-viewport desktop shell is used only by the (desktop) routes, so
// it lives in that route group's own layout instead of here. See
// src/app/(desktop)/layout.tsx. The (shell) routes have no chrome of their
// own yet; they render straight under this root layout.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
