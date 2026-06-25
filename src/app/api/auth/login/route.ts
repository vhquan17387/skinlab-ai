import { NextResponse, type NextRequest } from "next/server";
import { getAuthBackend } from "@/lib/backend/auth";
import { loginSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ." },
      { status: 400 },
    );
  }

  const result = await getAuthBackend().signIn(
    parsed.data.email,
    parsed.data.password,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
