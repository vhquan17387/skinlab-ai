import { NextResponse, type NextRequest } from "next/server";
import { getAuthBackend } from "@/lib/backend/auth";
import { getDataStore } from "@/lib/backend/data";
import { statusUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthBackend().getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Trạng thái không hợp lệ." },
      { status: 400 },
    );
  }

  await getDataStore().setSubmissionStatus(id, parsed.data.status);
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
