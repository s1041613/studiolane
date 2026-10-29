import { Geist_Mono, Noto_Sans_TC, Outfit } from "next/font/google";

// Shared by the root layout and global-error.tsx, which replaces the layout
// and so would otherwise render without these fonts.

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

// CJK glyphs are split by unicode-range; skip preloading so pages only fetch
// the slices they render.
const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: ["400", "500"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const fontVariables = `${outfit.variable} ${notoSansTc.variable} ${geistMono.variable}`;
