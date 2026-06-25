import { SiteHeader } from "@/components/site-header";
import { SubmitForm } from "./submit-form";

export const metadata = { title: "Nộp ảnh phân tích — SkinAI Lab" };

export default function SubmitPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold">Nộp ảnh để phân tích da</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vui lòng điền thông tin và tải lên 3 ảnh khuôn mặt rõ nét. Ảnh sẽ được
          kiểm tra chất lượng ngay trên trình duyệt trước khi gửi.
        </p>
        <div className="mt-6">
          <SubmitForm />
        </div>
      </main>
    </>
  );
}
