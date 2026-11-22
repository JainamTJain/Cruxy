import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Inter,
  Lexend,
} from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["500", "600"],
  subsets: ["latin"],
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Crux",
  description:
    "USC Ethics Bowl: cases, notes, research, and practice in one place. Cruxy is the built-in thinking partner.",
  applicationName: "Crux",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Crux",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#9D2235",
  width: "device-width",
  initialScale: 1,
  // Wave 9 I: allow pinch zoom for low vision (do not lock maximumScale).
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-text-size="md" data-reduce-motion="system">
      <body
        className={`${bricolage.variable} ${inter.variable} ${ibmPlexMono.variable} ${lexend.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
