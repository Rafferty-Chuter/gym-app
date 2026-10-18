"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import RoutineEditor from "@/components/training/RoutineEditor";
import { getTemplateById } from "@/lib/templateStorage";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";

/** Edit one routine. The routine lives in browser storage, so the server and the first client render both show nothing until hydration. */
export default function EditTemplatePage() {
  const params = useParams<{ templateId: string }>();
  const hydrated = useIsHydrated();
  const templateId = params?.templateId ? decodeURIComponent(String(params.templateId)) : "";
  const template = useMemo(() => (hydrated && templateId ? getTemplateById(templateId) : null), [hydrated, templateId]);

  if (!hydrated) return <main className="min-h-screen" style={{ background: "var(--page)" }} aria-busy />;

  if (!template) {
    return (
      <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-5 pt-6 sm:px-6">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            That routine is not on this phone.
          </p>
          <Link href="/templates" className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            ‹ Routines
          </Link>
        </div>
      </main>
    );
  }

  return <RoutineEditor key={template.id} mode="edit" initialTemplate={template} />;
}
