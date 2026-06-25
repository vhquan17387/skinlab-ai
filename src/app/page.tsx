import Link from "next/link";
import { Camera, ShieldCheck, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 text-center sm:py-24">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
            <Sparkles className="h-4 w-4" />
            Phân tích da bằng AI
          </div>
          <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Hiểu làn da của bạn rõ hơn
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Tải lên 3 ảnh khuôn mặt và nhận báo cáo phân tích da chi tiết, mang
            tính tham khảo cho việc chăm sóc da hằng ngày.
          </p>
          <div className="mt-8">
            <Link href="/submit" className={buttonVariants({ size: "lg" })}>
              Bắt đầu phân tích
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-3">
          <Feature
            icon={<Camera className="h-6 w-6 text-primary" />}
            title="3 ảnh khuôn mặt"
            desc="Chính diện, nghiêng trái, nghiêng phải — kiểm tra chất lượng ảnh ngay trên trình duyệt."
          />
          <Feature
            icon={<Sparkles className="h-6 w-6 text-primary" />}
            title="Điểm số 0–100"
            desc="Các trục da được chuẩn hoá về thang 0–100, điểm càng cao càng tốt."
          />
          <Feature
            icon={<ShieldCheck className="h-6 w-6 text-primary" />}
            title="Riêng tư"
            desc="Ảnh được lưu riêng tư, báo cáo dùng liên kết bí mật không lộ thông tin."
          />
        </section>
      </main>
    </>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3">{icon}</div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </CardContent>
    </Card>
  );
}
