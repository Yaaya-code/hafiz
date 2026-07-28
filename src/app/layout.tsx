import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Cairo, Amiri_Quran } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

const amiriQuran = Amiri_Quran({
  subsets: ["arabic"],
  weight: "400",
  variable: "--font-amiri-quran",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "حافظ | رفيق حفظ القرآن الكريم",
    template: "%s | حافظ",
  },
  description:
    "منصة ذكية لحفظ القرآن ومراجعته بنظام التكرار المتباعد، المتشابهات، والتحليلات. لا تنسَ ما حفظت.",
  keywords: ["حفظ القرآن", "مراجعة", "حفيظ", "متشابهات", "Quran memorization", "SRS"],
  authors: [{ name: "Hafiz" }],
  openGraph: {
    title: "حافظ — رفيق حفظ القرآن",
    description: "منصة ذكية لمنع النسيان وبناء جداول مراجعة شخصية",
    locale: "ar_SA",
    type: "website",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/logo.png", sizes: "1024x1024", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon-32.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "حافظ",
  },
  applicationName: "حافظ",
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#020408" },
    { media: "(prefers-color-scheme: dark)", color: "#020408" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${cairo.variable} ${amiriQuran.variable}`}
    >
      <body
        className={`${cairo.className} min-h-dvh antialiased`}
        style={
          {
            ["--font-quran"]: amiriQuran.style.fontFamily,
          } as CSSProperties
        }
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
