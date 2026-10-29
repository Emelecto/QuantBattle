import { cn } from "@/lib/cn";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "qb-glass rounded-xl",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn("px-5 pt-5 pb-3", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-[15px] font-semibold text-ink", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: DivProps) {
  return (
    <div
      className={cn("px-5 pb-5 text-sm leading-relaxed text-muted", className)}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t border-line px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
