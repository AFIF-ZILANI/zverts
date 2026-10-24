import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play } from "lucide-react";
import { SectionTitle } from "@/components/app/SectionTitle";

interface Row {
    module_id: string;
    percent_watched: number;
    updated_at: string;
    modules: {
        id: string;
        title: string;
        position: number;
        thumbnail_url: string | null;
        course_id: string;
        courses: { title: string } | null;
    } | null;
}

export const ContinueWatching = ({ userId }: { userId: string }) => {
    const [items, setItems] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from("module_progress")
                .select(
                    "module_id, percent_watched, updated_at, modules!inner(id,title,position,thumbnail_url,course_id, courses!inner(title))",
                )
                .eq("user_id", userId)
                .eq("completed", false)
                .gt("percent_watched", 0)
                .order("updated_at", { ascending: false })
                .limit(4);
            setItems((data ?? []) as Row[]);
            setLoading(false);
        })();
    }, [userId]);

    if (loading || items.length === 0) return null;

    return (
        <section>
            <SectionTitle title="Continue watching" note="Pick up where you left off" />
            {/* Swipeable row on phones, a grid on wider screens. */}
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
                {items.map((it) => (
                    <Link
                        key={it.module_id}
                        to={`/learn/${it.module_id}`}
                        className="group w-[72%] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.98] sm:w-auto"
                    >
                        <div className="relative aspect-video bg-muted">
                            {it.modules?.thumbnail_url && (
                                <img
                                    src={it.modules.thumbnail_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                            <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
                                <Play className="ml-0.5 h-4 w-4 fill-black text-black" />
                            </span>
                            <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                                {Math.round(it.percent_watched)}%
                            </span>
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                                <div
                                    className="h-full bg-gradient-lime"
                                    style={{ width: `${Math.min(100, it.percent_watched)}%` }}
                                />
                            </div>
                        </div>
                        <div className="p-3">
                            <div className="truncate text-[11px] font-medium text-muted-foreground">
                                {it.modules?.courses?.title}
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug">
                                {it.modules?.title}
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
};
