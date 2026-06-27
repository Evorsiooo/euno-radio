import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Euno Sonaris",
  description: "Ro-State Web Radio",
  openGraph: {
    title: "Euno Sonaris",
    description: "Ro-State Web Radio",
    siteName: "Euno Sonaris",
  },
  twitter: {
    card: "summary_large_image",
    title: "Euno Sonaris",
    description: "Ro-State Web Radio",
  }
};

export const viewport = {
  themeColor: '#00e88f',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
