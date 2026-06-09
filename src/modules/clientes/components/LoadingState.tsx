type LoadingStateProps = {
linhas?: number;
};

export function LoadingState({
linhas = 5,
}: LoadingStateProps) {
return ( <div className="space-y-3 px-6 py-6">
{Array.from({ length: linhas }).map((_, index) => ( <div
       key={index}
       className="grid grid-cols-5 gap-5 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-4"
     >
{Array.from({ length: 5 }).map((__, itemIndex) => ( <div
           key={itemIndex}
           className="h-4 animate-pulse rounded bg-slate-200"
         />
))} </div>
))} </div>
);
}
