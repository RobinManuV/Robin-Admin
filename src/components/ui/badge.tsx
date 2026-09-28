import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLSpanElement> & { variant?: string };
export function Badge({ variant = "default", className = "", ...props }: Props) {
  return <span className={`ui-badge ${variant} ${className}`.trim()} {...props} />;
}
