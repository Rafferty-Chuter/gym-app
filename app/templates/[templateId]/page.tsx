"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import TemplateEditorForm from "@/components/TemplateEditorForm";
import { getTemplateById } from "@/lib/templateStorage";

export default function EditTemplatePage() {
  const params = useParams<{ templateId: string }>();
  const templateId = params?.templateId ? decodeURIComponent(String(params.templateId)) : "";
  const template = useMemo(() => (templateId ? getTemplateById(templateId) : null), [templateId]);

  if (!template) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white p-6 pb-28">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm text-app-secondary">Template not found.</p>
        </div>
      </main>
    );
  }

  return <TemplateEditorForm mode="edit" initialTemplate={template} />;
}

