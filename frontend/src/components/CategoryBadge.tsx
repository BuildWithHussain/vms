import { useState } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "sonner"

const CATEGORIES = ["Footage", "For Review", "Deliverable"] as const
type Category = (typeof CATEGORIES)[number]

const categoryVariant: Record<string, "default" | "secondary" | "outline"> = {
  Footage: "outline",
  "For Review": "default",
  Deliverable: "secondary",
}

export function CategoryBadge({
  assetName,
  category,
  onChanged,
}: {
  assetName: string
  category: Category
  onChanged?: () => void
}) {
  const [current, setCurrent] = useState(category)
  const { call } = useFrappePostCall("vms.api.update_asset_category")

  const handleChange = async (value: string) => {
    if (value === current) return
    const prev = current
    setCurrent(value as Category)
    try {
      await call({ asset_name: assetName, category: value })
      onChanged?.()
    } catch {
      setCurrent(prev)
      toast.error("Failed to update category")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="cursor-pointer"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Badge variant={categoryVariant[current] ?? "outline"} className="gap-1">
          {current}
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} />
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={handleChange}
        >
          {CATEGORIES.map((cat) => (
            <DropdownMenuRadioItem key={cat} value={cat}>
              {cat}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
