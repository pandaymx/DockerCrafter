import React from "react";
import { cn } from "../../utils/cn";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  className,
  hoverEffect = false,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        "glass-panel rounded-xl p-4",
        hoverEffect && "glass-panel-hover",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
