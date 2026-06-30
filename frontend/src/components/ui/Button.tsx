import React from 'react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none",
          {
            // Variants
            'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-transparent': variant === 'primary',
            'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700': variant === 'secondary',
            'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50': variant === 'ghost',
            'p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700': variant === 'icon',
            'text-rose-400 hover:bg-rose-950/50 hover:text-rose-300': variant === 'destructive',

            // Sizes
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-4 py-2 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
            'h-auto w-auto p-1': size === 'icon', // override padding for pure icon buttons
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
