import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts ship with the app (SIL Open Font License, see src/fonts) so a build
// never depends on reaching Google Fonts.
const bricolage = localFont({
  src: "../fonts/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

const inter = localFont({
  src: "../fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const ibmPlexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const lexend = localFont({
  src: "../fonts/lexend-latin-wght-normal.woff2",
  variable: "--font-lexend",
  weight: "100 900",
  display: "swap",
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
