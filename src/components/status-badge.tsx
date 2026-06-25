import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL_VI, type SubmissionStatus } from "@/lib/constants";

const VARIANT: Record<
  SubmissionStatus,
  "default" | "secondary" | "destructive" | "success" | "warning" | "info"
> = {
  new: "info",
  processing: "warning",
  completed: "success",
  need_retake: "secondary",
  failed: "destructive",
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL_VI[status]}</Badge>;
}
