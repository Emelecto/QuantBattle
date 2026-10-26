import { cn } from "@/lib/cn";

type SkeletonVariant = "line" | "card" | "stat";

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  line: "h-4 w-full rounded",
  card: "h-32 w-full rounded-xl",
  stat: "h-16 w-full rounded-lg",
};

export function Skeleton({
  variant = "line",
  className,
}: {
  variant?: SkeletonVariant;
  className?: string;
}) {
  return <div aria-hidden className={cn("animate-pulse bg-surface-solid", VARIANT_CLASSES[variant], className)} />;
}
