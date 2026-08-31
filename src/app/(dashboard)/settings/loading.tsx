import { Bar } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="card space-y-5 p-6">
          <Bar className="h-4 w-32" />
          <div>
            <Bar className="h-3 w-20" />
            <Bar className="mt-2 h-11 rounded-xl" />
          </div>
          <div>
            <Bar className="h-3 w-24" />
            <Bar className="mt-2 h-11 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
