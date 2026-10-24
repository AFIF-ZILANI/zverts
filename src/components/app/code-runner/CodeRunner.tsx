import { lazy, Suspense, useState } from "react";
import { Code2, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// The editor (Monaco) is a few MB, so it only loads once the learner opens the runner.
const CodeWorkspace = lazy(() => import("./CodeWorkspace"));

const OPEN_KEY = "zverts.codeRunner.open";

export const CodeRunner = ({
    moduleId,
    alwaysOpen = false,
}: {
    moduleId: string;
    /** The playground page: editor shown straight away, no Hide toggle. */
    alwaysOpen?: boolean;
}) => {
    const [storedOpen, setOpen] = useState(() => {
        try {
            return localStorage.getItem(OPEN_KEY) === "1";
        } catch {
            return false;
        }
    });

    const open = alwaysOpen || storedOpen;
    const toggle = () => {
        const next = !open;
        setOpen(next);
        try {
            localStorage.setItem(OPEN_KEY, next ? "1" : "0");
        } catch {
            /* ignore */
        }
    };

    return (
        <div className="rounded-2xl border border-border bg-gradient-card p-3 sm:p-5 shadow-card">
            <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-primary" />
                <h3 className="font-display text-lg">Code Runner</h3>
                <span className="hidden sm:inline text-xs font-mono text-muted-foreground">
                    C · C++ · Python
                </span>
                {!alwaysOpen && (
                    <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={toggle}>
                        {open ? "Hide" : "Open editor"}
                        <ChevronDown
                            className={`h-4 w-4 ml-1 transition-transform ${open ? "rotate-180" : ""}`}
                        />
                    </Button>
                )}
            </div>
            {!open && (
                <p className="text-sm text-muted-foreground mt-2">
                    Practice what you just watched — write, run and test code with your own input,
                    right here.
                </p>
            )}
            {open && (
                <div className="mt-3 sm:mt-4">
                    <Suspense
                        fallback={
                            <div className="h-[420px] flex items-center justify-center rounded-xl border border-border">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        }
                    >
                        <CodeWorkspace key={moduleId} moduleId={moduleId} />
                    </Suspense>
                </div>
            )}
        </div>
    );
};
