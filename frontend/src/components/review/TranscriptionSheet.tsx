import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SubtitleIcon, Refresh01Icon, Search01Icon, Cancel01Icon, ArrowUp01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"

interface TranscriptionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transcriptionStatus: string
  transcriptionText: string
  onTranscribe: () => Promise<void>
  isTranscribing: boolean
  onRefresh: () => void
}

export function TranscriptionSheet({
  open,
  onOpenChange,
  transcriptionStatus,
  transcriptionText,
  onTranscribe,
  isTranscribing,
  onRefresh,
}: TranscriptionSheetProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [currentMatch, setCurrentMatch] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const matchCount = useMemo(() => {
    if (!searchQuery || !transcriptionText) return 0
    const regex = new RegExp(escapeRegex(searchQuery), "gi")
    return (transcriptionText.replace(/\*\*\[\d{2}:\d{2}(?::\d{2})?\]\*\*/g, "").replace(/\*\*Speaker \d+:\*\*/g, "").match(regex) || []).length
  }, [searchQuery, transcriptionText])

  const formattedHtml = useMemo(() => {
    return formatTranscription(transcriptionText, searchQuery, currentMatch)
  }, [transcriptionText, searchQuery, currentMatch])

  const scrollToMatch = useCallback((index: number) => {
    if (!contentRef.current) return
    const marks = contentRef.current.querySelectorAll("mark")
    if (marks[index]) {
      marks[index].scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [])

  const goToMatch = useCallback((index: number) => {
    setCurrentMatch(index)
    // scroll after render
    setTimeout(() => scrollToMatch(index), 50)
  }, [scrollToMatch])

  const handleNextMatch = useCallback(() => {
    if (matchCount === 0) return
    goToMatch((currentMatch + 1) % matchCount)
  }, [currentMatch, matchCount, goToMatch])

  const handlePrevMatch = useCallback(() => {
    if (matchCount === 0) return
    goToMatch((currentMatch - 1 + matchCount) % matchCount)
  }, [currentMatch, matchCount, goToMatch])

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (e.shiftKey) handlePrevMatch()
      else handleNextMatch()
    }
    if (e.key === "Escape") {
      setSearchOpen(false)
      setSearchQuery("")
      setCurrentMatch(0)
    }
  }, [handleNextMatch, handlePrevMatch])

  // Reset match index when query changes
  useEffect(() => {
    setCurrentMatch(0)
  }, [searchQuery])

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [searchOpen])

  // Reset search when sheet closes
  useEffect(() => {
    if (!open) {
      setSearchOpen(false)
      setSearchQuery("")
      setCurrentMatch(0)
    }
  }, [open])

  const isComplete = transcriptionStatus === "Complete" && transcriptionText

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={SubtitleIcon} strokeWidth={2} size={18} />
            Transcription
          </SheetTitle>
          <SheetDescription>
            {transcriptionStatus === "Complete"
              ? "AI-generated transcription of the video"
              : transcriptionStatus === "Processing"
                ? "Transcription is being generated..."
                : "Generate a transcription of the video using whisper.cpp"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isComplete ? (
            <div className="space-y-3">
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant={searchOpen ? "secondary" : "ghost"}
                  size="icon-sm"
                  onClick={() => {
                    setSearchOpen(!searchOpen)
                    if (searchOpen) {
                      setSearchQuery("")
                      setCurrentMatch(0)
                    }
                  }}
                  title="Search transcription"
                >
                  <HugeiconsIcon icon={Search01Icon} strokeWidth={2} size={14} />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={onRefresh} title="Refresh">
                  <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} size={14} />
                </Button>
              </div>

              {searchOpen && (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      ref={inputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search transcription..."
                      className="h-8 pr-8 text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(""); setCurrentMatch(0) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} size={12} />
                      </button>
                    )}
                  </div>
                  {searchQuery && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : "0/0"}
                      </span>
                      <Button variant="ghost" size="icon-sm" onClick={handlePrevMatch} disabled={matchCount === 0}>
                        <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} size={14} />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={handleNextMatch} disabled={matchCount === 0}>
                        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div
                ref={contentRef}
                className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground"
                dangerouslySetInnerHTML={{ __html: formattedHtml }}
              />
            </div>
          ) : transcriptionStatus === "Processing" ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Spinner className="size-6" />
              <p className="text-sm text-muted-foreground">
                Transcription in progress. This may take a few minutes depending on the video length.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Auto-checking every few seconds...
              </p>
            </div>
          ) : transcriptionStatus === "Error" ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-sm text-destructive">Transcription failed.</p>
              {transcriptionText && (
                <p className="text-xs text-muted-foreground">{transcriptionText}</p>
              )}
              <Button variant="outline" size="sm" onClick={onTranscribe} disabled={isTranscribing}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12">
              <HugeiconsIcon
                icon={SubtitleIcon}
                strokeWidth={1.5}
                size={40}
                className="text-muted-foreground/50"
              />
              <p className="text-sm text-muted-foreground text-center">
                No transcription yet. Click below to generate one using AI.
              </p>
              <Button onClick={onTranscribe} disabled={isTranscribing} size="sm">
                {isTranscribing ? (
                  <>
                    <Spinner className="size-3.5" />
                    Starting...
                  </>
                ) : (
                  "Transcribe"
                )}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

const SPEAKER_COLORS = [
  "text-blue-600 dark:text-blue-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-violet-600 dark:text-violet-400",
  "text-amber-600 dark:text-amber-400",
  "text-rose-600 dark:text-rose-400",
  "text-cyan-600 dark:text-cyan-400",
]

function formatTranscription(markdown: string, searchQuery?: string, currentMatch?: number): string {
  if (!markdown) return ""

  // Split into timestamp tokens, speaker tokens, and text segments
  const parts = markdown.split(/(\*\*\[\d{2}:\d{2}(?::\d{2})?\]\*\*|\*\*Speaker \d+:\*\*)/)

  let matchIndex = 0
  const html = parts.map((part) => {
    // Timestamp token → styled span
    const tsMatch = part.match(/^\*\*\[(\d{2}:\d{2}(?::\d{2})?)\]\*\*$/)
    if (tsMatch) {
      return `<span class="font-mono text-xs text-primary font-medium">[${escapeHtml(tsMatch[1])}]</span>`
    }

    // Speaker label → colored badge
    const speakerMatch = part.match(/^\*\*Speaker (\d+):\*\*$/)
    if (speakerMatch) {
      const speakerNum = parseInt(speakerMatch[1], 10)
      const colorClass = SPEAKER_COLORS[(speakerNum - 1) % SPEAKER_COLORS.length]
      return `<span class="text-xs font-semibold ${colorClass}">Speaker ${speakerNum}:</span>`
    }

    // Regular text — escape HTML first, then highlight search matches
    let text = escapeHtml(part)

    if (searchQuery) {
      const regex = new RegExp(`(${escapeRegex(escapeHtml(searchQuery))})`, "gi")
      text = text.replace(regex, (_match) => {
        const isCurrent = matchIndex === (currentMatch ?? 0)
        matchIndex++
        return `<mark class="${isCurrent ? "bg-primary/30 text-foreground" : "bg-yellow-200/50 dark:bg-yellow-500/20"} rounded-sm px-0.5">${_match}</mark>`
      })
    }

    return text
  }).join("")

  return html.replace(/\n\n/g, "<br/><br/>").replace(/\n/g, "<br/>")
}
