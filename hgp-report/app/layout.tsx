import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import "./globals.css";

const noto = Noto_Sans_KR({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Samkoo-HGP-Report",
  description: "건물 사진·동영상 아카이브, 일일 기록, 보고서, 촬영 스케줄·완료보고",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${noto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-3">
            <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-sm text-white">
                🏢
              </span>
              Samkoo-HGP-Report
            </Link>
          </div>
          <TopNav />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
