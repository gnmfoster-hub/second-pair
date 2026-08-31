import { HeaderSkeleton, ListSkeleton, Bar } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <HeaderSkeleton />
      <Bar className="mt-5 h-11 max-w-md rounded-xl" />
      <ListSkeleton rows={7} />
    </div>
  );
}
