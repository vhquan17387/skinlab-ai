"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AdminNote } from "@/types/database";

export function NotesPanel({
  submissionId,
  initialNotes,
}: {
  submissionId: string;
  initialNotes: AdminNote[];
}) {
  const [notes, setNotes] = useState<AdminNote[]>(initialNotes);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/submissions/${submissionId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Không thể thêm ghi chú.");
      return;
    }
    const data = await res.json();
    setNotes((prev) => [data.note as AdminNote, ...prev]);
    setBody("");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addNote} className="space-y-2">
        <Textarea
          placeholder="Thêm ghi chú nội bộ..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={saving || !body.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Thêm ghi chú
        </Button>
      </form>

      <ul className="space-y-3">
        {notes.length === 0 && (
          <li className="text-sm text-muted-foreground">Chưa có ghi chú nào.</li>
        )}
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border border-border p-3">
            <p className="whitespace-pre-wrap text-sm">{n.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {n.author_email || "admin"} ·{" "}
              {new Date(n.created_at).toLocaleString("vi-VN")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
