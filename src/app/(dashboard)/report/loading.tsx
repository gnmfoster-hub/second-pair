import { HeaderSkeleton, StatsSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="work">
      <HeaderSkeleton />
      <StatsSkeleton />
      <StatsSkeleton />
    </div>
  );
}
