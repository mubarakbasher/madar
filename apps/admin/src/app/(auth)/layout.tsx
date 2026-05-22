import { ShieldCheck } from "lucide-react";
import { labels } from "../../lib/copy";

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="flex items-center justify-between px-6 py-5 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white font-serif text-xl">
            M
          </div>
          <span className="font-serif text-xl tracking-tight">{labels.brand.name}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider text-accent-ink">
            <ShieldCheck className="h-3 w-3" strokeWidth={2} />
            {labels.brand.panel}
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16 pt-4 lg:px-10">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
