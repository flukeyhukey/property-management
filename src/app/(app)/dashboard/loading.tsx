import { Card } from "@/components/ui/primitives";

/** Shape of the dashboard while the numbers load. Flat, no motion. */
export default function DashboardLoading() {
  return (
    <main aria-busy="true" aria-label="Loading the dashboard" className="flex flex-col gap-8 px-4 py-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-3">
        <div className="h-8 w-2/3 max-w-[520px] rounded-[6px] bg-hairline" />
        <div className="h-4 w-1/2 max-w-[420px] rounded-[6px] bg-hairline" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="flex flex-col gap-2 p-3 sm:p-5">
            <div className="h-7 w-16 rounded-[6px] bg-hairline" />
            <div className="h-3 w-3/4 rounded-[6px] bg-hairline" />
          </Card>
        ))}
      </div>
      <Card className="h-56" />
      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="h-48" />
        <Card className="h-48" />
      </div>
    </main>
  );
}
