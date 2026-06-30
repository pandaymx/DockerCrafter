import React from "react";
import { cn } from "../../utils/cn";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  colorType?: "cpu" | "memory" | "default";
  showBackground?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  colorType = "default",
  showBackground = true,
  className,
  ...props
}) => {
  const percentage = Math.min((value / max) * 100, 100);

  let barColorClass = "bg-cyan-500"; // default

  if (colorType === "cpu") {
    barColorClass =
      percentage > 80
        ? "bg-rose-500"
        : percentage > 40
          ? "bg-amber-500"
          : "bg-cyan-500";
  } else if (colorType === "memory") {
    barColorClass =
      percentage > 80
        ? "bg-rose-500"
        : percentage > 40
          ? "bg-amber-500"
          : "bg-purple-500";
  }

  return (
    <div
      className={cn(
        "w-full h-1.5 rounded-full overflow-hidden",
        showBackground ? "bg-slate-950" : "bg-slate-800",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full transition-all duration-300 rounded-full",
          barColorClass,
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};
