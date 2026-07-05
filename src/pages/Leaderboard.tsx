import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import {
    Trophy, Flame, Gem, Medal, BookOpen, BrainCircuit, Globe,
    ChevronDown, Check, Search,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { rankRows, medalColor, type RankRow } from "@/lib/ranking";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

// ── Playlist leaderboard types ────────────────────────────────────────────────
interface PlaylistMeta {
    source_playlist_id: string;
    title: string;
    thumbnail_url: string | null;
    participant_count: number;
}

interface PlaylistRow {
    user_id: string;
    name: string | null;
    avatar_url: string | null;
    completed_count: number;
    quiz_passes: number;
    total_modules: number;
    completion_pct: number;
}

type RankedPlaylistRow = PlaylistRow & { rank: number };

// ── Helpers ───────────────────────────────────────────────────────────────────
const rankPlaylistRows = (rows: PlaylistRow[]): RankedPlaylistRow[] =>
    rows.map((r, i) => ({ ...r, rank: i + 1 }));

// ── Shared podium ─────────────────────────────────────────────────────────────
const Podium = ({
    items,
}: {
    items: { id: string; name: string | null; avatar_url: string | null; rank: number; line1: string; line2: string }[];
}) => (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        {[1, 0, 2].map((idx) => {
            const p = items[idx];
            if (!p) return <div key={idx} />;
            const heights = ["h-24", "h-32", "h-20"];
            const order = [1, 0, 2].indexOf(idx);
            const ringColor =
                p.rank === 1
                    ? "ring-yellow-400/70"
                    : p.rank === 2
                      ? "ring-slate-300/60"
                      : "ring-amber-600/60";
            return (
                <div key={p.id} className="flex flex-col items-center">
                    <div className={cn("h-14 w-14 rounded-full bg-muted overflow-hidden ring-2 mb-2", ringColor)}>
                        {p.avatar_url && (
                            <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                        )}
                    </div>
                    <div className="text-sm font-semibold truncate max-w-full px-1">{p.name ?? "—"}</div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{p.line1}</div>
                    <div
                        className={cn(
                            "mt-2 w-full rounded-t-lg border border-border bg-gradient-card flex items-center justify-center font-display text-2xl",
                            heights[order],
                            medalColor(p.rank),
                        )}
                    >
                        <Medal className="h-5 w-5 mr-1" />#{p.rank}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-1">{p.line2}</div>
                </div>
            );
        })}
    </div>
);

// ── Loading skeleton (shared) ─────────────────────────────────────────────────
const ListSkeleton = () => (
    <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                    <Skeleton className="h-14 w-14 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className={cn("w-full rounded-t-xl", i === 1 ? "h-32" : i === 0 ? "h-24" : "h-20")} />
                </div>
            ))}
        </div>
        <div className="rounded-2xl border border-border bg-gradient-card shadow-card divide-y divide-border/60">
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-6 w-6 rounded" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-4 flex-1 max-w-[60%]" />
                    <Skeleton className="h-4 w-16" />
                </div>
            ))}
        </div>
    </div>
);

