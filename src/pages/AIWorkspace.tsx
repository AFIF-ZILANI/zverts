import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAIUsage } from "@/hooks/useAIUsage";
import { SourcesPanel, type ActiveSource } from "@/components/ai/SourcesPanel";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { TranscriptPanel } from "@/components/ai/TranscriptPanel";
import { UsageChip } from "@/components/ai/UsageChip";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, FileText, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import zvertsLogo from "@/assets/zverts-logo.png";

type MobileTab = "sources" | "chat" | "panel";

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
        <div className="h-screen flex flex-col bg-background">
            {/* Header */}
            <header className="shrink-0 h-14 border-b border-border/60 bg-background/80 backdrop-blur-xl flex items-center justify-between px-3 md:px-4 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Link
                        to="/dashboard"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted/60 transition-colors shrink-0"
                        aria-label="Back to dashboard"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                    <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
                        <img src={zvertsLogo} alt="ZverTs" className="h-7 w-auto shrink-0" />
                        <div className="min-w-0">
                            <div className="font-display text-sm font-semibold leading-none truncate">
                                ZverTs AI
                            </div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground leading-tight">
                                {source ? source.moduleTitle : "Vert · Study Companion"}
                            </div>
                        </div>
                    </Link>
                </div>
                <div className="flex items-center gap-2">
                    <UsageChip usage={usage} />
                    <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                        <Link to="/dashboard">Close</Link>
                    </Button>
                </div>
            </header>

            {/* Desktop: three columns */}
            <div className="flex-1 min-h-0 hidden md:grid md:grid-cols-[280px_minmax(0,1fr)_320px] lg:grid-cols-[300px_minmax(0,1fr)_360px]">
                <aside className="border-r border-border/60 min-h-0">
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
                <aside className="border-l border-border/60 min-h-0">
                    <TranscriptPanel source={source} onAskAbout={onAskAbout} />
                </aside>
            </div>

            {/* Mobile: tabbed single column */}
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
                <nav className="shrink-0 border-t border-border/60 bg-background/95 backdrop-blur-xl grid grid-cols-3">
                    {(
                        [
                            { id: "sources", label: "Sources", icon: BookOpen },
                            { id: "chat", label: "Chat", icon: MessageSquare },
                            { id: "panel", label: "Transcript", icon: FileText },
                        ] as const
                    ).map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setMobileTab(t.id)}
                            className={cn(
                                "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                                mobileTab === t.id ? "text-primary" : "text-muted-foreground",
                            )}
                        >
                            <t.icon className="h-4 w-4" />
                            {t.label}
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    );
};

export default AIWorkspace;
