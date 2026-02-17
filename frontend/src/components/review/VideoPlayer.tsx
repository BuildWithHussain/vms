import { useRef, useEffect, useState, useCallback } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { useVideoPlayer } from "@/hooks/useVideoPlayer"
import { useReviewContext } from "@/hooks/useReviewContext"
import { VideoControls } from "./VideoControls"
import { VideoTimeline } from "./VideoTimeline"
import { AnnotationCanvas } from "./AnnotationCanvas"

interface VideoPlayerProps {
  assetName: string
}

export function VideoPlayer({ assetName }: VideoPlayerProps) {
  const {
    comments,
    setCurrentTime,
    seekToRef,
    annotationMode,
    replayAnnotation,
    fabricCanvas,
    viewAnnotation,
    token,
  } = useReviewContext()

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

  // Expose seek function to parent via context ref
  useEffect(() => {
    seekToRef.current = (time: number) => {
      player.seek(time)
      videoRef.current?.pause()
    }
  }, [seekToRef, player])

  // Notify context of time updates (drift-based replay dismissal handled in context)
  useEffect(() => {
    setCurrentTime(player.currentTime)
  }, [player.currentTime, setCurrentTime])

  // Pause video when annotation mode activates
  useEffect(() => {
    if (annotationMode || replayAnnotation) {
      videoRef.current?.pause()
    }
  }, [annotationMode, replayAnnotation])

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

  const SKIP_SECONDS = 10

  const skipForward = useCallback(() => {
    player.seek(player.currentTime + SKIP_SECONDS)
  }, [player])

  const skipBackward = useCallback(() => {
    player.seek(player.currentTime - SKIP_SECONDS)
  }, [player])

  // Keyboard shortcuts: Space (play/pause), ArrowLeft/Right (skip ±10s)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return

      switch (e.code) {
        case "Space":
          e.preventDefault()
          player.togglePlay()
          break
        case "ArrowLeft":
          e.preventDefault()
          player.seek(player.currentTime - SKIP_SECONDS)
          break
        case "ArrowRight":
          e.preventDefault()
          player.seek(player.currentTime + SKIP_SECONDS)
          break
      }
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
        />
      </div>

      <div className="bg-card border-t">
        <VideoTimeline
          currentTime={player.currentTime}
          duration={player.duration}
          comments={comments}
          onSeek={player.seek}
          onCommentMarkerClick={viewAnnotation}
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
          onSkipBackward={skipBackward}
          onSkipForward={skipForward}
        />
      </div>
    </div>
  )
}
