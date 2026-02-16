import { HugeiconsIcon } from "@hugeicons/react"
import { SubtitleIcon, Refresh01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
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
          {transcriptionStatus === "Complete" && transcriptionText ? (
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <Button variant="ghost" size="icon-sm" onClick={onRefresh} title="Refresh">
                  <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} size={14} />
                </Button>
              </div>
              <div
                className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground"
                dangerouslySetInnerHTML={{ __html: formatTranscription(transcriptionText) }}
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

function formatTranscription(markdown: string): string {
  // Simple markdown-to-HTML for timestamps: **[MM:SS]** or **[HH:MM:SS]** text
  return markdown
    .replace(/\*\*\[(\d{2}:\d{2}(?::\d{2})?)\]\*\*/g, '<span class="font-mono text-xs text-primary font-medium">[$1]</span>')
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>")
}
