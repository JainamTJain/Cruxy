import { cn } from "@/lib/utils";

type CruxWordmarkProps = {
  className?: string;
  as?: "h1" | "h2" | "p" | "span";
};

/**
 * Landing wordmark: white letters, stepped Genie-blue shadow, soft glow.
 * Uses `.crux-wordmark` in globals.css. No box borders.
 */
export function CruxWordmark({
  className,
  as: Tag = "span",
}: CruxWordmarkProps) {
  return (
    <Tag
      className={cn(
        "crux-wordmark font-display font-extrabold leading-[0.82] tracking-[-0.04em]",
        className,
      )}
    >
      crux
    </Tag>
  );
}