// ── Playlist combobox ─────────────────────────────────────────────────────────
const PlaylistCombobox = ({
    playlists,
    selectedId,
    loading,
    onSelect,
}: {
    playlists: PlaylistMeta[];
    selectedId: string | null;
    loading: boolean;
    onSelect: (id: string) => void;
}) => {
    const [open, setOpen] = useState(false);
    const selected = playlists.find((p) => p.source_playlist_id === selectedId);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-background text-left transition-colors",
                        open ? "border-primary/60 ring-1 ring-primary/30" : "border-border hover:border-primary/30",
                    )}
                    disabled={loading}
                >
                    {/* Thumbnail preview */}
                    <div className="h-10 w-16 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                        {selected?.thumbnail_url ? (
                            <img src={selected.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <BookOpen className="h-4 w-4 text-muted-foreground/40" />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        {loading ? (
                            <Skeleton className="h-4 w-40" />
                        ) : selected ? (
                            <>
                                <p className="text-sm font-medium truncate">{selected.title}</p>
                                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                    {selected.participant_count} learner{selected.participant_count !== 1 ? "s" : ""}
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">Select a playlist…</p>
                        )}
                    </div>

                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
                </button>
            </PopoverTrigger>

            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                    <div className="flex items-center gap-2 px-3 border-b border-border">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <CommandInput placeholder="Search playlists…" className="border-0 focus:ring-0 h-10 px-0 text-sm bg-transparent placeholder:text-muted-foreground" />
                    </div>
                    <CommandList className="max-h-72">
                        <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                            No playlists found.
                        </CommandEmpty>
                        <CommandGroup>
                            {playlists.map((pl) => (
                                <CommandItem
                                    key={pl.source_playlist_id}
                                    value={pl.title}
                                    onSelect={() => {
                                        onSelect(pl.source_playlist_id);
                                        setOpen(false);
                                    }}
                                    className="flex items-center gap-3 py-2 cursor-pointer"
                                >
                                    <div className="h-9 w-14 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                                        {pl.thumbnail_url ? (
                                            <img src={pl.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                        ) : (
                                            <BookOpen className="h-3.5 w-3.5 text-muted-foreground/40" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{pl.title}</p>
                                        <p className="text-[10px] font-mono text-muted-foreground">
                                            {pl.participant_count} learner{pl.participant_count !== 1 ? "s" : ""}
                                        </p>
                                    </div>
                                    {selectedId === pl.source_playlist_id && (
                                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Leaderboard = () => {
    const { t } = useTranslation();
    const { user } = useAuth();

    const [tab, setTab] = useState<"universal" | "playlist">("universal");

    // ── Universal state ──────────────────────────────────────────────────────
    const [rows, setRows] = useState<RankRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── Playlist state ───────────────────────────────────────────────────────
    const [playlists, setPlaylists] = useState<PlaylistMeta[]>([]);
    const [playlistsLoading, setPlaylistsLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [playlistRows, setPlaylistRows] = useState<RankedPlaylistRow[]>([]);
    const [playlistLoading, setPlaylistLoading] = useState(false);
    const autoSelectedRef = useRef(false);

    // ── Universal load ───────────────────────────────────────────────────────
    const loadUniversal = useCallback(async () => {
        setError(null);
        const { data, error: e } = await supabase.rpc("list_public_profiles", { _limit: 100 });
        if (e) setError(e.message);
        setRows((data ?? []) as RankRow[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        void loadUniversal();
        const channel = supabase
            .channel("leaderboard:profiles")
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () =>
                void loadUniversal(),
            )
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, () =>
                void loadUniversal(),
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [loadUniversal]);

    // ── Playlist: load list when tab switches ────────────────────────────────
    useEffect(() => {
        if (tab !== "playlist" || playlists.length > 0) return;
        setPlaylistsLoading(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.rpc as any)("get_leaderboard_playlists").then(
            ({ data, error: e }: { data: PlaylistMeta[] | null; error: unknown }) => {
                setPlaylistsLoading(false);
                const list = (data ?? []) as PlaylistMeta[];
                setPlaylists(list);
                // auto-select the first playlist if there's only one
                if (!e && list.length === 1 && !autoSelectedRef.current) {
                    autoSelectedRef.current = true;
                    setSelectedId(list[0].source_playlist_id);
                }
            },
        );
    }, [tab, playlists.length]);

    // ── Playlist: load rankings when selection changes ───────────────────────
    const loadPlaylist = useCallback(async (id: string) => {
        setPlaylistLoading(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: e } = await (supabase.rpc as any)(
            "get_playlist_leaderboard",
            { _source_playlist_id: id, _limit: 100 },
        );
        setPlaylistLoading(false);
        if (!e) setPlaylistRows(rankPlaylistRows((data ?? []) as PlaylistRow[]));
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        void loadPlaylist(selectedId);
    }, [selectedId, loadPlaylist]);

    // ── Universal derived ────────────────────────────────────────────────────
    const ranked = useMemo(() => rankRows(rows), [rows]);
    const myRow = useMemo(() => ranked.find((r) => r.id === user?.id), [ranked, user]);
    const podium = ranked.slice(0, 3);

    // ── Playlist derived ─────────────────────────────────────────────────────
    const myPlaylistRow = useMemo(
        () => playlistRows.find((r) => r.user_id === user?.id),
        [playlistRows, user],
    );
    const playlistPodium = playlistRows.slice(0, 3);
    const selectedMeta = playlists.find((p) => p.source_playlist_id === selectedId);

    return (
        <AppShell>
            <section className="container py-12 max-w-3xl">
                {/* Header */}
                <h1 className="font-display text-4xl font-semibold tracking-tight mb-2 inline-flex items-center gap-3">
                    <Trophy className="h-8 w-8 text-primary" />
                    {t("leaderboard.title")}
                </h1>

                {/* Tabs */}
                <div className="flex gap-1 mt-4 mb-6 rounded-xl bg-muted/60 border border-border p-1 w-fit">
                    <button
                        onClick={() => setTab("universal")}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                            tab === "universal"
                                ? "bg-background text-foreground shadow-sm border border-border"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <Globe className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                        Universal
                    </button>
                    <button
                        onClick={() => setTab("playlist")}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                            tab === "playlist"
                                ? "bg-background text-foreground shadow-sm border border-border"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <BookOpen className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                        Playlist
                    </button>
                </div>

                {/* ── UNIVERSAL TAB ── */}
                {tab === "universal" && (
                    <>
                        <p className="text-sm text-muted-foreground mb-8">
                            Ranked by <span className="text-accent font-medium">streak</span> →{" "}
                            <span className="text-primary font-medium">gems</span> →{" "}
                            <span className="text-foreground font-medium">XP</span>. Updates in real time.
                        </p>

                        {loading ? (
                            <ListSkeleton />
                        ) : error ? (
                            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
                                Couldn't load rankings: {error}
                            </div>
                        ) : ranked.length === 0 ? (
                            <div className="rounded-2xl border border-border bg-gradient-card shadow-card p-12 text-center text-muted-foreground text-sm">
                                No public profiles yet. Make your profile public from Settings to appear here.
                            </div>
                        ) : (
                            <>
                                {podium.length > 0 && (
                                    <Podium
                                        items={podium.map((p) => ({
                                            id: p.id,
                                            name: p.name,
                                            avatar_url: p.avatar_url,
                                            rank: p.rank,
                                            line1: `🔥${p.streak}  💎${p.gems}`,
                                            line2: `${p.xp.toLocaleString()} XP`,
                                        }))}
                                    />
                                )}

                                <div className="rounded-2xl border border-border bg-gradient-card shadow-card overflow-hidden">
                                    {ranked.map((r) => {
                                        const isMe = r.id === user?.id;
                                        const isTop3 = r.rank <= 3;
                                        return (
                                            <div
                                                key={r.id}
                                                className={cn(
                                                    "flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 border-b border-border/40 last:border-0 transition-colors",
                                                    isMe && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                                                    !isMe && isTop3 && "bg-accent/5",
                                                )}
                                            >
                                                <span className={cn("font-mono text-xs w-8 sm:w-10 font-semibold shrink-0", medalColor(r.rank))}>
                                                    #{r.rank}
                                                </span>
                                                <div className="h-9 w-9 rounded-full bg-muted overflow-hidden shrink-0">
                                                    {r.avatar_url && (
                                                        <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate text-sm">
                                                        {r.name ?? "—"}
                                                        {isMe && (
                                                            <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">you</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] font-mono text-muted-foreground">Lv {r.level}</div>
                                                </div>
                                                <span className="font-mono text-xs text-accent inline-flex items-center gap-1 tabular-nums w-12 justify-end" title="Streak">
                                                    <Flame className="h-3 w-3" />{r.streak}
                                                </span>
                                                <span className="font-mono text-xs text-primary inline-flex items-center gap-1 tabular-nums w-12 justify-end" title="Gems">
                                                    <Gem className="h-3 w-3" />{r.gems}
                                                </span>
                                                <span className="font-mono text-xs text-muted-foreground tabular-nums hidden sm:inline-block w-20 text-right" title="XP">
                                                    {r.xp.toLocaleString()} XP
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {user && !myRow && (
                                    <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground text-center">
                                        You're not on the leaderboard yet. Turn on a public profile in Settings → Privacy.
                                    </div>
                                )}
                                {myRow && myRow.rank > 10 && (
                                    <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 px-5 py-3 flex items-center gap-3 sm:gap-4">
                                        <span className="font-mono text-xs w-10 font-semibold text-primary">#{myRow.rank}</span>
                                        <span className="flex-1 font-medium truncate">You · Lv {myRow.level}</span>
                                        <span className="font-mono text-xs text-accent inline-flex items-center gap-1">
                                            <Flame className="h-3 w-3" />{myRow.streak}
                                        </span>
                                        <span className="font-mono text-xs text-primary inline-flex items-center gap-1">
                                            <Gem className="h-3 w-3" />{myRow.gems}
                                        </span>
                                        <span className="font-mono text-xs hidden sm:inline">{myRow.xp.toLocaleString()} XP</span>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* ── PLAYLIST TAB ── */}
                {tab === "playlist" && (
                    <>
                        <p className="text-sm text-muted-foreground mb-4">
                            Ranked by <span className="text-primary font-medium">completion %</span> →{" "}
                            <span className="text-foreground font-medium">quizzes passed</span> within a playlist.
                        </p>

                        {/* Searchable playlist combobox */}
                        {playlists.length === 0 && !playlistsLoading ? (
                            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground mb-6">
                                <BookOpen className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
                                No playlists yet. Import a YouTube playlist to get started.
                            </div>
                        ) : (
                            <div className="mb-6">
                                <PlaylistCombobox
                                    playlists={playlists}
                                    selectedId={selectedId}
                                    loading={playlistsLoading}
                                    onSelect={(id) => {
                                        setSelectedId(id);
                                        setPlaylistRows([]);
                                    }}
                                />
                            </div>
                        )}

                        {/* Playlist leaderboard */}
                        {!selectedId ? (
                            playlists.length > 0 && (
                                <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                                    Select a playlist above to see rankings.
                                </div>
                            )
                        ) : playlistLoading ? (
                            <ListSkeleton />
                        ) : playlistRows.length === 0 ? (
                            <div className="rounded-2xl border border-border bg-gradient-card shadow-card p-12 text-center text-muted-foreground text-sm">
                                No rankings yet for this playlist.
                            </div>
                        ) : (
                            <>
                                {/* Playlist header */}
                                {selectedMeta && (
                                    <div className="flex items-center gap-3 mb-5">
                                        {selectedMeta.thumbnail_url && (
                                            <div className="h-10 w-16 rounded-lg overflow-hidden shrink-0">
                                                <img src={selectedMeta.thumbnail_url} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                                / playlist leaderboard
                                            </p>
                                            <h2 className="font-display text-xl font-semibold truncate">{selectedMeta.title}</h2>
                                        </div>
                                    </div>
                                )}

                                {playlistPodium.length > 0 && (
                                    <Podium
                                        items={playlistPodium.map((p) => ({
                                            id: p.user_id,
                                            name: p.name,
                                            avatar_url: p.avatar_url,
                                            rank: p.rank,
                                            line1: `${p.completion_pct}% done`,
                                            line2: `${p.completed_count}/${p.total_modules} · 🧠${p.quiz_passes}`,
                                        }))}
                                    />
                                )}

                                <div className="rounded-2xl border border-border bg-gradient-card shadow-card overflow-hidden">
                                    {playlistRows.map((r) => {
                                        const isMe = r.user_id === user?.id;
                                        const isTop3 = r.rank <= 3;
                                        const pct = Number(r.completion_pct);
                                        return (
                                            <div
                                                key={r.user_id}
                                                className={cn(
                                                    "flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 border-b border-border/40 last:border-0 transition-colors",
                                                    isMe && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                                                    !isMe && isTop3 && "bg-accent/5",
                                                )}
                                            >
                                                <span className={cn("font-mono text-xs w-8 sm:w-10 font-semibold shrink-0", medalColor(r.rank))}>
                                                    #{r.rank}
                                                </span>
                                                <div className="h-9 w-9 rounded-full bg-muted overflow-hidden shrink-0">
                                                    {r.avatar_url && (
                                                        <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate text-sm">
                                                        {r.name ?? "—"}
                                                        {isMe && (
                                                            <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">you</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
                                                            <div className="h-full bg-gradient-lime transition-all" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="text-[10px] font-mono text-muted-foreground">{pct}%</span>
                                                    </div>
                                                </div>
                                                <span className="font-mono text-xs text-muted-foreground tabular-nums hidden sm:inline-block text-right" title="Completed / Total">
                                                    {r.completed_count}/{r.total_modules}
                                                </span>
                                                <span className="font-mono text-xs text-primary inline-flex items-center gap-1 tabular-nums w-10 justify-end" title="Quizzes passed">
                                                    <BrainCircuit className="h-3 w-3" />{r.quiz_passes}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {myPlaylistRow && myPlaylistRow.rank > 10 && (
                                    <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 px-5 py-3 flex items-center gap-3 sm:gap-4">
                                        <span className="font-mono text-xs w-10 font-semibold text-primary">#{myPlaylistRow.rank}</span>
                                        <span className="flex-1 font-medium truncate">You</span>
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {myPlaylistRow.completed_count}/{myPlaylistRow.total_modules}
                                        </span>
                                        <span className="font-mono text-xs text-primary inline-flex items-center gap-1">
                                            <BrainCircuit className="h-3 w-3" />{myPlaylistRow.quiz_passes}
                                        </span>
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {Number(myPlaylistRow.completion_pct)}%
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </section>
        </AppShell>
    );
};

export default Leaderboard;
