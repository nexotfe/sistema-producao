"use client";

import { use } from "react";
import { ProjectDetailsPageContent } from "@/modules/projetos/components/ProjectDetailsPageContent";

type ProjectDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default function ProjectDetailsPage({ params }: ProjectDetailsPageProps) {
  const { id } = use(params);

  return <ProjectDetailsPageContent projectId={id} />;
}
