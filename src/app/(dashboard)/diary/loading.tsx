import { Bar } from "@/components/Skeleton";

/**
 * The diary's own shape: a summary line, then a grid of columns.
 *
 * Deliberately shows the grid rather than a generic list — this is the page
 * people open most, and settling into the right shape matters more here than
 * anywhere else.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-8 py-9">
      <div className="flex flex-wrap items-baseline gap-4">
        <Bar className="h-7 w-24" />
        <Bar className="h-4 w-40" />
        <div className="ml-auto flex gap-2">
          <Bar className="h-10 w-32 rounded-xl" />
          <Bar className="h-10 w-40 rounded-xl" />
          <Bar className="h-10 w-24 rounded-xl" />
        </div>
      </div>

      <Bar className="mt-4 h-12 rounded-xl" />

      <div className="card mt-4 overflow-hidden">
        <div className="flex border-b border-border">
          <div className="w-16 shrink-0 border-r border-border" />
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex-1 border-r border-border px-2 py-3.5 last:border-r-0">
              <Bar className="mx-auto h-3 w-8" />
              <Bar className="mx-auto mt-2 size-7 rounded-full" />
            </div>
          ))}
        </div>

        <div className="flex" style={{ height: "26rem" }}>
          <div className="w-16 shrink-0 border-r border-border" />
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="flex-1 space-y-2 border-r border-border p-1.5 last:border-r-0"
            >
              {/* An uneven scatter, so it reads as a week rather than a table. */}
              {i % 3 !== 2 && <Bar className="h-14 rounded-lg" />}
              {i % 2 === 0 && <Bar className="mt-8 h-20 rounded-lg" />}
              {i % 4 === 1 && <Bar className="mt-6 h-10 rounded-lg" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
