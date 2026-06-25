import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getDataStore } from "@/lib/backend/data";
import { getBlobStore } from "@/lib/backend/blob";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SIGNED_URL_TTL,
  IMAGE_KIND_LABEL_VI,
  type ImageKind,
} from "@/lib/constants";
import type { NormalizedSkinAnalysisResult } from "@/lib/ai/types";
import { StatusEditor } from "./status-editor";
import { NotesPanel } from "./notes-panel";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = getDataStore();
  const detail = await data.getSubmissionDetail(id);
  if (!detail) notFound();

  const { submission, lead, images, analysis, report } = detail;

  const blob = getBlobStore();
  const imageUrls: { kind: ImageKind; url: string }[] = [];
  for (const img of images) {
    imageUrls.push({
      kind: img.kind as ImageKind,
      url: await blob.signedUrl(img.storage_path, SIGNED_URL_TTL),
    });
  }

  const notes = await data.listNotes(id);
  const normalized = analysis?.normalized as
    | NormalizedSkinAnalysisResult
    | undefined;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    <div className="space-y-6">
      <Link
        href="/admin/submissions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: lead + consent + status */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin khách hàng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Họ tên" value={lead.full_name} />
              <Row label="Email" value={lead.email} />
              <Row label="SĐT" value={lead.phone || "—"} />
              <Row label="Tuổi" value={lead.age?.toString() || "—"} />
              <Row label="Giới tính" value={lead.gender || "—"} />
              <Row
                label="Vấn đề da"
                value={submission.skin_concerns.join(", ") || "—"}
              />
              <Row
                label="Ghi chú user"
                value={submission.notes_from_user || "—"}
              />
              <Row
                label="Ngày tạo"
                value={new Date(submission.created_at).toLocaleString("vi-VN")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Đồng ý</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <ConsentBadge label="Điều khoản" ok={submission.consent_terms} />
              <ConsentBadge label="Dữ liệu" ok={submission.consent_data} />
              <ConsentBadge label="Hình ảnh" ok={submission.consent_images} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trạng thái</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusEditor submissionId={submission.id} current={submission.status} />
            </CardContent>
          </Card>

          {report && !report.revoked_at && (
            <Card>
              <CardHeader>
                <CardTitle>Báo cáo công khai</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={`${appUrl}/report/${report.token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Mở báo cáo <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: images + AI result + notes */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Ảnh đã gửi</CardTitle>
            </CardHeader>
            <CardContent>
              {imageUrls.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có ảnh.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {imageUrls.map(({ kind, url }) => (
                    <figure key={kind} className="space-y-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={IMAGE_KIND_LABEL_VI[kind]}
                        className="aspect-square w-full rounded-md object-cover"
                      />
                      <figcaption className="text-center text-xs text-muted-foreground">
                        {IMAGE_KIND_LABEL_VI[kind]}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kết quả AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {analysis ? (
                <>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>
                      Provider: <b>{analysis.provider}</b>
                    </span>
                    <span>
                      Model: <b>{analysis.provider_model || "—"}</b>
                    </span>
                    <span>
                      Điểm tổng: <b>{analysis.overall_score ?? "—"}</b>
                    </span>
                  </div>

                  {normalized && (
                    <div>
                      <h3 className="mb-2 text-sm font-medium">Điểm chuẩn hoá (0–100)</h3>
                      <div className="space-y-2">
                        {normalized.scores.map((s) => (
                          <div key={s.key} className="flex items-center gap-3 text-sm">
                            <span className="w-36 shrink-0">{s.label}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${s.score}%` }}
                              />
                            </div>
                            <span className="w-10 text-right">{s.score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium">Raw output</summary>
                    <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-secondary/50 p-3 text-xs">
                      {JSON.stringify(analysis.raw, null, 2)}
                    </pre>
                  </details>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có kết quả phân tích.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ghi chú nội bộ</CardTitle>
            </CardHeader>
            <CardContent>
              <NotesPanel submissionId={submission.id} initialNotes={notes} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

function ConsentBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <Badge variant={ok ? "success" : "destructive"}>
      {label}: {ok ? "Có" : "Không"}
    </Badge>
  );
}
