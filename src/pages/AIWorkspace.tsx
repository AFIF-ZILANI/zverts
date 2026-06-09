import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAIUsage } from "@/hooks/useAIUsage";
import { SourcesPanel, type ActiveSource } from "@/components/ai/SourcesPanel";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { TranscriptPanel } from "@/components/ai/TranscriptPanel";
import { UsageChip } from "@/components/ai/UsageChip";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, FileText, MessageSquare, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import zvertsLogo from "@/assets/zverts-logo.png";

type MobileTab = "sources" | "chat" | "panel";

const TABS = [
    { id: "sources" as const, label: "Sources", icon: BookOpen },
    { id: "chat" as const, label: "Chat", icon: MessageSquare },
    { id: "panel" as const, label: "Notes", icon: FileText },
];

const AIWorkspace = () => {
    const { user, loading } = useAuth();
    const { usage, applyServerUsage } = useAIUsage();
    const [source, setSource] = useState<ActiveSource>(null);
    const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
    const [externalPrompt, setExternalPrompt] = useState<string | null>(null);

    if (loading) return null;
    if (!user) return <Navigate to="/auth" replace />;

    const onAskAbout = (text: string) => {
        setExternalPrompt(text);
        setMobileTab("chat");
    };

    return (
        <div className="h-screen flex flex-col bg-background overflow-hidden">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className="shrink-0 h-14 border-b border-border/60 bg-background/95 backdrop-blur-xl">
                <div className="h-full flex items-center justify-between px-3 md:px-4 gap-2">
                    {/* Left: back + branding */}
                    <div className="flex items-center gap-2 min-w-0">
                        <Link
                            to="/dashboard"
                            aria-label="Back to dashboard"
                            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-border/60 hover:bg-muted/60 hover:border-border transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Link>

                        <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 shrink-0 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                                <Sparkles className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                                <div className="font-display text-sm font-semibold leading-none">
                                    Vert AI
                                </div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground leading-tight truncate max-w-[160px] md:max-w-xs">
                                    {source
                                        ? source.moduleTitle
                                        : "Study Companion"}
                                </div>
                            </div>
                        </div>

                        {/* Active source pill */}
                        {source && (
                            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-primary max-w-[200px]">
                                <BookOpen className="h-3 w-3 shrink-0" />
                                <span className="truncate">{source.courseTitle}</span>
                            </div>
                        )}
                    </div>

                    {/* Right: usage + close */}
                    <div className="flex items-center gap-2 shrink-0">
                        <UsageChip usage={usage} />
                        <Link
                            to="/dashboard"
                            aria-label="Close workspace"
                            className="hidden md:flex items-center justify-center h-8 w-8 rounded-lg border border-border/60 hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </header>

            {/* ── Desktop: three columns ────────────────────────────────────── */}
            <div className="flex-1 min-h-0 hidden md:grid md:grid-cols-[280px_minmax(0,1fr)_320px] lg:grid-cols-[300px_minmax(0,1fr)_360px]">
                <aside className="border-r border-border/60 min-h-0 bg-muted/20">
                    <SourcesPanel userId={user.id} active={source} onSelect={setSource} />
                </aside>
                <section className="min-h-0">
                    <ChatPanel
                        userId={user.id}
                        source={source}
                        onUsageUpdate={applyServerUsage}
                        externalPrompt={externalPrompt}
                        onExternalConsumed={() => setExternalPrompt(null)}
                    />
                </section>
                <aside className="border-l border-border/60 min-h-0 bg-muted/20">
                    <TranscriptPanel source={source} onAskAbout={onAskAbout} />
                </aside>
            </div>

            {/* ── Mobile: single column with tab nav ───────────────────────── */}
            <div className="flex-1 min-h-0 flex flex-col md:hidden">
                <div className="flex-1 min-h-0">
                    {mobileTab === "sources" && (
                        <SourcesPanel
                            userId={user.id}
                            active={source}
                            onSelect={(s) => {
                                setSource(s);
                                setMobileTab("chat");
                            }}
                        />
                    )}
                    {mobileTab === "chat" && (
                        <ChatPanel
                            userId={user.id}
                            source={source}
                            onUsageUpdate={applyServerUsage}
                            externalPrompt={externalPrompt}
                            onExternalConsumed={() => setExternalPrompt(null)}
                        />
                    )}
                    {mobileTab === "panel" && (
                        <TranscriptPanel source={source} onAskAbout={onAskAbout} />
                    )}
                </div>

                {/* Bottom tab bar */}
                <nav className="shrink-0 border-t border-border/60 bg-background/95 backdrop-blur-xl safe-area-pb">
                    <div className="grid grid-cols-3 px-2 py-1.5 gap-1">
                        {TABS.map((t) => {
                            const active = mobileTab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => setMobileTab(t.id)}
                                    className={cn(
                                        "flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-medium transition-all",
                                        active
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <t.icon className={cn("h-4 w-4", active && "scale-110 transition-transform")} />
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>
                </nav>
            </div>
        </div>
    );
};

export default AIWorkspace;
