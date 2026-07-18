import { SiteHeader } from "@/components/site-header";
import { ScanClient } from "./scan-client";

export const metadata = {
  title: "Quét da trực tiếp — SkinAI",
};

export default function ScanPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-bold">Quét da trực tiếp (v2 · thử nghiệm)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dùng camera trước và ánh sáng màn hình để phân tích da theo phong cách VISIA —
          không cần upload ảnh. Toàn bộ xử lý chạy ngay trên máy bạn.
        </p>
        <div className="mt-6">
          <ScanClient />
        </div>
      </main>
    </>
  );
}
