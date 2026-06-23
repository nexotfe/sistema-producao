import Link from "next/link";
import type { ReactNode } from "react";
import {
  EntityType,
  entityLabels,
  getEntityHref,
} from "@/modules/shared/navigation/entityRoutes";

type EntityLinkProps = {
  type: EntityType;
  id: string;
  children?: ReactNode;
  className?: string;
  title?: string;
};

export function EntityLink({
  type,
  id,
  children,
  className,
  title,
}: EntityLinkProps) {
  const label = children ?? `${entityLabels[type]} ${id}`;
  const defaultClassName =
    "font-semibold text-blue-700 underline-offset-2 outline-none transition hover:text-blue-900 hover:underline focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2";

  return (
    <Link
      href={getEntityHref(type, id)}
      title={title}
      className={className ?? defaultClassName}
    >
      {label}
    </Link>
  );
}
