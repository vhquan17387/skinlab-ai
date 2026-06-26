import { notFound } from "next/navigation";
import { getDataStore } from "@/lib/backend/data";
import { getBlobStore } from "@/lib/backend/blob";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SIGNED_URL_TTL,
  IMAGE_KIND_LABEL_VI,
  SIGNAL_DESCRIPTION_VI,
  SCORE_SCALE_EXPLANATION_VI,
  SCORE_BAND_EXPLANATION_VI,
  type ImageKind,
} from "@/lib/constants";
import type {
  NormalizedSkinAnalysisResult,
  BandLabel,
} from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const BAND_LABEL_VI: Record<BandLabel, string> = {
  high: "Tốt",
  medium: "Trung bình",
  low: "Cần cải thiện",
};

function bandColor(score: number): string {
  if (score >= 75) return "bg-green-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function bandTextColor(score: number): string {
  if (score >= 75) return "text-green-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = getDataStore();

  const report = await data.getReportByToken(token);
  if (!report || report.revoked_at) notFound();

  const detail = await data.getSubmissionDetail(report.submission_id);
  if (!detail || !detail.analysis) notFound();

  const normalized = detail.analysis.normalized as NormalizedSkinAnalysisResult;
  const overall = normalized.overall;

  const blob = getBlobStore();
  const imageUrls: { kind: ImageKind; url: string }[] = [];
  for (const img of detail.images) {
    const url = await blob.signedUrl(img.storage_path, SIGNED_URL_TTL);
    imageUrls.push({ kind: img.kind as ImageKind, url });
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">Báo cáo phân tích da</h1>

        {/* Overall */}
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-8">
            <p className="text-sm text-muted-foreground">Điểm tổng quan</p>
            <div className={`text-6xl font-bold ${bandTextColor(overall)}`}>
              {overall}
            </div>
            <p className="text-sm">
              trên thang 100 —{" "}
              <span className={`font-medium ${bandTextColor(overall)}`}>
                {BAND_LABEL_VI[normalized.bandLabel]}
              </span>
            </p>

            <p className="mt-2 max-w-prose text-center text-xs text-muted-foreground">
              {SCORE_SCALE_EXPLANATION_VI}
            </p>

            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {SCORE_BAND_EXPLANATION_VI.map((band) => (
                <span key={band.label} className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${bandColor(band.min)}`}
                  />
                  <span className="font-medium text-foreground">{band.label}</span>
                  <span>({band.hint})</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Nhận xét chung */}
        {normalized.summary && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Nhận xét chung</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground/90">
                {normalized.summary}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Vấn đề ưu tiên */}
        {normalized.primaryConcerns && normalized.primaryConcerns.length > 0 && (
          <Card className="mt-6 border-primary/40">
            <CardHeader>
              <CardTitle>Vấn đề nên ưu tiên</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {normalized.primaryConcerns.map((c, i) => (
                <div key={c.key || i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-sm text-foreground/80">{c.why}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Scores */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Chi tiết theo từng trục</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {normalized.scores.map((s) => (
              <div key={s.key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{s.label}</span>
                  <span className={`font-medium ${bandTextColor(s.score)}`}>
                    {s.score}/100
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${bandColor(s.score)}`}
                    style={{ width: `${s.score}%` }}
                  />
                </div>
                {s.rationale ? (
                  <p className="mt-1 text-sm text-foreground/80">
                    {s.rationale}
                  </p>
                ) : (
                  SIGNAL_DESCRIPTION_VI[s.key] && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {SIGNAL_DESCRIPTION_VI[s.key]}
                    </p>
                  )
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Lộ trình chăm sóc */}
        {normalized.routine && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Lộ trình chăm sóc gợi ý</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {(
                [
                  ["Buổi sáng", normalized.routine.morning],
                  ["Buổi tối", normalized.routine.evening],
                  ["Hằng tuần", normalized.routine.weekly],
                ] as const
              ).map(([title, steps]) =>
                steps && steps.length > 0 ? (
                  <div key={title}>
                    <p className="mb-2 text-sm font-semibold">{title}</p>
                    <ol className="space-y-2">
                      {steps.map((s, i) => (
                        <li key={i} className="text-sm">
                          <span className="font-medium">{s.step}</span>
                          {s.ingredients && s.ingredients.length > 0 && (
                            <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                              {s.ingredients.map((ing) => (
                                <span
                                  key={ing}
                                  className="rounded bg-secondary px-1.5 py-0.5 text-xs text-foreground/80"
                                >
                                  {ing}
                                </span>
                              ))}
                            </span>
                          )}
                          {s.note && (
                            <span className="block text-xs text-muted-foreground">
                              {s.note}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null,
              )}
              <p className="text-xs text-muted-foreground">
                Gợi ý theo nhóm hoạt chất, không phải thương hiệu cụ thể. Hãy thử
                từng sản phẩm mới một và ngưng nếu da kích ứng.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Kỳ vọng cải thiện */}
        {normalized.expectations && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Kỳ vọng cải thiện</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground/90">
                {normalized.expectations}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Khi nào nên gặp bác sĩ */}
        {normalized.seeDoctorIf && normalized.seeDoctorIf.length > 0 && (
          <Card className="mt-6 border-amber-300">
            <CardHeader>
              <CardTitle>Khi nào nên gặp bác sĩ da liễu</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
                {normalized.seeDoctorIf.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Gợi ý chăm sóc bổ sung */}
        {normalized.recommendations && normalized.recommendations.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Gợi ý bổ sung</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
                {normalized.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Images */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Ảnh đã gửi</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </main>
    </>
  );
}
