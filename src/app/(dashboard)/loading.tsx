import { HeaderSkeleton, StatsSkeleton, ListSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <HeaderSkeleton />
      <StatsSkeleton />
      <ListSkeleton rows={6} />
    </div>
  );
}
