import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, ChevronRight, FileText, Lock, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type Course = { id: string; title: string };
type Mod = { id: string; course_id: string; position: number; title: string };

export type ActiveSource = {
  moduleId: string;
  moduleTitle: string;
  position: number;
  courseId: string;
  courseTitle: string;
} | null;

export const SourcesPanel = ({
  userId,
  active,
  onSelect,
}: {
  userId: string;
  active: ActiveSource;
  onSelect: (s: ActiveSource) => void;
}) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Mod[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: cs } = await supabase
        .from("courses")
        .select("id,title")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      const ids = (cs ?? []).map((c) => c.id);
      const { data: ms } = ids.length
        ? await supabase.from("modules").select("id,course_id,position,title").in("course_id", ids).order("position")
        : { data: [] };
      if (cancelled) return;
      setCourses(cs ?? []);
      setModules((ms ?? []) as Mod[]);
      // auto-expand first course
      if (cs && cs[0]) setExpanded(new Set([cs[0].id]));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Sources</div>
          <div className="text-sm font-semibold mt-0.5">Your study material</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="px-3 py-4 text-xs font-mono text-muted-foreground">Loading…</div>
        ) : courses.length === 0 ? (
          <div className="px-3 py-6 text-xs text-muted-foreground">
            No courses yet. Import a YouTube playlist from the Courses page to ground Vert in your material.
          </div>
        ) : (
          <div className="space-y-1">
            <button
              onClick={() => onSelect(null)}
              className={cn(
                "w-full text-left flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active === null ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground/80"
              )}
            >
              <FileText className="h-4 w-4" />
              General study (no source)
            </button>
            {courses.map((c) => {
              const open = expanded.has(c.id);
              const mods = modules.filter((m) => m.course_id === c.id);
              return (
                <div key={c.id}>
                  <button
                    onClick={() => toggle(c.id)}
                    className="w-full flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-muted/60 transition-colors"
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
                    <BookOpen className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate">{c.title}</span>
                  </button>
                  {open && (
                    <div className="ml-5 border-l border-border/40 pl-2 space-y-0.5">
                      {mods.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No modules</div>
                      ) : (
                        mods.map((m) => {
                          const isActive = active?.moduleId === m.id;
                          return (
                            <button
                              key={m.id}
                              onClick={() => onSelect({
                                moduleId: m.id, moduleTitle: m.title, position: m.position,
                                courseId: c.id, courseTitle: c.title,
                              })}
                              className={cn(
                                "w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                                isActive ? "bg-primary/15 text-primary font-medium" : "hover:bg-muted/60 text-foreground/70"
                              )}
                            >
                              <span className="font-mono text-[10px] opacity-60 shrink-0">
                                {String(m.position).padStart(2, "0")}
                              </span>
                              <span className="truncate">{m.title}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 p-3">
        <button
          disabled
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground"
          title="Coming soon"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload PDF / notes
          <Lock className="h-3 w-3 ml-auto opacity-60" />
        </button>
      </div>
    </div>
  );
};
