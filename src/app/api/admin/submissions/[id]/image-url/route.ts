import { NextResponse, type NextRequest } from "next/server";
import { getAuthBackend } from "@/lib/backend/auth";
import { getDataStore } from "@/lib/backend/data";
import { getBlobStore } from "@/lib/backend/blob";
import { imageKindSchema } from "@/lib/validation";
import { SIGNED_URL_TTL } from "@/lib/constants";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthBackend().getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const kindParam = req.nextUrl.searchParams.get("kind");
  const parsed = imageKindSchema.safeParse(kindParam);
  if (!parsed.success) {
    return NextResponse.json({ error: "kind không hợp lệ." }, { status: 400 });
  }

  const image = await getDataStore().getImageByKind(id, parsed.data);
  if (!image) {
    return NextResponse.json({ error: "Không tìm thấy ảnh." }, { status: 404 });
  }

  const url = await getBlobStore().signedUrl(image.storage_path, SIGNED_URL_TTL);
  return NextResponse.json({ url });
}
