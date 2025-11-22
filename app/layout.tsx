import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "uruno_ocr_demo",
  description:
    "センター別のOCR解析とスプレッドシート出力を操作するNext.jsフロントエンド",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`system-font antialiased bg-slate-950 text-slate-100`}>
        <Header />
        <main className="min-h-screen pb-10">{children}</main>
      </body>
    </html>
  );
}
