type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-5 py-10 text-center">
      <div className="mb-2.5 h-10 w-10 rounded-[10px] border border-border bg-border-subtle" />

      <h4 className="text-[14.5px] font-semibold text-text-primary">{title}</h4>

      <p className="max-w-[32ch] text-[12.5px] text-text-secondary">
        {description}
      </p>
    </div>
  );
}
