import { useState } from "react";
import { FileText, Loader2, StickyNote, Wand2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranscript } from "@/hooks/useTranscript";
import type { ActiveSource } from "./SourcesPanel";

const fmt = (s: number) => {
    const m = Math.floor(s / 60),
        ss = Math.floor(s % 60);
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
    const { transcript, loading, requesting, requestTranscription } = useTranscript(
        source?.moduleId ?? null,
    );

    return (
        <div className="flex h-full flex-col">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-border/60 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    / study panel
                </div>
                {/* Tab switcher */}
                <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 w-fit">
                    {([
                        { id: "transcript" as const, icon: FileText, label: "Transcript" },
                        { id: "notes" as const, icon: StickyNote, label: "Notes" },
                    ]).map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={cn(
                                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                                tab === t.id
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <t.icon className="h-3 w-3" />
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
                {!source ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-primary/60" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-foreground/60">No module selected</p>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                Pick a module from the Sources panel to load its transcript and notes.
                            </p>
                        </div>
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
    loading,
    requesting,
    transcript,
    onRequest,
    onAskAbout,
}: {
    loading: boolean;
    requesting: boolean;
    transcript: ReturnType<typeof useTranscript>["transcript"];
    onRequest: () => void;
    onAskAbout: (t: string) => void;
}) => {
    if (loading)
        return (
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground py-4">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading transcript…
            </div>
        );

    if (!transcript || transcript.status === "failed") {
        return (
            <div className="space-y-3">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground leading-relaxed">
                    {transcript?.status === "failed"
                        ? `Transcription failed: ${transcript.error ?? "unknown error"}. Try again.`
                        : "No transcript yet for this module. Generate one to let Vert quote and cite the lesson."}
                </div>
                <Button
                    onClick={onRequest}
                    disabled={requesting}
                    size="sm"
                    className="w-full gap-2"
                >
                    {requesting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                    )}
                    Generate transcript
                </Button>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Runs in the background — this panel updates automatically when ready.
                </p>
            </div>
        );
    }

    if (transcript.status === "queued" || transcript.status === "processing") {
        return (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs leading-relaxed">
                <div className="flex items-center gap-2 mb-2 text-primary font-semibold">
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
            <div className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/85">
                {transcript.text}
            </div>
        );
    }

    return (
        <div className="space-y-0.5">
            <p className="text-[10px] font-mono text-muted-foreground mb-2 uppercase tracking-widest">
                Click any line to ask Vert about it
            </p>
            {segments.map((s, i) => (
                <button
                    key={i}
                    onClick={() => onAskAbout(`Explain this part: "${s.text}" [${fmt(s.start)}]`)}
                    className="w-full text-left flex gap-3 rounded-lg px-2 py-1.5 hover:bg-primary/5 transition-colors group"
                >
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors">
                        {fmt(s.start)}
                    </span>
                    <span className="text-xs leading-relaxed text-foreground/75 group-hover:text-foreground transition-colors">
                        {s.text}
                    </span>
                </button>
            ))}
        </div>
    );
};

const NotesView = ({ source }: { source: ActiveSource }) => {
    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground leading-relaxed">
                <p>
                    Your notes for{" "}
                    <span className="text-foreground font-medium">{source?.moduleTitle}</span> are
                    stored in the Module page. Open the module to write timestamped notes.
                </p>
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                AI-generated revision notes and flashcards are coming in a future update.
            </p>
        </div>
    );
};
