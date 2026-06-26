"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  SKIN_CONCERN_OPTIONS,
  IMAGE_KINDS,
  IMAGE_KIND_LABEL_VI,
  IMAGE_KIND_HINT_VI,
  ACCEPTED_MIME,
  MAX_IMAGE_BYTES,
  type ImageKind,
} from "@/lib/constants";
import {
  createImageContext,
  runValidators,
  validatorsForKind,
} from "@/lib/image-validators";

interface ImageState {
  file: File | null;
  previewUrl: string | null;
  status: "idle" | "validating" | "ok" | "error";
  error: string | null;
}

const emptyImage: ImageState = {
  file: null,
  previewUrl: null,
  status: "idle",
  error: null,
};

export function SubmitForm() {
  const router = useRouter();
  const [concerns, setConcerns] = useState<string[]>([]);
  const [images, setImages] = useState<Record<ImageKind, ImageState>>({
    front: { ...emptyImage },
    left: { ...emptyImage },
    right: { ...emptyImage },
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleConcern(value: string) {
    setConcerns((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  }

  async function handleImage(kind: ImageKind, file: File | undefined) {
    if (!file) return;

    if (!ACCEPTED_MIME.includes(file.type)) {
      setImages((p) => ({
        ...p,
        [kind]: {
          file,
          previewUrl: URL.createObjectURL(file),
          status: "error",
          error: "Định dạng ảnh không hỗ trợ (chỉ JPG, PNG, WEBP).",
        },
      }));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImages((p) => ({
        ...p,
        [kind]: {
          file,
          previewUrl: URL.createObjectURL(file),
          status: "error",
          error: "Ảnh vượt quá 8MB, vui lòng chọn ảnh nhỏ hơn.",
        },
      }));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImages((p) => ({
      ...p,
      [kind]: { file, previewUrl, status: "validating", error: null },
    }));

    try {
      const ctx = await createImageContext(file, kind);
      const result = await runValidators(ctx, validatorsForKind(kind));
      ctx.bitmap.close?.();
      if (result.ok) {
        setImages((p) => ({
          ...p,
          [kind]: { file, previewUrl, status: "ok", error: null },
        }));
      } else {
        setImages((p) => ({
          ...p,
          [kind]: { file, previewUrl, status: "error", error: result.message },
        }));
      }
    } catch {
      setImages((p) => ({
        ...p,
        [kind]: {
          file,
          previewUrl,
          status: "error",
          error: "Không thể kiểm tra ảnh, vui lòng thử lại.",
        },
      }));
    }
  }

  const allImagesOk = IMAGE_KINDS.every((k) => images[k].status === "ok");
  const anyValidating = IMAGE_KINDS.some(
    (k) => images[k].status === "validating",
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!allImagesOk) {
      setFormError("Vui lòng đảm bảo cả 3 ảnh đều hợp lệ trước khi gửi.");
      return;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);

    // Concerns are tracked in state, not native inputs.
    fd.delete("skin_concerns");
    concerns.forEach((c) => fd.append("skin_concerns", c));

    // Attach validated image files.
    for (const kind of IMAGE_KINDS) {
      const img = images[kind];
      if (img.file) fd.set(`image_${kind}`, img.file);
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/submit", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Gửi thất bại, vui lòng thử lại.");
        setSubmitting(false);
        return;
      }
      router.push(`/report/${data.token}`);
    } catch {
      setFormError("Lỗi kết nối, vui lòng thử lại.");
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-medium">Đang phân tích...</p>
          <p className="text-sm text-muted-foreground">
            Vui lòng chờ trong giây lát.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Personal info */}
      <section className="space-y-4">
        <h2 className="font-semibold">Thông tin cá nhân</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Họ và tên" htmlFor="full_name">
            <Input id="full_name" name="full_name" required minLength={2} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" required />
          </Field>
          <Field label="Số điện thoại (tùy chọn)" htmlFor="phone">
            <Input id="phone" name="phone" />
          </Field>
          <Field label="Tuổi" htmlFor="age">
            <Input id="age" name="age" type="number" min={10} max={100} required />
          </Field>
          <Field label="Giới tính" htmlFor="gender">
            <Select id="gender" name="gender" required defaultValue="">
              <option value="" disabled>
                -- Chọn --
              </option>
              <option value="female">Nữ</option>
              <option value="male">Nam</option>
              <option value="other">Khác</option>
            </Select>
          </Field>
        </div>
      </section>

      {/* Skin concerns */}
      <section className="space-y-3">
        <h2 className="font-semibold">Vấn đề về da (chọn ít nhất 1)</h2>
        <div className="flex flex-wrap gap-2">
          {SKIN_CONCERN_OPTIONS.map((opt) => {
            const selected = concerns.includes(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => toggleConcern(opt.value)}
                className={
                  "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                  (selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-secondary")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <Label htmlFor="notes_from_user">Ghi chú thêm (tùy chọn)</Label>
        <Textarea id="notes_from_user" name="notes_from_user" maxLength={2000} />
      </section>

      {/* Images */}
      <section className="space-y-3">
        <h2 className="font-semibold">Ảnh phân tích da</h2>
        <p className="text-sm text-muted-foreground">
          1 ảnh khuôn mặt chính diện và 2 ảnh cận cảnh vùng da cần phân tích.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {IMAGE_KINDS.map((kind) => (
            <ImageUploader
              key={kind}
              kind={kind}
              state={images[kind]}
              onChange={(file) => handleImage(kind, file)}
            />
          ))}
        </div>
      </section>

      {/* Consent */}
      <section className="space-y-3">
        <h2 className="font-semibold">Đồng ý</h2>
        <Consent name="consent_terms" label="Tôi đồng ý với điều khoản sử dụng dịch vụ." />
        <Consent name="consent_data" label="Tôi đồng ý cho hệ thống xử lý dữ liệu cá nhân của tôi." />
        <Consent name="consent_images" label="Tôi đồng ý cung cấp hình ảnh khuôn mặt/vùng da để phân tích." />
      </section>

      {formError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {formError}
        </div>
      )}

      <Button type="submit" size="lg" disabled={anyValidating} className="w-full">
        {anyValidating ? "Đang kiểm tra ảnh..." : "Gửi phân tích"}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Consent({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        required
        className="mt-0.5 h-4 w-4 rounded border-input"
      />
      <span>{label}</span>
    </label>
  );
}

function ImageUploader({
  kind,
  state,
  onChange,
}: {
  kind: ImageKind;
  state: ImageState;
  onChange: (file: File | undefined) => void;
}) {
  const inputId = `image_${kind}_input`;
  return (
    <div className="space-y-2">
      <Label>{IMAGE_KIND_LABEL_VI[kind]}</Label>
      <p className="text-xs text-muted-foreground">{IMAGE_KIND_HINT_VI[kind]}</p>
      <label
        htmlFor={inputId}
        className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-input bg-secondary/40 hover:bg-secondary"
      >
        {state.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.previewUrl}
            alt={IMAGE_KIND_LABEL_VI[kind]}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Upload className="h-6 w-6" />
            <span className="text-xs">Chọn ảnh</span>
          </div>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_MIME.join(",")}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0])}
      />
      {state.status === "validating" && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang kiểm tra...
        </p>
      )}
      {state.status === "ok" && (
        <p className="flex items-center gap-1 text-xs text-green-700">
          <CheckCircle2 className="h-3 w-3" /> Ảnh hợp lệ
        </p>
      )}
      {state.status === "error" && state.error && (
        <p className="flex items-start gap-1 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {state.error}
        </p>
      )}
    </div>
  );
}
