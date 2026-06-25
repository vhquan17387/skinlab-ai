import { NextResponse, type NextRequest } from "next/server";
import { getAuthBackend } from "@/lib/backend/auth";
import { getDataStore } from "@/lib/backend/data";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/lib/constants";

export const runtime = "nodejs";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const user = await getAuthBackend().getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusParam = req.nextUrl.searchParams.get("status") || undefined;
  const status = SUBMISSION_STATUSES.includes(statusParam as SubmissionStatus)
    ? (statusParam as SubmissionStatus)
    : undefined;

  const rows = await getDataStore().exportSubmissions(status);

  const header = [
    "id",
    "created_at",
    "status",
    "full_name",
    "email",
    "phone",
    "age",
    "gender",
    "skin_concerns",
    "overall_score",
    "provider",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.submission.id,
        r.submission.created_at,
        r.submission.status,
        r.lead.full_name,
        r.lead.email,
        r.lead.phone,
        r.lead.age,
        r.lead.gender,
        (r.submission.skin_concerns || []).join("|"),
        r.overall_score,
        r.provider,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = lines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="submissions.csv"`,
    },
  });
}
