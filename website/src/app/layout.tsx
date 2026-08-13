import type { Metadata } from "next";
import { Inter, DM_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Mini Manager | AI-Powered File Organizer",
  description: "Mini Manager scans any folder, classifies every file with AI, and auto-organizes them into the right place — with confidence scores, sensitivity detection, and full undo history.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${dmSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
