"use client";

import { useSearchParams } from "next/navigation";
import { ProjectDetailsPageContent } from "@/modules/projetos/components/ProjectDetailsPageContent";

export default function NewProjectPage() {
  const searchParams = useSearchParams();
  const projetoId = searchParams.get("id");

  return <ProjectDetailsPageContent projectId={projetoId} />;
}
