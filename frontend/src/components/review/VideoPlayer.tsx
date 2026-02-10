import { useRef, useEffect, useState, useCallback } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { useVideoPlayer } from "@/hooks/useVideoPlayer"
import { VideoControls } from "./VideoControls"
import { VideoTimeline } from "./VideoTimeline"
import { AnnotationCanvas } from "./AnnotationCanvas"
import type { VMSReviewComment } from "@/types"
import type { useFabricCanvas } from "@/hooks/useFabricCanvas"

interface VideoPlayerProps {
  assetName: string
  comments: VMSReviewComment[]
  onTimeUpdate?: (time: number) => void
  seekToRef?: React.MutableRefObject<((time: number) => void) | null>
  annotationMode?: boolean
  replayAnnotation?: string | null
  fabricCanvas: ReturnType<typeof useFabricCanvas>
  onPause?: () => void
  onCommentMarkerClick?: (commentName: string, timestamp?: number | null) => void
  token?: string | null
}

export function VideoPlayer({
  assetName,
  comments,
  onTimeUpdate,
  seekToRef,
  annotationMode = false,
  replayAnnotation,
  fabricCanvas,
  onPause,
  onCommentMarkerClick,
  token,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoWrapperRef = useRef<HTMLDivElement>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { call: getViewUrl } = useFrappePostCall("vms.review_api.get_review_view_url")

  const player = useVideoPlayer(videoRef)

  // Fetch video URL
  useEffect(() => {
    if (!assetName) return
    const params: Record<string, string> = { asset_name: assetName }
    if (token) params.token = token
    getViewUrl(params).then((res) => {
      setVideoUrl(res.message.url)
    })
  }, [assetName, token, getViewUrl])

  // Expose seek function to parent
  useEffect(() => {
    if (seekToRef) {
      seekToRef.current = (time: number) => {
        player.seek(time)
        videoRef.current?.pause()
      }
    }
  }, [seekToRef, player])

  // Notify parent of time updates
  useEffect(() => {
    onTimeUpdate?.(player.currentTime)
  }, [player.currentTime, onTimeUpdate])

  // Pause video when annotation mode activates
  useEffect(() => {
    if (annotationMode || replayAnnotation) {
      videoRef.current?.pause()
      onPause?.()
    }
  }, [annotationMode, replayAnnotation, onPause])

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen()
    }
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  // Spacebar play/pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      player.togglePlay()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [player])

  const isCanvasActive = annotationMode || !!replayAnnotation

  return (
    <div ref={containerRef} className="flex flex-col overflow-hidden rounded-lg border bg-black">
      <div ref={videoWrapperRef} className="relative flex items-center justify-center bg-black aspect-video">
        <video
          ref={videoRef}
          src={videoUrl ?? undefined}
          className="h-full w-full object-contain"
          onClick={isCanvasActive ? undefined : player.togglePlay}
          playsInline
        />
        {!videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            Loading video...
          </div>
        )}
        <AnnotationCanvas
          videoContainerRef={videoWrapperRef}
          isActive={isCanvasActive}
          readOnly={!!replayAnnotation}
          annotationData={replayAnnotation}
          fabricCanvas={fabricCanvas}
        />
      </div>

      <div className="bg-card border-t">
        <VideoTimeline
          currentTime={player.currentTime}
          duration={player.duration}
          comments={comments}
          onSeek={player.seek}
          onCommentMarkerClick={onCommentMarkerClick}
        />
        <VideoControls
          isPlaying={player.isPlaying}
          currentTime={player.currentTime}
          duration={player.duration}
          volume={player.volume}
          isMuted={player.isMuted}
          playbackRate={player.playbackRate}
          isLooping={player.isLooping}
          onTogglePlay={player.togglePlay}
          onToggleMute={player.toggleMute}
          onVolumeChange={player.setVolume}
          onPlaybackRateChange={player.setPlaybackRate}
          onToggleLoop={player.toggleLoop}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>
    </div>
  )
}
