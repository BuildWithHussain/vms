import { useRef, useState, useCallback, useEffect } from "react"
import * as fabric from "fabric"

export type DrawingTool = "select" | "arrow" | "freehand" | "line" | "rectangle" | "triangle"

export const ANNOTATION_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#ffffff", // white
] as const

const MAX_HISTORY = 50
const STROKE_WIDTH = 3

interface AnnotationJSON {
  _normalized: boolean
  _canvasWidth: number
  _canvasHeight: number
  objects: fabric.FabricObject[]
  version: string
}

export function useFabricCanvas() {
  const canvasRef = useRef<fabric.Canvas | null>(null)
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const [activeTool, setActiveTool] = useState<DrawingTool>("arrow")
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // History stacks
  const historyRef = useRef<string[]>([])
  const redoStackRef = useRef<string[]>([])
  const isLoadingRef = useRef(false)

  // Trigger re-apply of tool mode after canvas init
  const [canvasReady, setCanvasReady] = useState(0)

  // Drawing state for shape tools
  const drawingRef = useRef<{
    isDrawing: boolean
    startX: number
    startY: number
    activeObject: fabric.FabricObject | null
  }>({ isDrawing: false, startX: 0, startY: 0, activeObject: null })

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || isLoadingRef.current) return
    const json = JSON.stringify(canvas.toJSON())
    const stack = historyRef.current
    if (stack.length >= MAX_HISTORY) stack.shift()
    stack.push(json)
    redoStackRef.current = []
    setCanUndo(stack.length > 1)
    setCanRedo(false)
  }, [])

  const initCanvas = useCallback(
    (canvasEl: HTMLCanvasElement, width: number, height: number) => {
      if (canvasRef.current) {
        canvasRef.current.dispose()
      }

      const c = new fabric.Canvas(canvasEl, {
        width,
        height,
        selection: false,
        renderOnAddRemove: true,
      })

      canvasRef.current = c
      canvasElRef.current = canvasEl

      // Save initial empty state
      historyRef.current = [JSON.stringify(c.toJSON())]
      redoStackRef.current = []
      setCanUndo(false)
      setCanRedo(false)
      setCanvasReady((n) => n + 1)

      return c
    },
    [],
  )

  const disposeCanvas = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.dispose()
      canvasRef.current = null
    }
    historyRef.current = []
    redoStackRef.current = []
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  // Apply tool mode to canvas
  const applyToolMode = useCallback(
    (tool: DrawingTool, color: string) => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Remove all custom event listeners before re-attaching
      canvas.off("mouse:down")
      canvas.off("mouse:move")
      canvas.off("mouse:up")

      if (tool === "freehand") {
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = color
        canvas.freeDrawingBrush.width = STROKE_WIDTH
        canvas.selection = false

        // Save after each freehand path
        canvas.on("mouse:up", () => {
          saveToHistory()
        })
        return
      }

      canvas.isDrawingMode = false

      if (tool === "select") {
        canvas.selection = true
        canvas.defaultCursor = "default"
        canvas.forEachObject((obj) => {
          obj.selectable = true
          obj.evented = true
        })
        return
      }

      // Shape drawing tools: arrow, line, rectangle, triangle
      canvas.selection = false
      canvas.defaultCursor = "crosshair"
      canvas.forEachObject((obj) => {
        obj.selectable = false
        obj.evented = false
      })

      const state = drawingRef.current

      canvas.on("mouse:down", (opt) => {
        const pointer = canvas.getScenePoint(opt.e)
        state.isDrawing = true
        state.startX = pointer.x
        state.startY = pointer.y

        let obj: fabric.FabricObject | null = null

        if (tool === "line") {
          obj = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: color,
            strokeWidth: STROKE_WIDTH,
            selectable: false,
            evented: false,
          })
        } else if (tool === "rectangle") {
          obj = new fabric.Rect({
            left: pointer.x,
            top: pointer.y,
            originX: "left",
            originY: "top",
            width: 0,
            height: 0,
            fill: "transparent",
            stroke: color,
            strokeWidth: STROKE_WIDTH,
            selectable: false,
            evented: false,
          })
        } else if (tool === "triangle") {
          obj = new fabric.Triangle({
            left: pointer.x,
            top: pointer.y,
            originX: "left",
            originY: "top",
            width: 0,
            height: 0,
            fill: "transparent",
            stroke: color,
            strokeWidth: STROKE_WIDTH,
            selectable: false,
            evented: false,
          })
        } else if (tool === "arrow") {
          // Arrow: line + arrowhead (drawn on mouse:up)
          obj = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: color,
            strokeWidth: STROKE_WIDTH,
            selectable: false,
            evented: false,
          })
        }

        if (obj) {
          canvas.add(obj)
          state.activeObject = obj
        }
      })

      canvas.on("mouse:move", (opt) => {
        if (!state.isDrawing || !state.activeObject) return
        const pointer = canvas.getScenePoint(opt.e)

        if (tool === "line" || tool === "arrow") {
          const line = state.activeObject as fabric.Line
          line.set({ x2: pointer.x, y2: pointer.y })
        } else if (tool === "rectangle") {
          const rect = state.activeObject as fabric.Rect
          const w = pointer.x - state.startX
          const h = pointer.y - state.startY
          rect.set({
            left: w < 0 ? pointer.x : state.startX,
            top: h < 0 ? pointer.y : state.startY,
            width: Math.abs(w),
            height: Math.abs(h),
          })
        } else if (tool === "triangle") {
          const tri = state.activeObject as fabric.Triangle
          const w = pointer.x - state.startX
          const h = pointer.y - state.startY
          tri.set({
            left: w < 0 ? pointer.x : state.startX,
            top: h < 0 ? pointer.y : state.startY,
            width: Math.abs(w),
            height: Math.abs(h),
          })
        }

        canvas.requestRenderAll()
      })

      canvas.on("mouse:up", (opt) => {
        if (!state.isDrawing) return
        state.isDrawing = false

        if (tool === "arrow" && state.activeObject) {
          const line = state.activeObject as fabric.Line
          const pointer = canvas.getScenePoint(opt.e)
          const x1 = line.x1!
          const y1 = line.y1!
          const x2 = pointer.x
          const y2 = pointer.y

          // Only add arrowhead if line has meaningful length
          const dx = x2 - x1
          const dy = y2 - y1
          const len = Math.sqrt(dx * dx + dy * dy)

          if (len > 5) {
            const headLen = Math.min(15, len * 0.3)
            const angle = Math.atan2(dy, dx)

            const arrowHead = new fabric.Polygon(
              [
                { x: x2, y: y2 },
                {
                  x: x2 - headLen * Math.cos(angle - Math.PI / 6),
                  y: y2 - headLen * Math.sin(angle - Math.PI / 6),
                },
                {
                  x: x2 - headLen * Math.cos(angle + Math.PI / 6),
                  y: y2 - headLen * Math.sin(angle + Math.PI / 6),
                },
              ],
              {
                fill: color,
                stroke: color,
                strokeWidth: 1,
                selectable: false,
                evented: false,
              },
            )
            canvas.add(arrowHead)
          }
        }

        state.activeObject = null
        saveToHistory()
      })
    },
    [saveToHistory],
  )

  // Re-apply tool mode when tool, color, or canvas readiness changes
  useEffect(() => {
    applyToolMode(activeTool, activeColor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, activeColor, applyToolMode, canvasReady])

  const changeTool = useCallback(
    (tool: DrawingTool) => {
      setActiveTool(tool)
    },
    [],
  )

  const changeColor = useCallback(
    (color: string) => {
      setActiveColor(color)
      // Also update freehand brush color immediately
      const canvas = canvasRef.current
      if (canvas && canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = color
      }
    },
    [],
  )

  const undo = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const stack = historyRef.current
    if (stack.length <= 1) return

    const current = stack.pop()!
    redoStackRef.current.push(current)
    const prev = stack[stack.length - 1]

    isLoadingRef.current = true
    canvas.loadFromJSON(prev).then(() => {
      canvas.requestRenderAll()
      isLoadingRef.current = false
      setCanUndo(stack.length > 1)
      setCanRedo(true)
      // Re-apply tool mode so objects get correct selectable state
      applyToolMode(activeTool, activeColor)
    })
  }, [activeTool, activeColor, applyToolMode])

  const redo = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const redoStack = redoStackRef.current
    if (redoStack.length === 0) return

    const next = redoStack.pop()!
    historyRef.current.push(next)

    isLoadingRef.current = true
    canvas.loadFromJSON(next).then(() => {
      canvas.requestRenderAll()
      isLoadingRef.current = false
      setCanUndo(historyRef.current.length > 1)
      setCanRedo(redoStack.length > 0)
      applyToolMode(activeTool, activeColor)
    })
  }, [activeTool, activeColor, applyToolMode])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.clear()
    historyRef.current = [JSON.stringify(canvas.toJSON())]
    redoStackRef.current = []
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  const getAnnotationData = useCallback((): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const objects = canvas.getObjects()
    if (objects.length === 0) return null

    const w = canvas.width!
    const h = canvas.height!
    const json = canvas.toJSON() as AnnotationJSON

    // Normalize coordinates to 0-1 range
    for (const obj of json.objects as Record<string, unknown>[]) {
      if (typeof obj.left === "number") obj.left = obj.left / w
      if (typeof obj.top === "number") obj.top = obj.top / h
      if (typeof obj.width === "number") obj.width = obj.width / w
      if (typeof obj.height === "number") obj.height = obj.height / h
      if (typeof obj.x1 === "number") obj.x1 = obj.x1 / w
      if (typeof obj.y1 === "number") obj.y1 = obj.y1 / h
      if (typeof obj.x2 === "number") obj.x2 = obj.x2 / w
      if (typeof obj.y2 === "number") obj.y2 = obj.y2 / h
      if (typeof obj.radius === "number") obj.radius = obj.radius / Math.min(w, h)
      if (typeof obj.strokeWidth === "number") obj.strokeWidth = obj.strokeWidth / Math.min(w, h)

      // Normalize path points for freehand drawings
      if (Array.isArray(obj.path)) {
        for (const seg of obj.path as (string | number)[][]) {
          for (let i = 1; i < seg.length; i += 2) {
            if (typeof seg[i] === "number") seg[i] = (seg[i] as number) / w
            if (typeof seg[i + 1] === "number") seg[i + 1] = (seg[i + 1] as number) / h
          }
        }
      }

      // Normalize polygon points
      if (Array.isArray(obj.points)) {
        for (const pt of obj.points as { x: number; y: number }[]) {
          pt.x = pt.x / w
          pt.y = pt.y / h
        }
      }
    }

    json._normalized = true
    json._canvasWidth = w
    json._canvasHeight = h

    return JSON.stringify(json)
  }, [])

  const loadAnnotationData = useCallback(
    (jsonStr: string, width: number, height: number) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const json = JSON.parse(jsonStr) as AnnotationJSON

      if (json._normalized) {
        // Denormalize coordinates
        for (const obj of json.objects as Record<string, unknown>[]) {
          if (typeof obj.left === "number") obj.left = obj.left * width
          if (typeof obj.top === "number") obj.top = obj.top * height
          if (typeof obj.width === "number") obj.width = obj.width * width
          if (typeof obj.height === "number") obj.height = obj.height * height
          if (typeof obj.x1 === "number") obj.x1 = obj.x1 * width
          if (typeof obj.y1 === "number") obj.y1 = obj.y1 * height
          if (typeof obj.x2 === "number") obj.x2 = obj.x2 * width
          if (typeof obj.y2 === "number") obj.y2 = obj.y2 * height
          if (typeof obj.radius === "number") obj.radius = obj.radius * Math.min(width, height)
          if (typeof obj.strokeWidth === "number")
            obj.strokeWidth = obj.strokeWidth * Math.min(width, height)

          // Denormalize path points
          if (Array.isArray(obj.path)) {
            for (const seg of obj.path as (string | number)[][]) {
              for (let i = 1; i < seg.length; i += 2) {
                if (typeof seg[i] === "number") seg[i] = (seg[i] as number) * width
                if (typeof seg[i + 1] === "number") seg[i + 1] = (seg[i + 1] as number) * height
              }
            }
          }

          // Denormalize polygon points
          if (Array.isArray(obj.points)) {
            for (const pt of obj.points as { x: number; y: number }[]) {
              pt.x = pt.x * width
              pt.y = pt.y * height
            }
          }
        }
      }

      isLoadingRef.current = true
      canvas.loadFromJSON(JSON.stringify(json)).then(() => {
        canvas.requestRenderAll()
        isLoadingRef.current = false
        // Make all objects non-interactive in replay mode
        canvas.forEachObject((obj) => {
          obj.selectable = false
          obj.evented = false
        })
      })
    },
    [],
  )

  const hasContent = useCallback((): boolean => {
    const canvas = canvasRef.current
    return !!canvas && canvas.getObjects().length > 0
  }, [])

  return {
    canvasRef,
    canvasElRef,
    activeTool,
    activeColor,
    canUndo,
    canRedo,
    initCanvas,
    disposeCanvas,
    changeTool,
    changeColor,
    undo,
    redo,
    clear,
    getAnnotationData,
    loadAnnotationData,
    hasContent,
  }
}
