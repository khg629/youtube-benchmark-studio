import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouTube 벤치마킹",
  description: "참고 영상을 수집하고 LLM으로 분석하는 로컬 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen" suppressHydrationWarning>
        <header className="sticky top-0 z-40 border-b border-[color:var(--border)] bg-[color:var(--background)]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="group flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#7b57fa] to-[#a688ff] text-[11px] font-bold text-white shadow-[0_4px_12px_-2px_rgba(123,87,250,0.4)]">
                VT
              </span>
              <span className="text-sm font-semibold tracking-tight">
                벤치마킹 <span className="text-[color:var(--muted)] font-normal">Studio</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/">대시보드</NavLink>
              <NavLink href="/channels">채널</NavLink>
              <NavLink href="/search">검색</NavLink>
              <NavLink href="/keywords">키워드</NavLink>
              <NavLink href="/synthesis">종합분석</NavLink>
              <NavLink href="/settings">설정</NavLink>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-[color:var(--muted-strong)] transition hover:bg-[color:var(--card)] hover:text-[color:var(--foreground)]"
    >
      {children}
    </Link>
  );
}
