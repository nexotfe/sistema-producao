"use client";

import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";

type ModuleBackLinkProps = {
  href: string;
  label: string;
};

export function ModuleBackLink({ href, label }: ModuleBackLinkProps) {
  return <ModuleBackButton label={label} fallbackHref={href} />;
}
