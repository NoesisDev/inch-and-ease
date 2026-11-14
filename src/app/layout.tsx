import type { Metadata } from "next";
import { Space_Grotesk, Work_Sans } from "next/font/google";
import "./globals.css";

// Brand "Evergreen" (same as the tour's start page): Space Grotesk for the name and headings, Work Sans for text.
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-grotesk" });
const body = Work_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-work" });

export const metadata: Metadata = {
  title: "Inch & Ease",
  description: "Can you live here? We check how easy daily life would be for a wheelchair user, then find the best fit and the fixes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${display.variable} ${body.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
