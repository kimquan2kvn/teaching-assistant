import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// Bản `native-select` chính thức của shadcn (registry new-york-v4) chuyển sang JS + Tailwind v3.
// Giữ thẻ <select> gốc để điện thoại mở trình chọn của hệ điều hành. Khác bản gốc: khung bọc `w-full` (không
// `w-fit`) và cao h-10 để khớp Input/Button của dự án; có forwardRef vì form hiện tại dùng ref.
const NativeSelect = React.forwardRef(({ className, size = "default", ...props }, ref) => (
  <div
    className="group/native-select relative w-full has-[select:disabled]:opacity-50"
    data-slot="native-select-wrapper"
  >
    <select
      ref={ref}
      data-slot="native-select"
      data-size={size}
      className={cn(
        "h-10 w-full min-w-0 appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 text-base outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8 data-[size=sm]:py-1 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20",
        className
      )}
      {...props}
    />
    <ChevronDown
      className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 select-none text-muted-foreground opacity-50"
      aria-hidden="true"
      data-slot="native-select-icon"
    />
  </div>
))
NativeSelect.displayName = "NativeSelect"

function NativeSelectOption({ className, ...props }) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({ className, ...props }) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOption, NativeSelectOptGroup }
