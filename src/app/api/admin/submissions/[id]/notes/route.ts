import { NextResponse, type NextRequest } from "next/server";
import { getAuthBackend } from "@/lib/backend/auth";
import { getDataStore } from "@/lib/backend/data";
import { noteCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthBackend().getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const notes = await getDataStore().listNotes(id);
  return NextResponse.json({ notes });
}

export async function POST(
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

  const parsed = noteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Ghi chú không hợp lệ." },
      { status: 400 },
    );
  }

  const note = await getDataStore().addNote({
    submission_id: id,
    author_id: user.id,
    author_email: user.email,
    body: parsed.data.body,
  });
  return NextResponse.json({ note });
}
