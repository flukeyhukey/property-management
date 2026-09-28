import { Card } from "@/components/ui/primitives";

/** Quiet placeholders in the same shapes as the real screen. */
export default function QueueLoading() {
  return (
    <main aria-busy="true" aria-label="Loading your queue" className="mx-auto flex w-full max-w-[640px] flex-col gap-10 px-4 py-5 lg:max-w-[760px] lg:px-8 lg:py-10">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex flex-col gap-2 p-3 sm:p-5">
            <span className="h-7 w-16 rounded-[6px] bg-ground" />
            <span className="h-3 w-full rounded-[6px] bg-ground" />
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <span className="h-8 w-3/4 rounded-[6px] bg-hairline" />
        <span className="h-4 w-full rounded-[6px] bg-ground" />
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex flex-col gap-3 p-4">
            <span className="h-5 w-1/2 rounded-[6px] bg-ground" />
            <span className="h-4 w-2/3 rounded-[6px] bg-ground" />
            <span className="h-4 w-full rounded-[6px] bg-ground" />
            <span className="h-11 w-full rounded-[6px] bg-ground" />
          </Card>
        ))}
      </div>
    </main>
  );
}
