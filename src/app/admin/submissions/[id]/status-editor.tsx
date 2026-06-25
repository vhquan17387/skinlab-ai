"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import {
  SUBMISSION_STATUSES,
  STATUS_LABEL_VI,
  type SubmissionStatus,
} from "@/lib/constants";

export function StatusEditor({
  submissionId,
  current,
}: {
  submissionId: string;
  current: SubmissionStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SubmissionStatus>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(value: SubmissionStatus) {
    setStatus(value);
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/submissions/${submissionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Cập nhật thất bại.");
      setStatus(current);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Select
          className="w-56"
          value={status}
          disabled={saving}
          onChange={(e) => onChange(e.target.value as SubmissionStatus)}
        >
          {SUBMISSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL_VI[s]}
            </option>
          ))}
        </Select>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
