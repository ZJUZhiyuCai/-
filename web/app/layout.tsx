import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "书页 · 在线出版工作台",
  description: "云端图书排版、结构化编辑与 MCP 自动化。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="/brand/brand-colors.css" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
