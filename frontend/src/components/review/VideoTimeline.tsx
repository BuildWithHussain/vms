import { useCallback, useRef } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatTimestamp } from "@/hooks/useVideoPlayer"
import type { VMSReviewComment } from "@/types"

interface VideoTimelineProps {
  currentTime: number
  duration: number
  comments: VMSReviewComment[]
  onSeek: (time: number) => void
  onCommentMarkerClick?: (commentName: string, timestamp?: number | null) => void
}

export function VideoTimeline({
  currentTime,
  duration,
  comments,
  onSeek,
  onCommentMarkerClick,
}: VideoTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const getTimeFromEvent = useCallback(
    (e: React.MouseEvent) => {
      const track = trackRef.current
      if (!track || !duration) return 0
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      return ratio * duration
    },
    [duration],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onSeek(getTimeFromEvent(e))
    },
    [getTimeFromEvent, onSeek],
  )

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  // Only show markers for comments with timestamps
  const commentMarkers = comments.filter(
    (c) => c.video_timestamp != null && !c.parent_comment,
  )

  return (
    <div className="px-2 py-1">
      <div className="relative">
        {/* Track */}
        <div
          ref={trackRef}
          className="relative h-2 cursor-pointer rounded-full bg-muted"
          onClick={handleClick}
        >
          {/* Progress bar */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />

          {/* Playhead */}
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-3 rounded-full bg-primary shadow-sm"
            style={{ left: `${progress}%` }}
          />
        </div>

        {/* Comment markers — rendered as an overlay so tooltip anchors correctly */}
        {commentMarkers.map((comment) => {
          const pos = duration > 0 ? ((comment.video_timestamp! / duration) * 100) : 0
          return (
            <Tooltip key={comment.name}>
              <TooltipTrigger
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-2.5 rounded-full bg-amber-400 border border-amber-500 hover:scale-150 transition-transform cursor-pointer z-10 p-0 appearance-none outline-none"
                style={{ left: `${pos}%` }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (onCommentMarkerClick) {
                    onCommentMarkerClick(comment.name, comment.video_timestamp)
                  } else {
                    onSeek(comment.video_timestamp!)
                  }
                }}
              />
              <TooltipContent side="top" sideOffset={8}>
                <span className="font-mono text-xs">
                  {formatTimestamp(comment.video_timestamp!)}
                </span>
                {" — "}
                <span className="text-xs">
                  {comment.comment_text.length > 40
                    ? comment.comment_text.slice(0, 40) + "..."
                    : comment.comment_text}
                </span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
