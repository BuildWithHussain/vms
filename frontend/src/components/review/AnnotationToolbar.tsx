import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUpRight01Icon,
  PenTool01Icon,
  SolidLine01Icon,
  SquareIcon,
  TriangleIcon,
  UndoIcon,
  RedoIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  type DrawingTool,
  ANNOTATION_COLORS,
} from "@/hooks/useFabricCanvas"

interface AnnotationToolbarProps {
  activeTool: DrawingTool
  activeColor: string
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: DrawingTool) => void
  onColorChange: (color: string) => void
  onUndo: () => void
  onRedo: () => void
  onBack?: () => void
  onSave?: () => void
  onCancel?: () => void
  isSaving?: boolean
}

const TOOLS: { value: DrawingTool; icon: typeof ArrowUpRight01Icon; label: string }[] = [
  { value: "arrow", icon: ArrowUpRight01Icon, label: "Arrow" },
  { value: "freehand", icon: PenTool01Icon, label: "Pen" },
  { value: "line", icon: SolidLine01Icon, label: "Line" },
  { value: "rectangle", icon: SquareIcon, label: "Rectangle" },
  { value: "triangle", icon: TriangleIcon, label: "Triangle" },
]

export function AnnotationToolbar({
  activeTool,
  activeColor,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onUndo,
  onRedo,
  onBack,
  onSave,
  onCancel,
  isSaving,
}: AnnotationToolbarProps) {
  const isEditMode = !!onSave
  return (
    <div className="border-t px-3 py-2 space-y-1.5">
      {/* Row 1: Back/Save + drawing tools */}
      <div className="flex items-center gap-1.5">
        {isEditMode ? (
          <>
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={isSaving} className="text-xs">
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="icon-sm" onClick={onBack} title="Done drawing">
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
          </Button>
        )}

        <div className="h-5 w-px bg-border" />

        <ToggleGroup
          value={[activeTool]}
          onValueChange={(values) => {
            if (values.length > 0) onToolChange(values[values.length - 1] as DrawingTool)
          }}
          size="sm"
        >
          {TOOLS.map((tool) => (
            <ToggleGroupItem key={tool.value} value={tool.value} aria-label={tool.label}>
              <HugeiconsIcon icon={tool.icon} size={16} strokeWidth={2} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Row 2: Colors + undo/redo */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          {ANNOTATION_COLORS.map((color) => (
            <button
              key={color}
              className="size-5 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: color,
                borderColor: color === activeColor ? "var(--color-foreground)" : "transparent",
              }}
              onClick={() => onColorChange(color)}
              title={color}
            />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={onUndo} disabled={!canUndo} title="Undo">
            <HugeiconsIcon icon={UndoIcon} size={16} strokeWidth={2} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onRedo} disabled={!canRedo} title="Redo">
            <HugeiconsIcon icon={RedoIcon} size={16} strokeWidth={2} />
          </Button>
        </div>
      </div>
    </div>
  )
}
