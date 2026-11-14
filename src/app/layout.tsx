import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inch & Ease",
  description: "Can I live here? Accessibility checks for a wheelchair user.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
