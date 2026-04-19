import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "./providers";
import { OnboardingGate } from "./components/OnboardingGate";
import BottomTabs from "@/components/BottomTabs";
import ActiveWorkoutResumeBar from "@/components/ActiveWorkoutResumeBar";

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
          <OnboardingGate>{children}</OnboardingGate>
          <ActiveWorkoutResumeBar />
          <BottomTabs />
        </AppProviders>
      </body>
    </html>
  );
}
