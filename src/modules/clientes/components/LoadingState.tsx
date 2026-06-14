type LoadingStateProps = {
  linhas?: number;
};

export function LoadingState({ linhas = 5 }: LoadingStateProps) {
  return (
    <div className="space-y-2 px-5 py-5">
      {Array.from({ length: linhas }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-5 gap-5 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
        >
          {Array.from({ length: 5 }).map((__, itemIndex) => (
            <div
              key={itemIndex}
              className="h-4 animate-pulse rounded bg-slate-200"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
