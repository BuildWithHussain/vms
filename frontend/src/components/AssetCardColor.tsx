import { useState, useEffect } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PaintBrush02Icon, Tick02Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "sonner"

export type CardColor = "" | "red" | "amber" | "green" | "blue" | "purple" | "pink"

export const CARD_COLORS: { value: CardColor; label: string; swatch: string }[] = [
  { value: "red", label: "Red", swatch: "bg-red-500" },
  { value: "amber", label: "Amber", swatch: "bg-amber-500" },
  { value: "green", label: "Green", swatch: "bg-green-500" },
  { value: "blue", label: "Blue", swatch: "bg-blue-500" },
  { value: "purple", label: "Purple", swatch: "bg-purple-500" },
  { value: "pink", label: "Pink", swatch: "bg-pink-500" },
]

const swatchByValue: Record<string, string> = Object.fromEntries(
  CARD_COLORS.map((c) => [c.value, c.swatch])
)

interface AssetCardColorProps {
  assetName: string
  color?: string | null
  onChanged?: (color: CardColor) => void
}

export function AssetCardColor({ assetName, color, onChanged }: AssetCardColorProps) {
  const [current, setCurrent] = useState<CardColor>((color ?? "") as CardColor)
  const [open, setOpen] = useState(false)
  const { call } = useFrappePostCall("vms.api.set_asset_card_color")

  useEffect(() => {
    setCurrent((color ?? "") as CardColor)
  }, [color])

  const setColor = async (value: CardColor) => {
    if (value === current) {
      setOpen(false)
      return
    }
    const prev = current
    setCurrent(value)
    setOpen(false)
    try {
      await call({ asset_name: assetName, color: value })
      onChanged?.(value)
    } catch {
      setCurrent(prev)
      toast.error("Failed to update colour")
    }
  }

  const stopPropagation = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()
  const currentSwatch = current ? swatchByValue[current] : ""

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            onClick={stopPropagation}
            aria-label={current ? `Card colour: ${current}` : "Set card colour"}
          />
        }
      >
        {current ? (
          <span className={`size-3.5 rounded-full ring-1 ring-border ${currentSwatch}`} />
        ) : (
          <HugeiconsIcon
            icon={PaintBrush02Icon}
            className="size-3.5 text-muted-foreground"
            strokeWidth={2}
          />
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto gap-2 p-2"
        onClick={stopPropagation}
        onKeyDown={stopPropagation}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setColor("")}
            className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
            aria-label="No colour"
          >
            {current === "" ? (
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5" strokeWidth={2.5} />
            ) : (
              <HugeiconsIcon icon={Cancel01Icon} className="size-3" strokeWidth={2} />
            )}
          </button>
          {CARD_COLORS.map((c) => (
            <button
              type="button"
              key={c.value}
              onClick={() => setColor(c.value)}
              className={`flex size-7 items-center justify-center rounded-full ${c.swatch} text-white ring-1 ring-border hover:opacity-90`}
              aria-label={c.label}
              title={c.label}
            >
              {current === c.value && (
                <HugeiconsIcon icon={Tick02Icon} className="size-3.5" strokeWidth={3} />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Tailwind class for left-border accent on cards. Used by ProjectDetailPage.
export const CARD_COLOR_BORDER_CLASS: Record<string, string> = {
  red: "border-l-4 border-l-red-500",
  amber: "border-l-4 border-l-amber-500",
  green: "border-l-4 border-l-green-500",
  blue: "border-l-4 border-l-blue-500",
  purple: "border-l-4 border-l-purple-500",
  pink: "border-l-4 border-l-pink-500",
}
