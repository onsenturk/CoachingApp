import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coaching",
  description: "AI-assisted endurance coach grounded in Strava data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
