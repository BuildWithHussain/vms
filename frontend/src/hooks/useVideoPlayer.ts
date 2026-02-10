import { useState, useEffect, useCallback, useRef } from "react"

export interface VideoPlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  playbackRate: number
  isLooping: boolean
  isReady: boolean
}

export function useVideoPlayer(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<VideoPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackRate: 1,
    isLooping: false,
    isReady: false,
  })

  const animationRef = useRef<number>(0)

  const updateTime = useCallback(() => {
    const video = videoRef.current
    if (video && !video.paused) {
      setState((prev) => ({ ...prev, currentTime: video.currentTime }))
      animationRef.current = requestAnimationFrame(updateTime)
    }
  }, [videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoadedMetadata = () => {
      setState((prev) => ({
        ...prev,
        duration: video.duration,
        isReady: true,
      }))
    }

    const onPlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true }))
      animationRef.current = requestAnimationFrame(updateTime)
    }

    const onPause = () => {
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: video.currentTime }))
      cancelAnimationFrame(animationRef.current)
    }

    const onEnded = () => {
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: video.currentTime }))
      cancelAnimationFrame(animationRef.current)
    }

    const onVolumeChange = () => {
      setState((prev) => ({
        ...prev,
        volume: video.volume,
        isMuted: video.muted,
      }))
    }

    const onRateChange = () => {
      setState((prev) => ({ ...prev, playbackRate: video.playbackRate }))
    }

    video.addEventListener("loadedmetadata", onLoadedMetadata)
    video.addEventListener("loadeddata", onLoadedMetadata)
    video.addEventListener("durationchange", onLoadedMetadata)
    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("ended", onEnded)
    video.addEventListener("volumechange", onVolumeChange)
    video.addEventListener("ratechange", onRateChange)

    // If metadata already loaded
    if (video.readyState >= 1 && video.duration > 0) {
      onLoadedMetadata()
    }

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata)
      video.removeEventListener("loadeddata", onLoadedMetadata)
      video.removeEventListener("durationchange", onLoadedMetadata)
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("ended", onEnded)
      video.removeEventListener("volumechange", onVolumeChange)
      video.removeEventListener("ratechange", onRateChange)
      cancelAnimationFrame(animationRef.current)
    }
  }, [videoRef, updateTime])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
    } else {
      video.pause()
    }
  }, [videoRef])

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current
      if (!video) return
      video.currentTime = Math.max(0, Math.min(time, video.duration || 0))
      setState((prev) => ({ ...prev, currentTime: video.currentTime }))
    },
    [videoRef],
  )

  const setVolume = useCallback(
    (vol: number) => {
      const video = videoRef.current
      if (!video) return
      video.volume = Math.max(0, Math.min(1, vol))
      if (vol > 0 && video.muted) {
        video.muted = false
      }
    },
    [videoRef],
  )

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
  }, [videoRef])

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const video = videoRef.current
      if (!video) return
      video.playbackRate = rate
    },
    [videoRef],
  )

  const toggleLoop = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.loop = !video.loop
    setState((prev) => ({ ...prev, isLooping: video.loop }))
  }, [videoRef])

  return {
    ...state,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleLoop,
  }
}

/**
 * Format seconds to HH:MM:SS:FF timecode (30fps).
 */
export function formatTimecode(seconds: number, fps: number = 30): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00:00:00"

  const totalFrames = Math.floor(seconds * fps)
  const frames = totalFrames % fps
  const totalSeconds = Math.floor(seconds)
  const ss = totalSeconds % 60
  const mm = Math.floor(totalSeconds / 60) % 60
  const hh = Math.floor(totalSeconds / 3600)

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(frames).padStart(2, "0")}`
}

/**
 * Format seconds to MM:SS for short display (e.g., comment badges).
 */
export function formatTimestamp(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00"

  const totalSeconds = Math.floor(seconds)
  const mm = Math.floor(totalSeconds / 60)
  const ss = totalSeconds % 60
  return `${mm}:${String(ss).padStart(2, "0")}`
}
