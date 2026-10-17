import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "./providers";
import BottomTabs from "@/components/BottomTabs";
import ActiveWorkoutResumeBar from "@/components/ActiveWorkoutResumeBar";
import RestTimerBanner from "@/components/RestTimerBanner";
import ReminderSync from "@/components/physique/ReminderSync";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gym AI — Your Intelligent Training Coach",
  description: "AI-powered workout tracking and coaching",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Gym AI", statusBarStyle: "black" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppProviders>
          {children}
          <ReminderSync />
          <RestTimerBanner />
          <ActiveWorkoutResumeBar />
          <BottomTabs />
        </AppProviders>
      </body>
    </html>
  );
}
