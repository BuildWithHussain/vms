import {
  createContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { useReviewComments } from "@/hooks/useReviewComments"
import { useFabricCanvas } from "@/hooks/useFabricCanvas"

interface ReviewContextType {
  // Asset & auth
  assetId: string
  token: string | null
  isGuest: boolean
  assetVersion: number

  // Guest identity
  guestName: string
  setGuestName: (name: string) => void

  // Video time & seeking
  currentTime: number
  setCurrentTime: (time: number) => void
  seekTo: (time: number) => void
  seekToRef: React.MutableRefObject<((time: number) => void) | null>

  // Comments
  comments: ReturnType<typeof useReviewComments>["comments"]
  versionFilter: number | "all"
  setVersionFilter: (v: number | "all") => void

  // Annotations
  annotationMode: boolean
  pendingAnnotation: string | null
  replayAnnotation: string | null
  replayTimestampRef: React.MutableRefObject<number | null>
  editingAnnotationComment: string | null
  editAnnotationDataRef: React.MutableRefObject<string | null>
  fabricCanvas: ReturnType<typeof useFabricCanvas>
  startAnnotation: () => void
  cancelAnnotation: () => void
  finishAnnotation: () => void
  viewAnnotation: (commentName: string, timestamp?: number | null) => Promise<void>
  editAnnotation: (commentName: string, timestamp?: number | null) => Promise<void>
  dismissReplay: () => void
  clearPendingAnnotation: () => void
}

export const ReviewContext = createContext<ReviewContextType | null>(null)

interface ReviewProviderProps {
  assetId: string
  token: string | null
  isGuest: boolean
  assetVersion: number
  children: ReactNode
}

export function ReviewProvider({ assetId, token, isGuest, assetVersion, children }: ReviewProviderProps) {
  const [currentTime, setCurrentTimeRaw] = useState(0)
  const seekToRef = useRef<((time: number) => void) | null>(null)

  // Guest name (persisted in localStorage)
  const [guestName, setGuestNameState] = useState<string>(
    () => localStorage.getItem("vms_guest_name") || "",
  )
  const setGuestName = useCallback((name: string) => {
    setGuestNameState(name)
    localStorage.setItem("vms_guest_name", name)
  }, [])

  // Annotation state
  const [annotationMode, setAnnotationMode] = useState(false)
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null)
  const [replayAnnotation, setReplayAnnotation] = useState<string | null>(null)
  const replayTimestampRef = useRef<number | null>(null)
  const [editingAnnotationComment, setEditingAnnotationComment] = useState<string | null>(null)
  const editAnnotationDataRef = useRef<string | null>(null)

  // Wrap setCurrentTime to auto-dismiss replay when video time drifts
  const setCurrentTime = useCallback((time: number) => {
    setCurrentTimeRaw(time)
    if (replayTimestampRef.current != null && Math.abs(time - replayTimestampRef.current) > 0.5) {
      setReplayAnnotation(null)
      replayTimestampRef.current = null
    }
  }, [])

  const [versionFilter, setVersionFilter] = useState<number | "all">(assetVersion)

  const fabricCanvas = useFabricCanvas()

  const { call: fetchAnnotation } = useFrappePostCall("vms.review_api.get_annotation_data")

  // Comments (sorted by timestamp for timeline markers, filtered by version)
  const { comments } = useReviewComments(assetId, "timestamp", token, versionFilter)

  const seekTo = useCallback((time: number) => {
    seekToRef.current?.(time)
    setReplayAnnotation(null)
    replayTimestampRef.current = null
  }, [])

  const startAnnotation = useCallback(() => {
    setAnnotationMode(true)
    setReplayAnnotation(null)
    replayTimestampRef.current = null
    setEditingAnnotationComment(null)
    editAnnotationDataRef.current = null
  }, [])

  const cancelAnnotation = useCallback(() => {
    setAnnotationMode(false)
    setEditingAnnotationComment(null)
    editAnnotationDataRef.current = null
  }, [])

  const finishAnnotation = useCallback(() => {
    const data = fabricCanvas.getAnnotationData()
    setPendingAnnotation(data)
    setAnnotationMode(false)
  }, [fabricCanvas])

  const editAnnotation = useCallback(
    async (commentName: string, timestamp?: number | null) => {
      if (timestamp != null) {
        seekToRef.current?.(timestamp)
      }
      try {
        const res = await fetchAnnotation({
          comment_name: commentName,
          ...(token ? { token } : {}),
        })
        const annotationData = res.message?.annotation_data
        if (annotationData) {
          setReplayAnnotation(null)
          replayTimestampRef.current = null
          setEditingAnnotationComment(commentName)
          editAnnotationDataRef.current = annotationData
          setAnnotationMode(true)
        }
      } catch {
        // ignore fetch errors
      }
    },
    [fetchAnnotation, token],
  )

  const viewAnnotation = useCallback(
    async (commentName: string, timestamp?: number | null) => {
      if (timestamp != null) {
        seekToRef.current?.(timestamp)
      }
      try {
        const res = await fetchAnnotation({
          comment_name: commentName,
          ...(token ? { token } : {}),
        })
        const annotationData = res.message?.annotation_data
        if (annotationData) {
          setAnnotationMode(false)
          setReplayAnnotation(annotationData)
          replayTimestampRef.current = timestamp ?? null
        }
      } catch {
        // ignore fetch errors
      }
    },
    [fetchAnnotation, token],
  )

  const dismissReplay = useCallback(() => {
    setReplayAnnotation(null)
    replayTimestampRef.current = null
  }, [])

  const clearPendingAnnotation = useCallback(() => {
    setPendingAnnotation(null)
  }, [])

  return (
    <ReviewContext.Provider
      value={{
        assetId,
        token,
        isGuest,
        assetVersion,
        guestName,
        setGuestName,
        currentTime,
        setCurrentTime,
        seekTo,
        seekToRef,
        comments,
        versionFilter,
        setVersionFilter,
        annotationMode,
        pendingAnnotation,
        replayAnnotation,
        replayTimestampRef,
        editingAnnotationComment,
        editAnnotationDataRef,
        fabricCanvas,
        startAnnotation,
        cancelAnnotation,
        finishAnnotation,
        viewAnnotation,
        editAnnotation,
        dismissReplay,
        clearPendingAnnotation,
      }}
    >
      {children}
    </ReviewContext.Provider>
  )
}
