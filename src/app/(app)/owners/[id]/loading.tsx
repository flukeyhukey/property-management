export default function Loading() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-8" aria-busy="true" aria-label="Loading owner">
      <div className="h-4 w-48 rounded bg-hairline" />
      <div className="h-10 w-72 rounded-[6px] bg-hairline" />
      <div className="h-4 w-96 max-w-full rounded bg-hairline" />
      <div className="h-32 rounded-[12px] border border-hairline bg-card" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[12px] border border-hairline bg-card" />
        ))}
      </div>
      <div className="h-64 rounded-[12px] border border-hairline bg-card" />
    </div>
  );
}
