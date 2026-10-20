import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "./providers";
import BottomTabs from "@/components/BottomTabs";
import ActiveWorkoutResumeBar from "@/components/ActiveWorkoutResumeBar";
import RestTimerBanner from "@/components/RestTimerBanner";
import ReminderSync from "@/components/physique/ReminderSync";
import NativeShell from "@/components/NativeShell";
import { APPEARANCE_BOOT } from "@/lib/ui/appearance";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gym AI",
  description: "Food, weight, sleep and training in one place, with a plain read on whether the plan is working.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Gym AI", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  // The top of the Mist page in each mode (DESIGN.md rev 4), so the browser bar melts into the sky.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#d9e6ec" },
    { media: "(prefers-color-scheme: dark)", color: "#1c2b32" },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply a light or dark choice from Profile before first paint; with none, the phone decides. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppProviders>
          {children}
          <ReminderSync />
          <NativeShell />
          <RestTimerBanner />
          <ActiveWorkoutResumeBar />
          <BottomTabs />
        </AppProviders>
      </body>
    </html>
  );
}
