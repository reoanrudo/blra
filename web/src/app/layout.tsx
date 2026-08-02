import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hourei RAG",
  description: "建築法規ナレッジOS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full">
      <body className="antialiased h-full">
        {children}
      </body>
    </html>
  );
}
