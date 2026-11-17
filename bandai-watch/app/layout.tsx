import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BANDAI WATCH | Collector Radar",
  description: "Personal monitoring dashboard for Bandai tokusatsu collectibles.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "BANDAI WATCH" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}