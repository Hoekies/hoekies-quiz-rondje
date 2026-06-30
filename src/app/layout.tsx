import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Hoekies Quiz Rondje",
  description: "De nostalgische borrelquiz voor vrienden.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#060e1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${spaceGrotesk.variable} h-full`}>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))}` }} />
        {children}
        <footer style={{
          position: "fixed", bottom: "6px", left: 0, right: 0,
          textAlign: "center", fontSize: "10px", color: "rgba(255,255,255,0.18)",
          pointerEvents: "none", userSelect: "none", zIndex: 0,
          letterSpacing: "0.06em",
        }}>
          Design Hoekies 2026
        </footer>
      </body>
    </html>
  );
}
