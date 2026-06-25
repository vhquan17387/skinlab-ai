import { AlertTriangle } from "lucide-react";
import { DISCLAIMER_TEXT } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900",
        className,
      )}
      role="note"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{DISCLAIMER_TEXT}</p>
    </div>
  );
}
