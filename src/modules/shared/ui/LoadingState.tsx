type LoadingStateProps = {
  linhas?: number;
  colunas?: number;
};

export function LoadingState({ linhas = 5, colunas = 5 }: LoadingStateProps) {
  return (
    <div className="flex flex-col gap-2.5 px-5 py-5">
      {Array.from({ length: linhas }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-3.5 rounded-[10px] border border-border-subtle bg-border-subtle px-3.5 py-3"
          style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: colunas }).map((_, colIndex) => (
            <div key={colIndex} className="h-3 animate-pulse rounded bg-border" />
          ))}
        </div>
      ))}
    </div>
  );
}
