type StatusBadgeProps = {
ativo: boolean;
};

export function StatusBadge({ ativo }: StatusBadgeProps) {
return (
<span
className={
ativo
? "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
: "inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500"
}
>
{ativo ? "Ativo" : "Inativo"} </span>
);
}
