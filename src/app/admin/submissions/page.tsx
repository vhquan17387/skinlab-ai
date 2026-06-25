import Link from "next/link";
import { Download } from "lucide-react";
import { getDataStore } from "@/lib/backend/data";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from "@/lib/constants";
import { FilterBar } from "./filter-bar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function parseStatus(v: string | undefined): SubmissionStatus | undefined {
  return SUBMISSION_STATUSES.includes(v as SubmissionStatus)
    ? (v as SubmissionStatus)
    : undefined;
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const status = parseStatus(typeof sp.status === "string" ? sp.status : undefined);
  const search = typeof sp.search === "string" ? sp.search : "";
  const offset = Math.max(0, Number(sp.offset) || 0);

  const data = getDataStore();
  const { items, total } = await data.listSubmissions({
    status,
    search,
    limit: PAGE_SIZE,
    offset,
  });

  const exportQs = new URLSearchParams();
  if (status) exportQs.set("status", status);
  const exportHref = `/api/admin/submissions/export?${exportQs.toString()}`;

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  function pageHref(newOffset: number): string {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (search) qs.set("search", search);
    if (newOffset > 0) qs.set("offset", String(newOffset));
    return `/admin/submissions?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Danh sách submissions</h1>
        <Link href={exportHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download className="h-4 w-4" />
          Export CSV
        </Link>
      </div>

      <FilterBar />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Họ tên</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium">Điểm</th>
                  <th className="px-4 py-3 font-medium">Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      Không có submission nào.
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.submission.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/submissions/${item.submission.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {item.lead.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.lead.email}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.submission.status} />
                    </td>
                    <td className="px-4 py-3">{item.overall_score ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(item.submission.created_at).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Hiển thị {pageStart}–{pageEnd} / {total}
        </span>
        <div className="flex gap-2">
          {offset > 0 && (
            <Link
              href={pageHref(Math.max(0, offset - PAGE_SIZE))}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Trước
            </Link>
          )}
          {pageEnd < total && (
            <Link
              href={pageHref(offset + PAGE_SIZE)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Sau
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
