import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string };
export function Button({ variant = "default", size = "default", className = "", ...props }: Props) {
  return <button className={`ui-button ${variant} ${size} ${className}`.trim()} {...props} />;
}
