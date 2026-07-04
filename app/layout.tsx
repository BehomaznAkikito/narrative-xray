import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "narrative-xray | 序列透視鏡",
  description:
    "貼り付けたテキストに埋め込まれた序列・内外集団のナラティブ構造をAIが可視化する装置。高度計 (Altitude Meter) の姉妹アプリ。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
