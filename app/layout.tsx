import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "오사카 여행 지도", description: "함께 장소를 모으고 오사카 여행 동선을 짜는 지도", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
