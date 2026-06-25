import Link from "next/link";
import { Sparkles } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          <span>SkinAI Lab</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/submit" className="text-muted-foreground hover:text-foreground">
            Phân tích da
          </Link>
        </nav>
      </div>
    </header>
  );
}
