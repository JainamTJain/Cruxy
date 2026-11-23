import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";

/** Shared first-paint skeleton for Today, Program map, Practice, Cases. */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-2"
      aria-busy
      aria-label={label}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-56 max-w-full" />
        <SkeletonBlock lines={2} className="max-w-md" />
      </div>
      <Skeleton className="h-28 w-full" rounded="lg" />
      <Skeleton className="h-40 w-full" rounded="lg" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Skeleton className="h-24 w-full" rounded="lg" />
        <Skeleton className="h-24 w-full" rounded="lg" />
      </div>
    </div>
  );
}
