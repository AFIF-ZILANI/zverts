import { useState } from "react";
import { FileText, Loader2, Sparkles, StickyNote, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranscript } from "@/hooks/useTranscript";
import type { ActiveSource } from "./SourcesPanel";

const fmt = (s: number) => {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

export const TranscriptPanel = ({
  source,
  onAskAbout,
}: {
  source: ActiveSource;
  onAskAbout: (text: string) => void;
}) => {
  const [tab, setTab] = useState<"transcript" | "notes">("transcript");
  const { transcript, loading, requesting, requestTranscription } = useTranscript(source?.moduleId ?? null);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 border-b border-border/60">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Study Panel</div>
        <div className="flex gap-1 mt-2">
          <button
            onClick={() => setTab("transcript")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              tab === "transcript" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5" /> Transcript
          </button>
          <button
            onClick={() => setTab("notes")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              tab === "notes" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <StickyNote className="h-3.5 w-3.5" /> Notes
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!source ? (
          <div className="text-xs text-muted-foreground py-8 text-center">
            <Sparkles className="h-5 w-5 mx-auto mb-2 opacity-50" />
            Pick a module from the sources panel to load its transcript and notes.
          </div>
        ) : tab === "transcript" ? (
          <TranscriptView
            loading={loading}
            requesting={requesting}
            transcript={transcript}
            onRequest={requestTranscription}
            onAskAbout={onAskAbout}
          />
        ) : (
          <NotesView source={source} />
        )}
      </div>
    </div>
  );
};

const TranscriptView = ({
  loading, requesting, transcript, onRequest, onAskAbout,
}: {
  loading: boolean;
  requesting: boolean;
  transcript: ReturnType<typeof useTranscript>["transcript"];
  onRequest: () => void;
  onAskAbout: (t: string) => void;
}) => {
  if (loading) return <div className="text-xs font-mono text-muted-foreground">Loading transcript…</div>;

  if (!transcript || transcript.status === "failed") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
          {transcript?.status === "failed"
            ? `Transcription failed: ${transcript.error ?? "unknown error"}. Try again.`
            : "No transcript yet for this module. Generate one to let Vert quote and cite the lesson."}
        </div>
        <Button onClick={onRequest} disabled={requesting} size="sm" className="w-full">
          {requesting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-2" />}
          Generate transcript
        </Button>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Transcription runs in the background. The panel updates automatically when it's ready.
        </p>
      </div>
    );
  }

  if (transcript.status === "queued" || transcript.status === "processing") {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs leading-relaxed">
        <div className="flex items-center gap-2 mb-2 text-primary font-medium">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcribing…
        </div>
        <p className="text-muted-foreground">
          Vert will use the transcript to ground answers and let you click any line to ask about it.
        </p>
      </div>
    );
  }

  const segments = transcript.segments ?? [];
  if (segments.length === 0 && transcript.text) {
    return (
      <div className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
        {transcript.text}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {segments.map((s, i) => (
        <button
          key={i}
          onClick={() => onAskAbout(`Explain this part: "${s.text}" [${fmt(s.start)}]`)}
          className="w-full text-left flex gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors group"
        >
          <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary">
            {fmt(s.start)}
          </span>
          <span className="text-xs leading-relaxed text-foreground/80 group-hover:text-foreground">
            {s.text}
          </span>
        </button>
      ))}
    </div>
  );
};

const NotesView = ({ source }: { source: ActiveSource }) => {
  return (
    <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
      <p>
        Your notes for <span className="text-foreground font-medium">{source?.moduleTitle}</span> are stored in the
        Module page. Open the module to write timestamped notes.
      </p>
      <p className="text-[10px] opacity-70">
        AI-generated revision notes and flashcards are coming in a future update.
      </p>
    </div>
  );
};
