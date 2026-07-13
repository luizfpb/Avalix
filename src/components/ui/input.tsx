import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[0.7rem] border border-input bg-card px-3.5 py-1 text-base shadow-[inset_0_1px_0_color-mix(in_oklab,var(--card)_80%,white),0_1px_2px_color-mix(in_oklab,var(--foreground)_4%,transparent)] transition-[border-color,box-shadow,background-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-background/45",
        "focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
