import type { Metadata } from "next";
import "./globals.css";
import { Disclaimer } from "@/components/disclaimer";

export const metadata: Metadata = {
  title: "SkinAI Lab",
  description: "Phân tích da bằng AI — kết quả mang tính tham khảo.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-secondary/30">
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-border bg-white">
            <div className="mx-auto max-w-5xl px-4 py-6">
              <Disclaimer />
              <p className="mt-4 text-center text-xs text-muted-foreground">
                © {new Date().getFullYear()} SkinAI Lab — Phase 0 MVP
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
