import { useEffect, useState } from "react";
import { Keyboard, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

/**
 * Asked before every run when the code reads input (scanf, cin, input()…), so
 * the program gets its input instead of hitting EOF. Code without input runs
 * straight away.
 */
export const InputPrompt = ({
    reader,
    initial,
    onRun,
    onRunWithout,
    onCancel,
}: {
    /** The input call found in the code, or null when closed. */
    reader: string | null;
    /** Last run's input, so re-running the same case is one keypress. */
    initial: string;
    onRun: (input: string) => void;
    onRunWithout: () => void;
    onCancel: () => void;
}) => {
    const [value, setValue] = useState("");
    useEffect(() => {
        if (reader) setValue(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
    }, [reader]);

    const submit = () => {
        if (value.trim()) onRun(value);
    };

    return (
        <Dialog open={!!reader} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent
                className="max-w-[calc(100vw-2rem)] sm:max-w-md rounded-xl"
                // Radix's own Escape handling stops working from the second
                // time this dialog opens, so close on Escape ourselves.
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        onCancel();
                    }
                }}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Keyboard className="h-4 w-4 text-primary" /> Your program needs input
                    </DialogTitle>
                    <DialogDescription>
                        It reads input with{" "}
                        <code className="font-mono text-foreground">{reader}</code>. Type the values
                        it asks for, in order — separate them with spaces or new lines.
                    </DialogDescription>
                </DialogHeader>
                <textarea
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder={"e.g.\n3 4"}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    rows={4}
                    className="w-full resize-none rounded-md border border-border bg-background p-3 font-mono text-base md:text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground/60"
                />
                <p className="-mt-2 text-[11px] text-muted-foreground">Ctrl/⌘ + Enter to run</p>
                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                    <Button variant="ghost" onClick={onRunWithout}>
                        Run without input
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={!value.trim()}
                        className="bg-gradient-lime text-primary-foreground shadow-glow"
                    >
                        <Play className="h-3.5 w-3.5 mr-1" /> Run with this input
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
