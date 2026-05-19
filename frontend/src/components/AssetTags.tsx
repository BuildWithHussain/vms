import { useState, useRef, useEffect } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Cancel01Icon, PlusSignIcon, Tag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "sonner"

interface AssetTagsProps {
  assetName: string
  tags: string[]
  onChanged?: (tags: string[]) => void
  compact?: boolean
}

export function AssetTags({ assetName, tags, onChanged, compact = false }: AssetTagsProps) {
  const [current, setCurrent] = useState<string[]>(tags ?? [])
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  const { call: addCall } = useFrappePostCall("vms.api.add_asset_tag")
  const { call: removeCall } = useFrappePostCall("vms.api.remove_asset_tag")

  useEffect(() => {
    setCurrent(tags ?? [])
  }, [tags])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setInput("")
    }
  }, [open])

  const addTag = async (raw: string) => {
    const tag = raw.trim()
    if (!tag) return
    if (current.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setInput("")
      return
    }
    const prev = current
    const optimistic = [...prev, tag]
    setCurrent(optimistic)
    setInput("")
    try {
      const res = await addCall({ asset_name: assetName, tag })
      const next = (res?.message?.tags ?? optimistic) as string[]
      setCurrent(next)
      onChanged?.(next)
    } catch {
      setCurrent(prev)
      toast.error("Failed to add tag")
    }
  }

  const removeTag = async (tag: string) => {
    const prev = current
    const optimistic = prev.filter((t) => t !== tag)
    setCurrent(optimistic)
    try {
      const res = await removeCall({ asset_name: assetName, tag })
      const next = (res?.message?.tags ?? optimistic) as string[]
      setCurrent(next)
      onChanged?.(next)
    } catch {
      setCurrent(prev)
      toast.error("Failed to remove tag")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag(input)
    } else if (e.key === "Backspace" && !input && current.length > 0) {
      e.preventDefault()
      removeTag(current[current.length - 1])
    }
  }

  const stopPropagation = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()

  return (
    <div className="flex flex-wrap items-center gap-1" onClick={stopPropagation}>
      {current.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="group/tag gap-0.5 pr-1 text-[10px] font-normal"
        >
          <HugeiconsIcon icon={Tag01Icon} className="size-2.5 text-muted-foreground" strokeWidth={2} />
          <span className="max-w-[120px] truncate">{tag}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              removeTag(tag)
            }}
            className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove tag ${tag}`}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" strokeWidth={2.5} />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-5 gap-0.5 rounded-full px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={stopPropagation}
            />
          }
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-2.5" strokeWidth={2} />
          {compact || current.length > 0 ? null : <span>Add tag</span>}
        </PopoverTrigger>
        <PopoverContent className="w-56 gap-2 p-3" onClick={stopPropagation} onKeyDown={stopPropagation}>
          <div className="text-xs font-medium text-muted-foreground">Add a tag</div>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Must use"
            className="h-8 text-sm"
            maxLength={50}
          />
          <div className="text-[10px] text-muted-foreground">
            Press Enter to add. Click × to remove.
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
