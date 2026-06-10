import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import ClearDataButton from "@/components/ClearDataButton";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Book Editor",
  description: "Upload and auto-correct books using AI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="my">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Providers>
          <Header />
          {children}
          <ClearDataButton />
        </Providers>
      </body>
    </html>
  );
}
