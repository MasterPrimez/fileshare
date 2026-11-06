import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Share",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Share" },
  icons: { apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0c0c0d", width: "device-width", initialScale: 1, viewportFit: "cover", maximumScale: 1 };

export default function MLayout({ children }: { children: React.ReactNode }) {
  return <div className="m">{children}</div>;
}
