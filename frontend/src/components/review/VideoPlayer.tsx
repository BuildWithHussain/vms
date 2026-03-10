import { useRef, useEffect, useState, useCallback } from "react"
import { useFrappePostCall } from "frappe-react-sdk"
import { useVideoPlayer } from "@/hooks/useVideoPlayer"
import { useReviewContext } from "@/hooks/useReviewContext"
import { Spinner } from "@/components/ui/spinner"
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
  const FPS = 30

  const skipForward = useCallback(() => {
    player.seek(player.currentTime + SKIP_SECONDS)
  }, [player])

  const skipBackward = useCallback(() => {
    player.seek(player.currentTime - SKIP_SECONDS)
  }, [player])

  // JKL shuttle speeds: successive presses cycle through these
  const SHUTTLE_SPEEDS = [1, 2, 4, 8] as const
  const shuttleIndexRef = useRef(0)
  const shuttleDirRef = useRef<"fwd" | "rev" | null>(null)
  const rewindIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playerRef = useRef(player)
  playerRef.current = player

  const clearRewind = useCallback(() => {
    if (rewindIntervalRef.current) {
      clearInterval(rewindIntervalRef.current)
      rewindIntervalRef.current = null
    }
  }, [])

  const startRewind = useCallback(
    (speed: number) => {
      clearRewind()
      const video = videoRef.current
      if (!video) return
      video.pause()
      // Seek backwards at `speed` x real-time, updating every 50ms
      rewindIntervalRef.current = setInterval(() => {
        const v = videoRef.current
        if (!v) return
        const step = speed * (50 / 1000)
        const next = v.currentTime - step
        if (next <= 0) {
          playerRef.current.seek(0)
          clearRewind()
          shuttleIndexRef.current = 0
          shuttleDirRef.current = null
        } else {
          playerRef.current.seek(next)
        }
      }, 50)
    },
    [clearRewind, videoRef],
  )

  // Clean up rewind interval on unmount
  useEffect(() => clearRewind, [clearRewind])

  // Keyboard shortcuts: JKL shuttle, Space, Arrow keys (frame/10-frame), M (mute), F (fullscreen)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return

      const video = videoRef.current
      if (!video) return

      switch (e.code) {
        case "Space":
          e.preventDefault()
          player.togglePlay()
          // Reset shuttle state on space
          clearRewind()
          shuttleIndexRef.current = 0
          shuttleDirRef.current = null
          break

        case "KeyK":
          e.preventDefault()
          // K always pauses and resets shuttle
          clearRewind()
          shuttleIndexRef.current = 0
          shuttleDirRef.current = null
          if (!video.paused) {
            video.pause()
          } else {
            video.play()
          }
          break

        case "KeyL": {
          e.preventDefault()
          clearRewind()
          if (shuttleDirRef.current === "fwd" && shuttleIndexRef.current < SHUTTLE_SPEEDS.length - 1) {
            shuttleIndexRef.current++
          } else if (shuttleDirRef.current !== "fwd") {
            shuttleIndexRef.current = 0
            shuttleDirRef.current = "fwd"
          }
          const speed = SHUTTLE_SPEEDS[shuttleIndexRef.current]
          video.playbackRate = speed
          if (video.paused) video.play()
          break
        }

        case "KeyJ": {
          e.preventDefault()
          // If currently playing forward, stop first
          if (!video.paused) video.pause()
          if (shuttleDirRef.current === "rev" && shuttleIndexRef.current < SHUTTLE_SPEEDS.length - 1) {
            shuttleIndexRef.current++
          } else if (shuttleDirRef.current !== "rev") {
            shuttleIndexRef.current = 0
            shuttleDirRef.current = "rev"
          }
          const speed = SHUTTLE_SPEEDS[shuttleIndexRef.current]
          startRewind(speed)
          break
        }

        case "ArrowLeft":
          e.preventDefault()
          clearRewind()
          shuttleIndexRef.current = 0
          shuttleDirRef.current = null
          if (e.shiftKey) {
            // Skip 10 frames
            player.seek(player.currentTime - 10 / FPS)
          } else {
            // Skip 1 frame
            player.seek(player.currentTime - 1 / FPS)
          }
          if (!video.paused) video.pause()
          break

        case "ArrowRight":
          e.preventDefault()
          clearRewind()
          shuttleIndexRef.current = 0
          shuttleDirRef.current = null
          if (e.shiftKey) {
            // Skip 10 frames
            player.seek(player.currentTime + 10 / FPS)
          } else {
            // Skip 1 frame
            player.seek(player.currentTime + 1 / FPS)
          }
          if (!video.paused) video.pause()
          break

        case "KeyM":
          e.preventDefault()
          player.toggleMute()
          break

        case "KeyF":
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [player, clearRewind, startRewind, toggleFullscreen, videoRef])

  const isCanvasActive = annotationMode || !!replayAnnotation

  return (
    <div ref={containerRef} className="flex flex-col overflow-hidden rounded-lg border bg-black md:h-full">
      <div ref={videoWrapperRef} className="relative flex items-center justify-center bg-black aspect-video md:aspect-auto md:min-h-0 md:flex-1">
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
        {videoUrl && player.isBuffering && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner className="size-10 text-white/80" />
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
