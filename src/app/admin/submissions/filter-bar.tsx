"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SUBMISSION_STATUSES, STATUS_LABEL_VI } from "@/lib/constants";

export function FilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("search") ?? "");

  // Debounce search → push to URL (resets offset).
  useEffect(() => {
    const current = params.get("search") ?? "";
    if (search === current) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search) next.set("search", search);
      else next.delete("search");
      next.delete("offset");
      startTransition(() => router.push(`/admin/submissions?${next.toString()}`));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function onStatusChange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("status", value);
    else next.delete("status");
    next.delete("offset");
    router.push(`/admin/submissions?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm theo tên / email / SĐT"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Select
        className="w-48"
        value={params.get("status") ?? ""}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="">Tất cả trạng thái</option>
        {SUBMISSION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL_VI[s]}
          </option>
        ))}
      </Select>
    </div>
  );
}
