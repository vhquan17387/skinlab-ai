import { NextResponse } from "next/server";
import { getAuthBackend } from "@/lib/backend/auth";

export async function POST() {
  await getAuthBackend().signOut();
  return NextResponse.json({ ok: true });
}
