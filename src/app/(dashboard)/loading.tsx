import { HeaderSkeleton, StatsSkeleton, ListSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="work">
      <HeaderSkeleton />
      <StatsSkeleton />
      <ListSkeleton rows={6} />
    </div>
  );
}
