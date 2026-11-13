import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { AuthGate } from "@/lib/auth/AuthGate";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import "./globals.css";

// 本文の書体（docs/04 の 1.3）
const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ぴあとも",
  description: "AIに教えて学ぶ学習アプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${notoSansJp.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* ログイン：ログインしていないと使えない画面はホームのログイン画面へ */}
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
