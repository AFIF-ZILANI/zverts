import { Check, ChevronDown, GraduationCap } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type StudyMode =
  | "study_buddy"
  | "strict_teacher"
  | "exam"
  | "simple_bangla"
  | "deep_explain"
  | "fast_revision"
  | "coding_mentor";

export const MODES: { id: StudyMode; label: string; desc: string }[] = [
  { id: "study_buddy", label: "Study Buddy", desc: "Friendly, encouraging" },
  { id: "deep_explain", label: "Deep Explanation", desc: "Intuition + formal + examples" },
  { id: "fast_revision", label: "Fast Revision", desc: "One-page summary" },
  { id: "exam", label: "Exam Mode", desc: "Exam-ready format + practice" },
  { id: "strict_teacher", label: "Strict Teacher", desc: "Rigorous, demanding" },
  { id: "simple_bangla", label: "Simple Bangla", desc: "Everyday Banglish" },
  { id: "coding_mentor", label: "Coding Mentor", desc: "Code-first answers" },
];

export const ModeSelector = ({ value, onChange }: { value: StudyMode; onChange: (v: StudyMode) => void }) => {
  const current = MODES.find((m) => m.id === value) ?? MODES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs font-medium hover:bg-muted/60 transition-colors">
        <GraduationCap className="h-3.5 w-3.5 text-primary" />
        <span>{current.label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {MODES.map((m) => {
          const active = m.id === value;
          return (
            <DropdownMenuItem key={m.id} onClick={() => onChange(m.id)} className={cn("py-2.5", active && "bg-muted")}>
              <div className="flex-1">
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-[11px] text-muted-foreground">{m.desc}</div>
              </div>
              {active && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
