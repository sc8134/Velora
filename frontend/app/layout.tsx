import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import ClientOnly from "./components/ClientOnly";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"),
  title: "Velora",
  description: "Download any video or audio — fast & free. Supports YouTube, TikTok, Instagram, Vimeo, SoundCloud and 1000+ sites.",
  icons: {
    icon: [
      { url: "/velora-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/velora-icon.svg",
  },
  openGraph: {
    title: "Velora",
    description: "Download any video or audio — fast & free",
    images: [{ url: "/velora-og.svg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Velora",
    description: "Download any video or audio — fast & free",
    images: ["/velora-og.svg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/velora-icon.svg" type="image/svg+xml" />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <ClientOnly fallback={
            <div className="flex h-screen bg-[#07070f]" aria-hidden="true" />
          }>
            {children}
          </ClientOnly>
        </AuthProvider>
      </body>
    </html>
  );
}
