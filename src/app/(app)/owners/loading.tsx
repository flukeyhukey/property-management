export default function Loading() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-8" aria-busy="true" aria-label="Loading owners">
      <div className="h-10 w-40 rounded-[6px] bg-hairline" />
      <div className="h-11 w-full rounded-[6px] bg-hairline" />
      <div className="rounded-[12px] border border-hairline bg-card">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-hairline px-4 py-4 last:border-b-0">
            <div className="h-2 w-2 rounded-full bg-hairline" />
            <div className="h-4 w-40 rounded bg-hairline" />
            <div className="ml-auto h-4 w-24 rounded bg-hairline" />
          </div>
        ))}
      </div>
    </div>
  );
}
