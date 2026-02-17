import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlayIcon,
  PauseIcon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMute01Icon,
  RepeatIcon,
  RepeatOffIcon,
  FullScreenIcon,
  MinimizeScreenIcon,
  GoBackward10SecIcon,
  GoForward10SecIcon,
} from "@hugeicons/core-free-icons"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { formatTimecode } from "@/hooks/useVideoPlayer"

const SPEED_OPTIONS = [0.5, 1, 1.5, 2]

interface VideoControlsProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  playbackRate: number
  isLooping: boolean
  onTogglePlay: () => void
  onToggleMute: () => void
  onVolumeChange: (vol: number) => void
  onPlaybackRateChange: (rate: number) => void
  onToggleLoop: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onSkipBackward: () => void
  onSkipForward: () => void
}

export function VideoControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  playbackRate,
  isLooping,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onPlaybackRateChange,
  onToggleLoop,
  isFullscreen,
  onToggleFullscreen,
  onSkipBackward,
  onSkipForward,
}: VideoControlsProps) {
  const VolumeIcon = isMuted || volume === 0
    ? VolumeMute01Icon
    : volume < 0.5
      ? VolumeLowIcon
      : VolumeHighIcon

  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      <Button variant="ghost" size="icon-sm" onClick={onSkipBackward} title="Skip back 10s (←)">
        <HugeiconsIcon icon={GoBackward10SecIcon} strokeWidth={2} size={18} />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onTogglePlay}>
        <HugeiconsIcon
          icon={isPlaying ? PauseIcon : PlayIcon}
          strokeWidth={2}
          size={18}
        />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onSkipForward} title="Skip forward 10s (→)">
        <HugeiconsIcon icon={GoForward10SecIcon} strokeWidth={2} size={18} />
      </Button>

      <div className="hidden items-center gap-1 md:flex">
        <Button variant="ghost" size="icon-sm" onClick={onToggleMute}>
          <HugeiconsIcon icon={VolumeIcon} strokeWidth={2} size={18} />
        </Button>
        <input
          type="range"
          min={0}
          max={100}
          value={isMuted ? 0 : Math.round(volume * 100)}
          onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
          className="w-20 h-1.5 appearance-none rounded-full bg-white/20 cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm"
        />
      </div>

      <div className="mx-1 font-mono text-[10px] text-muted-foreground select-none md:text-xs">
        {formatTimecode(currentTime)} / {formatTimecode(duration)}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Popover>
          <PopoverTrigger
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden font-mono text-xs md:inline-flex cursor-pointer"
            )}
          >
            {playbackRate}x
          </PopoverTrigger>
          <PopoverContent className="w-auto min-w-0 p-1" align="end">
            <div className="flex flex-col">
              {SPEED_OPTIONS.map((rate) => (
                <Button
                  key={rate}
                  variant={playbackRate === rate ? "secondary" : "ghost"}
                  size="sm"
                  className="justify-start font-mono text-xs"
                  onClick={() => onPlaybackRateChange(rate)}
                >
                  {rate}x
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleLoop}
          className={`hidden md:inline-flex ${isLooping ? "text-primary" : "text-muted-foreground"}`}
        >
          <HugeiconsIcon
            icon={isLooping ? RepeatIcon : RepeatOffIcon}
            strokeWidth={2}
            size={18}
          />
        </Button>

        <Button variant="ghost" size="icon-sm" onClick={onToggleFullscreen}>
          <HugeiconsIcon
            icon={isFullscreen ? MinimizeScreenIcon : FullScreenIcon}
            strokeWidth={2}
            size={18}
          />
        </Button>
      </div>
    </div>
  )
}
