import { NextResponse, type NextRequest } from "next/server";
import { getDataStore } from "@/lib/backend/data";
import { getBlobStore } from "@/lib/backend/blob";
import { getSkinAnalysisProvider, normalize } from "@/lib/ai";
import { submitSchema } from "@/lib/validation";
import { newReportToken } from "@/lib/tokens";
import { sendReportReadyEmail } from "@/lib/email/resend";
import {
  IMAGE_KINDS,
  ACCEPTED_MIME,
  MAX_IMAGE_BYTES,
  type ImageKind,
} from "@/lib/constants";
import type { SkinAnalysisImage } from "@/lib/ai/types";

export const runtime = "nodejs";

function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function hashIp(ip: string): Promise<string> {
  const pepper = process.env.IP_HASH_PEPPER || "";
  const data = new TextEncoder().encode(ip + pepper);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi không hợp lệ." }, { status: 400 });
  }

  // Validate text fields with zod.
  const parsed = submitSchema.safeParse({
    full_name: form.get("full_name"),
    email: form.get("email"),
    phone: form.get("phone") || undefined,
    age: form.get("age"),
    gender: form.get("gender"),
    skin_concerns: form.getAll("skin_concerns"),
    notes_from_user: form.get("notes_from_user") || undefined,
    consent_terms: form.get("consent_terms") === "on" || form.get("consent_terms") === "true",
    consent_data: form.get("consent_data") === "on" || form.get("consent_data") === "true",
    consent_images: form.get("consent_images") === "on" || form.get("consent_images") === "true",
  });

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return NextResponse.json({ error: first?.message || "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const input = parsed.data;

  // Validate the 3 image files.
  const files: Record<ImageKind, File> = {} as Record<ImageKind, File>;
  for (const kind of IMAGE_KINDS) {
    const f = form.get(`image_${kind}`);
    if (!(f instanceof File)) {
      return NextResponse.json({ error: `Thiếu ảnh ${kind}.` }, { status: 400 });
    }
    if (!ACCEPTED_MIME.includes(f.type)) {
      return NextResponse.json({ error: `Ảnh ${kind} có định dạng không hỗ trợ.` }, { status: 400 });
    }
    if (f.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: `Ảnh ${kind} vượt quá dung lượng cho phép.` }, { status: 400 });
    }
    files[kind] = f;
  }

  const data = getDataStore();
  const blob = getBlobStore();

  try {
    // 1. Lead
    const lead = await data.insertLead({
      full_name: input.full_name,
      email: input.email,
      phone: input.phone || null,
      age: input.age,
      gender: input.gender,
    });

    // 2. Submission (status defaults to 'new')
    const submission = await data.insertSubmission({
      lead_id: lead.id,
      skin_concerns: input.skin_concerns,
      notes_from_user: input.notes_from_user || null,
      consent_terms: input.consent_terms,
      consent_data: input.consent_data,
      consent_images: input.consent_images,
      user_agent: req.headers.get("user-agent") || null,
      ip_hash: await hashIp(clientIp(req)),
    });

    // 3. Upload images + insert rows
    const analysisImages: Partial<Record<ImageKind, SkinAnalysisImage>> = {};
    for (const kind of IMAGE_KINDS) {
      const f = files[kind];
      const bytes = new Uint8Array(await f.arrayBuffer());
      const ext = extForMime(f.type);
      const path = `${submission.id}/${kind}.${ext}`;
      await blob.put({ path, bytes, contentType: f.type });
      await data.insertImage({
        submission_id: submission.id,
        kind,
        storage_path: path,
        mime_type: f.type,
        size_bytes: f.size,
        width: null,
        height: null,
      });
      analysisImages[kind] = { storagePath: path, bytes, contentType: f.type };
    }

    // 4. status -> processing
    await data.setSubmissionStatus(submission.id, "processing");

    // 5. Run provider + normalize
    const provider = getSkinAnalysisProvider();
    const raw = await provider.analyze({
      submissionId: submission.id,
      images: {
        front: analysisImages.front!,
        left: analysisImages.left!,
        right: analysisImages.right!,
      },
    });
    const normalized = normalize(raw);

    // 6. Persist analysis
    await data.insertAnalysisResult({
      submission_id: submission.id,
      provider: raw.provider,
      provider_model: raw.providerModel || null,
      raw,
      normalized,
      overall_score: normalized.overall,
    });

    // 7. Report token
    const token = newReportToken();
    await data.createReport(submission.id, token);

    // 8. status -> completed
    await data.setSubmissionStatus(submission.id, "completed");

    // 9. Email (optional, best-effort)
    void sendReportReadyEmail({ to: lead.email, fullName: lead.full_name, token });

    return NextResponse.json({ token });
  } catch (err) {
    console.error("[submit] pipeline failed:", err);
    return NextResponse.json(
      { error: "Có lỗi xảy ra trong quá trình phân tích. Vui lòng thử lại." },
      { status: 500 },
    );
  }
}
