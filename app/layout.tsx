import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Krypt — End-to-End Encrypted Messaging",
  description:
    "Krypt is a secure messaging app where your messages are encrypted on your device. The server never sees your plaintext.",
  keywords: ["encrypted messaging", "e2ee", "secure chat", "private messaging"],
  authors: [{ name: "Krypt" }],
  themeColor: "#0a0a0f",
  openGraph: {
    title: "Krypt — End-to-End Encrypted Messaging",
    description: "Private. Secure. Encrypted.",
    type: "website",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary",
    title: "Krypt",
    description: "Krypt is a high-performance, minimalist messaging platform that ensures that privacy is not a feature, but a foundational law.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/krypt_icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#050505] text-zinc-300">
        {children}
      </body>
    </html>
  );
}