import "./globals.css";

export const metadata = {
  title: "euno",
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: "#0e0e0f",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
