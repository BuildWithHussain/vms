import { useFrappeGetCall } from "frappe-react-sdk"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Cancel01Icon, FilterIcon, Tag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

interface ProjectTag {
  tag: string
  count: number
}

interface AssetTagFilterProps {
  project: string
  value: string | null
  onChange: (tag: string | null) => void
}

export function AssetTagFilter({ project, value, onChange }: AssetTagFilterProps) {
  const { data } = useFrappeGetCall<{ message: { tags: ProjectTag[] } }>(
    "vms.api.get_project_tags",
    { project },
    `project-tags-${project}`,
  )

  const tags = data?.message?.tags ?? []

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" />
        }
      >
        <HugeiconsIcon icon={FilterIcon} strokeWidth={2} data-icon="inline-start" />
        <span className="hidden sm:inline">
          {value ? "Tag:" : "Filter"}
        </span>
        {value && (
          <Badge variant="secondary" className="gap-1 pr-1 text-[10px] font-normal">
            <HugeiconsIcon icon={Tag01Icon} className="size-2.5" strokeWidth={2} />
            <span className="max-w-[100px] truncate">{value}</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(null)
              }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              aria-label="Clear tag filter"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" strokeWidth={2.5} />
            </button>
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="end">
        <div className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">
          Filter by tag
        </div>
        <div className="max-h-72 overflow-y-auto">
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${value === null ? "bg-accent" : ""}`}
          >
            <span>All tags</span>
          </button>
          {tags.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No tags in this project yet
            </div>
          ) : (
            tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => onChange(t.tag)}
                className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${value === t.tag ? "bg-accent" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <HugeiconsIcon icon={Tag01Icon} className="size-3 text-muted-foreground" strokeWidth={2} />
                  <span className="truncate">{t.tag}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{t.count}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
